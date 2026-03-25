import { Bathroom, NearbyBathroom, Review } from "@/types";
import { getUserProfilesByIds } from "@/lib/auth/userProfiles";
import { getCollectibleIdentitiesByProfileIds } from "@/lib/collectibles/identity";
import { attachReviewEngagement } from "@/lib/data/reviewEngagement";
import { getSupabaseServerClient, getSupabaseServerClientConfigIssue } from "@/lib/supabase/server";
import {
  getBathroomById as getMockBathroomById,
  getBathroomsInBounds as getMockBathroomsInBounds,
  getBathroomReviews as getMockBathroomReviews,
  getNearbyBathrooms as getMockNearbyBathrooms
} from "@/lib/mock/restrooms";
import { bathroomAccessTypeOptions, bathroomPlaceTypeOptions } from "@/lib/validations/bathroom";
import { buildBathroomRatingSummary } from "@/lib/utils/reviewPresentation";
import { normalizeReviewQuickTags } from "@/lib/utils/reviewSignals";

const DEFAULT_ORIGIN = { lat: 37.7749, lng: -122.4194 };
const DEFAULT_LIMIT = 12;
const ACTIVE_STATUS = "active";
const REVIEW_QUERY_BATHROOM_ID_BATCH_SIZE = 100;
const moderationStatusOptions = ["active", "pending", "flagged", "removed"] as const;
const sourceOptions = ["user", "google_places", "city_open_data", "openstreetmap", "partner", "la_controller", "other"] as const;
const allowedPlaceTypes = new Set<(typeof bathroomPlaceTypeOptions)[number]>(bathroomPlaceTypeOptions);
const allowedAccessTypes = new Set<(typeof bathroomAccessTypeOptions)[number]>(bathroomAccessTypeOptions);
const allowedModerationStatuses = new Set<(typeof moderationStatusOptions)[number]>(moderationStatusOptions);
const allowedSources = new Set<(typeof sourceOptions)[number]>(sourceOptions);

const isPlaceType = (value: string): value is Bathroom["place_type"] =>
  allowedPlaceTypes.has(value as (typeof bathroomPlaceTypeOptions)[number]);
const isAccessType = (value: string): value is Bathroom["access_type"] =>
  allowedAccessTypes.has(value as (typeof bathroomAccessTypeOptions)[number]);
const isModerationStatus = (value: string): value is Bathroom["status"] =>
  allowedModerationStatuses.has(value as (typeof moderationStatusOptions)[number]);
const isSource = (value: string): value is Bathroom["source"] => allowedSources.has(value as (typeof sourceOptions)[number]);

interface BathroomRow {
  id: string;
  name: string;
  place_type: string;
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  access_type: string;
  has_baby_station: boolean;
  is_gender_neutral: boolean;
  is_accessible: boolean;
  requires_purchase: boolean;
  created_by_profile_id: string | null;
  created_by: string | null;
  created_at: string;
  status: string;
  source: string;
  source_external_id: string | null;
}

interface ReviewRow {
  id: string;
  bathroom_id: string;
  profile_id: string | null;
  user_id: string | null;
  overall_rating: number;
  smell_rating: number;
  cleanliness_rating: number;
  wait_rating: number;
  privacy_rating: number;
  review_text: string | null;
  quick_tags?: string[] | null;
  visit_time: string | null;
  created_at: string;
  status: string;
}

export interface BathroomBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

const roundToOne = (value: number) => Math.round(value * 10) / 10;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const haversineDistanceMiles = (origin: { lat: number; lng: number }, point: { lat: number; lng: number }) => {
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(point.lat - origin.lat);
  const dLng = toRadians(point.lng - origin.lng);
  const lat1 = toRadians(origin.lat);
  const lat2 = toRadians(point.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMiles * c;
};

const toBathroom = (row: BathroomRow): Bathroom | null => {
  if (!isPlaceType(row.place_type) || !isAccessType(row.access_type)) {
    return null;
  }

  if (!isModerationStatus(row.status) || !isSource(row.source)) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    place_type: row.place_type,
    address: row.address,
    city: row.city,
    state: row.state,
    lat: row.lat,
    lng: row.lng,
    access_type: row.access_type,
    has_baby_station: row.has_baby_station,
    is_gender_neutral: row.is_gender_neutral,
    is_accessible: row.is_accessible,
    requires_purchase: row.requires_purchase,
    created_by_profile_id: row.created_by_profile_id ?? row.created_by,
    created_at: row.created_at,
    status: row.status,
    source: row.source,
    source_external_id: row.source_external_id
  };
};

