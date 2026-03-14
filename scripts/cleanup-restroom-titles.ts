import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { MapboxFeature } from "../lib/mapbox/reverseGeocodeParser";

interface CleanupOptions {
  apply: boolean;
  dryRun: boolean;
  limit: number | null;
  concurrency: number;
  cityFilters: string[];
  scopes: ScopeKey[];
  titleTargets: TitleTargetKey[];
}

type ScopeKey = "east_bay" | "south_bay" | "inner_bay";
type TitleTargetKey =
  | "exact-oakland"
  | "exact-san-mateo"
  | "exact-san-francisco"
  | "public-restroom-oakland"
  | "public-restroom-san-mateo"
  | "public-restroom-san-francisco"
  | "restroom-1-5";

interface BathroomTitleRow {
  id: string;
  name: string | null;
  city: string | null;
  address: string | null;
  lat: number;
  lng: number;
}

interface ProposedTitleChange {
  id: string;
  currentName: string;
  proposedName: string;
  city: string;
  lat: number;
  lng: number;
  landmarkUsed: string | null;
  reason: "placeholder->landmark restroom" | "placeholder->public restroom";
}

interface MapboxReverseGeocodeResponse {
  features?: MapboxFeature[];
}

const DEFAULT_PUBLIC_NAME = "Public Restroom";
const MAPBOX_GEOCODING_BASE_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places";
const DEFAULT_CONCURRENCY = 3;
const FETCH_PAGE_SIZE = 1000;
const LOOKUP_TIMEOUT_MS = 7000;
const NEARBY_DUPLICATE_RADIUS_MILES = 0.12;
const PLACEHOLDER_NUMBER_PATTERN = /^(?:public\s+)?(?:restroom|toilet|bathroom|washroom)\s*#?\s*\d+$/i;
const PLACEHOLDER_CONTEXT_PATTERN =
  /^(public restroom|public restrooms|public washroom|public washrooms|restroom|restrooms|public toilet|public toilets|toilet|toilets|washroom|washrooms|bathroom|bathrooms|wc)\s*(?:-|—|:)\s*(.+)$/i;
const STREET_CONTEXT_PATTERN =
  /(?:\b\d{1,5}\b\s+)?[a-z0-9.'-]+\s(?:st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|way|pl|place|ct|court|ter|terrace|hwy|highway)\b/i;
const COORDINATE_PATTERN = /^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/;

const genericPlaceholderNames = new Set([
  "public restroom",
  "public restrooms",
  "public toilet",
  "public toilets",
  "public washroom",
  "public washrooms",
  "restroom",
  "restrooms",
  "toilet",
  "toilets",
  "washroom",
  "washrooms",
  "bathroom",
  "bathrooms",
  "wc"
]);

const knownCityPlaceholders = new Set([
  "oakland",
  "berkeley",
  "richmond",
  "san pablo",
  "hercules",
  "el cerrito",
  "concord",
  "walnut creek",
  "pleasant hill",
  "fremont",
  "hayward",
  "union city",
  "newark",
  "san leandro",
  "san jose",
  "santa clara",
  "sunnyvale",
  "campbell",
  "cupertino",
  "milpitas",
  "mountain view",
  "palo alto",
  "san mateo",
  "redwood city",
  "san francisco",
  "sausalito"
]);

const trustedLandmarkKeywords = [
  "park",
  "trail",
  "campus",
  "college",
  "university",
  "museum",
  "station",
  "transit",
  "bart",
  "caltrain",
  "center",
  "centre",
  "library",
  "marina",
  "plaza",
  "pier",
  "mall",
  "market",
  "recreation",
  "community",
  "civic",
  "terminal",
  "preserve",
  "gardens"
];

const weakLandmarkFragments = [
  "county",
  "region",
  "district",
  "bay area",
  "neighborhood",
  "downtown",
  "unknown",
  "unnamed"
];

const eastBayScope = {
  minLat: 37.45,
  maxLat: 38.15,
  minLng: -122.38,
  maxLng: -121.55
} as const;

const southBayScope = {
  minLat: 36.95,
  maxLat: 37.55,
  minLng: -122.2,
  maxLng: -121.45
} as const;

const innerBayScope = {
  minLat: 37.7,
  maxLat: 38.2,
  minLng: -122.52,
  maxLng: -122.15
} as const;

const scopeBoundsByKey: Record<ScopeKey, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
  east_bay: eastBayScope,
  south_bay: southBayScope,
  inner_bay: innerBayScope
};

