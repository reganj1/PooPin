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

const allowedPlaceTypes = new Set<BathroomPlaceType>(bathroomPlaceTypeOptions);
const allowedAccessTypes = new Set<BathroomAccessType>(bathroomAccessTypeOptions);
const allowedSources = new Set<BathroomSource>(["user", "google_places", "city_open_data", "openstreetmap", "partner", "other"]);

const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const normalizeName = (value: string) =>
  value
    .toLowerCase()
    .replace(/\b(restroom|bathroom|toilet|washroom|public|wc|room)\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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
  return ["true", "1", "yes", "y", "t", "available", "public"].includes(normalized);
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

const resolvePlaceType = (value: RawValue): BathroomPlaceType => {
  const parsed = parseString(value)?.toLowerCase();
  if (!parsed) {
    return "other";
  }

  if (allowedPlaceTypes.has(parsed as BathroomPlaceType)) {
    return parsed as BathroomPlaceType;
  }

  if (parsed.includes("park")) return "park";
  if (parsed.includes("transit") || parsed.includes("station")) return "transit_station";
  if (parsed.includes("cafe") || parsed.includes("coffee")) return "cafe";
  if (parsed.includes("restaurant") || parsed.includes("food")) return "restaurant";
  if (parsed.includes("library")) return "library";
  if (parsed.includes("mall") || parsed.includes("shopping")) return "mall";
  if (parsed.includes("gym") || parsed.includes("fitness")) return "gym";
  if (parsed.includes("office") || parsed.includes("building")) return "office";

  return "other";
};

const resolveAccessType = (value: RawValue): BathroomAccessType => {
  const parsed = parseString(value)?.toLowerCase();
  if (!parsed) {
    return "public";
  }

  if (allowedAccessTypes.has(parsed as BathroomAccessType)) {
    return parsed as BathroomAccessType;
  }

  if (parsed.includes("customer") || parsed.includes("purchase")) return "customer_only";
  if (parsed.includes("code") || parsed.includes("keypad")) return "code_required";
  if (parsed.includes("staff") || parsed.includes("attendant")) return "staff_assisted";
  if (parsed.includes("private")) return "staff_assisted";

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

const buildAddress = (row: RawRecord, fallbackCity: string, lat: number, lng: number): string => {
  const fullAddress = parseString(getValue(row, ["address", "street_address", "street", "location", "location_address", "cross_street", "addr:full"]));
  if (fullAddress) {
    return fullAddress;
  }

  const houseNumber = parseString(getValue(row, ["addr:housenumber", "house_number"]));
  const streetName = parseString(getValue(row, ["addr:street", "road", "street_name"]));
  if (streetName) {
    return [houseNumber, streetName].filter(Boolean).join(" ");
  }

  const neighborhood = parseString(getValue(row, ["addr:suburb", "neighbourhood", "neighborhood", "district"]));
  if (neighborhood) {
    return `${neighborhood}, ${fallbackCity}`;
  }

  return `Approximate location (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
};

const toImportRecord = (row: RawRecord, options: ImportOptions): ImportBathroomRecord | null => {
  const lat = parseNumber(getValue(row, ["lat", "latitude", "y", "geom_lat", "location_lat"]));
  const lng = parseNumber(getValue(row, ["lng", "lon", "long", "longitude", "x", "geom_lng", "location_lng"]));

  if (lat === null || lng === null) {
    return null;
  }

  const source = resolveSource(getValue(row, ["source", "dataset_source"]), options.source);
  const parsedName = parseString(getValue(row, ["name", "restroom_name", "facility_name", "site_name", "location_name"]));
  const name = parsedName ?? (source === "openstreetmap" ? DEFAULT_OSM_NAME : null);
  if (!name) {
    return null;
  }

  const sourceExternalIdRaw = parseString(getValue(row, ["source_external_id", "external_id", "externalid", "objectid"]));
  const osmType = parseString(getValue(row, ["osm_type", "type"]))?.toLowerCase();
  const osmId = parseString(getValue(row, ["osm_id", "id"]));
  const sourceExternalId =
    sourceExternalIdRaw && sourceExternalIdRaw.length > 0
      ? sourceExternalIdRaw
      : source === "openstreetmap" && osmType && osmId
        ? `osm:${osmType}/${osmId}`
        : null;

  const city = parseString(getValue(row, ["city", "addr:city", "town", "municipality"])) ?? options.defaultCity;
  const state = parseString(getValue(row, ["state", "state_code", "province", "addr:state"])) ?? options.defaultState;
  const parsedAddress = parseString(
    getValue(row, ["address", "street_address", "street", "location", "location_address", "cross_street", "addr:full"])
  );
  const address = parsedAddress ?? (source === "openstreetmap" ? buildAddress(row, city, lat, lng) : null);
  if (!address) {
    return null;
  }

  const accessType = resolveAccessType(getValue(row, ["access_type", "access", "access_level"]));
  const requiresPurchase =
    parseBoolean(getValue(row, ["requires_purchase", "purchase_required", "fee"])) || accessType === "customer_only";

  return {
    name,
    place_type: resolvePlaceType(getValue(row, ["place_type", "category", "type", "facility_type"])),
    address,
    city,
    state,
    lat,
    lng,
    access_type: accessType,
    has_baby_station: parseBoolean(getValue(row, ["has_baby_station", "baby_station", "changing_table"])),
    is_gender_neutral: parseBoolean(getValue(row, ["is_gender_neutral", "gender_neutral", "all_gender", "unisex"])),
    is_accessible: parseBoolean(getValue(row, ["is_accessible", "accessible", "ada_accessible", "wheelchair"])),
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
          throw new Error("--source must be one of user|google_places|city_open_data|openstreetmap|partner|other");
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

  rawRecords.forEach((row) => {
    const normalized = toImportRecord(row, options);
    if (!normalized) {
      invalidRows += 1;
      return;
    }
    normalizedRecords.push(normalized);
  });

  const { data: existingRows, error: existingError } = await supabase
    .from("bathrooms")
    .select("name, lat, lng, source, source_external_id")
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

      seenExternalKeysInInput.add(key);
      upsertByExternalId.push(record);

      if (!existingExternalKeys.has(key)) {
        existingExternalKeys.add(key);
      }

      existing.push({
        name: record.name,
        lat: record.lat,
        lng: record.lng,
        source: record.source,
        source_external_id: record.source_external_id
      });

      continue;
    }

    const duplicate = existing.some((existingRow) =>
      isLikelyDuplicateByNameAndLocation(record, existingRow, options.distanceMiles)
    );

    if (duplicate) {
      duplicateRows += 1;
      continue;
    }

    insertWithoutExternalId.push(record);
    existing.push({
      name: record.name,
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
