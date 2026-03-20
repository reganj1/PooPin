"use client";

import type {
  BathroomAccessType,
  BathroomPlaceType,
  BathroomRatingSummary,
  BathroomSource,
  NearbyBathroom,
  ReviewQuickTag
} from "@/types";

export interface RecentRestroomSnapshot {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  source: BathroomSource;
  place_type: BathroomPlaceType;
  access_type: BathroomAccessType;
  lat: number;
  lng: number;
  has_baby_station: boolean;
  is_accessible: boolean;
  is_gender_neutral: boolean;
  requires_purchase: boolean;
  ratings: BathroomRatingSummary;
  viewedAt: number;
}

const STORAGE_KEY = "poopin:recent-restrooms:v1";
const RECENT_RESTROOM_LIMIT = 6;
const bathroomSourceValues = new Set<BathroomSource>(["user", "google_places", "city_open_data", "openstreetmap", "partner", "other"]);
const bathroomPlaceTypeValues = new Set<BathroomPlaceType>([
  "park",
  "restaurant",
  "cafe",
  "mall",
  "transit_station",
  "library",
  "gym",
  "office",
  "other"
]);
const bathroomAccessTypeValues = new Set<BathroomAccessType>(["public", "customer_only", "code_required", "staff_assisted"]);
const reviewQuickTagValues = new Set<ReviewQuickTag>(["clean", "smelly", "no_line", "crowded", "no_toilet_paper", "locked"]);

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const normalizeQualitySignals = (value: unknown): ReviewQuickTag[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((signal): signal is ReviewQuickTag => typeof signal === "string" && reviewQuickTagValues.has(signal as ReviewQuickTag));
};

const isValidRatings = (value: unknown): value is BathroomRatingSummary =>
  Boolean(
    value &&
      typeof value === "object" &&
      isFiniteNumber((value as BathroomRatingSummary).overall) &&
      isFiniteNumber((value as BathroomRatingSummary).smell) &&
      isFiniteNumber((value as BathroomRatingSummary).cleanliness) &&
      typeof (value as BathroomRatingSummary).reviewCount === "number" &&
      Array.isArray((value as BathroomRatingSummary).qualitySignals)
  );

const isRecentRestroomSnapshot = (value: unknown): value is RecentRestroomSnapshot => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const snapshot = value as RecentRestroomSnapshot;
  return (
    typeof snapshot.id === "string" &&
    typeof snapshot.name === "string" &&
    typeof snapshot.address === "string" &&
    typeof snapshot.city === "string" &&
    typeof snapshot.state === "string" &&
    bathroomSourceValues.has(snapshot.source) &&
    bathroomPlaceTypeValues.has(snapshot.place_type) &&
    bathroomAccessTypeValues.has(snapshot.access_type) &&
    isFiniteNumber(snapshot.lat) &&
    isFiniteNumber(snapshot.lng) &&
    typeof snapshot.has_baby_station === "boolean" &&
    typeof snapshot.is_accessible === "boolean" &&
    typeof snapshot.is_gender_neutral === "boolean" &&
    typeof snapshot.requires_purchase === "boolean" &&
    isFiniteNumber(snapshot.viewedAt) &&
    isValidRatings(snapshot.ratings)
  );
};

const sanitizeSnapshot = (value: RecentRestroomSnapshot): RecentRestroomSnapshot => ({
  ...value,
  ratings: {
    ...value.ratings,
    qualitySignals: normalizeQualitySignals(value.ratings.qualitySignals)
  }
});

const readStorage = () => {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(isRecentRestroomSnapshot)
      .map(sanitizeSnapshot)
      .sort((a, b) => b.viewedAt - a.viewedAt)
      .slice(0, RECENT_RESTROOM_LIMIT);
  } catch {
    return [];
  }
};

const writeStorage = (snapshots: RecentRestroomSnapshot[]) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots));
};

const toRecentRestroomSnapshot = (restroom: NearbyBathroom): RecentRestroomSnapshot => ({
  id: restroom.id,
  name: restroom.name,
  address: restroom.address,
  city: restroom.city,
  state: restroom.state,
  source: restroom.source,
  place_type: restroom.place_type,
  access_type: restroom.access_type,
  lat: restroom.lat,
  lng: restroom.lng,
  has_baby_station: restroom.has_baby_station,
  is_accessible: restroom.is_accessible,
  is_gender_neutral: restroom.is_gender_neutral,
  requires_purchase: restroom.requires_purchase,
  ratings: restroom.ratings,
  viewedAt: Date.now()
});

export const getRecentRestrooms = () => readStorage();

export const storeRecentRestroom = (restroom: NearbyBathroom) => {
  const nextSnapshot = toRecentRestroomSnapshot(restroom);
  const nextSnapshots = [nextSnapshot, ...readStorage().filter((snapshot) => snapshot.id !== restroom.id)].slice(
    0,
    RECENT_RESTROOM_LIMIT
  );

  writeStorage(nextSnapshots);
  return nextSnapshots;
};
