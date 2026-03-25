import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { bathroomAccessTypeOptions, bathroomPlaceTypeOptions } from "../lib/validations/bathroom";
import type { BathroomAccessType, BathroomPlaceType, BathroomSource } from "../types";

type RawValue = string | number | boolean | null | undefined;
type RawRecord = Record<string, RawValue>;

interface ImportOptions {
  inputPath: string;
  format: "json" | "csv";
  source: BathroomSource;
  defaultCity: string;
  defaultState: string;
  distanceMiles: number;
  dryRun: boolean;
}

interface ImportBathroomRecord {
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
  source: BathroomSource;
  source_external_id: string | null;
  status: "active";
}

interface ExistingBathroomDedupe {
  name: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  source: string;
  source_external_id: string | null;
}

const DEFAULT_SOURCE: BathroomSource = "city_open_data";
const DEFAULT_CITY = "San Francisco";
const DEFAULT_STATE = "CA";
const DEFAULT_DISTANCE_MILES = 0.08;
const DEFAULT_OSM_NAME = "Public Restroom";
const OSM_GENERIC_DUPLICATE_DISTANCE_MILES = 0.02;
const CROSS_SOURCE_STRICT_DUPLICATE_DISTANCE_MILES = 0.01;
const WEAK_ADDRESS_PATTERN = /^near\s+[a-z][a-z\s.'-]+$/i;
const COORDINATE_ADDRESS_PATTERN = /^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/;
const STREET_CONTEXT_PATTERN =
  /(?:\b\d{1,5}\b\s+)?[a-z0-9.'-]+\s(?:st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|way|pl|place|ct|court|ter|terrace|hwy|highway)\b/i;

const allowedPlaceTypes = new Set<BathroomPlaceType>(bathroomPlaceTypeOptions);
const allowedAccessTypes = new Set<BathroomAccessType>(bathroomAccessTypeOptions);
const allowedSources = new Set<BathroomSource>(["user", "google_places", "city_open_data", "openstreetmap", "partner", "la_controller", "other"]);

const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const normalizeName = (value: string) =>
  value
    .toLowerCase()
    .replace(/\b(restroom|bathroom|toilet|washroom|public|wc|room)\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeLabel = (value: string) => value.trim().replace(/\s+/g, " ");
const normalizeContext = (value: string) => normalizeLabel(value).toLowerCase();

const isGenericOsmName = (value: string) => {
  const normalized = normalizeContext(value);
  return [
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
    "wc"
  ].includes(normalized);
};

const isGenericRestroomName = (value: string) => {
  const normalized = normalizeContext(value);
  return (
    isGenericOsmName(normalized) ||
    normalized.startsWith("public restroom - ") ||
    normalized.startsWith("public restroom — ")
  );
};

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

const isSimilarName = (a: string, b: string) => {
  const normalizedA = normalizeName(a);
  const normalizedB = normalizeName(b);

  if (!normalizedA || !normalizedB) {
    return false;
  }

  if (normalizedA === normalizedB) {
    return true;
  }

  if (normalizedA.length >= 6 && normalizedB.length >= 6 && (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA))) {
    return true;
  }

  const tokensA = new Set(normalizedA.split(" ").filter(Boolean));
  const tokensB = new Set(normalizedB.split(" ").filter(Boolean));
  const overlap = [...tokensA].filter((token) => tokensB.has(token)).length;
  const denominator = Math.max(tokensA.size, tokensB.size, 1);

  return overlap / denominator >= 0.6;
};

const parseBoolean = (value: RawValue) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "y", "t", "available", "public", "designated", "permissive", "customers", "customer"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "n", "f", "private", "restricted"].includes(normalized)) {
    return false;
  }

  return false;
};

const parseNumber = (value: RawValue): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const parseString = (value: RawValue): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return null;
};

const parseTagValue = (row: RawRecord, keys: string[]): string | null => {
  return parseString(getValue(row, keys));
};

const parseTagValueLower = (row: RawRecord, keys: string[]) => {
  return parseTagValue(row, keys)?.toLowerCase() ?? "";
};

const parseTagBoolean = (row: RawRecord, keys: string[]) => {
  return parseBoolean(getValue(row, keys));
};