const toReview = (row: ReviewRow): Review | null => {
  if (!isModerationStatus(row.status)) {
    return null;
  }

  return {
    id: row.id,
    bathroom_id: row.bathroom_id,
    profile_id: row.profile_id ?? row.user_id,
    author_display_name: null,
    overall_rating: row.overall_rating,
    smell_rating: row.smell_rating,
    cleanliness_rating: row.cleanliness_rating,
    wait_rating: row.wait_rating,
    privacy_rating: row.privacy_rating,
    review_text: row.review_text ?? "",
    quick_tags: normalizeReviewQuickTags(row.quick_tags ?? []),
    visit_time: row.visit_time ?? row.created_at,
    created_at: row.created_at,
    status: row.status
  };
};

const attachReviewAuthors = async (reviews: Review[]): Promise<Review[]> => {
  const profileIds = reviews.map((review) => review.profile_id).filter((profileId): profileId is string => typeof profileId === "string");
  if (profileIds.length === 0) {
    return reviews;
  }

  try {
    const profilesById = await getUserProfilesByIds(profileIds);
    const collectibleIdentities = await getCollectibleIdentitiesByProfileIds(profileIds);
    return reviews.map((review) => ({
      ...review,
      author_display_name: review.profile_id ? profilesById.get(review.profile_id)?.display_name ?? null : null,
      author_collectible_title: review.profile_id ? collectibleIdentities.get(review.profile_id)?.activeCardTitle ?? null : null,
      author_collectible_rarity: review.profile_id ? collectibleIdentities.get(review.profile_id)?.activeCardRarity ?? null : null
    }));
  } catch (error) {
    console.warn("[Poopin] Could not load review author profiles, falling back to anonymous labels.", getErrorMessage(error));
    return reviews;
  }
};

const buildRatingMap = (reviews: Review[]) => {
  const grouped = new Map<string, Review[]>();

  for (const review of reviews) {
    const current = grouped.get(review.bathroom_id);
    if (current) {
      current.push(review);
    } else {
      grouped.set(review.bathroom_id, [review]);
    }
  }

  const ratings = new Map<string, NearbyBathroom["ratings"]>();

  for (const [bathroomId, bathroomReviews] of grouped.entries()) {
    ratings.set(bathroomId, buildBathroomRatingSummary(bathroomReviews));
  }

  return ratings;
};

const emptyRatings = () => ({
  overall: 0,
  smell: 0,
  cleanliness: 0,
  reviewCount: 0,
  qualitySignals: []
});

const toNearbyBathroom = (
  bathroom: Bathroom,
  ratingsMap: Map<string, NearbyBathroom["ratings"]>,
  origin: { lat: number; lng: number }
): NearbyBathroom => {
  return {
    ...bathroom,
    distanceMiles: roundToOne(haversineDistanceMiles(origin, { lat: bathroom.lat, lng: bathroom.lng })),
    ratings: ratingsMap.get(bathroom.id) ?? emptyRatings()
  };
};

const chunkItems = <T,>(items: T[], batchSize: number) => {
  if (items.length === 0) {
    return [] as T[][];
  }

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    chunks.push(items.slice(index, index + batchSize));
  }

  return chunks;
};

const supabaseHostForLogs = (() => {
  const rawUrl = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  if (!rawUrl) {
    return "unconfigured";
  }

  try {
    return new URL(rawUrl).host;
  } catch {
    return "invalid_url";
  }
})();

let hasLoggedSupabaseConfigIssue = false;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }

  return "Unknown error";
};

const isSupabaseNetworkFetchFailure = (message: string) => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("fetch failed") ||
    normalized.includes("enotfound") ||
    normalized.includes("econnrefused") ||
    normalized.includes("etimedout") ||
    normalized.includes("network")
  );
};