const defaultTitleTargets: TitleTargetKey[] = [
  "exact-oakland",
  "exact-san-mateo",
  "exact-san-francisco",
  "public-restroom-oakland",
  "public-restroom-san-mateo",
  "public-restroom-san-francisco"
];

const parseArgs = (): CleanupOptions => {
  const args = process.argv.slice(2);
  const cityFilters = new Set<string>();
  const scopes = new Set<ScopeKey>(["east_bay", "south_bay", "inner_bay"]);
  const titleTargets = new Set<TitleTargetKey>(defaultTitleTargets);
  const options: CleanupOptions = {
    apply: false,
    dryRun: true,
    limit: null,
    concurrency: DEFAULT_CONCURRENCY,
    cityFilters: [],
    scopes: [],
    titleTargets: []
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--apply") {
      options.apply = true;
      options.dryRun = false;
      continue;
    }
    if (arg === "--dry-run") {
      options.apply = false;
      options.dryRun = true;
      continue;
    }

    const next = args[i + 1];
    if (!next) {
      throw new Error(`Missing value for argument ${arg}`);
    }

    switch (arg) {
      case "--limit": {
        const value = Number.parseInt(next, 10);
        if (!Number.isFinite(value) || value <= 0) {
          throw new Error("--limit must be a positive integer");
        }
        options.limit = value;
        i += 1;
        break;
      }
      case "--concurrency": {
        const value = Number.parseInt(next, 10);
        if (!Number.isFinite(value) || value <= 0 || value > 20) {
          throw new Error("--concurrency must be an integer between 1 and 20");
        }
        options.concurrency = value;
        i += 1;
        break;
      }
      case "--city": {
        const requestedCities = next
          .split(",")
          .map((value) => normalizeToken(stripStateSuffix(value)))
          .filter(Boolean);
        if (requestedCities.length === 0) {
          throw new Error("--city requires one city value (or a comma-separated list)");
        }
        for (const requestedCity of requestedCities) {
          cityFilters.add(requestedCity);
        }
        i += 1;
        break;
      }
      case "--scope": {
        const requestedScopes = next
          .split(",")
          .map((value) => parseScopeKey(value))
          .filter((value): value is ScopeKey => value !== null);
        if (requestedScopes.length === 0) {
          throw new Error("--scope must include one or more of east_bay|south_bay|inner_bay");
        }
        scopes.clear();
        for (const requestedScope of requestedScopes) {
          scopes.add(requestedScope);
        }
        i += 1;
        break;
      }
      case "--title-target":
      case "--title-pattern": {
        const requestedTargets = next
          .split(",")
          .map((value) => parseTitleTargetKey(value))
          .filter((value): value is TitleTargetKey => value !== null);
        if (requestedTargets.length === 0) {
          throw new Error(
            "--title-target must include built-ins such as exact-oakland, public-restroom-oakland, exact-san-mateo, public-restroom-san-mateo, exact-san-francisco, public-restroom-san-francisco, restroom-1-5"
          );
        }
        titleTargets.clear();
        for (const requestedTarget of requestedTargets) {
          titleTargets.add(requestedTarget);
        }
        i += 1;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.cityFilters = [...cityFilters];
  options.scopes = [...scopes];
  options.titleTargets = [...titleTargets];
  return options;
};

const getMapboxToken = () =>
  process.env.MAPBOX_ACCESS_TOKEN?.trim() || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() || "";

const getSupabaseConfig = () => {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (preferred), or NEXT_PUBLIC_* fallback."
    );
  }

  return {
    url,
    key
  };
};

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const normalizeToken = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeDashes = (value: string) => value.replace(/[—–]/g, "-");

