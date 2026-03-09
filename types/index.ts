export type BathroomPlaceType =
  | "park"
  | "restaurant"
  | "cafe"
  | "mall"
  | "transit_station"
  | "library"
  | "gym"
  | "office"
  | "other";

export type BathroomAccessType = "public" | "customer_only" | "code_required" | "staff_assisted";

export type BathroomSource = "user" | "google_places" | "city_open_data" | "openstreetmap" | "partner" | "other";

export type ModerationStatus = "active" | "pending" | "flagged" | "removed";

export interface Bathroom {
  id: string;
  name: string;
  place_type: BathroomPlaceType;
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  access_type: BathroomAccessType;
  has_baby_station: boolean;
  is_gender_neutral: boolean;
  is_accessible: boolean;
  requires_purchase: boolean;
  created_by: string | null;
  created_at: string;
  status: ModerationStatus;
  source: BathroomSource;
  source_external_id: string | null;
}

export interface Review {
  id: string;
  bathroom_id: string;
  user_id: string | null;
  overall_rating: number;
  smell_rating: number;
  cleanliness_rating: number;
  wait_rating: number;
  privacy_rating: number;
  review_text: string;
  visit_time: string;
  created_at: string;
  status: ModerationStatus;
}

export interface Photo {
  id: string;
  bathroom_id: string;
  user_id: string | null;
  storage_path: string;
  created_at: string;
  status: ModerationStatus;
}

export interface Report {
  id: string;
  bathroom_id: string;
  user_id: string | null;
  reason: string;
  created_at: string;
}

export interface BathroomRatingSummary {
  overall: number;
  smell: number;
  cleanliness: number;
  reviewCount: number;
}

export interface NearbyBathroom extends Bathroom {
  distanceMiles: number;
  ratings: BathroomRatingSummary;
}