const getValue = (row: RawRecord, keys: string[]): RawValue => {
  const index = new Map<string, RawValue>();
  for (const [key, value] of Object.entries(row)) {
    index.set(normalizeKey(key), value);
  }

  for (const key of keys) {
    const value = index.get(normalizeKey(key));
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return undefined;
};

const inferPlaceTypeFromText = (value: string): BathroomPlaceType => {
  if (!value) {
    return "other";
  }

  if (allowedPlaceTypes.has(value as BathroomPlaceType)) {
    return value as BathroomPlaceType;
  }

  if (value.includes("park") || value.includes("playground")) return "park";
  if (
    value.includes("transit") ||
    value.includes("station") ||
    value.includes("rail") ||
    value.includes("bus_stop") ||
    value.includes("subway")
  ) {
    return "transit_station";
  }

  if (value.includes("cafe") || value.includes("coffee")) return "cafe";
  if (value.includes("restaurant") || value.includes("food") || value.includes("fast_food")) return "restaurant";
  if (value.includes("library")) return "library";
  if (value.includes("mall") || value.includes("shopping") || value.includes("supermarket")) return "mall";
  if (value.includes("gym") || value.includes("fitness") || value.includes("sports")) return "gym";
  if (value.includes("office") || value.includes("civic") || value.includes("building")) return "office";

  return "other";
};

const resolvePlaceType = (row: RawRecord): BathroomPlaceType => {
  const directValue = parseString(getValue(row, ["place_type", "category", "facility_type"]))?.toLowerCase();
  if (directValue) {
    const inferred = inferPlaceTypeFromText(directValue);
    if (inferred !== "other") {
      return inferred;
    }
  }

  const contextParts = [
    parseTagValueLower(row, ["amenity"]),
    parseTagValueLower(row, ["shop"]),
    parseTagValueLower(row, ["leisure"]),
    parseTagValueLower(row, ["tourism"]),
    parseTagValueLower(row, ["building"]),
    parseTagValueLower(row, ["public_transport"]),
    parseTagValueLower(row, ["railway"]),
    parseTagValueLower(row, ["landuse"]),
    parseTagValueLower(row, ["operator"]),
    parseTagValueLower(row, ["site_type"])
  ].filter(Boolean);

  if (contextParts.length === 0) {
    return "other";
  }

  return inferPlaceTypeFromText(contextParts.join(" "));
};

const resolveAccessType = (row: RawRecord): BathroomAccessType => {
  const directValue = parseString(getValue(row, ["access_type", "access_level"]))?.toLowerCase();
  if (directValue && allowedAccessTypes.has(directValue as BathroomAccessType)) {
    return directValue as BathroomAccessType;
  }

  const accessContext = [
    parseTagValueLower(row, ["toilets:access", "access", "access_type", "access_level"]),
    parseTagValueLower(row, ["operator"]),
    parseTagValueLower(row, ["fee", "toilets:fee"])
  ]
    .filter(Boolean)
    .join(" ");

  if (!accessContext) {
    return "public";
  }

  if (
    accessContext.includes("customer") ||
    accessContext.includes("customers") ||
    accessContext.includes("patron") ||
    accessContext.includes("purchase")
  ) {
    return "customer_only";
  }

  if (accessContext.includes("code") || accessContext.includes("keypad") || accessContext.includes("key")) {
    return "code_required";
  }

  if (
    accessContext.includes("staff") ||
    accessContext.includes("private") ||
    accessContext.includes("employee") ||
    accessContext.includes("attendant")
  ) {
    return "staff_assisted";
  }

  return "public";
};

const resolveSource = (value: RawValue, fallback: BathroomSource): BathroomSource => {
  const parsed = parseString(value)?.toLowerCase() as BathroomSource | undefined;
  if (!parsed) {
    return fallback;
  }

  return allowedSources.has(parsed) ? parsed : fallback;
};

const parseCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      const nextChar = line[i + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((item) => item.trim());
};

const parseCsv = (content: string): RawRecord[] => {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);
  const records: RawRecord[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);
    const row: RawRecord = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    records.push(row);
  }

  return records;
};