const parseScopeKey = (value: string): ScopeKey | null => {
  const normalized = normalizeToken(value);
  if (normalized === "east bay" || normalized === "eastbay" || normalized === "east_bay") {
    return "east_bay";
  }
  if (normalized === "south bay" || normalized === "southbay" || normalized === "south_bay") {
    return "south_bay";
  }
  if (normalized === "inner bay" || normalized === "innerbay" || normalized === "inner_bay") {
    return "inner_bay";
  }
  return null;
};

const parseTitleTargetKey = (value: string): TitleTargetKey | null => {
  const normalized = normalizeToken(normalizeDashes(value));
  switch (normalized) {
    case "exact oakland":
    case "oakland":
      return "exact-oakland";
    case "exact san mateo":
    case "san mateo":
      return "exact-san-mateo";
    case "exact san francisco":
    case "san francisco":
      return "exact-san-francisco";
    case "public restroom oakland":
    case "public restroom oakland pattern":
      return "public-restroom-oakland";
    case "public restroom san mateo":
    case "public restroom san mateo pattern":
      return "public-restroom-san-mateo";
    case "public restroom san francisco":
    case "public restroom san francisco pattern":
      return "public-restroom-san-francisco";
    case "restroom 1 5":
    case "restroom 1 to 5":
    case "restroom 1 through 5":
    case "restroom 1-5":
      return "restroom-1-5";
    default:
      return null;
  }
};

const toTitleCase = (value: string) =>
  normalizeWhitespace(value)
    .split(" ")
    .map((part) => (part.length <= 2 ? part.toUpperCase() : `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`))
    .join(" ");

const stripNearPrefix = (value: string) => value.replace(/^near\s+/i, "").trim();

const stripStateSuffix = (value: string) => value.replace(/,\s*[a-z]{2}$/i, "").trim();

const isSanFrancisco = (value: string | null | undefined) => /^san francisco(?:,\s*ca)?$/i.test(normalizeWhitespace(value ?? ""));

const isWithinBounds = (
  lat: number,
  lng: number,
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }
) => lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng;

const isInScope = (row: BathroomTitleRow, scopes: ScopeKey[]) => {
  if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng)) {
    return false;
  }

  if (isSanFrancisco(row.city)) {
    return false;
  }

  return scopes.some((scope) => isWithinBounds(row.lat, row.lng, scopeBoundsByKey[scope]));
};

const hasCityFilterMatch = (row: BathroomTitleRow, cityFilters: string[]) => {
  if (cityFilters.length === 0) {
    return true;
  }

  const rowCityToken = normalizeToken(stripStateSuffix(row.city ?? ""));
  if (!rowCityToken) {
    return false;
  }

  return cityFilters.includes(rowCityToken);
};

const isCityPlaceholder = (name: string, city: string | null) => {
  const normalizedName = normalizeToken(stripStateSuffix(name));
  if (!normalizedName) {
    return false;
  }

  if (knownCityPlaceholders.has(normalizedName)) {
    return true;
  }

  const cityCore = normalizeToken(stripStateSuffix(city ?? ""));
  return Boolean(cityCore) && normalizedName === cityCore;
};

const isObviouslyPlaceholderName = (name: string, city: string | null) => {
  const normalizedName = normalizeToken(name);
  if (!normalizedName) {
    return true;
  }

  if (genericPlaceholderNames.has(normalizedName) || PLACEHOLDER_NUMBER_PATTERN.test(name)) {
    return true;
  }

  if (isCityPlaceholder(name, city)) {
    return true;
  }

  const contextMatch = normalizeWhitespace(name).match(PLACEHOLDER_CONTEXT_PATTERN);
  if (contextMatch?.[2]) {
    const context = stripNearPrefix(contextMatch[2]);
    if (isCityPlaceholder(context, city)) {
      return true;
    }
  }

  return false;
};

const titleTargetRegexByKey: Record<Exclude<TitleTargetKey, "restroom-1-5">, RegExp> = {
  "exact-oakland": /^oakland(?:,\s*ca)?$/i,
  "exact-san-mateo": /^san mateo(?:,\s*ca)?$/i,
  "exact-san-francisco": /^san francisco(?:,\s*ca)?$/i,
  "public-restroom-oakland": /^public restroom(?:s)?\s*(?:-|—|:)\s*oakland(?:,\s*ca)?$/i,
  "public-restroom-san-mateo": /^public restroom(?:s)?\s*(?:-|—|:)\s*san mateo(?:,\s*ca)?$/i,
  "public-restroom-san-francisco": /^public restroom(?:s)?\s*(?:-|—|:)\s*san francisco(?:,\s*ca)?$/i
};

