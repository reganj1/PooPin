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

  // [DEBUG] — remove once the failing request is identified
  const method = init?.method ?? "GET";
  console.log(`[DEBUG fetch] → ${method} ${url}`);

  try {
    response = await fetch(url, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network request failed";
    // [DEBUG]
    console.warn(`[DEBUG fetch] ✗ NETWORK ERROR ${method} ${url}`, message);
    throw new Error(`Request to ${url} failed before a response was received. ${message}`);
  }

  // [DEBUG]
  if (!response.ok) {
    console.warn(`[DEBUG fetch] ✗ HTTP ${response.status} ${method} ${url}`);
  } else {
    console.log(`[DEBUG fetch] ✓ ${response.status} ${method} ${url}`);
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

// ─── Leaderboard ─────────────────────────────────────────────────────────────
// The leaderboard_profile_stats Supabase view requires the service-role key to
// bypass the `profiles` table RLS (which restricts each user to their own row).
// The mobile anon/authenticated client cannot read that view directly, so we
// delegate to the web API which runs with the service-role key server-side.

export interface LeaderboardEntry {
  rank: number;
  profileId: string;
  displayName: string;
  totalPoints: number;
  reviewCount: number;
  photoCount: number;
  restroomAddCount: number;
  contributionCount: number;
  lastContributionAt: string | null;
  /** Collectible card title attached server-side (may be null for users with no activity). */
  collectibleTitle: string | null;
  /** Collectible card rarity string (e.g. "Common", "Legendary"). */
  collectibleRarity: string | null;
}

export interface LeaderboardResult {
  entries: LeaderboardEntry[];
  totalContributors: number;
  /** The signed-in user's own standing when they fall outside the top entries. */
  currentViewerEntry: LeaderboardEntry | null;
}

export const getLeaderboard = async (limit = 50, profileId?: string | null): Promise<LeaderboardResult> => {
  const params: Record<string, string | number | undefined> = { limit };
  if (profileId) params.profileId = profileId;

  const data = await fetchJson<{
    entries: LeaderboardEntry[];
    totalContributors: number;
    currentViewerEntry: LeaderboardEntry | null;
  }>(createUrl("/api/leaderboard", params));

  return {
    entries: data.entries ?? [],
    totalContributors: data.totalContributors ?? (data.entries?.length ?? 0),
    currentViewerEntry: data.currentViewerEntry ?? null
  };
};

// ─── Profile (mobile-direct Supabase mutations) ──────────────────────────────
// The web profile API routes use cookie-based session auth, which mobile cannot
// replicate. Instead, the mobile Supabase client sends the JWT automatically,
// and the `profiles` table RLS (supabase_auth_user_id = auth.uid()) ensures
// each user can only read/mutate their own row.

export interface MyProfile {
  id: string;
  displayName: string;
  activeCardKey: string | null;
}

export const getMyProfile = async (): Promise<MyProfile | null> => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, active_card_key")
    .maybeSingle();

  if (error || !data) return null;

  const row = data as { id: string; display_name: string | null; active_card_key: string | null };
  return {
    id: row.id,
    displayName: row.display_name?.trim() || "Poopin Pal",
    activeCardKey: row.active_card_key ?? null
  };
};

const DISPLAY_NAME_RE = /^[A-Za-z0-9' -]+$/;

export const updateMyDisplayName = async (
  profileId: string,
  newName: string
): Promise<{ success: true; displayName: string } | { error: string }> => {
  const normalized = newName.trim().replace(/\s+/g, " ");
  if (normalized.length < 3) return { error: "Display name must be at least 3 characters." };
  if (normalized.length > 40) return { error: "Display name must be 40 characters or fewer." };
  if (!DISPLAY_NAME_RE.test(normalized)) {
    return { error: "Use letters, numbers, spaces, apostrophes, or hyphens only." };
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: normalized, updated_at: new Date().toISOString() })
    .eq("id", profileId)
    .select("display_name")
    .maybeSingle();

  if (error) {
    const msg = error.message ?? "";
    if (error.code === "23505" || msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate")) {
      return { error: "That name is already taken. Try another one." };
    }
    return { error: msg || "Could not update your name right now." };
  }

  const row = data as { display_name: string | null } | null;
  return { success: true, displayName: row?.display_name?.trim() || normalized };
};

export const updateMyActiveCard = async (
  profileId: string,
  cardKey: string
): Promise<{ success: true } | { error: string }> => {
  const { error } = await supabase
    .from("profiles")
    .update({ active_card_key: cardKey, updated_at: new Date().toISOString() })
    .eq("id", profileId);

  if (error) return { error: error.message || "Could not update your active card." };
  return { success: true };
};

export const getMyContributionCounts = async (
  profileId: string
): Promise<{ reviewCount: number; photoCount: number; restroomAddCount: number }> => {
  const [reviewRes, photoRes, restroomRes] = await Promise.all([
    supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId)
      .eq("status", "active"),
    supabase
      .from("photos")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId),
    supabase
      .from("bathrooms")
      .select("id", { count: "exact", head: true })
      .eq("created_by_profile_id", profileId)
      .eq("source", "user")
  ]);

  return {
    reviewCount: reviewRes.count ?? 0,
    photoCount: photoRes.count ?? 0,
    restroomAddCount: restroomRes.count ?? 0
  };
};