const parseJson = (content: string): RawRecord[] => {
  const parsed = JSON.parse(content) as unknown;

  if (Array.isArray(parsed)) {
    return parsed as RawRecord[];
  }

  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;

    if (obj.type === "FeatureCollection" && Array.isArray(obj.features)) {
      return obj.features
        .filter((feature) => feature && typeof feature === "object")
        .map((feature) => {
          const f = feature as {
            properties?: Record<string, RawValue>;
            geometry?: { type?: string; coordinates?: unknown[] };
          };

          const row: RawRecord = { ...(f.properties ?? {}) };
          const coordinates = f.geometry?.type === "Point" ? f.geometry.coordinates : undefined;
          if (Array.isArray(coordinates) && coordinates.length >= 2) {
            row.lng = parseNumber(coordinates[0] as RawValue) ?? undefined;
            row.lat = parseNumber(coordinates[1] as RawValue) ?? undefined;
          }

          return row;
        });
    }

    if (Array.isArray(obj.elements)) {
      return obj.elements
        .filter((element) => element && typeof element === "object")
        .map((element) => {
          const e = element as {
            id?: RawValue;
            type?: RawValue;
            lat?: RawValue;
            lon?: RawValue;
            center?: { lat?: RawValue; lon?: RawValue };
            tags?: Record<string, RawValue>;
          };

          const row: RawRecord = { ...(e.tags ?? {}) };

          const lat = parseNumber(e.lat) ?? parseNumber(e.center?.lat ?? undefined);
          const lng = parseNumber(e.lon) ?? parseNumber(e.center?.lon ?? undefined);

          if (lat !== null) {
            row.lat = lat;
          }
          if (lng !== null) {
            row.lng = lng;
          }

          const osmType = parseString(e.type);
          const osmId = parseString(e.id);
          if (osmType) {
            row.osm_type = osmType;
          }
          if (osmId) {
            row.osm_id = osmId;
          }

          return row;
        });
    }

    for (const key of ["records", "data", "rows", "items"]) {
      if (Array.isArray(obj[key])) {
        return obj[key] as RawRecord[];
      }
    }
  }

  throw new Error(
    "Unsupported JSON shape. Expected an array, Overpass elements, FeatureCollection, or object with records/data/rows/items."
  );
};

const inferFormat = (inputPath: string): "json" | "csv" => {
  const extension = path.extname(inputPath).toLowerCase();
  if (extension === ".csv") return "csv";
  return "json";
};