const matchesTitleTarget = (name: string, target: TitleTargetKey) => {
  const cleanedName = normalizeWhitespace(normalizeDashes(name));
  if (!cleanedName) {
    return false;
  }

  if (target === "restroom-1-5") {
    return /^(?:public\s+)?(?:restroom|toilet|bathroom|washroom)\s*#?\s*[1-5]$/i.test(cleanedName);
  }

  return titleTargetRegexByKey[target].test(cleanedName);
};

const hasTitleTargetMatch = (name: string, titleTargets: TitleTargetKey[]) =>
  titleTargets.some((titleTarget) => matchesTitleTarget(name, titleTarget));

const isWeakLandmark = (value: string, city: string | null) => {
  const cleaned = normalizeWhitespace(value);
  if (!cleaned) {
    return true;
  }

  if (COORDINATE_PATTERN.test(cleaned)) {
    return true;
  }

  if (STREET_CONTEXT_PATTERN.test(cleaned.toLowerCase())) {
    return true;
  }

  const normalized = normalizeToken(cleaned);
  if (!normalized) {
    return true;
  }

  if (genericPlaceholderNames.has(normalized) || isCityPlaceholder(cleaned, city)) {
    return true;
  }

  if (weakLandmarkFragments.some((fragment) => normalized.includes(fragment))) {
    return true;
  }

  return false;
};

const hasTrustedLandmarkSignal = (value: string) => {
  const normalized = normalizeToken(value);
  return trustedLandmarkKeywords.some((keyword) => normalized.includes(keyword));
};

const getAddressLandmarkCandidate = (address: string | null, city: string | null) => {
  const firstSegment = normalizeWhitespace((address ?? "").split(",")[0] ?? "");
  if (!firstSegment) {
    return null;
  }

  const candidate = stripNearPrefix(firstSegment);
  if (isWeakLandmark(candidate, city)) {
    return null;
  }

  if (!hasTrustedLandmarkSignal(candidate)) {
    return null;
  }

  return toTitleCase(candidate);
};

const extractMapboxPoiCandidates = (features: MapboxFeature[]) => {
  const candidates: string[] = [];

  for (const feature of features) {
    const isPoiFeature = feature.place_type?.includes("poi");
    if (isPoiFeature && feature.text?.trim()) {
      candidates.push(feature.text.trim());
    }

    for (const context of feature.context ?? []) {
      if (!context.id?.startsWith("poi.")) {
        continue;
      }
      if (context.text?.trim()) {
        candidates.push(context.text.trim());
      }
    }
  }

  return Array.from(new Set(candidates));
};

