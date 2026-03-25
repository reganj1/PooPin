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
  "public washroom",
  "public washrooms",
  "restroom",
  "restrooms",
  "public toilet",
  "public toilets",
  "toilet",
  "toilets",
  "washroom",
  "washrooms",
  "bathroom",
  "bathrooms",
  "wc",
  "toiletten"
]);
const GENERIC_OSM_NAME_WITH_CONTEXT_PATTERN =
  /^(public restroom|public restrooms|public washroom|public washrooms|restroom|restrooms|public toilet|public toilets|toilet|toilets|washroom|washrooms|bathroom|bathrooms|wc)\s*(?:-|—|:)\s*(.+)$/i;

const COORDINATE_FALLBACK_PATTERN = /^approximate location\s*\(/i;
const RAW_COORDINATE_PATTERN = /^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/;
const CITY_WITH_STATE_SUFFIX_PATTERN = /^(.+?),\s*([a-z]{2})$/i;
const GENERIC_CITY_PLACEHOLDER_NAMES = new Set([
  "berkeley",
  "concord",
  "fremont",
  "hercules",
  "oakland",
  "richmond",
  "san francisco",
  "san leandro",
  "san mateo",
  "san pablo",
  "san ramon",
  "sausalito"
]);

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
const normalizeStateCode = (value: string) => value.trim().toUpperCase();

const stripTrailingStateSuffix = (value: string) => value.replace(/,\s*[a-z]{2}$/i, "").trim();

const extractCityCore = (value: string) => {
  const normalized = normalizeLabel(value);
  const match = normalized.match(CITY_WITH_STATE_SUFFIX_PATTERN);
  if (!match?.[1]) {
    return normalized;
  }

  return normalizeLabel(match[1]);
};

const toCanonicalCityToken = (value: string) => normalizeText(stripTrailingStateSuffix(value)).trim();

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
  const normalizedCity = normalizeLabel(city);
  const normalizedState = normalizeStateCode(state);
  if (!normalizedCity && !normalizedState) {
    return "";
  }

  const cityMatch = normalizedCity.match(CITY_WITH_STATE_SUFFIX_PATTERN);
  if (cityMatch?.[1]) {
    const cityCore = normalizeLabel(cityMatch[1]);
    const stateFromCity = normalizeStateCode(cityMatch[2] ?? "");
    const stateCode = normalizedState || stateFromCity;
    return [cityCore, stateCode].filter(Boolean).join(", ");
  }

  return [normalizedCity, normalizedState].filter(Boolean).join(", ");
};

const isCityEquivalent = (value: string, city: string) => {
  if (!city.trim()) {
    return false;
  }

  const normalizedValue = normalizeText(stripNearPrefix(value));
  const normalizedCity = normalizeText(city);
  const normalizedCityCore = normalizeText(extractCityCore(city));

  return normalizedValue === normalizedCity || normalizedValue === normalizedCityCore;
};

const isAddressAlreadyCityLike = (address: string, city: string) => {
  if (!city.trim()) {
    return false;
  }

  const normalizedAddress = normalizeText(stripNearPrefix(address));
  const normalizedCity = normalizeText(city);
  const normalizedCityCore = normalizeText(extractCityCore(city));

  return (
    normalizedAddress === normalizedCity ||
    normalizedAddress.includes(normalizedCity) ||
    normalizedAddress === normalizedCityCore ||
    normalizedAddress.includes(normalizedCityCore)
  );
};

const isKnownCityPlaceholderContext = (value: string) => {
  const canonicalToken = toCanonicalCityToken(value);
  return GENERIC_CITY_PLACEHOLDER_NAMES.has(canonicalToken);
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

  if (includeState && cityState && isKnownCityPlaceholderContext(cleanedAddress)) {
    return cityState;
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
    case "la_controller":
      return "Verified public facility";
    default:
      return "Community submitted";
  }
};

export const getRestroomDisplayName = (restroom: RestroomPresentationInput) => {
  const baseName = normalizeLabel(restroom.name) || DEFAULT_RESTROOM_NAME;
  if (isKnownCityPlaceholderContext(baseName) || isCityEquivalent(baseName, restroom.city)) {
    return DEFAULT_RESTROOM_NAME;
  }

  const genericWithContextMatch = baseName.match(GENERIC_OSM_NAME_WITH_CONTEXT_PATTERN);
  const genericWithContext = genericWithContextMatch?.[2] ? stripNearPrefix(genericWithContextMatch[2]) : "";
  if (genericWithContext && (isKnownCityPlaceholderContext(genericWithContext) || isCityEquivalent(genericWithContext, restroom.city))) {
    return DEFAULT_RESTROOM_NAME;
  }

  if (restroom.source !== "openstreetmap" || !isGenericOsmName(baseName)) {
    return baseName;
  }

  const genericNameContext = extractContextFromGenericName(baseName, restroom.city);
  const addressContext = getNameContextFromAddress(cleanAddress(restroom.address, restroom.city, restroom.state), restroom.city);
  const context = genericNameContext || addressContext;
  if (!context || isKnownCityPlaceholderContext(context) || isCityEquivalent(context, restroom.city)) {
    return DEFAULT_RESTROOM_NAME;
  }

  return `${DEFAULT_RESTROOM_NAME} — ${withMaxLength(context)}`;
};

export const getRestroomCardSubtitle = (restroom: RestroomPresentationInput) => {
  return withMaxLength(buildLocationLine(restroom, true), 66);
};

export const getRestroomDetailLocationLine = (restroom: RestroomPresentationInput) => {
  return buildLocationLine(restroom, true);
};

export const getRestroomPopupAddress = (restroom: RestroomPresentationInput) => {
  return withMaxLength(buildLocationLine(restroom, true), 60);
};