// ─── Point events (leaderboard activity) ─────────────────────────────────────
// Queries the `point_events` table directly via the authenticated Supabase
// client. RLS should allow `SELECT WHERE profile_id = auth.uid()` since the
// web also uses the auth client (not admin) for the same query.
// If RLS blocks the query, the function returns silently empty — no crash.

export type PointEventType = "review_created" | "photo_uploaded" | "restroom_added";

export interface PointEventSummary {
  id: string;
  eventType: PointEventType;
  pointsDelta: number;
  createdAt: string;
}

/** Leaderboard point values (review +5, photo +7, restroom +10). */
export const LEADERBOARD_POINT_VALUES: Record<PointEventType, number> = {
  review_created: 5,
  photo_uploaded: 7,
  restroom_added: 10
};

export const formatPointEventLabel = (eventType: PointEventType): string => {
  switch (eventType) {
    case "review_created":
      return "Review posted";
    case "photo_uploaded":
      return "Photo uploaded";
    case "restroom_added":
      return "Restroom added";
    default:
      return "Contribution";
  }
};

export const getMyRecentActivity = async (
  profileId: string,
  limit = 6
): Promise<PointEventSummary[]> => {
  try {
    const { data } = await supabase
      .from("point_events")
      .select("id, event_type, points_delta, created_at")
      .eq("profile_id", profileId)
      .eq("status", "awarded")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!data) return [];

    return (
      data as Array<{
        id: string;
        event_type: string;
        points_delta: number;
        created_at: string;
      }>
    ).map((row) => ({
      id: row.id,
      eventType: row.event_type as PointEventType,
      pointsDelta: row.points_delta,
      createdAt: row.created_at
    }));
  } catch {
    return [];
  }
};

// ─── Your List (contribution history) ────────────────────────────────────────
// Fetches the signed-in user's awarded point_events then enriches each row
// with restroom name/address via batch lookups on reviews, photos, and
// bathrooms. All queries use the authenticated Supabase client — RLS allows
// a user to read their own point_events, reviews, and photos.

export interface YourListItem {
  id: string;
  eventType: PointEventType;
  pointsDelta: number;
  createdAt: string;
  entityId: string;
  restroomId: string | null;
  restroomName: string | null;
  restroomAddressLine: string | null;
  overallRating: number | null;
  reviewText: string | null;
  quickTags: string[] | null;
}

