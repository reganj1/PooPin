import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { MapboxContext, MapboxFeature } from "../lib/mapbox/reverseGeocodeParser";

interface CleanupOptions {
  apply: boolean;
  dryRun: boolean;
  limit: number | null;
  concurrency: number;
  excludeSanFrancisco: boolean;
}

interface BathroomCityRow {
  id: string;
  name: string;
  city: string | null;
  lat: number;
  lng: number;
}

interface ProposedCityChange {
  id: string;
  name: string;
  currentCity: string;
  proposedCity: string;
  lat: number;
  lng: number;
}

interface MapboxReverseGeocodeResponse {
  features?: MapboxFeature[];
}

interface ReverseGeocodeCityResult {
  city: string | null;
  reason: string;
}

const MAPBOX_GEOCODING_BASE_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places";
const DEFAULT_CONCURRENCY = 4;
const BATHROOM_FETCH_PAGE_SIZE = 1000;
const HTTP_TIMEOUT_MS = 7000;
const CITY_VALUE_BLOCKLIST = /\b(county|district|region|bay area|metropolitan)\b/i;

const parseArgs = (): CleanupOptions => {
  const args = process.argv.slice(2);
  const options: CleanupOptions = {
    apply: false,
    dryRun: true,
    limit: null,
    concurrency: DEFAULT_CONCURRENCY,
    excludeSanFrancisco: false
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
    if (arg === "--exclude-san-francisco") {
      options.excludeSanFrancisco = true;
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
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

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

const normalizeCityCandidate = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  const normalized = normalizeWhitespace(value.replace(/^city of\s+/i, ""));
  if (!normalized) {
    return null;
  }

  if (CITY_VALUE_BLOCKLIST.test(normalized)) {
    return null;
  }

  return normalized;
};

const isSanFrancisco = (value: string | null | undefined) => {
  if (!value) {
    return false;
  }

  return /^san francisco(?:,\s*ca)?$/i.test(normalizeWhitespace(value));
};

const normalizeCityForComparison = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s*,\s*ca$/i, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isSameCityValue = (currentCity: string, proposedCity: string) =>
  normalizeCityForComparison(currentCity) === normalizeCityForComparison(proposedCity);

const getContextEntry = (features: MapboxFeature[], prefix: string): MapboxContext | null => {
  for (const feature of features) {
    for (const context of feature.context ?? []) {
      if (context.id?.startsWith(`${prefix}.`)) {
        return context;
      }
    }
  }

  return null;
};

const getFeatureTextByPlaceType = (features: MapboxFeature[], placeType: string): string | null => {
  const matchingFeature = features.find((feature) => feature.place_type?.includes(placeType));
  return matchingFeature?.text?.trim() || null;
};

const getStateCode = (features: MapboxFeature[]) => {
  const regionContext = getContextEntry(features, "region");
  const shortCode = regionContext?.short_code?.trim();
  if (shortCode?.includes("-")) {
    const [, suffix] = shortCode.split("-");
    return suffix?.toUpperCase() ?? "";
  }

  if (shortCode) {
    return shortCode.toUpperCase();
  }

  return "";
};

const resolveCityFromFeatures = (features: MapboxFeature[]): string | null => {
  const candidates = [
    getContextEntry(features, "place")?.text?.trim() ?? null,
    getFeatureTextByPlaceType(features, "place"),
    getContextEntry(features, "locality")?.text?.trim() ?? null,
    getFeatureTextByPlaceType(features, "locality")
  ];

  for (const candidate of candidates) {
    const normalized = normalizeCityCandidate(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const reverseGeocodeCity = async (
  token: string,
  coordinates: { lat: number; lng: number }
): Promise<ReverseGeocodeCityResult> => {
  const endpoint = `${MAPBOX_GEOCODING_BASE_URL}/${coordinates.lng},${coordinates.lat}.json`;
  const query = new URLSearchParams({
    access_token: token,
    language: "en",
    worldview: "us",
    types: "place,locality,address"
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, HTTP_TIMEOUT_MS);

  try {
    const response = await fetch(`${endpoint}?${query.toString()}`, {
      signal: controller.signal
    });

    if (!response.ok) {
      return {
        city: null,
        reason: `provider_${response.status}`
      };
    }

    const payload = (await response.json()) as MapboxReverseGeocodeResponse;
    const features = payload.features ?? [];
    if (features.length === 0) {
      return {
        city: null,
        reason: "no_features"
      };
    }

    const stateCode = getStateCode(features);
    if (stateCode && stateCode !== "CA") {
      return {
        city: null,
        reason: `non_ca_${stateCode}`
      };
    }

    const city = resolveCityFromFeatures(features);
    if (!city) {
      return {
        city: null,
        reason: "ambiguous_city"
      };
    }

    return {
      city: `${city}, CA`,
      reason: "resolved"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "request_failed";
    return {
      city: null,
      reason: message
    };
  } finally {
    clearTimeout(timeout);
  }
};

const runWithConcurrency = async <T>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<void>
) => {
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await task(items[index], index);
    }
  });

  await Promise.all(workers);
};

const fetchBathrooms = async (
  supabase: SupabaseClient,
  limit: number | null
): Promise<BathroomCityRow[]> => {
  const rows: BathroomCityRow[] = [];
  let offset = 0;

  while (true) {
    const end = offset + BATHROOM_FETCH_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("bathrooms")
      .select("id, name, city, lat, lng")
      .neq("status", "removed")
      .order("created_at", { ascending: true })
      .range(offset, end);

    if (error) {
      throw new Error(`Failed to load bathrooms: ${error.message}`);
    }

    const batch = (data ?? []) as BathroomCityRow[];
    if (batch.length === 0) {
      break;
    }

    rows.push(...batch);
    if (limit && rows.length >= limit) {
      return rows.slice(0, limit);
    }

    if (batch.length < BATHROOM_FETCH_PAGE_SIZE) {
      break;
    }

    offset += BATHROOM_FETCH_PAGE_SIZE;
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

  const bathrooms = await fetchBathrooms(supabase, options.limit);
  const candidates = bathrooms.filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng));

  const changes: ProposedCityChange[] = [];
  const skippedByReason = new Map<string, number>();
  let unchangedCount = 0;

  await runWithConcurrency(candidates, options.concurrency, async (row) => {
    if (options.excludeSanFrancisco && isSanFrancisco(row.city)) {
      const count = skippedByReason.get("excluded_san_francisco") ?? 0;
      skippedByReason.set("excluded_san_francisco", count + 1);
      return;
    }

    const geocode = await reverseGeocodeCity(mapboxToken, {
      lat: row.lat,
      lng: row.lng
    });

    if (!geocode.city) {
      const count = skippedByReason.get(geocode.reason) ?? 0;
      skippedByReason.set(geocode.reason, count + 1);
      return;
    }

    if (options.excludeSanFrancisco && isSanFrancisco(geocode.city)) {
      const count = skippedByReason.get("excluded_san_francisco") ?? 0;
      skippedByReason.set("excluded_san_francisco", count + 1);
      return;
    }

    if (isSameCityValue(row.city ?? "", geocode.city)) {
      unchangedCount += 1;
      return;
    }

    changes.push({
      id: row.id,
      name: row.name,
      currentCity: row.city ?? "",
      proposedCity: geocode.city,
      lat: row.lat,
      lng: row.lng
    });
  });

  const sortedChanges = [...changes].sort((a, b) => a.name.localeCompare(b.name));

  if (options.dryRun) {
    console.log("[cleanup:restroom-cities] Dry run preview");
    for (const change of sortedChanges) {
      console.log(
        `${change.id}\t${change.currentCity || "(empty)"}\t=>\t${change.proposedCity}\t${change.name}\t(${change.lat.toFixed(6)}, ${change.lng.toFixed(6)})`
      );
    }
  } else {
    let appliedCount = 0;
    await runWithConcurrency(sortedChanges, options.concurrency, async (change) => {
      const { error } = await supabase
        .from("bathrooms")
        .update({
          city: change.proposedCity
        })
        .eq("id", change.id);

      if (error) {
        throw new Error(`Failed to update bathroom ${change.id}: ${error.message}`);
      }

      appliedCount += 1;
    });

    console.log(`[cleanup:restroom-cities] Applied city updates: ${appliedCount}`);
  }

  console.log(`[cleanup:restroom-cities] Bathrooms scanned: ${bathrooms.length}`);
  console.log(`[cleanup:restroom-cities] With valid coordinates: ${candidates.length}`);
  console.log(`[cleanup:restroom-cities] Proposed city rewrites: ${sortedChanges.length}`);
  console.log(`[cleanup:restroom-cities] Unchanged city rows: ${unchangedCount}`);
  if (skippedByReason.size > 0) {
    console.log("[cleanup:restroom-cities] Skipped rows by reason:");
    for (const [reason, count] of [...skippedByReason.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      console.log(`  - ${reason}: ${count}`);
    }
  }
};

run().catch((error) => {
  console.error("[cleanup:restroom-cities] Failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
