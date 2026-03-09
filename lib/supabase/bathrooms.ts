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

export interface InsertBathroomResult {
  bathroomId: string;
  canReadDetail: boolean;
}

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
    status: "active",
    source_external_id: null,
    created_by: null
  };
};

export const insertBathroom = async (
  supabaseClient: SupabaseClient,
  input: BathroomCreateInput
): Promise<InsertBathroomResult> => {
  const bathroomId = crypto.randomUUID();
  const payload = toInsertPayload(input, bathroomId);

  const { error: insertError } = await supabaseClient.from("bathrooms").insert(payload);

  if (insertError) {
    throw new Error(insertError.message);
  }

  const { data, error: readError } = await supabaseClient
    .from("bathrooms")
    .select("id")
    .eq("id", bathroomId)
    .maybeSingle();

  const canReadDetail = !readError && data?.id === bathroomId;

  return {
    bathroomId,
    canReadDetail
  };
};

export const toAddRestroomErrorMessage = (error: unknown): string => {
  const fallback = "Could not submit restroom right now. Please try again.";

  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = error.message.toLowerCase();

  if (message.includes("row-level security") || message.includes("permission denied")) {
    return "Supabase rejected the insert. Check table RLS/policies for anon insert on bathrooms.";
  }

  if (message.includes("failed to fetch") || message.includes("network")) {
    return "Could not reach Supabase. Check your URL/key and network, then retry.";
  }

  return error.message || fallback;
};
