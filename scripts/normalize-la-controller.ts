import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type PlaceType = "park" | "library" | "transit_station" | "other";

type RawCsvRow = Record<string, string>;

interface NormalizeOptions {
  outputPath: string;
  concurrency: number;
  cachePath: string;
}

interface CsvSourceDefinition {
  fileKey: SourceFileKey;
  fileName: string;
  placeType: PlaceType;
}

type SourceFileKey = "parks" | "metro" | "libraries" | "streets" | "city-other" | "county";

interface IntermediateRestroom {
  sourceFile: SourceFileKey;
  sourceRowNumber: number;
  name: string;
  place_type: PlaceType;
  rawAddressLine: string;
  address: string;
  city: string;
  state: "CA";
  lat: number | null;
  lng: number | null;
  access_type: "public";
  has_baby_station: boolean;
  is_gender_neutral: boolean;
  is_accessible: boolean;
  requires_purchase: boolean;
  source: "la_controller";
  source_external_id: string;
  hasSourceCoordinates: boolean;
  normalizedName: string;
  normalizedAddress: string;
  geocodeQueries: string[];
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
  source: "la_controller";
  source_external_id: string;
}

interface GeocodeResult {
  lat: number;
  lng: number;
  address: string;
  city: string;
  state: string;
}

const SOURCE_DEFINITIONS: CsvSourceDefinition[] = [
  { fileKey: "parks", fileName: "parks.csv", placeType: "park" },
  { fileKey: "metro", fileName: "metro.csv", placeType: "transit_station" },
  { fileKey: "libraries", fileName: "libraries.csv", placeType: "library" },
  { fileKey: "streets", fileName: "streets.csv", placeType: "other" },
  { fileKey: "city-other", fileName: "city-other.csv", placeType: "other" },
  { fileKey: "county", fileName: "county.csv", placeType: "other" }
];

const DEFAULT_OUTPUT_PATH = path.join("data", "la_controller_restrooms.json");
const DEFAULT_CACHE_PATH = path.join("data", "la_controller_geocode_cache.json");
const DEFAULT_CONCURRENCY = 4;
const MAPBOX_GEOCODING_BASE_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places";
const GEOCODE_TIMEOUT_MS = 8000;
const DEDUPE_DISTANCE_MILES = 0.015;
const STATE_CODE = "CA";
const SOURCE_NAME = "la_controller";
const GENERIC_NAME = "Public Restroom";
const BATHROOM_MARKERS = ["x", "yes", "y", "true", "1"];

