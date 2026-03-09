import { Bathroom, NearbyBathroom, Review } from "@/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  getBathroomById as getMockBathroomById,
  getBathroomsInBounds as getMockBathroomsInBounds,
  getBathroomReviews as getMockBathroomReviews,
  getNearbyBathrooms as getMockNearbyBathrooms
} from "@/lib/mock/restrooms";
import { bathroomAccessTypeOptions, bathroomPlaceTypeOptions } from "@/lib/validations/bathroom";

const DEFAULT_ORIGIN = { lat: 37.7749, lng: -122.4194 };
const DEFAULT_LIMIT = 12;
const ACTIVE_STATUS = "active";
const moderationStatusOptions = ["active", "pending", "flagged", "removed"] as const;
const sourceOptions = ["user", "google_places", "city_open_data", "openstreetmap", "partner", "other"] as const;
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
  created_by: string | null;
  created_at: string;
  status: string;
  source: string;
  source_external_id: string | null;
}

interface ReviewRow {
  id: string;
  bathroom_id: string;
  user_id: string | null;
  overall_rating: number;
  smell_rating: number;
  cleanliness_rating: number;
  wait_rating: number;
  privacy_rating: number;
  review_text: string | null;
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
    created_by: row.created_by,
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
    user_id: row.user_id,
    overall_rating: row.overall_rating,
    smell_rating: row.smell_rating,
    cleanliness_rating: row.cleanliness_rating,
    wait_rating: row.wait_rating,
    privacy_rating: row.privacy_rating,
    review_text: row.review_text ?? "",
    visit_time: row.visit_time ?? row.created_at,
    created_at: row.created_at,
    status: row.status
  };
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
    const totals = bathroomReviews.reduce(
      (acc, review) => {
        acc.overall += review.overall_rating;
        acc.smell += review.smell_rating;
        acc.cleanliness += review.cleanliness_rating;
        return acc;
      },
      { overall: 0, smell: 0, cleanliness: 0 }
    );

    ratings.set(bathroomId, {
      overall: roundToOne(totals.overall / bathroomReviews.length),
      smell: roundToOne(totals.smell / bathroomReviews.length),
      cleanliness: roundToOne(totals.cleanliness / bathroomReviews.length),
      reviewCount: bathroomReviews.length
    });
  }

  return ratings;
};

const emptyRatings = () => ({
  overall: 0,
  smell: 0,
  cleanliness: 0,
  reviewCount: 0
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

export async function getNearbyBathroomsData(
  origin: { lat: number; lng: number } = DEFAULT_ORIGIN,
  limit = DEFAULT_LIMIT
): Promise<NearbyBathroom[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return getMockNearbyBathrooms(origin, limit);
  }

  const { data: bathroomRows, error: bathroomError } = await supabase
    .from("bathrooms")
    .select("*")
    .eq("status", ACTIVE_STATUS)
    .limit(500);

  if (bathroomError || !bathroomRows) {
    console.warn("[Poopin] Supabase bathroom query failed, using mock data.", bathroomError?.message);
    return getMockNearbyBathrooms(origin, limit);
  }

  const bathrooms = (bathroomRows as BathroomRow[]).map(toBathroom).filter((row): row is Bathroom => row !== null);

  if (bathrooms.length === 0) {
    return [];
  }

  const bathroomIds = bathrooms.map((bathroom) => bathroom.id);

  const { data: reviewRows, error: reviewError } = await supabase
    .from("reviews")
    .select("*")
    .in("bathroom_id", bathroomIds)
    .eq("status", ACTIVE_STATUS);

  if (reviewError) {
    console.warn("[Poopin] Supabase review query failed, using mock data.", reviewError.message);
    return getMockNearbyBathrooms(origin, limit);
  }

  const reviews = ((reviewRows ?? []) as ReviewRow[]).map(toReview).filter((row): row is Review => row !== null);
  const ratingsMap = buildRatingMap(reviews);

  return bathrooms
    .map((bathroom) => toNearbyBathroom(bathroom, ratingsMap, origin))
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, limit);
}

export async function getBathroomByIdData(id: string): Promise<NearbyBathroom | undefined> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return getMockBathroomById(id);
  }

  const { data: bathroomRow, error: bathroomError } = await supabase
    .from("bathrooms")
    .select("*")
    .eq("id", id)
    .eq("status", ACTIVE_STATUS)
    .maybeSingle();

  if (bathroomError) {
    console.warn("[Poopin] Supabase bathroom detail query failed, using mock data.", bathroomError.message);
    return getMockBathroomById(id);
  }

  if (!bathroomRow) {
    return undefined;
  }

  const bathroom = toBathroom(bathroomRow as BathroomRow);
  if (!bathroom) {
    return undefined;
  }

  const { data: reviewRows, error: reviewError } = await supabase
    .from("reviews")
    .select("*")
    .eq("bathroom_id", id)
    .eq("status", ACTIVE_STATUS);

  if (reviewError) {
    console.warn("[Poopin] Supabase review summary query failed, using mock data.", reviewError.message);
    return getMockBathroomById(id);
  }

  const reviews = ((reviewRows ?? []) as ReviewRow[]).map(toReview).filter((row): row is Review => row !== null);
  const ratingsMap = buildRatingMap(reviews);

  return toNearbyBathroom(bathroom, ratingsMap, DEFAULT_ORIGIN);
}

export async function getBathroomReviewsData(bathroomId: string): Promise<Review[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return getMockBathroomReviews(bathroomId);
  }

  const { data: reviewRows, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("bathroom_id", bathroomId)
    .eq("status", ACTIVE_STATUS)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[Poopin] Supabase review list query failed, using mock data.", error.message);
    return getMockBathroomReviews(bathroomId);
  }

  return ((reviewRows ?? []) as ReviewRow[]).map(toReview).filter((row): row is Review => row !== null);
}

export async function getBathroomsInBoundsData(
  bounds: BathroomBounds,
  limit = 300,
  origin: { lat: number; lng: number } = DEFAULT_ORIGIN
): Promise<NearbyBathroom[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
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
    console.warn("[Poopin] Supabase bounds bathroom query failed, using mock data.", bathroomError?.message);
    return getMockBathroomsInBounds(bounds, limit, origin);
  }

  const bathrooms = (bathroomRows as BathroomRow[]).map(toBathroom).filter((row): row is Bathroom => row !== null);

  if (bathrooms.length === 0) {
    return [];
  }

  const bathroomIds = bathrooms.map((bathroom) => bathroom.id);

  const { data: reviewRows, error: reviewError } = await supabase
    .from("reviews")
    .select("*")
    .in("bathroom_id", bathroomIds)
    .eq("status", ACTIVE_STATUS);

  if (reviewError) {
    console.warn("[Poopin] Supabase bounds review query failed, using mock data.", reviewError.message);
    return getMockBathroomsInBounds(bounds, limit, origin);
  }

  const reviews = ((reviewRows ?? []) as ReviewRow[]).map(toReview).filter((row): row is Review => row !== null);
  const ratingsMap = buildRatingMap(reviews);

  return bathrooms
    .map((bathroom) => toNearbyBathroom(bathroom, ratingsMap, origin))
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
}
