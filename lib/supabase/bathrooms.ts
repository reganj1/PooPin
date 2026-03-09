import { SupabaseClient } from "@supabase/supabase-js";
import { BathroomCreateInput } from "@/lib/validations/bathroom";
import { Bathroom } from "@/types";

type BathroomInsertRow = Pick<
  Bathroom,
  | "id"
  | "name"
  | "place_type"
  | "address"
  | "city"
  | "state"
  | "lat"
  | "lng"
  | "access_type"
  | "has_baby_station"
  | "is_gender_neutral"
  | "is_accessible"
  | "requires_purchase"
  | "source"
  | "status"
  | "source_external_id"
  | "created_by"
>;

interface NearbyBathroomLookupRow {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface SubmitBathroomResult {
  outcome: "created" | "duplicate";
  bathroomId: string | null;
  status: Bathroom["status"] | null;
  duplicateBathroomId?: string;
}

const PUBLIC_SUBMISSION_STATUS: Bathroom["status"] = "pending";
const DUPLICATE_LOOKUP_RADIUS_MILES = 0.08;
const STRICT_DUPLICATE_DISTANCE_MILES = 0.03;

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

const normalizeComparableText = (value: string) =>
  value
    .toLowerCase()
    .replace(/\b(restroom|bathroom|toilet|public|wc|room)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const toTokenSet = (value: string) => new Set(value.split(" ").map((token) => token.trim()).filter(Boolean));

const isSimilarName = (a: string, b: string) => {
  const normalizedA = normalizeComparableText(a);
  const normalizedB = normalizeComparableText(b);

  if (!normalizedA || !normalizedB) {
    return false;
  }

  if (normalizedA === normalizedB) {
    return true;
  }

  if (normalizedA.length >= 6 && normalizedB.length >= 6 && (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA))) {
    return true;
  }

  const tokensA = toTokenSet(normalizedA);
  const tokensB = toTokenSet(normalizedB);
  const overlap = [...tokensA].filter((token) => tokensB.has(token)).length;
  const denominator = Math.max(tokensA.size, tokensB.size, 1);

  return overlap / denominator >= 0.7;
};

const isSimilarAddress = (a: string, b: string) => {
  const normalizedA = normalizeComparableText(a);
  const normalizedB = normalizeComparableText(b);
  if (!normalizedA || !normalizedB) {
    return false;
  }

  return normalizedA === normalizedB || normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA);
};

const findDuplicateBathroomId = async (
  supabaseClient: SupabaseClient,
  input: BathroomCreateInput
): Promise<string | null> => {
  const latDelta = DUPLICATE_LOOKUP_RADIUS_MILES / 69;
  const cosLatitude = Math.cos(toRadians(input.lat));
  const safeCosLatitude = Math.max(Math.abs(cosLatitude), 0.25);
  const lngDelta = DUPLICATE_LOOKUP_RADIUS_MILES / (69 * safeCosLatitude);

  const { data, error } = await supabaseClient
    .from("bathrooms")
    .select("id, name, address, lat, lng")
    .in("status", ["active", "pending"])
    .gte("lat", input.lat - latDelta)
    .lte("lat", input.lat + latDelta)
    .gte("lng", input.lng - lngDelta)
    .lte("lng", input.lng + lngDelta)
    .limit(50);

  if (error || !data) {
    return null;
  }

  const candidates = (data as NearbyBathroomLookupRow[]).map((candidate) => ({
    ...candidate,
    distanceMiles: haversineDistanceMiles(
      { lat: input.lat, lng: input.lng },
      { lat: candidate.lat, lng: candidate.lng }
    )
  }));

  const sortedCandidates = candidates.sort((a, b) => a.distanceMiles - b.distanceMiles);

  for (const candidate of sortedCandidates) {
    if (candidate.distanceMiles > DUPLICATE_LOOKUP_RADIUS_MILES) {
      continue;
    }

    if (candidate.distanceMiles <= STRICT_DUPLICATE_DISTANCE_MILES && isSimilarAddress(candidate.address, input.address)) {
      return candidate.id;
    }

    if (isSimilarName(candidate.name, input.name)) {
      return candidate.id;
    }
  }

  return null;
};

const toInsertPayload = (input: BathroomCreateInput, bathroomId: string): BathroomInsertRow => {
  return {
    id: bathroomId,
    name: input.name,
    place_type: input.place_type,
    address: input.address,
    city: input.city,
    state: input.state,
    lat: input.lat,
    lng: input.lng,
    access_type: input.access_type,
    has_baby_station: input.has_baby_station,
    is_gender_neutral: input.is_gender_neutral,
    is_accessible: input.is_accessible,
    requires_purchase: input.requires_purchase,
    source: "user",
    status: PUBLIC_SUBMISSION_STATUS,
    source_external_id: null,
    created_by: null
  };
};

export const submitBathroom = async (
  supabaseClient: SupabaseClient,
  input: BathroomCreateInput
): Promise<SubmitBathroomResult> => {
  const duplicateBathroomId = await findDuplicateBathroomId(supabaseClient, input);
  if (duplicateBathroomId) {
    return {
      outcome: "duplicate" as const,
      bathroomId: null,
      status: null,
      duplicateBathroomId
    };
  }

  const bathroomId = crypto.randomUUID();
  const payload = toInsertPayload(input, bathroomId);

  const { error: insertError } = await supabaseClient.from("bathrooms").insert(payload);
  if (insertError) {
    throw new Error(insertError.message);
  }

  return {
    outcome: "created" as const,
    bathroomId,
    status: PUBLIC_SUBMISSION_STATUS
  };
};

export const toAddRestroomErrorMessage = (error: unknown): string => {
  const fallback = "Could not submit this restroom right now. Please try again in a moment.";

  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = error.message.toLowerCase();

  if (message.includes("row-level security") || message.includes("permission denied")) {
    return "Submissions are temporarily unavailable. Please try again later.";
  }

  if (message.includes("failed to fetch") || message.includes("network")) {
    return "Could not reach the submission service. Check your connection and try again.";
  }

  return error.message || fallback;
};
