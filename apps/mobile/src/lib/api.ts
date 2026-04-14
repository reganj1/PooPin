import type {
  ApiErrorResponse,
  BoundsRestroomsQuery,
  BoundsRestroomsResponse,
  NearbyRestroomsQuery,
  NearbyRestroomsResponse,
  RestroomDetailResponse,
  SendEmailOtpResponse
} from "@poopin/api-client";
import type { NearbyBathroom, Review, ReviewQuickTag } from "@poopin/domain";
import { mobileEnv } from "./env";
import { supabase } from "./supabase";

const RESTROOM_PHOTOS_BUCKET = "restroom-photos";
const PHOTO_SIGNED_URL_EXPIRY_SECONDS = 3600;
const PHOTO_LIMIT = 24;

// ─── Preview photo lazy-fetch cache ─────────────────────────────────────────
// Mirrors lib/utils/restroomPreviewClient.ts in the web app.
// Only called when the user taps a specific marker — never in bulk.
// Keeps Vercel invocations to ~1 per restroom per 45 min.

const PREVIEW_CACHE_TTL_MS = 45 * 60_000;
const EMPTY_PREVIEW_CACHE_TTL_MS = 5 * 60_000;
const previewPhotoCache = new Map<string, { url: string | null; cachedAt: number }>();
const inFlightPreviewRequests = new Map<string, Promise<string | null>>();

const isCacheEntryFresh = (entry: { url: string | null; cachedAt: number }) => {
  const ttl = entry.url ? PREVIEW_CACHE_TTL_MS : EMPTY_PREVIEW_CACHE_TTL_MS;
  return Date.now() - entry.cachedAt < ttl;
};

export const getRestroomPreviewPhotoUrl = async (restroomId: string): Promise<string | null> => {
  const cached = previewPhotoCache.get(restroomId);
  if (cached && isCacheEntryFresh(cached)) {
    return cached.url;
  }
  previewPhotoCache.delete(restroomId);

  // Deduplicate in-flight requests for the same restroom.
  const existing = inFlightPreviewRequests.get(restroomId);
  if (existing) return existing;

  const request = fetchJson<{ success?: boolean; photoUrl?: string | null }>(
    createUrl(`/api/restrooms/${encodeURIComponent(restroomId)}/preview`)
  )
    .then((data) => {
      const url = data.success ? (data.photoUrl ?? null) : null;
      previewPhotoCache.set(restroomId, { url, cachedAt: Date.now() });
      return url;
    })
    .catch(() => {
      previewPhotoCache.set(restroomId, { url: null, cachedAt: Date.now() });
      return null;
    })
    .finally(() => {
      inFlightPreviewRequests.delete(restroomId);
    });

  inFlightPreviewRequests.set(restroomId, request);
  return request;
};

export interface RestroomPhotoItem {
  id: string;
  /** Signed or public URL suitable for full-size lightbox display. */
  url: string;
  /** Same as url for now; kept as a separate field for future thumbnail transforms. */
  thumbnailUrl: string;
  createdAt: string;
}

const generateUUID = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
};

const TAG_RATING_IMPACTS: Record<ReviewQuickTag, Partial<Record<string, number>>> = {
  clean: { cleanliness_rating: 5 },
  smelly: { smell_rating: 1 },
  no_line: { wait_rating: 5 },
  crowded: { wait_rating: 1 },
  no_toilet_paper: { cleanliness_rating: 1 },
  locked: { privacy_rating: 1 }
};

