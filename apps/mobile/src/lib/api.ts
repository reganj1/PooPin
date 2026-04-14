import type {
  ApiErrorResponse,
  BoundsRestroomsQuery,
  BoundsRestroomsResponse,
  NearbyRestroomsQuery,
  NearbyRestroomsResponse,
  RestroomDetailResponse,
  SendEmailOtpResponse
} from "@poopin/api-client";
import type { NearbyBathroom, Review } from "@poopin/domain";
import { mobileEnv } from "./env";
import { supabase } from "./supabase";

const RESTROOM_PHOTOS_BUCKET = "restroom-photos";

export interface RestroomPhotoItem {
  id: string;
  url: string;
  createdAt: string;
}

const restroomCache = new Map<string, NearbyBathroom>();

export type PlaceSearchResultType = "address" | "poi" | "neighborhood" | "locality" | "place" | "region" | "unknown";

export interface PlaceSearchResult {
  id: string;
  name: string;
  secondaryName: string;
  fullName: string;
  lat: number;
  lng: number;
  zoom: number;
  placeType: PlaceSearchResultType;
}

const createUrl = (path: string, params?: Record<string, string | number | undefined>) => {
  const url = new URL(path, mobileEnv.apiBaseUrl);

  if (!params) {
    return url.toString();
  }

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "undefined") {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url.toString();
};

const readJson = async <T>(response: Response): Promise<T> => {
  const payload = (await response.json().catch(() => null)) as T | ApiErrorResponse | null;

  if (!response.ok) {
    if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
      throw new Error(payload.error);
    }

    throw new Error(`Request failed with status ${response.status}.`);
  }

  return payload as T;
};

const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(url, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network request failed";
    throw new Error(`Request to ${url} failed before a response was received. ${message}`);
  }

  return readJson<T>(response);
};

interface PlaceSearchApiResponse {
  results?: PlaceSearchResult[];
}

export const primeRestroomCache = (restrooms: NearbyBathroom[]) => {
  for (const restroom of restrooms) {
    restroomCache.set(restroom.id, restroom);
  }
};

export const getCachedRestroom = (id: string): NearbyBathroom | null => {
  return restroomCache.get(id) ?? null;
};

export const sendEmailOtp = async (email: string): Promise<SendEmailOtpResponse> => {
  return fetchJson<SendEmailOtpResponse>(createUrl("/api/auth/email-otp"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email })
  });
};

export const getNearbyRestrooms = async (query: NearbyRestroomsQuery): Promise<NearbyRestroomsResponse> => {
  return fetchJson<NearbyRestroomsResponse>(
    createUrl("/api/restrooms/nearby", {
      lat: query.lat,
      lng: query.lng,
      limit: query.limit
    })
  );
};

export const getBoundsRestrooms = async (query: BoundsRestroomsQuery): Promise<BoundsRestroomsResponse> => {
  const response = await fetchJson<BoundsRestroomsResponse>(
    createUrl("/api/restrooms/bounds", {
      minLat: query.minLat,
      maxLat: query.maxLat,
      minLng: query.minLng,
      maxLng: query.maxLng,
      limit: query.limit
    })
  );

  primeRestroomCache(response.restrooms);
  return response;
};

export const getRestroom = async (id: string): Promise<RestroomDetailResponse> => {
  const response = await fetchJson<RestroomDetailResponse>(createUrl(`/api/restrooms/${encodeURIComponent(id)}`));
  restroomCache.set(response.restroom.id, response.restroom);
  return response;
};

export const getRestroomReviews = async (bathroomId: string): Promise<Review[]> => {
  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("bathroom_id", bathroomId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Review[];
};

export const getRestroomPhotoUrls = async (bathroomId: string): Promise<RestroomPhotoItem[]> => {
  const { data, error } = await supabase
    .from("photos")
    .select("id, storage_path, created_at")
    .eq("bathroom_id", bathroomId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as { id: string; storage_path: string; created_at: string }[];

  return rows.map((row) => {
    const { data: urlData } = supabase.storage.from(RESTROOM_PHOTOS_BUCKET).getPublicUrl(row.storage_path);
    return {
      id: row.id,
      url: urlData.publicUrl,
      createdAt: row.created_at
    };
  });
};

export const searchPlaces = async (
  query: string,
  options?: { signal?: AbortSignal; proximity?: { lat: number; lng: number } | null }
): Promise<PlaceSearchResult[]> => {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) {
    return [];
  }

  const response = await fetchJson<PlaceSearchApiResponse>(
    createUrl("/api/geocode/search", {
      q: trimmedQuery,
      lat: options?.proximity?.lat,
      lng: options?.proximity?.lng
    }),
    {
      signal: options?.signal,
      headers: {
        accept: "application/json"
      }
    }
  );

  return Array.isArray(response.results) ? response.results : [];
};