const parseArgs = (): NormalizeOptions => {
  const args = process.argv.slice(2);
  const options: NormalizeOptions = {
    outputPath: DEFAULT_OUTPUT_PATH,
    concurrency: DEFAULT_CONCURRENCY,
    cachePath: DEFAULT_CACHE_PATH
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
      case "--cache":
        options.cachePath = next;
        index += 1;
        break;
      case "--concurrency": {
        const parsed = Number.parseInt(next, 10);
        if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 12) {
          throw new Error("--concurrency must be an integer between 1 and 12");
        }
        options.concurrency = parsed;
        index += 1;
        break;
      }
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

const slugify = (value: string) =>
  normalizeWhitespace(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

const toTitleCase = (value: string) =>
  normalizeWhitespace(value)
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());

const normalizeNameForCompare = (value: string) =>
  normalizeWhitespace(value)
    .toLowerCase()
    .replace(/\b(public restroom|restroom|bathroom|toilet|washroom|metro station|branch library)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeAddressForCompare = (value: string) =>
  normalizeWhitespace(value)
    .toLowerCase()
    .replace(/\b(street)\b/g, "st")
    .replace(/\b(avenue)\b/g, "ave")
    .replace(/\b(boulevard)\b/g, "blvd")
    .replace(/\b(road)\b/g, "rd")
    .replace(/\b(place)\b/g, "pl")
    .replace(/\b(lane)\b/g, "ln")
    .replace(/\b(drive)\b/g, "dr")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const parseCsvRows = (content: string): string[][] => {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const nextCharacter = content[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentValue += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && character === ",") {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if (!inQuotes && (character === "\n" || character === "\r")) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      currentRow.push(currentValue);
      currentValue = "";
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentValue += character;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue);
    if (currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
};

const toObjects = (rows: string[][], headers: string[]): RawCsvRow[] =>
  rows.map((row) => {
    const record: RawCsvRow = {};
    for (let index = 0; index < headers.length; index += 1) {
      record[headers[index]] = normalizeWhitespace(row[index] ?? "");
    }
    return record;
  });

const parseNumber = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseBooleanMarker = (value: string | null | undefined) => {
  if (!value) {
    return false;
  }

  return BATHROOM_MARKERS.includes(normalizeWhitespace(value).toLowerCase());
};

const extractCityFromCombinedField = (value: string | null | undefined) => {
  if (!value) {
    return "";
  }

  const normalized = normalizeWhitespace(value.replace(/\bCA\b.*$/i, "").replace(/,+$/g, ""));
  if (!normalized) {
    return "";
  }

  const parts = normalized.split(",").map((part) => normalizeWhitespace(part)).filter(Boolean);
  if (parts.length === 0) {
    return "";
  }

  return parts[parts.length - 1];
};

const buildStreetAddress = (row: RawCsvRow) => {
  const numberedStreet = [row.Number, row.Street].map((value) => normalizeWhitespace(value ?? "")).filter(Boolean).join(" ");
  const unitSuffix = [row["Unit Type"], row["Unit Number"]].map((value) => normalizeWhitespace(value ?? "")).filter(Boolean).join(" ");
  if (!numberedStreet) {
    return normalizeWhitespace(row.Address ?? row["Facility Address"] ?? "");
  }

  return [numberedStreet, unitSuffix].filter(Boolean).join(" ");
};

const stripAddressSuffix = (value: string, city: string) => {
  const normalizedValue = normalizeWhitespace(value);
  if (!normalizedValue) {
    return "";
  }

  const cityPattern = city ? city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
  const patterns = [
    cityPattern ? new RegExp(`(?:,\\s*|\\s+)${cityPattern},\\s*CA(?:\\s+\\d{5}(?:-\\d{4})?)?$`, "i") : null,
    /,\s*[A-Za-z.' -]+,\s*CA(?:\s+\d{5}(?:-\d{4})?)?$/i,
    /,\s*CA(?:\s+\d{5}(?:-\d{4})?)?$/i
  ].filter((pattern): pattern is RegExp => pattern instanceof RegExp);

  for (const pattern of patterns) {
    const nextValue = normalizeWhitespace(normalizedValue.replace(pattern, ""));
    if (nextValue && nextValue !== normalizedValue) {
      return nextValue;
    }
  }

  return normalizedValue;
};

const parseAddressParts = (rawAddress: string, explicitCity: string) => {
  const normalizedAddress = normalizeWhitespace(rawAddress);
  const normalizedCity = normalizeWhitespace(explicitCity);
  const stripped = stripAddressSuffix(normalizedAddress, normalizedCity);

  if (stripped && normalizedCity) {
    return {
      address: stripped,
      city: normalizedCity
    };
  }

  const cityMatch = normalizedAddress.match(/^(.*?),\s*([A-Za-z][A-Za-z.' -]+),\s*CA(?:\s+\d{5}(?:-\d{4})?)?$/i);
  if (cityMatch) {
    return {
      address: normalizeWhitespace(cityMatch[1]),
      city: normalizeWhitespace(cityMatch[2])
    };
  }

  return {
    address: normalizedAddress,
    city: normalizedCity
  };
};

const uniqueStrings = (values: string[]) => {
  const seen = new Set<string>();
  const nextValues: string[] = [];

  for (const value of values.map((entry) => normalizeWhitespace(entry)).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    nextValues.push(value);
  }

  return nextValues;
};

const buildGeneratedName = (address: string) => {
  const cleanAddress = normalizeWhitespace(address.replace(/,\s*CA.*$/i, ""));
  if (!cleanAddress) {
    return GENERIC_NAME;
  }

  return `${GENERIC_NAME} — ${cleanAddress}`;
};

const hasStreetNumber = (value: string) => /\b\d{1,6}\b/.test(normalizeWhitespace(value));

const hasBathroomAccess = (row: RawCsvRow, fileKey: SourceFileKey) => {
  switch (fileKey) {
    case "parks":
      return parseBooleanMarker(row["Bathroom ONLY"]) || parseBooleanMarker(row["Combo: Bathroom + Water"]) || (parseNumber(row["Number of Restrooms"]) ?? 0) > 0;
    case "libraries":
    case "streets":
      return parseBooleanMarker(row["Bathroom ONLY"]) || parseBooleanMarker(row["Combo: Bathroom + Water"]) || (parseNumber(row["No. of Restrooms"]) ?? 0) > 0;
    case "metro":
    case "city-other":
    case "county":
      return parseBooleanMarker(row["Bathroom ONLY"]) || parseBooleanMarker(row["Both: Bathroom + Water"]);
    default:
      return false;
  }
};

const buildStableExternalId = (input: { fileKey: SourceFileKey; name: string; address: string; city: string }) => {
  const canonical = [input.fileKey, input.name, input.address, input.city, STATE_CODE]
    .map((part) => normalizeWhitespace(part).toLowerCase())
    .join("|");
  const digest = createHash("sha1").update(canonical).digest("hex").slice(0, 10);
  const slug = slugify(`${input.fileKey}-${input.name}-${input.address}`) || input.fileKey;
  return `${slug}-${digest}`;
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

const isGeneratedGenericName = (value: string) => normalizeWhitespace(value).toLowerCase().startsWith(`${GENERIC_NAME.toLowerCase()} —`);

const scoreCompleteness = (record: IntermediateRestroom) => {
  let score = 0;
  if (record.hasSourceCoordinates) score += 5;
  if (record.place_type !== "other") score += 4;
  if (!isGeneratedGenericName(record.name)) score += 3;
  if (record.has_baby_station) score += 1;
  if (record.address.length > 0) score += 1;
  if (record.city.length > 0) score += 1;
  return score;
};

const isDuplicateRecord = (left: IntermediateRestroom, right: IntermediateRestroom) => {
  if (left.lat === null || left.lng === null || right.lat === null || right.lng === null) {
    return false;
  }

  const distance = haversineDistanceMiles({ lat: left.lat, lng: left.lng }, { lat: right.lat, lng: right.lng });
  if (distance > DEDUPE_DISTANCE_MILES) {
    return false;
  }

  if (left.normalizedAddress && left.normalizedAddress === right.normalizedAddress) {
    return true;
  }

  if (left.normalizedName && left.normalizedName === right.normalizedName) {
    return true;
  }

  return false;
};

const chooseBetterRecord = (current: IntermediateRestroom, candidate: IntermediateRestroom) => {
  const currentScore = scoreCompleteness(current);
  const candidateScore = scoreCompleteness(candidate);
  if (candidateScore !== currentScore) {
    return candidateScore > currentScore ? candidate : current;
  }

  return current.source_external_id <= candidate.source_external_id ? current : candidate;
};

const resolveRawInputPath = async (fileName: string) => {
  const candidates = [path.join(process.cwd(), "data", "la-controller", fileName), path.join(process.cwd(), fileName)];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(`Could not find ${fileName} in data/la-controller or project root.`);
};

const loadLocalEnv = async () => {
  const envPaths = [path.join(process.cwd(), ".env.local"), path.join(process.cwd(), ".env")];
  for (const envPath of envPaths) {
    try {
      const content = await readFile(envPath, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
          continue;
        }

        const equalsIndex = trimmed.indexOf("=");
        if (equalsIndex <= 0) {
          continue;
        }

        const key = trimmed.slice(0, equalsIndex).trim();
        if (!key || process.env[key]) {
          continue;
        }

        const rawValue = trimmed.slice(equalsIndex + 1).trim();
        const unwrapped = rawValue.replace(/^['\"]|['\"]$/g, "");
        process.env[key] = unwrapped;
      }
    } catch {
      continue;
    }
  }
};

const getMapboxToken = () => process.env.MAPBOX_ACCESS_TOKEN?.trim() || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() || "";

const readCache = async (cachePath: string) => {
  try {
    const content = await readFile(cachePath, "utf8");
    return JSON.parse(content) as Record<string, GeocodeResult>;
  } catch {
    return {} as Record<string, GeocodeResult>;
  }
};

const writeCache = async (cachePath: string, cache: Record<string, GeocodeResult>) => {
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(cache, null, 2));
};

const geocodeAddress = async (token: string, query: string): Promise<GeocodeResult | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);

  try {
    const endpoint = `${MAPBOX_GEOCODING_BASE_URL}/${encodeURIComponent(query)}.json`;
    const search = new URLSearchParams({
      access_token: token,
      language: "en",
      worldview: "us",
      country: "us",
      limit: "1",
      types: "address,poi,neighborhood,locality,place"
    });

    const response = await fetch(`${endpoint}?${search.toString()}`, {
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Mapbox geocoding failed (${response.status}) for ${query}`);
    }

    const payload = (await response.json()) as {
      features?: Array<{
        center?: number[];
        address?: string;
        text?: string;
        place_name?: string;
        context?: Array<{ id?: string; text?: string; short_code?: string }>;
      }>;
    };

    const feature = payload.features?.find((candidate) => Array.isArray(candidate.center) && candidate.center.length >= 2);
    if (!feature?.center) {
      return null;
    }

    const [lng, lat] = feature.center;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }

    const contexts = feature.context ?? [];
    const placeContext = contexts.find((context) => context.id?.startsWith("place."));
    const localityContext = contexts.find((context) => context.id?.startsWith("locality."));
    const regionContext = contexts.find((context) => context.id?.startsWith("region."));
    const city = normalizeWhitespace(placeContext?.text ?? localityContext?.text ?? "");
    const state = normalizeWhitespace((regionContext?.short_code?.split("-")[1] ?? regionContext?.text ?? "").toUpperCase());
    const address = normalizeWhitespace(
      feature.address && feature.text ? `${feature.address} ${feature.text}` : feature.text ?? feature.place_name?.split(",")[0] ?? ""
    );

    if (state && state !== STATE_CODE) {
      return null;
    }

    return {
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      address,
      city,
      state: STATE_CODE
    };
  } finally {
    clearTimeout(timeout);
  }
};

const resolveGeocodeResult = async (token: string, queries: string[]) => {
  for (const query of queries) {
    const result = await geocodeAddress(token, query);
    if (result) {
      return {
        query,
        result
      };
    }
  }

  return null;
};

const runWithConcurrency = async <T,>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>) => {
  let currentIndex = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (currentIndex < items.length) {
      const index = currentIndex;
      currentIndex += 1;
      await worker(items[index], index);
    }
  });

  await Promise.all(runners);
};

const buildRowsForSource = (definition: CsvSourceDefinition, rows: RawCsvRow[]) => {
  const normalizedRows: IntermediateRestroom[] = [];

  rows.forEach((row, rowIndex) => {
    if (!hasBathroomAccess(row, definition.fileKey)) {
      return;
    }

    const rawName = normalizeWhitespace(
      row["Facility Name"] ?? row["Completed Installations"] ?? row["Facility Name "] ?? ""
    );
    const explicitCity = normalizeWhitespace(row.City ?? extractCityFromCombinedField(row["City and Zip"]));
    const rawAddress = buildStreetAddress(row);
    const rawAddressLine = normalizeWhitespace(
      row["Facility Address"] ?? [rawAddress, row["City and Zip"] ?? ""].filter(Boolean).join(", ")
    );
    const { address, city } = parseAddressParts(rawAddress, explicitCity);
    const name = rawName || buildGeneratedName(address || rawAddress);
    const lat = parseNumber(row.Latitude);
    const lng = parseNumber(row.Longitude);
    const hasBabyStation = definition.fileKey === "parks" ? (parseNumber(row["No. of Baby Changing Stations"]) ?? 0) > 0 : false;
    const normalizedAddress = address || normalizeWhitespace(rawAddress);
    const normalizedCity = city || explicitCity || "Los Angeles";

    const source_external_id = buildStableExternalId({
      fileKey: definition.fileKey,
      name,
      address: normalizedAddress,
      city: normalizedCity
    });

    const geocodeQueries = uniqueStrings([
      rawAddressLine,
      [normalizedAddress, normalizedCity, STATE_CODE].filter(Boolean).join(", ")
    ]);

    normalizedRows.push({
      sourceFile: definition.fileKey,
      sourceRowNumber: rowIndex + 1,
      name,
      place_type: definition.placeType,
      rawAddressLine,
      address: normalizedAddress,
      city: normalizedCity,
      state: STATE_CODE,
      lat,
      lng,
      access_type: "public",
      has_baby_station: hasBabyStation,
      is_gender_neutral: false,
      is_accessible: false,
      requires_purchase: false,
      source: SOURCE_NAME,
      source_external_id,
      hasSourceCoordinates: lat !== null && lng !== null,
      normalizedName: normalizeNameForCompare(name),
      normalizedAddress: normalizeAddressForCompare(normalizedAddress),
      geocodeQueries
    });
  });

  return normalizedRows;
};

const readSourceRows = async (definition: CsvSourceDefinition) => {
  const inputPath = await resolveRawInputPath(definition.fileName);
  const content = await readFile(inputPath, "utf8");
  const csvRows = parseCsvRows(content);

  if (definition.fileKey === "parks") {
    const parkHeaders = [
      "Facility Name",
      "Facility Address",
      "CD",
      "Bathroom ONLY",
      "Water ONLY",
      "Combo: Bathroom + Water",
      "Standard",
      "Bottle Fillers",
      "Number of Restrooms",
      "No. of Baby Changing Stations",
      "No. of Showers",
      "Cooling Center"
    ];
    return buildRowsForSource(definition, toObjects(csvRows.slice(2), parkHeaders));
  }

  const [headerRow, ...dataRows] = csvRows;
  return buildRowsForSource(definition, toObjects(dataRows, headerRow));
};

const enrichWithGeocodes = async (records: IntermediateRestroom[], options: NormalizeOptions) => {
  await loadLocalEnv();
  const token = getMapboxToken();
  const cache = await readCache(options.cachePath);
  const recordsNeedingGeocode = records.filter((record) => record.lat === null || record.lng === null);

  if (recordsNeedingGeocode.length === 0) {
    return records;
  }

  if (!token) {
    throw new Error(`Missing Mapbox token. ${recordsNeedingGeocode.length} LA Controller rows still need coordinates.`);
  }

  let cacheWrites = 0;
  await runWithConcurrency(recordsNeedingGeocode, options.concurrency, async (record, index) => {
    const cached = record.geocodeQueries.map((query) => cache[query]).find(Boolean);
    const resolvedGeocode = cached
      ? { query: record.geocodeQueries[0], result: cached }
      : await resolveGeocodeResult(token, record.geocodeQueries);

    if (!resolvedGeocode) {
      throw new Error(
        `Could not geocode ${record.sourceFile} row ${record.sourceRowNumber}: ${record.name} (${record.geocodeQueries.join(" | ")})`
      );
    }

    for (const query of record.geocodeQueries) {
      cache[query] = resolvedGeocode.result;
    }

    record.lat = resolvedGeocode.result.lat;
    record.lng = resolvedGeocode.result.lng;

    const geocodedAddress = resolvedGeocode.result.address || record.address;
    const originalLooksUnsplit = /,\s*CA\b/i.test(record.address);
    const shouldKeepOriginalAddress =
      !originalLooksUnsplit && hasStreetNumber(record.address) && !hasStreetNumber(geocodedAddress);
    record.address = shouldKeepOriginalAddress ? record.address : geocodedAddress;
    record.city = resolvedGeocode.result.city || record.city;
    record.normalizedAddress = normalizeAddressForCompare(record.address);

    cacheWrites += 1;
    if (cacheWrites % 25 === 0 || index === recordsNeedingGeocode.length - 1) {
      await writeCache(options.cachePath, cache);
    }
  });

  return records;
};

const dedupeRecords = (records: IntermediateRestroom[]) => {
  const deduped: IntermediateRestroom[] = [];

  for (const record of records) {
    const duplicateIndex = deduped.findIndex((existing) => isDuplicateRecord(existing, record));
    if (duplicateIndex === -1) {
      deduped.push(record);
      continue;
    }

    deduped[duplicateIndex] = chooseBetterRecord(deduped[duplicateIndex], record);
  }

  return deduped;
};

const toNormalizedRestroom = (record: IntermediateRestroom): NormalizedRestroom => {
  if (record.lat === null || record.lng === null) {
    throw new Error(`Record is missing coordinates after normalization: ${record.name}`);
  }

  return {
    name: normalizeWhitespace(record.name),
    place_type: record.place_type,
    address: normalizeWhitespace(record.address),
    city: toTitleCase(record.city),
    state: STATE_CODE,
    lat: Number(record.lat.toFixed(6)),
    lng: Number(record.lng.toFixed(6)),
    access_type: record.access_type,
    has_baby_station: record.has_baby_station,
    is_gender_neutral: record.is_gender_neutral,
    is_accessible: record.is_accessible,
    requires_purchase: record.requires_purchase,
    source: SOURCE_NAME,
    source_external_id: record.source_external_id
  };
};

const sortRecords = (records: NormalizedRestroom[]) =>
  [...records].sort((left, right) => {
    const cityCompare = left.city.localeCompare(right.city);
    if (cityCompare !== 0) return cityCompare;
    const nameCompare = left.name.localeCompare(right.name);
    if (nameCompare !== 0) return nameCompare;
    return left.address.localeCompare(right.address);
  });

const main = async () => {
  const options = parseArgs();

  const sourceRows = (
    await Promise.all(
      SOURCE_DEFINITIONS.map(async (definition) => ({
        fileKey: definition.fileKey,
        records: await readSourceRows(definition)
      }))
    )
  ).flatMap((entry) => entry.records);

  const withCoordinates = await enrichWithGeocodes(sourceRows, options);
  const deduped = dedupeRecords(withCoordinates);
  const normalized = sortRecords(deduped.map(toNormalizedRestroom));

  await mkdir(path.dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, `${JSON.stringify(normalized, null, 2)}\n`);

  const countsBySource = SOURCE_DEFINITIONS.map((definition) => ({
    fileKey: definition.fileKey,
    count: deduped.filter((record) => record.sourceFile === definition.fileKey).length
  }));

  console.log(`[seed:normalize:la-controller] Wrote ${normalized.length} normalized LA restrooms to ${options.outputPath}`);
  for (const count of countsBySource) {
    console.log(`[seed:normalize:la-controller] ${count.fileKey}: ${count.count}`);
  }
  console.log(
    `[seed:normalize:la-controller] Import with: npm run seed:import:restrooms -- --input ${options.outputPath} --source la_controller --default-city "Los Angeles" --default-state CA --dry-run`
  );
};

main().catch((error) => {
  console.error("[seed:normalize:la-controller] Failed", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
