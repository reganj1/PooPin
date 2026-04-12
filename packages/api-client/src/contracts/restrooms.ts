import type { BathroomCreateInput, ModerationStatus, NearbyBathroom } from "@poopin/domain";

export interface NearbyRestroomsQuery {
  lat: number;
  lng: number;
  limit?: number;
}

export interface NearbyRestroomsResponse {
  restrooms: NearbyBathroom[];
}

export interface BoundsRestroomsQuery {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  limit?: number;
}

export interface BoundsRestroomsResponse {
  restrooms: NearbyBathroom[];
}

export type RestroomPreviewResponse =
  | {
      success: true;
      photoUrl: string | null;
    }
  | {
      success: false;
      photoUrl: null;
    };

export type SubmitRestroomRequest = BathroomCreateInput;

export interface SubmitRestroomSuccessResponse {
  success: true;
  bathroomId: string;
  status: ModerationStatus;
}

export interface SubmitRestroomConflictResponse {
  error: string;
  duplicateBathroomId: string | null;
}
