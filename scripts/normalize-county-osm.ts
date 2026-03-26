import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type PlaceType = "park" | "library" | "transit_station" | "other";

interface NormalizeOptions {
  outputPath: string;
}

interface CountyDefinition {
  key: "orange" | "riverside";
  fileName: string;
  countyLabel: string;
  defaultCity: string;
  cityInferenceRadiusMiles: number;
  bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
}

interface GeoJsonFeature {
  properties?: Record<string, unknown>;
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
}

interface NormalizedRestroom {
  name: string;
  place_type: PlaceType;
  address: string;
  city: string;
  state: "CA";
  lat: number;
  lng: number;
  access_type: "public";
  has_baby_station: boolean;
  is_gender_neutral: boolean;
  is_accessible: boolean;
  requires_purchase: boolean;
  source: "osm";
  source_external_id: string;
}

interface CandidateRestroom extends NormalizedRestroom {
  countyKey: CountyDefinition["key"];
  normalizedName: string;
  normalizedAddress: string;
  completenessScore: number;
}

interface CityAnchor {
  city: string;
  lat: number;
  lng: number;
}

interface CountyStats {
  county: string;
  rawFeatures: number;
  normalizedCandidates: number;
  keptAfterDedupe: number;
}

const DEFAULT_OUTPUT_PATH = path.join("data", "osm_county_restrooms.json");
const STATE_CODE = "CA";
const SOURCE_NAME = "osm";
const DEDUPE_DISTANCE_MILES = 0.03;

const COUNTIES: CountyDefinition[] = [
  {
    key: "orange",
    fileName: "export.geojson",
    countyLabel: "Orange County",
    defaultCity: "Orange County",
    cityInferenceRadiusMiles: 8,
    bounds: {
      minLat: 33.33,
      maxLat: 33.98,
      minLng: -118.2,
      maxLng: -117.35
    }
  },
  {
    key: "riverside",
    fileName: "export2.geojson",
    countyLabel: "Riverside County",
    defaultCity: "Riverside County",
    cityInferenceRadiusMiles: 12,
    bounds: {
      minLat: 33.35,
      maxLat: 34.25,
      minLng: -117.75,
      maxLng: -114.35
    }
  }
];

