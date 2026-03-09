import { BathroomSource } from "@/types";

interface RestroomPresentationInput {
  name: string;
  address: string;
  city: string;
  state: string;
  source: BathroomSource;
}

const GENERIC_OSM_NAMES = new Set([
  "public restroom",
  "public restrooms",
  "restroom",
  "restrooms",
  "public toilet",
  "public toilets",
  "toilet",
  "toilets",
  "bathroom",
  "bathrooms",
  "wc",
  "toiletten"
]);

const COORDINATE_FALLBACK_PATTERN = /^approximate location\s*\(/i;

const normalizeText = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");

const toTitleCase = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((part) => (part.length <= 2 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)))
    .join(" ");

const isCoordinateFallbackAddress = (address: string) => COORDINATE_FALLBACK_PATTERN.test(address.trim());

const isGenericOsmName = (name: string) => GENERIC_OSM_NAMES.has(normalizeText(name));

const withMaxLength = (value: string, max = 34) => {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max - 1).trimEnd()}…`;
};

const isAddressAlreadyCityLike = (address: string, city: string) => {
  if (!city.trim()) {
    return false;
  }

  const normalizedAddress = normalizeText(address);
  const normalizedCity = normalizeText(city);

  return normalizedAddress.includes(normalizedCity);
};

const cleanAddress = (address: string, city: string) => {
  const trimmed = address.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) {
    return city ? `Near ${city}` : "Near current area";
  }

  if (isCoordinateFallbackAddress(trimmed)) {
    return city ? `Near ${city}` : "Near current area";
  }

  return trimmed;
};

const getNameContextFromAddress = (address: string, city: string) => {
  const firstSegment = address.split(",")[0]?.trim() ?? "";
  if (!firstSegment) {
    return "";
  }

  const withoutNearPrefix = firstSegment.replace(/^near\s+/i, "").trim();
  if (!withoutNearPrefix) {
    return "";
  }

  if (city && normalizeText(withoutNearPrefix) === normalizeText(city)) {
    return "";
  }

  return toTitleCase(withoutNearPrefix);
};

export const getRestroomSourceLabel = (source: BathroomSource) => {
  switch (source) {
    case "openstreetmap":
      return "OpenStreetMap";
    case "city_open_data":
      return "City Data";
    case "google_places":
      return "Google Places";
    case "partner":
      return "Partner";
    case "user":
      return "Community";
    default:
      return "Other";
  }
};

export const getRestroomDisplayName = (restroom: RestroomPresentationInput) => {
  const baseName = restroom.name.trim() || "Public Restroom";
  if (restroom.source !== "openstreetmap" || !isGenericOsmName(baseName)) {
    return baseName;
  }

  const address = cleanAddress(restroom.address, restroom.city);
  const context = getNameContextFromAddress(address, restroom.city);
  if (!context) {
    return "Public Restroom";
  }

  return `Public Restroom — ${withMaxLength(context)}`;
};

export const getRestroomCardSubtitle = (restroom: RestroomPresentationInput) => {
  const address = cleanAddress(restroom.address, restroom.city);
  if (!restroom.city || isAddressAlreadyCityLike(address, restroom.city)) {
    return address;
  }

  return `${address}, ${restroom.city}`;
};

export const getRestroomDetailLocationLine = (restroom: RestroomPresentationInput) => {
  const address = cleanAddress(restroom.address, restroom.city);
  const includesCity = isAddressAlreadyCityLike(address, restroom.city);

  if (includesCity) {
    return restroom.state ? `${address}, ${restroom.state}` : address;
  }

  return [address, restroom.city, restroom.state].filter(Boolean).join(", ");
};

export const getRestroomPopupAddress = (restroom: RestroomPresentationInput) => {
  const address = cleanAddress(restroom.address, restroom.city);
  return withMaxLength(address, 52);
};