export const getMyContributions = async (
  profileId: string,
  limit = 60
): Promise<YourListItem[]> => {
  try {
    // 1 — Fetch point events
    const { data: events } = await supabase
      .from("point_events")
      .select("id, event_type, entity_id, points_delta, created_at")
      .eq("profile_id", profileId)
      .eq("status", "awarded")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!events?.length) return [];

    type RawEvent = { id: string; event_type: string; entity_id: string; points_delta: number; created_at: string };

    // 2 — Bucket entity IDs by type
    const reviewIds: string[] = [];
    const photoIds: string[] = [];
    const restroomIds: string[] = [];

    for (const e of events as RawEvent[]) {
      if (e.event_type === "review_created") reviewIds.push(e.entity_id);
      else if (e.event_type === "photo_uploaded") photoIds.push(e.entity_id);
      else if (e.event_type === "restroom_added") restroomIds.push(e.entity_id);
    }

    // 3 — Batch fetch reviews + photos in parallel
    type RawReview = { id: string; bathroom_id: string; overall_rating: number; review_text: string; quick_tags: string[] | null };
    type RawPhoto = { id: string; bathroom_id: string };
    type RawBathroom = { id: string; name: string; address: string; city: string; state: string };

    const [reviews, photos] = await Promise.all([
      reviewIds.length > 0
        ? supabase
            .from("reviews")
            .select("id, bathroom_id, overall_rating, review_text, quick_tags")
            .in("id", reviewIds)
            .then((r) => (r.data ?? []) as RawReview[])
        : Promise.resolve([] as RawReview[]),
      photoIds.length > 0
        ? supabase
            .from("photos")
            .select("id, bathroom_id")
            .in("id", photoIds)
            .then((r) => (r.data ?? []) as RawPhoto[])
        : Promise.resolve([] as RawPhoto[])
    ]);

    // 4 — Collect unique bathroom IDs and batch fetch
    const bathroomIdSet = new Set<string>([
      ...reviews.map((r) => r.bathroom_id).filter(Boolean),
      ...photos.map((p) => p.bathroom_id).filter(Boolean),
      ...restroomIds
    ]);

    const bathroomIds = [...bathroomIdSet];
    const bathrooms =
      bathroomIds.length > 0
        ? ((
            await supabase
              .from("bathrooms")
              .select("id, name, address, city, state")
              .in("id", bathroomIds)
          ).data ?? []) as RawBathroom[]
        : [];

    // 5 — Build lookup maps
    const reviewMap = new Map(reviews.map((r) => [r.id, r]));
    const photoMap = new Map(photos.map((p) => [p.id, p]));
    const bathroomMap = new Map(bathrooms.map((b) => [b.id, b]));

    // 6 — Assemble final items
    return (events as RawEvent[]).map((e) => {
      let restroomId: string | null = null;
      let overallRating: number | null = null;
      let reviewText: string | null = null;
      let quickTags: string[] | null = null;

      if (e.event_type === "review_created") {
        const rev = reviewMap.get(e.entity_id);
        restroomId = rev?.bathroom_id ?? null;
        overallRating = rev?.overall_rating ?? null;
        reviewText = rev?.review_text?.trim() || null;
        quickTags = rev?.quick_tags ?? null;
      } else if (e.event_type === "photo_uploaded") {
        restroomId = photoMap.get(e.entity_id)?.bathroom_id ?? null;
      } else if (e.event_type === "restroom_added") {
        restroomId = e.entity_id;
      }

      const bth = restroomId ? bathroomMap.get(restroomId) : null;

      return {
        id: e.id,
        eventType: e.event_type as PointEventType,
        pointsDelta: e.points_delta,
        createdAt: e.created_at,
        entityId: e.entity_id,
        restroomId: restroomId ?? null,
        restroomName: bth?.name ?? null,
        restroomAddressLine: bth ? [bth.address, bth.city].filter(Boolean).join(", ") : null,
        overallRating,
        reviewText,
        quickTags
      };
    });
  } catch {
    return [];
  }
};

// ─── Contact form ────────────────────────────────────────────────────────────

export const CONTACT_TOPICS = [
  { value: "general_feedback", label: "General feedback" },
  { value: "incorrect_restroom_info", label: "Report incorrect restroom info" },
  { value: "photo_or_content_issue", label: "Report photo or content issue" },
  { value: "business_or_partnership", label: "Business or partnership inquiry" },
  { value: "press_or_media", label: "Press or media" },
  { value: "other", label: "Other" }
] as const;

export type ContactTopic = (typeof CONTACT_TOPICS)[number]["value"];

export interface ContactFormValues {
  name: string;
  email: string;
  topic: ContactTopic;
  message: string;
  restroomReference: string;
  cityLocation: string;
}

export interface ContactSubmitResult {
  message: string;
  submissionId?: string | null;
}

/** Mirrors the field-level errors from the web /api/contact endpoint. */
export type ContactFieldErrors = Partial<Record<keyof ContactFormValues, string>>;

export class ContactApiError extends Error {
  fieldErrors?: ContactFieldErrors;
  constructor(message: string, fieldErrors?: ContactFieldErrors) {
    super(message);
    this.name = "ContactApiError";
    this.fieldErrors = fieldErrors;
  }
}

export const submitContactForm = async (values: ContactFormValues): Promise<ContactSubmitResult> => {
  const url = createUrl("/api/contact");
  console.log(`[DEBUG fetch] → POST ${url}`);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: values.name.trim(),
        email: values.email.trim().toLowerCase(),
        topic: values.topic,
        message: values.message.trim(),
        restroomReference: values.restroomReference.trim() || undefined,
        cityLocation: values.cityLocation.trim() || undefined
      })
    });
  } catch {
    throw new ContactApiError("Could not send your message. Please check your connection and try again.");
  }

  const payload = await response.json().catch(() => null) as {
    success?: boolean;
    message?: string;
    submissionId?: string;
    error?: string;
    fieldErrors?: Partial<Record<keyof ContactFormValues, string[]>>;
  } | null;

  if (!response.ok) {
    const firstFieldErrors = payload?.fieldErrors
      ? (Object.fromEntries(
          Object.entries(payload.fieldErrors).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
        ) as ContactFieldErrors)
      : undefined;
    throw new ContactApiError(
      payload?.error ?? "Could not send your message right now. Please try again.",
      firstFieldErrors
    );
  }

  console.log(`[DEBUG fetch] ✓ 200 POST ${url}`);
  return {
    message: payload?.message ?? "Thanks for reaching out. Our team will review this message shortly.",
    submissionId: payload?.submissionId ?? null
  };
};