const logSupabaseFallback = (context: string, error: unknown) => {
  const message = getErrorMessage(error);
  if (isSupabaseNetworkFetchFailure(message)) {
    console.warn(`[Poopin] ${context} failed, using mock data.`, {
      error: message,
      supabaseHost: supabaseHostForLogs,
      hint: "Verify Supabase URL/key env vars and local network access to Supabase."
    });
    return;
  }

  console.warn(`[Poopin] ${context} failed, using mock data.`, message);
};

const logSupabaseConfigFallback = () => {
  if (hasLoggedSupabaseConfigIssue) {
    return;
  }

  hasLoggedSupabaseConfigIssue = true;
  const configIssue = getSupabaseServerClientConfigIssue();
  if (!configIssue) {
    return;
  }

  console.warn("[Poopin] Supabase server client unavailable, using mock data.", {
    issue: configIssue
  });
};

const fetchActiveReviewRowsByBathroomIds = async (
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  bathroomIds: string[],
  context: string
) => {
  const uniqueBathroomIds = [...new Set(bathroomIds)];
  const idChunks = chunkItems(uniqueBathroomIds, REVIEW_QUERY_BATHROOM_ID_BATCH_SIZE);
  const collectedRows: ReviewRow[] = [];

  if (process.env.NODE_ENV !== "production" && idChunks.length > 1) {
    console.info(`[Poopin] ${context} using chunked review fetch.`, {
      bathroomCount: uniqueBathroomIds.length,
      chunkCount: idChunks.length,
      chunkSize: REVIEW_QUERY_BATHROOM_ID_BATCH_SIZE
    });
  }

  for (let chunkIndex = 0; chunkIndex < idChunks.length; chunkIndex += 1) {
    const chunkBathroomIds = idChunks[chunkIndex];
    const { data: reviewRows, error: reviewError } = await supabase
      .from("reviews")
      .select("*")
      .in("bathroom_id", chunkBathroomIds)
      .eq("status", ACTIVE_STATUS);

    if (reviewError) {
      throw new Error(`${context} chunk ${chunkIndex + 1}/${idChunks.length} failed: ${reviewError.message}`);
    }

    collectedRows.push(...((reviewRows ?? []) as ReviewRow[]));
  }

  return collectedRows;
};

export async function getNearbyBathroomsData(
  origin: { lat: number; lng: number } = DEFAULT_ORIGIN,
  limit = DEFAULT_LIMIT
): Promise<NearbyBathroom[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    logSupabaseConfigFallback();
    return getMockNearbyBathrooms(origin, limit);
  }

  const { data: bathroomRows, error: bathroomError } = await supabase
    .from("bathrooms")
    .select("*")
    .eq("status", ACTIVE_STATUS)
    .limit(500);

  if (bathroomError || !bathroomRows) {
    logSupabaseFallback("Supabase bathroom query", bathroomError ?? new Error("Bathroom rows missing."));
    return getMockNearbyBathrooms(origin, limit);
  }

  const bathrooms = (bathroomRows as BathroomRow[]).map(toBathroom).filter((row): row is Bathroom => row !== null);

  if (bathrooms.length === 0) {
    return [];
  }

  const bathroomIds = bathrooms.map((bathroom) => bathroom.id);

  try {
    const reviewRows = await fetchActiveReviewRowsByBathroomIds(supabase, bathroomIds, "Supabase review query");
    const reviews = reviewRows.map(toReview).filter((row): row is Review => row !== null);
    const ratingsMap = buildRatingMap(reviews);

    return bathrooms
      .map((bathroom) => toNearbyBathroom(bathroom, ratingsMap, origin))
      .sort((a, b) => a.distanceMiles - b.distanceMiles)
      .slice(0, limit);
  } catch (error) {
    logSupabaseFallback("Supabase review query", error);
    return getMockNearbyBathrooms(origin, limit);
  }
}

