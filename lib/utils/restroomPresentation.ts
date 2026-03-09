import { BathroomSource } from "@/types";

interface RestroomPresentationInput {
  name: string;
  address: string;
  city: string;
  state: string;
  source: BathroomSource;
}

const DEFAULT_RESTROOM_NAME = "Public Restroom";
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
const GENERIC_OSM_NAME_WITH_CONTEXT_PATTERN =
  /^(public restroom|public restrooms|restroom|restrooms|public toilet|public toilets|toilet|toilets|bathroom|bathrooms|wc)\s*(?:-|—|:)\s*(.+)$/i;

const COORDINATE_FALLBACK_PATTERN = /^approximate location\s*\(/i;
const RAW_COORDINATE_PATTERN = /^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/;

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

const normalizeLabel = (value: string) => value.trim().replace(/\s+/g, " ");

const isCoordinateFallbackAddress = (address: string) => {
  const trimmed = address.trim();
  return COORDINATE_FALLBACK_PATTERN.test(trimmed) || RAW_COORDINATE_PATTERN.test(trimmed);
};

const stripNearPrefix = (value: string) => value.replace(/^near\s+/i, "").trim();

const isGenericOsmName = (name: string) => {
  const normalized = normalizeText(name);
  return GENERIC_OSM_NAMES.has(normalized) || GENERIC_OSM_NAME_WITH_CONTEXT_PATTERN.test(normalizeLabel(name));
};

const withMaxLength = (value: string, max = 34) => {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max - 1).trimEnd()}…`;
};

const formatCityState = (city: string, state: string) => {
  const normalizedCity = city.trim();
  const normalizedState = state.trim().toUpperCase();
  return [normalizedCity, normalizedState].filter(Boolean).join(", ");
};

const isCityEquivalent = (value: string, city: string) => {
  if (!city.trim()) {
    return false;
  }

  const normalizedValue = normalizeText(stripNearPrefix(value));
  const normalizedCity = normalizeText(city);

  return normalizedValue === normalizedCity;
};

const isAddressAlreadyCityLike = (address: string, city: string) => {
  if (!city.trim()) {
    return false;
  }

  const normalizedAddress = normalizeText(stripNearPrefix(address));
  const normalizedCity = normalizeText(city);

  return normalizedAddress === normalizedCity || normalizedAddress.includes(normalizedCity);
};

const cleanAddress = (address: string, city: string, state: string) => {
  const trimmed = normalizeLabel(address);
  if (trimmed.length === 0) {
    const fallbackCity = formatCityState(city, state);
    return fallbackCity || "Current area";
  }

  if (isCoordinateFallbackAddress(trimmed)) {
    const fallbackCity = formatCityState(city, state);
    return fallbackCity || "Current area";
  }

  return trimmed;
};

const extractContextFromGenericName = (name: string, city: string) => {
  const match = normalizeLabel(name).match(GENERIC_OSM_NAME_WITH_CONTEXT_PATTERN);
  if (!match?.[2]) {
    return "";
  }

  const context = stripNearPrefix(match[2]);
  if (!context || isCityEquivalent(context, city)) {
    return "";
  }

  return toTitleCase(context);
};

const getNameContextFromAddress = (address: string, city: string) => {
  const firstSegment = address.split(",")[0]?.trim() ?? "";
  if (!firstSegment) {
    return "";
  }

  const withoutNearPrefix = stripNearPrefix(firstSegment);
  if (!withoutNearPrefix) {
    return "";
  }

  if (isCityEquivalent(withoutNearPrefix, city)) {
    return "";
  }

  return toTitleCase(withoutNearPrefix);
};

const buildLocationLine = (restroom: RestroomPresentationInput, includeState: boolean) => {
  const cityState = formatCityState(restroom.city, restroom.state);
  const cleanedAddress = cleanAddress(restroom.address, restroom.city, restroom.state);
  const hasCity = restroom.city.trim().length > 0;
  const includesCity = hasCity && normalizeText(cleanedAddress).includes(normalizeText(restroom.city));
  const includesState =
    restroom.state.trim().length > 0 && normalizeText(cleanedAddress).includes(normalizeText(restroom.state));

  if (!hasCity) {
    return cleanedAddress;
  }

  if (isAddressAlreadyCityLike(cleanedAddress, restroom.city)) {
    return includeState ? cityState || cleanedAddress : restroom.city.trim();
  }

  if (includesCity) {
    if (includeState && restroom.state.trim() && !includesState) {
      return `${cleanedAddress}, ${restroom.state.trim().toUpperCase()}`;
    }
    return cleanedAddress;
  }

  if (includeState) {
    return cityState ? `${cleanedAddress}, ${cityState}` : cleanedAddress;
  }

  return `${cleanedAddress}, ${restroom.city.trim()}`;
};

export const getRestroomSourceLabel = (source: BathroomSource) => {
  switch (source) {
    case "openstreetmap":
      return "Community mapped";
    case "city_open_data":
      return "Verified public facility";
    default:
      return "Community submitted";
  }
};

export const getRestroomDisplayName = (restroom: RestroomPresentationInput) => {
  const baseName = normalizeLabel(restroom.name) || DEFAULT_RESTROOM_NAME;
  if (restroom.source !== "openstreetmap" || !isGenericOsmName(baseName)) {
    return baseName;
  }

  const genericNameContext = extractContextFromGenericName(baseName, restroom.city);
  const addressContext = getNameContextFromAddress(cleanAddress(restroom.address, restroom.city, restroom.state), restroom.city);
  const context = genericNameContext || addressContext;
  if (!context) {
    return DEFAULT_RESTROOM_NAME;
  }

  return `${DEFAULT_RESTROOM_NAME} — ${withMaxLength(context)}`;
};

export const getRestroomCardSubtitle = (restroom: RestroomPresentationInput) => {
  return withMaxLength(buildLocationLine(restroom, false), 62);
};

export const getRestroomDetailLocationLine = (restroom: RestroomPresentationInput) => {
  return buildLocationLine(restroom, true);
};

export const getRestroomPopupAddress = (restroom: RestroomPresentationInput) => {
  return withMaxLength(buildLocationLine(restroom, false), 56);
};