const getMapboxLandmarkCandidate = async (
  token: string,
  row: BathroomTitleRow
): Promise<{ landmark: string | null; reason: string }> => {
  const endpoint = `${MAPBOX_GEOCODING_BASE_URL}/${row.lng},${row.lat}.json`;
  const query = new URLSearchParams({
    access_token: token,
    language: "en",
    worldview: "us",
    types: "poi,address,place,locality",
    limit: "10"
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, LOOKUP_TIMEOUT_MS);

  try {
    const response = await fetch(`${endpoint}?${query.toString()}`, {
      signal: controller.signal
    });
    if (!response.ok) {
      return {
        landmark: null,
        reason: `provider_${response.status}`
      };
    }

    const payload = (await response.json()) as MapboxReverseGeocodeResponse;
    const poiCandidates = extractMapboxPoiCandidates(payload.features ?? []);
    for (const candidate of poiCandidates) {
      if (isWeakLandmark(candidate, row.city)) {
        continue;
      }
      if (!hasTrustedLandmarkSignal(candidate)) {
        continue;
      }
      return {
        landmark: toTitleCase(candidate),
        reason: "poi"
      };
    }

    return {
      landmark: null,
      reason: "no_trusted_poi"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "provider_exception";
    return {
      landmark: null,
      reason: message
    };
  } finally {
    clearTimeout(timeout);
  }
};

const toOutputName = (landmark: string | null) => {
  if (!landmark) {
    return DEFAULT_PUBLIC_NAME;
  }

  if (/restroom$/i.test(landmark)) {
    return landmark;
  }

  return `${landmark} Restroom`;
};

const normalizeNameForCompare = (name: string) => normalizeToken(name);

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

const hasNearbyDuplicateName = (
  row: BathroomTitleRow,
  proposedName: string,
  allRows: BathroomTitleRow[],
  proposedNameById: Map<string, string>
) => {
  const normalizedProposed = normalizeNameForCompare(proposedName);
  for (const other of allRows) {
    if (other.id === row.id) {
      continue;
    }

    if (!Number.isFinite(other.lat) || !Number.isFinite(other.lng)) {
      continue;
    }

    const distance = haversineDistanceMiles(
      { lat: row.lat, lng: row.lng },
      { lat: other.lat, lng: other.lng }
    );
    if (distance > NEARBY_DUPLICATE_RADIUS_MILES) {
      continue;
    }

    const otherEffectiveName = proposedNameById.get(other.id) ?? normalizeWhitespace(other.name ?? "");
    if (!otherEffectiveName) {
      continue;
    }

    if (normalizeNameForCompare(otherEffectiveName) === normalizedProposed) {
      return true;
    }
  }

  return false;
};

const runWithConcurrency = async <T>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<void>
) => {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(items.length, concurrency) }, async () => {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      await task(items[current], current);
    }
  });

  await Promise.all(workers);
};

const fetchBathrooms = async (supabase: SupabaseClient, limit: number | null): Promise<BathroomTitleRow[]> => {
  const rows: BathroomTitleRow[] = [];
  let offset = 0;

  while (true) {
    const end = offset + FETCH_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("bathrooms")
      .select("id, name, city, address, lat, lng")
      .neq("status", "removed")
      .order("created_at", { ascending: true })
      .range(offset, end);

    if (error) {
      throw new Error(`Failed to load bathrooms: ${error.message}`);
    }

    const batch = (data ?? []) as BathroomTitleRow[];
    if (batch.length === 0) {
      break;
    }

    rows.push(...batch);
    if (limit && rows.length >= limit) {
      return rows.slice(0, limit);
    }

    if (batch.length < FETCH_PAGE_SIZE) {
      break;
    }

    offset += FETCH_PAGE_SIZE;
  }

  return rows;
};