const withMaxLength = (value: string, max = 42) => {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max - 1).trimEnd()}…`;
};

const toTitleCase = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((part) => (part.length <= 2 ? part.toUpperCase() : `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`))
    .join(" ");

const OSM_CONTEXT_IGNORE_VALUES = new Set([
  "",
  "yes",
  "no",
  "unknown",
  "none",
  "toilets",
  "toilet",
  "restroom",
  "bathroom",
  "public restroom",
  "public toilets",
  "wc",
  "park",
  "plaza",
  "square",
  "attraction",
  "landmark",
  "operator",
  "facility",
  "building",
  "service"
]);

const toDisplayContext = (value: string) => {
  const cleaned = normalizeLabel(value).replace(/_/g, " ");
  if (!cleaned) {
    return "";
  }

  const hasUppercase = /[A-Z]/.test(cleaned);
  return hasUppercase ? cleaned : toTitleCase(cleaned);
};

const isIgnoredContext = (value: string, fallbackCity: string) => {
  const normalizedValue = normalizeContext(value);
  if (!normalizedValue) {
    return true;
  }

  if (OSM_CONTEXT_IGNORE_VALUES.has(normalizedValue)) {
    return true;
  }

  const normalizedCity = normalizeContext(fallbackCity);
  if (normalizedCity && (normalizedValue === normalizedCity || normalizedValue === `near ${normalizedCity}`)) {
    return true;
  }

  return false;
};

const pickContextFromKeys = (row: RawRecord, keys: string[], fallbackCity: string) => {
  for (const key of keys) {
    const rawValue = parseTagValue(row, [key]);
    if (!rawValue) {
      continue;
    }

    const candidate = toDisplayContext(rawValue);
    if (!candidate || isGenericOsmName(candidate) || isIgnoredContext(candidate, fallbackCity)) {
      continue;
    }

    return candidate;
  }

  return null;
};

const normalizeStreetPart = (value: string) => {
  const cleaned = value.replace(/\b(corner of|near)\b/gi, " ").replace(/[()]/g, " ");
  return toDisplayContext(cleaned).replace(/\s+/g, " ").trim();
};

const splitIntersectionParts = (value: string) =>
  value
    .split(/\s*(?:&|\/|;|\+|\band\b|\bat\b)\s*/i)
    .map((part) => normalizeStreetPart(part))
    .filter((part) => part.length > 0);

const formatIntersection = (streetA: string, streetB: string) => {
  const first = normalizeStreetPart(streetA);
  const second = normalizeStreetPart(streetB);
  if (!first || !second) {
    return null;
  }

  if (normalizeContext(first) === normalizeContext(second)) {
    return first;
  }

  return `${first} & ${second}`;
};

const buildCrossStreetContext = (row: RawRecord) => {
  const explicitIntersection = parseTagValue(row, [
    "cross_street",
    "cross_streets",
    "intersection",
    "intersection_name",
    "at_street",
    "street_intersection"
  ]);
  if (explicitIntersection) {
    const parts = splitIntersectionParts(explicitIntersection);
    if (parts.length >= 2) {
      return formatIntersection(parts[0], parts[1]);
    }
  }

  const primaryStreet = parseTagValue(row, ["addr:street", "road", "street_name", "street"]);
  const secondaryStreet = parseTagValue(row, [
    "cross_street",
    "cross_streets",
    "intersecting_street",
    "street_2",
    "addr:cross_street",
    "nearby_street"
  ]);
  if (primaryStreet && secondaryStreet) {
    return formatIntersection(primaryStreet, secondaryStreet);
  }

  const junction = parseTagValue(row, ["junction"]);
  if (junction) {
    const parts = splitIntersectionParts(junction);
    if (parts.length >= 2) {
      return formatIntersection(parts[0], parts[1]);
    }
  }

  return null;
};

const buildSingleStreetContext = (row: RawRecord) => {
  const houseNumber = parseTagValue(row, ["addr:housenumber", "house_number"]);
  const streetName = parseTagValue(row, ["addr:street", "road", "street_name", "street"]);
  if (streetName) {
    return [houseNumber, normalizeStreetPart(streetName)].filter(Boolean).join(" ").trim();
  }

  const firstAddressSegment = parseTagValue(row, ["addr:full", "address"])?.split(",")[0]?.trim();
  if (firstAddressSegment && STREET_CONTEXT_PATTERN.test(firstAddressSegment.toLowerCase())) {
    return normalizeStreetPart(firstAddressSegment);
  }

  return null;
};

const buildNeighborhoodContext = (row: RawRecord) => {
  return parseTagValue(row, [
    "addr:suburb",
    "neighbourhood",
    "neighborhood",
    "district",
    "quarter",
    "addr:locality",
    "addr:hamlet",
    "locality"
  ]);
};

const buildParkLandmarkContext = (row: RawRecord, fallbackCity: string) => {
  const namedContext = pickContextFromKeys(
    row,
    ["park", "park_name", "plaza", "square", "landmark", "site_name", "name:en", "addr:place", "leisure:park"],
    fallbackCity
  );
  if (namedContext) {
    return namedContext;
  }

  const leisureValue = parseTagValueLower(row, ["leisure"]);
  if (!leisureValue) {
    return null;
  }

  const namedArea = pickContextFromKeys(
    row,
    ["addr:place", "neighbourhood", "neighborhood", "district", "quarter", "addr:locality", "city", "addr:city"],
    fallbackCity
  );
  if (!namedArea) {
    return null;
  }

  if (["park", "garden", "playground", "recreation_ground"].includes(leisureValue)) {
    const suffix = leisureValue === "garden" ? "Garden" : leisureValue === "playground" ? "Playground" : "Park";
    if (normalizeContext(namedArea).endsWith(normalizeContext(suffix))) {
      return namedArea;
    }
    return `${namedArea} ${suffix}`;
  }

  return namedArea;
};

const buildTourismAttractionContext = (row: RawRecord, fallbackCity: string) => {
  const namedContext = pickContextFromKeys(
    row,
    ["tourism_name", "attraction_name", "attraction", "poi_name", "destination", "tourism:site"],
    fallbackCity
  );
  if (namedContext) {
    return namedContext;
  }

  const tourismValue = parseTagValueLower(row, ["tourism"]);
  if (!tourismValue || isIgnoredContext(tourismValue, fallbackCity)) {
    return null;
  }

  return toDisplayContext(tourismValue);
};

const buildOperatorFacilityContext = (row: RawRecord, fallbackCity: string) => {
  return pickContextFromKeys(
    row,
    [
      "operator",
      "facility_name",
      "brand",
      "network",
      "building:name",
      "site_operator",
      "owner",
      "organization",
      "organisation"
    ],
    fallbackCity
  );
};

const isWeakAddress = (address: string, fallbackCity: string) => {
  const normalized = normalizeLabel(address);
  if (!normalized) {
    return true;
  }

  if (COORDINATE_ADDRESS_PATTERN.test(normalized) || WEAK_ADDRESS_PATTERN.test(normalized)) {
    return true;
  }

  const normalizedContext = normalizeContext(normalized);
  const normalizedCity = normalizeContext(fallbackCity);
  return Boolean(normalizedCity && (normalizedContext === normalizedCity || normalizedContext === `near ${normalizedCity}`));
};

const buildAddress = (row: RawRecord, fallbackCity: string): string => {
  const fullAddress = parseString(
    getValue(row, ["address", "street_address", "street", "location", "location_address", "cross_street", "addr:full"])
  );
  if (fullAddress && !isWeakAddress(fullAddress, fallbackCity)) {
    return fullAddress;
  }

  const parkLandmarkContext = buildParkLandmarkContext(row, fallbackCity);
  if (parkLandmarkContext) {
    return parkLandmarkContext;
  }

  const tourismContext = buildTourismAttractionContext(row, fallbackCity);
  if (tourismContext) {
    return tourismContext;
  }

  const operatorContext = buildOperatorFacilityContext(row, fallbackCity);
  if (operatorContext) {
    return operatorContext;
  }

  const crossStreetContext = buildCrossStreetContext(row);
  if (crossStreetContext) {
    return crossStreetContext;
  }

  const singleStreetContext = buildSingleStreetContext(row);
  if (singleStreetContext) {
    return singleStreetContext;
  }

  const neighborhood = buildNeighborhoodContext(row);
  const normalizedNeighborhood = neighborhood ? toDisplayContext(neighborhood) : "";
  if (normalizedNeighborhood && !isIgnoredContext(normalizedNeighborhood, fallbackCity)) {
    if (fallbackCity && normalizeContext(normalizedNeighborhood) !== normalizeContext(fallbackCity)) {
      return `${normalizedNeighborhood}, ${fallbackCity}`;
    }
    return normalizedNeighborhood;
  }

  return fallbackCity || "Current area";
};

const formatOsmFallbackName = (context: string) => `${DEFAULT_OSM_NAME} — ${withMaxLength(normalizeLabel(context))}`;

const buildOsmFallbackName = (row: RawRecord, fallbackCity: string) => {
  const parkLandmarkContext = buildParkLandmarkContext(row, fallbackCity);
  if (parkLandmarkContext) {
    return formatOsmFallbackName(parkLandmarkContext);
  }

  const tourismContext = buildTourismAttractionContext(row, fallbackCity);
  if (tourismContext) {
    return formatOsmFallbackName(tourismContext);
  }

  const operatorContext = buildOperatorFacilityContext(row, fallbackCity);
  if (operatorContext) {
    return formatOsmFallbackName(operatorContext);
  }

  const crossStreetContext = buildCrossStreetContext(row);
  if (crossStreetContext) {
    return formatOsmFallbackName(crossStreetContext);
  }

  const singleStreetContext = buildSingleStreetContext(row);
  if (singleStreetContext) {
    return formatOsmFallbackName(singleStreetContext);
  }

  const neighborhood = buildNeighborhoodContext(row);
  const normalizedNeighborhood = neighborhood ? toDisplayContext(neighborhood) : "";
  if (normalizedNeighborhood && !isIgnoredContext(normalizedNeighborhood, fallbackCity)) {
    return formatOsmFallbackName(normalizedNeighborhood);
  }

  if (fallbackCity) {
    return formatOsmFallbackName(withMaxLength(toDisplayContext(fallbackCity), 26));
  }

  return DEFAULT_OSM_NAME;
};

const toImportRecord = (row: RawRecord, options: ImportOptions): ImportBathroomRecord | null => {
  const lat = parseNumber(getValue(row, ["lat", "latitude", "y", "geom_lat", "location_lat"]));
  const lng = parseNumber(getValue(row, ["lng", "lon", "long", "longitude", "x", "geom_lng", "location_lng"]));

  if (lat === null || lng === null) {
    return null;
  }

  const source = resolveSource(getValue(row, ["source", "dataset_source"]), options.source);
  const city = parseString(getValue(row, ["city", "addr:city", "town", "municipality"])) ?? options.defaultCity;
  const state = parseString(getValue(row, ["state", "state_code", "province", "addr:state"])) ?? options.defaultState;

  const explicitOsmName = parseString(getValue(row, ["name", "name:en"]));
  const parsedAddress = parseString(
    getValue(row, ["address", "street_address", "street", "location", "location_address", "cross_street", "addr:full"])
  );
  const parsedName = parseString(
    getValue(row, ["name", "name:en", "restroom_name", "facility_name", "site_name", "location_name"])
  );
  const name =
    source === "openstreetmap"
      ? explicitOsmName && !isGenericOsmName(explicitOsmName)
        ? explicitOsmName
        : buildOsmFallbackName(row, city)
      : parsedName;
  if (!name) {
    return null;
  }

  const sourceExternalIdRaw = parseString(getValue(row, ["source_external_id", "external_id", "externalid", "objectid"]));
  const osmType = parseString(getValue(row, ["osm_type", "object_type", "element_type"]))?.toLowerCase();
  const osmId = parseString(getValue(row, ["osm_id", "object_id", "element_id", "id"]));
  const sourceExternalId =
    sourceExternalIdRaw && sourceExternalIdRaw.length > 0
      ? sourceExternalIdRaw
      : source === "openstreetmap" && osmType && osmId
        ? `osm:${osmType}/${osmId}`
        : null;

  const address =
    source === "openstreetmap"
      ? parsedAddress && !isWeakAddress(parsedAddress, city)
        ? parsedAddress
        : buildAddress(row, city)
      : parsedAddress;
  if (!address) {
    return null;
  }

  const accessType = resolveAccessType(row);
  const requiresPurchase =
    parseTagBoolean(row, ["requires_purchase", "purchase_required", "fee", "toilets:fee"]) || accessType === "customer_only";

  const accessibilityValue = parseTagValueLower(row, ["wheelchair", "is_accessible", "accessible", "ada_accessible"]);
  const isAccessible =
    accessibilityValue.length > 0
      ? ["yes", "true", "1", "designated", "limited"].includes(accessibilityValue)
      : parseTagBoolean(row, ["is_accessible", "accessible", "ada_accessible", "wheelchair"]);

  const genderSegregated = parseTagValueLower(row, ["gender_segregated"]);
  const isGenderNeutral =
    parseTagBoolean(row, ["is_gender_neutral", "gender_neutral", "all_gender", "unisex"]) ||
    (genderSegregated.length > 0 && ["no", "false", "0"].includes(genderSegregated));

  const hasBabyStation = parseTagBoolean(row, ["has_baby_station", "baby_station", "changing_table", "baby_changing_table"]);

  return {
    name,
    place_type: resolvePlaceType(row),
    address,
    city,
    state,
    lat,
    lng,
    access_type: accessType,
    has_baby_station: hasBabyStation,
    is_gender_neutral: isGenderNeutral,
    is_accessible: isAccessible,
    requires_purchase: requiresPurchase,
    source,
    source_external_id: sourceExternalId,
    status: "active"
  };
};

const isLikelyDuplicateByNameAndLocation = (
  candidate: ImportBathroomRecord,
  existing: ExistingBathroomDedupe,
  distanceMiles: number
) => {
  if (!isSimilarName(candidate.name, existing.name)) {
    return false;
  }

  const distance = haversineDistanceMiles(
    { lat: candidate.lat, lng: candidate.lng },
    { lat: existing.lat, lng: existing.lng }
  );

  return distance <= distanceMiles;
};

const extractGenericNameContext = (name: string) => {
  const normalized = normalizeLabel(name);
  const match = normalized.match(/^public restroom\s*(?:-|—)\s*(.+)$/i);
  if (!match?.[1]) {
    return "";
  }

  return normalizeName(match[1]);
};

const toAddressContext = (address: string, city: string) => {
  const firstSegment = address.split(",")[0]?.trim() ?? "";
  if (!firstSegment) {
    return "";
  }

  const withoutNearPrefix = firstSegment.replace(/^near\s+/i, "").trim();
  if (!withoutNearPrefix) {
    return "";
  }

  if (city && normalizeName(withoutNearPrefix) === normalizeName(city)) {
    return "";
  }

  return normalizeName(withoutNearPrefix);
};

const isLikelyOsmGenericOverlap = (
  candidate: ImportBathroomRecord,
  existing: ExistingBathroomDedupe,
  distanceMiles: number
) => {
  if (candidate.source !== "openstreetmap" || existing.source !== "openstreetmap") {
    return false;
  }

  if (!isGenericRestroomName(candidate.name) || !isGenericRestroomName(existing.name)) {
    return false;
  }

  const distance = haversineDistanceMiles(
    { lat: candidate.lat, lng: candidate.lng },
    { lat: existing.lat, lng: existing.lng }
  );
  if (distance > Math.min(distanceMiles, OSM_GENERIC_DUPLICATE_DISTANCE_MILES)) {
    return false;
  }

  const candidateContext = extractGenericNameContext(candidate.name) || toAddressContext(candidate.address, candidate.city);
  const existingContext = extractGenericNameContext(existing.name) || toAddressContext(existing.address, existing.city);

  if (candidateContext && existingContext) {
    return candidateContext === existingContext || isSimilarName(candidateContext, existingContext);
  }

  return distance <= 0.008;
};

const isLikelyDuplicateWithoutExternalId = (
  candidate: ImportBathroomRecord,
  existing: ExistingBathroomDedupe,
  distanceMiles: number
) => {
  if (isLikelyOsmGenericOverlap(candidate, existing, distanceMiles)) {
    return true;
  }

  if (candidate.source === existing.source) {
    return isLikelyDuplicateByNameAndLocation(candidate, existing, distanceMiles);
  }

  const distance = haversineDistanceMiles(
    { lat: candidate.lat, lng: candidate.lng },
    { lat: existing.lat, lng: existing.lng }
  );
  if (distance > Math.min(distanceMiles, CROSS_SOURCE_STRICT_DUPLICATE_DISTANCE_MILES)) {
    return false;
  }

  if (isGenericRestroomName(candidate.name) || isGenericRestroomName(existing.name)) {
    return false;
  }

  return isSimilarName(candidate.name, existing.name);
};

const parseArgs = (): ImportOptions => {
  const args = process.argv.slice(2);

  const options: ImportOptions = {
    inputPath: "",
    format: "json",
    source: DEFAULT_SOURCE,
    defaultCity: DEFAULT_CITY,
    defaultState: DEFAULT_STATE,
    distanceMiles: DEFAULT_DISTANCE_MILES,
    dryRun: false
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    const next = args[i + 1];
    if (!next) {
      throw new Error(`Missing value for argument ${arg}`);
    }

    switch (arg) {
      case "--input":
        options.inputPath = next;
        i += 1;
        break;
      case "--format":
        if (next !== "json" && next !== "csv") {
          throw new Error("--format must be json or csv");
        }
        options.format = next;
        i += 1;
        break;
      case "--source":
        if (!allowedSources.has(next as BathroomSource)) {
          throw new Error("--source must be one of user|google_places|city_open_data|openstreetmap|partner|la_controller|other");
        }
        options.source = next as BathroomSource;
        i += 1;
        break;
      case "--default-city":
        options.defaultCity = next;
        i += 1;
        break;
      case "--default-state":
        options.defaultState = next;
        i += 1;
        break;
      case "--distance-miles": {
        const value = Number.parseFloat(next);
        if (!Number.isFinite(value) || value <= 0) {
          throw new Error("--distance-miles must be a positive number");
        }
        options.distanceMiles = value;
        i += 1;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.inputPath) {
    throw new Error("Missing --input path. Example: npm run seed:import:restrooms -- --input ./data/sf-restrooms.json");
  }

  if (!args.includes("--format")) {
    options.format = inferFormat(options.inputPath);
  }

  return options;
};

const chunk = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const run = async () => {
  const options = parseArgs();

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (preferred), or NEXT_PUBLIC_* fallback."
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const rawContent = await readFile(options.inputPath, "utf8");
  const rawRecords = options.format === "csv" ? parseCsv(rawContent) : parseJson(rawContent);

  const normalizedRecords: ImportBathroomRecord[] = [];
  let invalidRows = 0;

  for (const row of rawRecords) {
    const normalized = toImportRecord(row, options);
    if (!normalized) {
      invalidRows += 1;
      continue;
    }
    normalizedRecords.push(normalized);
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("bathrooms")
    .select("name, address, city, lat, lng, source, source_external_id")
    .neq("status", "removed")
    .limit(10000);

  if (existingError) {
    throw new Error(`Failed to load existing bathrooms for dedupe: ${existingError.message}`);
  }

  const existing = (existingRows ?? []) as ExistingBathroomDedupe[];
  const existingExternalKeys = new Set(
    existing
      .filter((row) => row.source_external_id)
      .map((row) => `${row.source}::${row.source_external_id}`)
  );

  const seenExternalKeysInInput = new Set<string>();
  const upsertByExternalId: ImportBathroomRecord[] = [];
  const insertWithoutExternalId: ImportBathroomRecord[] = [];

  let duplicateRows = 0;

  for (const record of normalizedRecords) {
    if (record.source_external_id) {
      const key = `${record.source}::${record.source_external_id}`;
      if (seenExternalKeysInInput.has(key)) {
        duplicateRows += 1;
        continue;
      }

      const hasExistingExternalKey = existingExternalKeys.has(key);
      if (!hasExistingExternalKey) {
        const overlappingGenericOsm = existing.some((existingRow) =>
          isLikelyOsmGenericOverlap(record, existingRow, options.distanceMiles)
        );
        if (overlappingGenericOsm) {
          duplicateRows += 1;
          continue;
        }
      }

      seenExternalKeysInInput.add(key);
      upsertByExternalId.push(record);

      if (!hasExistingExternalKey) {
        existingExternalKeys.add(key);
      }

      existing.push({
        name: record.name,
        address: record.address,
        city: record.city,
        lat: record.lat,
        lng: record.lng,
        source: record.source,
        source_external_id: record.source_external_id
      });

      continue;
    }

    const duplicate = existing.some((existingRow) => isLikelyDuplicateWithoutExternalId(record, existingRow, options.distanceMiles));

    if (duplicate) {
      duplicateRows += 1;
      continue;
    }

    insertWithoutExternalId.push(record);
    existing.push({
      name: record.name,
      address: record.address,
      city: record.city,
      lat: record.lat,
      lng: record.lng,
      source: record.source,
      source_external_id: null
    });
  }

  if (options.dryRun) {
    console.log("[seed:import:restrooms] Dry run complete");
    console.log(`Input rows: ${rawRecords.length}`);
    console.log(`Normalized rows: ${normalizedRecords.length}`);
    console.log(`Invalid rows: ${invalidRows}`);
    console.log(`Skipped as duplicates: ${duplicateRows}`);
    console.log(`Would upsert (source+source_external_id): ${upsertByExternalId.length}`);
    console.log(`Would insert (name+distance dedupe): ${insertWithoutExternalId.length}`);
    return;
  }

  let upserted = 0;
  let inserted = 0;

  for (const batch of chunk(upsertByExternalId, 250)) {
    const { error } = await supabase.from("bathrooms").upsert(batch, {
      onConflict: "source,source_external_id",
      ignoreDuplicates: false
    });

    if (error) {
      throw new Error(`Failed to upsert bathrooms batch: ${error.message}`);
    }

    upserted += batch.length;
  }

  for (const batch of chunk(insertWithoutExternalId, 250)) {
    const { error } = await supabase.from("bathrooms").insert(batch);

    if (error) {
      throw new Error(`Failed to insert bathrooms batch: ${error.message}`);
    }

    inserted += batch.length;
  }

  console.log("[seed:import:restrooms] Import complete");
  console.log(`Input rows: ${rawRecords.length}`);
  console.log(`Normalized rows: ${normalizedRecords.length}`);
  console.log(`Invalid rows: ${invalidRows}`);
  console.log(`Skipped as duplicates: ${duplicateRows}`);
  console.log(`Upserted via source+external id: ${upserted}`);
  console.log(`Inserted with fallback dedupe: ${inserted}`);
};

run().catch((error) => {
  console.error("[seed:import:restrooms] Failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