const computeDetailRatings = (tags: ReviewQuickTag[], overall: number) => {
  const impacts: Record<string, number[]> = { smell_rating: [], cleanliness_rating: [], wait_rating: [], privacy_rating: [] };
  for (const tag of tags) {
    const tagImpacts = TAG_RATING_IMPACTS[tag];
    if (tagImpacts) {
      for (const [field, val] of Object.entries(tagImpacts)) {
        impacts[field].push(val as number);
      }
    }
  }
  const resolve = (field: string) => {
    const vals = impacts[field];
    if (!vals || vals.length === 0) return overall;
    return Math.max(1, Math.min(5, Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10));
  };
  return {
    smell_rating: resolve("smell_rating"),
    cleanliness_rating: resolve("cleanliness_rating"),
    wait_rating: resolve("wait_rating"),
    privacy_rating: resolve("privacy_rating")
  };
};

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
    .order("created_at", { ascending: false })
    .limit(PHOTO_LIMIT);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as { id: string; storage_path: string; created_at: string }[];
  if (rows.length === 0) return [];

  const paths = rows.map((r) => r.storage_path);

  // Try batch signed URLs first (works when the user is authenticated or the bucket allows it).
  // Fall back to public URLs for each path that doesn't get a signed URL.
  const { data: signedBatch } = await supabase.storage.from(RESTROOM_PHOTOS_BUCKET).createSignedUrls(paths, PHOTO_SIGNED_URL_EXPIRY_SECONDS);

  const signedUrlByPath = new Map<string, string>();
  if (signedBatch) {
    for (const item of signedBatch) {
      if (!item.error && item.path && item.signedUrl) {
        signedUrlByPath.set(item.path, item.signedUrl);
      }
    }
  }

  return rows.map((row) => {
    const signed = signedUrlByPath.get(row.storage_path);
    const url = signed ?? supabase.storage.from(RESTROOM_PHOTOS_BUCKET).getPublicUrl(row.storage_path).data.publicUrl;
    return {
      id: row.id,
      url,
      thumbnailUrl: url,
      createdAt: row.created_at
    };
  });
};

export interface SubmitReviewInput {
  bathroomId: string;
  overallRating: number;
  quickTags: ReviewQuickTag[];
  reviewText: string;
  profileId: string;
}

export const submitRestroomReview = async (input: SubmitReviewInput): Promise<void> => {
  const { bathroomId, overallRating, quickTags, reviewText, profileId } = input;
  const detailRatings = computeDetailRatings(quickTags, overallRating);

  const { error } = await supabase.from("reviews").insert({
    id: generateUUID(),
    bathroom_id: bathroomId,
    profile_id: profileId,
    user_id: profileId,
    overall_rating: overallRating,
    ...detailRatings,
    review_text: reviewText.trim(),
    quick_tags: quickTags,
    visit_time: new Date().toISOString(),
    status: "active"
  });

  if (error) throw new Error(error.message);
};

export interface UploadPhotoInput {
  bathroomId: string;
  imageUri: string;
  mimeType?: string;
  profileId: string;
}

export const uploadRestroomPhoto = async (input: UploadPhotoInput): Promise<void> => {
  const { bathroomId, imageUri, mimeType, profileId } = input;

  const fetchResponse = await fetch(imageUri);
  const blob = await fetchResponse.blob();

  const rawExt = (mimeType?.split("/")[1] ?? imageUri.split(".").pop()?.toLowerCase() ?? "jpg").replace("jpeg", "jpg");
  const ext = rawExt.length > 5 ? "jpg" : rawExt;
  const photoId = generateUUID();
  const storagePath = `${bathroomId}/${photoId}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(RESTROOM_PHOTOS_BUCKET).upload(storagePath, blob, {
    contentType: mimeType ?? "image/jpeg",
    cacheControl: "3600"
  });

  if (uploadError) throw new Error(uploadError.message);

  const { error: insertError } = await supabase.from("photos").insert({
    id: photoId,
    bathroom_id: bathroomId,
    profile_id: profileId,
    user_id: profileId,
    storage_path: storagePath,
    status: "pending"
  });

  if (insertError) {
    await supabase.storage.from(RESTROOM_PHOTOS_BUCKET).remove([storagePath]);
    throw new Error(insertError.message);
  }
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