export async function getBathroomByIdData(id: string): Promise<NearbyBathroom | undefined> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    logSupabaseConfigFallback();
    return getMockBathroomById(id);
  }

  const { data: bathroomRow, error: bathroomError } = await supabase
    .from("bathrooms")
    .select("*")
    .eq("id", id)
    .eq("status", ACTIVE_STATUS)
    .maybeSingle();

  if (bathroomError) {
    logSupabaseFallback("Supabase bathroom detail query", bathroomError);
    return getMockBathroomById(id);
  }

  if (!bathroomRow) {
    return undefined;
  }

  const bathroom = toBathroom(bathroomRow as BathroomRow);
  if (!bathroom) {
    return undefined;
  }

  try {
    const { data: reviewRows, error: reviewError } = await supabase
      .from("reviews")
      .select("*")
      .eq("bathroom_id", id)
      .eq("status", ACTIVE_STATUS);

    if (reviewError) {
      logSupabaseFallback("Supabase review summary query", reviewError);
      return getMockBathroomById(id);
    }

    const reviews = ((reviewRows ?? []) as ReviewRow[]).map(toReview).filter((row): row is Review => row !== null);
    const ratingsMap = buildRatingMap(reviews);

    return toNearbyBathroom(bathroom, ratingsMap, DEFAULT_ORIGIN);
  } catch (error) {
    logSupabaseFallback("Supabase review summary query", error);
    return getMockBathroomById(id);
  }
}

export async function getBathroomReviewsData(bathroomId: string, viewerProfileId?: string | null): Promise<Review[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    logSupabaseConfigFallback();
    return getMockBathroomReviews(bathroomId);
  }

  try {
    const { data: reviewRows, error } = await supabase
      .from("reviews")
      .select("*")
      .eq("bathroom_id", bathroomId)
      .eq("status", ACTIVE_STATUS)
      .order("created_at", { ascending: false });

    if (error) {
      logSupabaseFallback("Supabase review list query", error);
      return getMockBathroomReviews(bathroomId);
    }

    const reviews = ((reviewRows ?? []) as ReviewRow[]).map(toReview).filter((row): row is Review => row !== null);
    const reviewsWithAuthors = await attachReviewAuthors(reviews);
    return await attachReviewEngagement(reviewsWithAuthors, viewerProfileId);
  } catch (error) {
    logSupabaseFallback("Supabase review list query", error);
    return getMockBathroomReviews(bathroomId);
  }
}

export async function getBathroomsInBoundsData(
  bounds: BathroomBounds,
  limit = 300,
  origin: { lat: number; lng: number } = DEFAULT_ORIGIN
): Promise<NearbyBathroom[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    logSupabaseConfigFallback();
    return getMockBathroomsInBounds(bounds, limit, origin);
  }

  const { data: bathroomRows, error: bathroomError } = await supabase
    .from("bathrooms")
    .select("*")
    .eq("status", ACTIVE_STATUS)
    .gte("lat", bounds.minLat)
    .lte("lat", bounds.maxLat)
    .gte("lng", bounds.minLng)
    .lte("lng", bounds.maxLng)
    .limit(limit);

  if (bathroomError || !bathroomRows) {
    logSupabaseFallback("Supabase bounds bathroom query", bathroomError ?? new Error("Bathroom rows missing."));
    return getMockBathroomsInBounds(bounds, limit, origin);
  }

  const bathrooms = (bathroomRows as BathroomRow[]).map(toBathroom).filter((row): row is Bathroom => row !== null);

  if (bathrooms.length === 0) {
    return [];
  }

  const bathroomIds = bathrooms.map((bathroom) => bathroom.id);

  try {
    const reviewRows = await fetchActiveReviewRowsByBathroomIds(supabase, bathroomIds, "Supabase bounds review query");
    const reviews = reviewRows.map(toReview).filter((row): row is Review => row !== null);
    const ratingsMap = buildRatingMap(reviews);

    return bathrooms
      .map((bathroom) => toNearbyBathroom(bathroom, ratingsMap, origin))
      .sort((a, b) => a.distanceMiles - b.distanceMiles);
  } catch (error) {
    logSupabaseFallback("Supabase bounds review query", error);
    return getMockBathroomsInBounds(bounds, limit, origin);
  }
}
