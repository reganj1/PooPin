import type {
  ApiErrorResponse,
  NearbyRestroomsQuery,
  NearbyRestroomsResponse,
  RestroomDetailResponse,
  SendEmailOtpResponse
} from "@poopin/api-client";
import { mobileEnv } from "./env";

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

export const getRestroom = async (id: string): Promise<RestroomDetailResponse> => {
  return fetchJson<RestroomDetailResponse>(createUrl(`/api/restrooms/${encodeURIComponent(id)}`));
};