const run = async () => {
  const options = parseArgs();
  const mapboxToken = getMapboxToken();
  if (!mapboxToken) {
    throw new Error("Missing Mapbox token. Set MAPBOX_ACCESS_TOKEN (preferred) or NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN.");
  }

  const supabaseConfig = getSupabaseConfig();
  const supabase = createClient(supabaseConfig.url, supabaseConfig.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const allRows = await fetchBathrooms(supabase, options.limit);
  const inScopeRows = allRows.filter((row) => isInScope(row, options.scopes) && hasCityFilterMatch(row, options.cityFilters));
  const placeholderRows = inScopeRows.filter((row) => {
    const currentName = normalizeWhitespace(row.name ?? "");
    if (!currentName || !hasTitleTargetMatch(currentName, options.titleTargets)) {
      return false;
    }

    return isObviouslyPlaceholderName(currentName, row.city);
  });

  const proposedNameById = new Map<string, string>();
  const proposedChanges: ProposedTitleChange[] = [];
  const skippedByReason = new Map<string, number>();
  let mapboxLookups = 0;

  await runWithConcurrency(placeholderRows, options.concurrency, async (row) => {
    const currentName = normalizeWhitespace(row.name ?? "");
    const city = normalizeWhitespace(row.city ?? "");

    let landmark = getAddressLandmarkCandidate(row.address, row.city);
    let landmarkReason: string = landmark ? "address_landmark" : "none";
    if (!landmark) {
      mapboxLookups += 1;
      const mapboxResult = await getMapboxLandmarkCandidate(mapboxToken, row);
      landmark = mapboxResult.landmark;
      landmarkReason = mapboxResult.reason;
    }

    let proposedName = toOutputName(landmark);
    let reason: ProposedTitleChange["reason"] = landmark
      ? "placeholder->landmark restroom"
      : "placeholder->public restroom";

    if (reason === "placeholder->landmark restroom" && hasNearbyDuplicateName(row, proposedName, allRows, proposedNameById)) {
      proposedName = DEFAULT_PUBLIC_NAME;
      reason = "placeholder->public restroom";
      landmark = null;
      landmarkReason = "duplicate_landmark_name";
    }

    if (normalizeNameForCompare(currentName) === normalizeNameForCompare(proposedName)) {
      const count = skippedByReason.get("no_change") ?? 0;
      skippedByReason.set("no_change", count + 1);
      return;
    }

    proposedNameById.set(row.id, proposedName);
    proposedChanges.push({
      id: row.id,
      currentName,
      proposedName,
      city,
      lat: row.lat,
      lng: row.lng,
      landmarkUsed: landmark,
      reason
    });

    const lookupCount = skippedByReason.get(`candidate_${landmarkReason}`) ?? 0;
    skippedByReason.set(`candidate_${landmarkReason}`, lookupCount + 1);
  });

  const sortedChanges = [...proposedChanges].sort((a, b) => a.currentName.localeCompare(b.currentName));

  if (options.dryRun) {
    console.log("[cleanup:restroom-titles] Dry run preview");
    for (const change of sortedChanges) {
      console.log(
        `${change.id}\t${change.currentName || "(empty)"}\t${change.city || "(no city)"}\tlandmark=${change.landmarkUsed ?? "-"}\t${change.reason}\t=>\t${change.proposedName}\t(${change.lat.toFixed(6)}, ${change.lng.toFixed(6)})`
      );
    }
  } else {
    let updatedCount = 0;
    await runWithConcurrency(sortedChanges, options.concurrency, async (change) => {
      const { error } = await supabase
        .from("bathrooms")
        .update({
          name: change.proposedName
        })
        .eq("id", change.id);

      if (error) {
        throw new Error(`Failed to update restroom ${change.id}: ${error.message}`);
      }

      updatedCount += 1;
    });

    console.log(`[cleanup:restroom-titles] Updated names: ${updatedCount}`);
  }

  const landmarkCount = sortedChanges.filter((change) => change.reason === "placeholder->landmark restroom").length;
  const fallbackCount = sortedChanges.filter((change) => change.reason === "placeholder->public restroom").length;

  console.log(`[cleanup:restroom-titles] Rows scanned: ${allRows.length}`);
  console.log(`[cleanup:restroom-titles] Applied scope filter: ${options.scopes.join(", ")}`);
  if (options.cityFilters.length > 0) {
    console.log(
      `[cleanup:restroom-titles] Applied city filter: ${options.cityFilters
        .map((city) => toTitleCase(city))
        .join(", ")}`
    );
  }
  console.log(`[cleanup:restroom-titles] Applied title-target filter: ${options.titleTargets.join(", ")}`);
  console.log(`[cleanup:restroom-titles] Rows in selected scope (after city filter): ${inScopeRows.length}`);
  console.log(`[cleanup:restroom-titles] Placeholder candidates matching title targets: ${placeholderRows.length}`);
  console.log(`[cleanup:restroom-titles] Proposed renames: ${sortedChanges.length}`);
  console.log(`[cleanup:restroom-titles] Proposed landmark-based names: ${landmarkCount}`);
  console.log(`[cleanup:restroom-titles] Proposed fallback Public Restroom names: ${fallbackCount}`);
  console.log(`[cleanup:restroom-titles] Mapbox lookups executed: ${mapboxLookups}`);

  if (skippedByReason.size > 0) {
    console.log("[cleanup:restroom-titles] Candidate notes:");
    for (const [reason, count] of [...skippedByReason.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      console.log(`  - ${reason}: ${count}`);
    }
  }
};

run().catch((error) => {
  console.error("[cleanup:restroom-titles] Failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