const PUBLIC_ACCESS_VALUES = new Set(["yes", "public", "permissive", "seasonal"]);
const REJECTED_ACCESS_VALUES = new Set(["private", "customers", "customer", "staff", "guests", "guest", "permit", "key", "unknown"]);
const PUBLIC_CONTEXT_KEYWORDS = [
  "library",
  "park",
  "beach",
  "pier",
  "harbor",
  "marina",
  "civic",
  "community center",
  "visitor center",
  "trailhead",
  "transportation authority",
  "transportation center",
  "transit",
  "station",
  "plaza",
  "city of",
  "county of",
  "forest service",
  "usfs",
  "water district"
];
const PRIVATE_CONTEXT_KEYWORDS = [
  "laundry",
  "guest laundry",
  "residents only",
  "residents-only",
  "castmember",
  "employee",
  "staff only",
  "staff-only",
  "locker room",
  "board room",
  "tours or for use by staff",
  "residents"
];
const RETAIL_CONTEXT_KEYWORDS = ["wal-mart", "walmart", "target", "ralphs", "stater bros"];
const EDUCATION_CONTEXT_KEYWORDS = ["high school", "school", "college", "university", "church"];
const TRUSTED_OPERATOR_KEYWORDS = [
  "library",
  "forest service",
  "usfs",
  "transportation authority",
  "water district",
  "visitor center",
  "community center",
  "civic",
  "park",
  "beach",
  "harbor",
  "marina",
  "pier",
  "trailhead"
];
const RESTROOM_WORD_PATTERN = /\b(restroom|restrooms|bathroom|bathrooms|toilet|toilets|washroom|washrooms|wc)\b/i;
const GENDER_WORD_PATTERN = /\b(male|female|men'?s|women'?s|all gender|wheelchair)\b/gi;
const GENERIC_QUALIFIER_PATTERN = /\b(male|female|men'?s|women'?s|wheelchair)\b/gi;
const FRIENDLY_GENERIC_EXCEPTIONS = new Set(["all gender restroom", "family restroom", "family bathroom", "special accommodation toilets"]);
const GENERIC_NAME_PATTERNS = [
  /^(public )?(restroom|bathroom|toilet|wc)s?$/i,
  /^(male|female|men'?s|women'?s)\s+(restroom|toilet)s?$/i,
  /^(restroom|bathroom|toilet)s?\s+\d+$/i,
  /^[a-z]{1,3}\d+$/i,
  /^comfort station$/i
];
const parseArgs = (): NormalizeOptions => {
  const args = process.argv.slice(2);
  const options: NormalizeOptions = {
    outputPath: DEFAULT_OUTPUT_PATH
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (!next) {
      throw new Error(`Missing value for argument ${arg}`);
    }

    switch (arg) {
      case "--output":
        options.outputPath = next;
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
};

const normalizeWhitespace = (value: string) =>
  value
    .replace(/\uFEFF/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const parseString = (value: unknown) => {
  if (typeof value === "string") {
    const normalized = normalizeWhitespace(value);
    return normalized.length > 0 ? normalized : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
};

const parseLower = (value: unknown) => parseString(value)?.toLowerCase() ?? "";

const parseBoolean = (value: unknown) => {
  const normalized = parseLower(value);
  return ["yes", "true", "1", "y", "designated"].includes(normalized);
};

const toTitleCase = (value: string) =>
  normalizeWhitespace(value)
    .toLowerCase()
    .split(" ")
    .map((part) => {
      if (part.length <= 2) {
        return part.toUpperCase();
      }

      return `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`;
    })
    .join(" ");

const normalizeForCompare = (value: string) =>
  normalizeWhitespace(value)
    .toLowerCase()
    .replace(GENDER_WORD_PATTERN, " ")
    .replace(/\b(public|restroom|restrooms|bathroom|bathrooms|toilet|toilets|washroom|washrooms|loo|portable)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const toStreetLabel = (value: string) => {
  const cleaned = normalizeWhitespace(value)
    .replace(/^near\s+/i, "")
    .replace(/[()]/g, " ");

  return toTitleCase(cleaned);
};

const extractMunicipalArea = (value: string) => {
  const normalized = normalizeWhitespace(value);
  const cityMatch = normalized.match(/^(?:City|Town)\s+of\s+(.+)$/i);
  if (cityMatch?.[1]) {
    return toTitleCase(cityMatch[1]);
  }

  const countyMatch = normalized.match(/^County\s+of\s+(.+)$/i);
  if (countyMatch?.[1]) {
    return `${toTitleCase(countyMatch[1])} County`;
  }

  return "";
};

const extractCoordinatePairs = (value: unknown, output: Array<[number, number]>) => {
  if (!Array.isArray(value)) {
    return;
  }

  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  ) {
    output.push([value[0], value[1]]);
    return;
  }

  for (const item of value) {
    extractCoordinatePairs(item, output);
  }
};

const getFeatureCoordinates = (feature: GeoJsonFeature) => {
  const coordinates: Array<[number, number]> = [];
  extractCoordinatePairs(feature.geometry?.coordinates, coordinates);

  if (coordinates.length === 0) {
    return null;
  }

  const lng = coordinates.reduce((sum, point) => sum + point[0], 0) / coordinates.length;
  const lat = coordinates.reduce((sum, point) => sum + point[1], 0) / coordinates.length;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
};

const isWithinBounds = (lat: number, lng: number, county: CountyDefinition) =>
  lat >= county.bounds.minLat &&
  lat <= county.bounds.maxLat &&
  lng >= county.bounds.minLng &&
  lng <= county.bounds.maxLng;

const textIncludesAny = (value: string, patterns: string[]) => patterns.some((pattern) => value.includes(pattern));

const isGenericName = (name: string | null) => {
  if (!name) {
    return true;
  }

  const normalized = normalizeWhitespace(name).toLowerCase();
  if (FRIENDLY_GENERIC_EXCEPTIONS.has(normalized)) {
    return false;
  }

  if (GENERIC_NAME_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  const deQualified = normalizeWhitespace(normalized.replace(GENERIC_QUALIFIER_PATTERN, " "));
  if (!deQualified || FRIENDLY_GENERIC_EXCEPTIONS.has(deQualified)) {
    return false;
  }

  return GENERIC_NAME_PATTERNS.some((pattern) => pattern.test(deQualified));
};

const isJunkName = (name: string | null) => {
  const normalized = parseLower(name);
  if (!normalized) {
    return false;
  }

  return (
    normalized.includes("laundry") ||
    normalized.includes("locker room") ||
    normalized.includes("board room") ||
    normalized.includes("castmember")
  );
};

const sanitizeSpecificName = (name: string) => {
  const cleaned = toTitleCase(name.replace(/\s+/g, " "));
  if (!cleaned) {
    return null;
  }

  if (RESTROOM_WORD_PATTERN.test(cleaned)) {
    return cleaned;
  }

  return `${cleaned} Restroom`;
};

const getTrustedOperatorContext = (properties: Record<string, unknown>) => {
  const operator = parseString(properties.operator) ?? parseString(properties.brand);
  if (!operator) {
    return null;
  }

  const normalized = operator.toLowerCase();
  if (textIncludesAny(normalized, RETAIL_CONTEXT_KEYWORDS) || textIncludesAny(normalized, PRIVATE_CONTEXT_KEYWORDS)) {
    return null;
  }

  if (textIncludesAny(normalized, EDUCATION_CONTEXT_KEYWORDS) && !textIncludesAny(normalized, ["library"])) {
    return null;
  }

  const municipalArea = extractMunicipalArea(operator);
  if (municipalArea) {
    return {
      label: municipalArea,
      kind: "municipal" as const
    };
  }

  if (textIncludesAny(normalized, TRUSTED_OPERATOR_KEYWORDS) || /library/i.test(operator)) {
    return {
      label: toTitleCase(operator),
      kind: "facility" as const
    };
  }

  return null;
};

const inferIntrinsicCity = (properties: Record<string, unknown>, county: CountyDefinition) => {
  const addrCity = parseString(properties["addr:city"]);
  if (addrCity) {
    return toTitleCase(addrCity);
  }

  const operatorContext = getTrustedOperatorContext(properties);
  if (operatorContext?.kind === "municipal") {
    return operatorContext.label;
  }

  return county.defaultCity;
};

const findNearestCityAnchor = (coordinate: { lat: number; lng: number }, cityAnchors: CityAnchor[], radiusMiles: number) => {
  let bestAnchor: CityAnchor | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const anchor of cityAnchors) {
    const distance = haversineDistanceMiles(coordinate, { lat: anchor.lat, lng: anchor.lng });
    if (distance < bestDistance) {
      bestDistance = distance;
      bestAnchor = anchor;
    }
  }

  if (!bestAnchor || bestDistance > radiusMiles) {
    return null;
  }

  return bestAnchor.city;
};

const inferCity = (
  properties: Record<string, unknown>,
  county: CountyDefinition,
  coordinate: { lat: number; lng: number },
  cityAnchors: CityAnchor[]
) => {
  const intrinsicCity = inferIntrinsicCity(properties, county);
  if (intrinsicCity !== county.defaultCity) {
    return intrinsicCity;
  }

  return findNearestCityAnchor(coordinate, cityAnchors, county.cityInferenceRadiusMiles) ?? county.defaultCity;
};

const buildStreetContext = (properties: Record<string, unknown>) => {
  const street = parseString(properties["addr:street"]) ?? parseString(properties.street);
  if (!street) {
    return "";
  }

  return toStreetLabel(street);
};

const buildAddress = (properties: Record<string, unknown>, city: string, county: CountyDefinition, operatorContext: ReturnType<typeof getTrustedOperatorContext>) => {
  const fullAddress = parseString(properties["addr:full"]) ?? parseString(properties.address);
  if (fullAddress) {
    return normalizeWhitespace(fullAddress);
  }

  const houseNumber = parseString(properties["addr:housenumber"]);
  const street = buildStreetContext(properties);
  if (street) {
    return [houseNumber, street].filter(Boolean).join(" ").trim();
  }

  if (operatorContext?.kind === "facility") {
    return operatorContext.label;
  }

  return city || county.countyLabel;
};

const resolvePlaceType = (_properties: Record<string, unknown>, text: string): PlaceType => {
  if (text.includes("library")) {
    return "library";
  }

  if (
    text.includes("transportation authority") ||
    text.includes("transit") ||
    text.includes("station") ||
    text.includes("rail") ||
    text.includes("bus") ||
    text.includes("metro")
  ) {
    return "transit_station";
  }

  if (text.includes("state park") || text.includes(" park") || text.startsWith("park ") || text.includes("playground") || text.includes("campground")) {
    return "park";
  }

  return "other";
};

const buildName = (
  properties: Record<string, unknown>,
  city: string,
  county: CountyDefinition,
  operatorContext: ReturnType<typeof getTrustedOperatorContext>,
  placeTypeHint: PlaceType
) => {
  const rawName = parseString(properties.name);
  const streetContext = buildStreetContext(properties);

  if (rawName && !isGenericName(rawName) && !isJunkName(rawName)) {
    return sanitizeSpecificName(rawName);
  }

  if (operatorContext?.kind === "facility") {
    return RESTROOM_WORD_PATTERN.test(operatorContext.label) ? operatorContext.label : `${operatorContext.label} Restroom`;
  }

  if (streetContext) {
    return `${streetContext} Restroom`;
  }

  if (placeTypeHint === "park") {
    return city && city !== county.defaultCity ? `Park Restroom - ${city}` : `Park Restroom - ${county.countyLabel}`;
  }

  if (placeTypeHint === "transit_station") {
    return city && city !== county.defaultCity ? `Transit Restroom - ${city}` : `Transit Restroom - ${county.countyLabel}`;
  }

  if (city && city !== county.defaultCity) {
    return `Public Restroom - ${city}`;
  }

  if (operatorContext?.kind === "municipal") {
    return `Public Restroom - ${operatorContext.label}`;
  }

  return `Public Restroom - ${county.countyLabel}`;
};

const buildCandidate = (feature: GeoJsonFeature, county: CountyDefinition, cityAnchors: CityAnchor[]): CandidateRestroom | null => {
  const properties = feature.properties ?? {};
  if (parseLower(properties.amenity) !== "toilets") {
    return null;
  }

  const coordinate = getFeatureCoordinates(feature);
  if (!coordinate || !isWithinBounds(coordinate.lat, coordinate.lng, county)) {
    return null;
  }

  const text = [
    parseString(properties.name),
    parseString(properties.operator),
    parseString(properties.brand),
    parseString(properties.description),
    parseString(properties.note),
    parseString(properties.website),
    parseString(properties["addr:city"]),
    parseString(properties["addr:street"])
  ]
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();

  const access = parseLower(properties.access);
  if (REJECTED_ACCESS_VALUES.has(access)) {
    return null;
  }

  if (parseBoolean(properties.portable) || text.includes("portable restroom")) {
    return null;
  }

  if (parseLower(properties.shop) === "laundry" || textIncludesAny(text, PRIVATE_CONTEXT_KEYWORDS)) {
    return null;
  }

  if (textIncludesAny(text, RETAIL_CONTEXT_KEYWORDS)) {
    const access = parseLower(properties.access);
    if (!PUBLIC_ACCESS_VALUES.has(access)) {
      return null;
    }
  }

  const operatorContext = getTrustedOperatorContext(properties);
  const city = inferCity(properties, county, coordinate, cityAnchors);
  const placeTypeHint = resolvePlaceType(
    properties,
    [text, city, parseString(properties["addr:street"]), parseString(properties.operator), parseString(properties.brand)].filter(Boolean).join(" ").toLowerCase()
  );
  const name = buildName(properties, city, county, operatorContext, placeTypeHint);
  if (!name) {
    return null;
  }

  const address = buildAddress(properties, city, county, operatorContext);
  if (!address) {
    return null;
  }

  const sourceId = parseString(properties["@id"]);
  const sourceExternalId =
    sourceId ??
    `osm:${createHash("sha1")
      .update(`${county.key}|${coordinate.lat.toFixed(6)}|${coordinate.lng.toFixed(6)}|${name}`)
      .digest("hex")
      .slice(0, 16)}`;

  const placeText = [name, address, city, parseString(properties.operator), parseString(properties.brand)].filter(Boolean).join(" ").toLowerCase();
  const completenessScore =
    (parseString(properties.name) && !isGenericName(parseString(properties.name)) ? 3 : 0) +
    (parseString(properties["addr:city"]) ? 2 : 0) +
    (buildStreetContext(properties) ? 2 : 0) +
    (parseString(properties.operator) ? 1 : 0) +
    (parseBoolean(properties.wheelchair) ? 1 : 0) +
    (parseBoolean(properties.changing_table) ? 1 : 0) +
    (parseBoolean(properties.unisex) ? 1 : 0) +
    (parseString(properties.fee) ? 1 : 0) +
    (PUBLIC_ACCESS_VALUES.has(access) ? 2 : 0);

  return {
    name,
    place_type: resolvePlaceType(properties, placeText),
    address,
    city,
    state: STATE_CODE,
    lat: coordinate.lat,
    lng: coordinate.lng,
    access_type: "public",
    has_baby_station: parseBoolean(properties.changing_table),
    is_gender_neutral: parseBoolean(properties.unisex),
    is_accessible: ["yes", "limited", "designated"].includes(parseLower(properties.wheelchair)),
    requires_purchase: false,
    source: SOURCE_NAME,
    source_external_id: sourceExternalId,
    countyKey: county.key,
    normalizedName: normalizeForCompare(name),
    normalizedAddress: normalizeForCompare(address),
    completenessScore
  };
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

const isLikelyDuplicate = (candidate: CandidateRestroom, existing: CandidateRestroom) => {
  if (candidate.source_external_id === existing.source_external_id) {
    return true;
  }

  const distance = haversineDistanceMiles(
    { lat: candidate.lat, lng: candidate.lng },
    { lat: existing.lat, lng: existing.lng }
  );
  if (distance > DEDUPE_DISTANCE_MILES) {
    return false;
  }

  if (candidate.normalizedName && candidate.normalizedName === existing.normalizedName) {
    return true;
  }

  if (
    candidate.normalizedName.startsWith("public restroom") &&
    existing.normalizedName.startsWith("public restroom") &&
    candidate.city === existing.city
  ) {
    return true;
  }

  return Boolean(candidate.normalizedAddress && candidate.normalizedAddress === existing.normalizedAddress);
};

const dedupeCandidates = (candidates: CandidateRestroom[]) => {
  const sorted = [...candidates].sort((a, b) => {
    if (b.completenessScore !== a.completenessScore) {
      return b.completenessScore - a.completenessScore;
    }

    if (a.name !== b.name) {
      return a.name.localeCompare(b.name);
    }

    return a.source_external_id.localeCompare(b.source_external_id);
  });

  const kept: CandidateRestroom[] = [];
  for (const candidate of sorted) {
    const duplicateIndex = kept.findIndex((existing) => isLikelyDuplicate(candidate, existing));
    if (duplicateIndex === -1) {
      kept.push(candidate);
      continue;
    }

    const existing = kept[duplicateIndex];
    if (candidate.completenessScore > existing.completenessScore) {
      kept[duplicateIndex] = candidate;
    }
  }

  return kept.sort((a, b) => {
    if (a.city !== b.city) {
      return a.city.localeCompare(b.city);
    }

    if (a.name !== b.name) {
      return a.name.localeCompare(b.name);
    }

    return a.address.localeCompare(b.address);
  });
};

const loadCountyCandidates = async (county: CountyDefinition) => {
  const filePath = path.resolve(county.fileName);
  const content = await readFile(filePath, "utf8");
  const parsed = JSON.parse(content) as { features?: GeoJsonFeature[] };
  const features = parsed.features ?? [];
  const cityAnchors: CityAnchor[] = features
    .map((feature) => {
      const properties = feature.properties ?? {};
      if (parseLower(properties.amenity) !== "toilets") {
        return null;
      }

      const coordinate = getFeatureCoordinates(feature);
      if (!coordinate || !isWithinBounds(coordinate.lat, coordinate.lng, county)) {
        return null;
      }

      const city = inferIntrinsicCity(properties, county);
      if (!city || city === county.defaultCity) {
        return null;
      }

      return {
        city,
        lat: coordinate.lat,
        lng: coordinate.lng
      } satisfies CityAnchor;
    })
    .filter((anchor): anchor is CityAnchor => anchor !== null);
  const candidates = features
    .map((feature) => buildCandidate(feature, county, cityAnchors))
    .filter((candidate): candidate is CandidateRestroom => candidate !== null);

  return {
    county,
    features,
    candidates
  };
};

const run = async () => {
  const options = parseArgs();
  const countyResults = await Promise.all(COUNTIES.map((county) => loadCountyCandidates(county)));

  const allCandidates = countyResults.flatMap((result) => result.candidates);
  const deduped = dedupeCandidates(allCandidates);
  const normalized: NormalizedRestroom[] = deduped.map(
    ({ countyKey: _countyKey, normalizedName: _normalizedName, normalizedAddress: _normalizedAddress, completenessScore: _completenessScore, ...restroom }) =>
      restroom
  );

  await mkdir(path.dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");

  const stats: CountyStats[] = countyResults.map((result) => ({
    county: result.county.countyLabel,
    rawFeatures: result.features.length,
    normalizedCandidates: result.candidates.length,
    keptAfterDedupe: deduped.filter((candidate) => candidate.countyKey === result.county.key).length
  }));

  console.log(`[seed:normalize:county-osm] Wrote ${normalized.length} normalized county OSM restrooms to ${options.outputPath}`);
  for (const stat of stats) {
    console.log(
      `[seed:normalize:county-osm] ${stat.county}: raw=${stat.rawFeatures} candidates=${stat.normalizedCandidates} kept=${stat.keptAfterDedupe}`
    );
  }
  console.log(
    `[seed:normalize:county-osm] Import with: npm run seed:import:restrooms -- --input ${options.outputPath} --source openstreetmap --default-city "California" --default-state CA --dry-run`
  );
};

run().catch((error) => {
  console.error("[seed:normalize:county-osm] Failed", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
