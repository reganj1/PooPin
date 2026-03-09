import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BAY_AREA_OSM_CHUNKS, getBayAreaChunk, getBayAreaChunkKeys } from "./lib/bay-area-chunks";

interface FetchJob {
  label: string;
  bbox: [number, number, number, number];
  outputPath: string;
  defaultCity?: string;
  defaultState?: string;
}

interface FetchOptions {
  bbox: [number, number, number, number];
  outputPath: string;
  outputDir: string;
  endpoint: string;
  timeoutSeconds: number;
  dryRun: boolean;
  chunkKeys: string[];
  allBayArea: boolean;
}

const DEFAULT_BBOX: [number, number, number, number] = [37.706, -122.524, 37.833, -122.356];
const DEFAULT_OUTPUT = "supabase/seeds/osm-sf-overpass.json";
const DEFAULT_OUTPUT_DIR = "supabase/seeds/bay-area";
const DEFAULT_ENDPOINT = "https://overpass-api.de/api/interpreter";
const DEFAULT_TIMEOUT_SECONDS = 90;

const parseBbox = (value: string): [number, number, number, number] => {
  const parts = value
    .split(",")
    .map((part) => Number.parseFloat(part.trim()))
    .filter((part) => Number.isFinite(part));

  if (parts.length !== 4) {
    throw new Error("--bbox must include 4 comma-separated numbers: south,west,north,east");
  }

  const [south, west, north, east] = parts as [number, number, number, number];
  if (south >= north || west >= east) {
    throw new Error("--bbox ordering must be south<north and west<east");
  }

  return [south, west, north, east];
};

const parseChunkList = (value: string) =>
  value
    .split(",")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);

const parseArgs = (): FetchOptions => {
  const args = process.argv.slice(2);

  const options: FetchOptions = {
    bbox: DEFAULT_BBOX,
    outputPath: DEFAULT_OUTPUT,
    outputDir: DEFAULT_OUTPUT_DIR,
    endpoint: DEFAULT_ENDPOINT,
    timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
    dryRun: false,
    chunkKeys: [],
    allBayArea: false
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--all-bay-area") {
      options.allBayArea = true;
      continue;
    }

    const next = args[i + 1];
    if (!next) {
      throw new Error(`Missing value for argument ${arg}`);
    }

    switch (arg) {
      case "--bbox":
        options.bbox = parseBbox(next);
        i += 1;
        break;
      case "--output":
        options.outputPath = next;
        i += 1;
        break;
      case "--output-dir":
        options.outputDir = next;
        i += 1;
        break;
      case "--chunk":
        options.chunkKeys.push(next.trim());
        i += 1;
        break;
      case "--chunks":
        options.chunkKeys.push(...parseChunkList(next));
        i += 1;
        break;
      case "--endpoint":
        options.endpoint = next;
        i += 1;
        break;
      case "--timeout": {
        const parsed = Number.parseInt(next, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new Error("--timeout must be a positive integer (seconds)");
        }
        options.timeoutSeconds = parsed;
        i += 1;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if ((options.allBayArea || options.chunkKeys.length > 0) && args.includes("--bbox")) {
    throw new Error("Do not combine --bbox with --chunk/--chunks/--all-bay-area");
  }

  return options;
};

const buildOverpassQuery = ([south, west, north, east]: [number, number, number, number], timeoutSeconds: number) => {
  return `
[out:json][timeout:${timeoutSeconds}];
(
  node["amenity"="toilets"](${south},${west},${north},${east});
  way["amenity"="toilets"](${south},${west},${north},${east});
  relation["amenity"="toilets"](${south},${west},${north},${east});
);
out center tags;
`.trim();
};

const fetchOverpassPayload = async (
  endpoint: string,
  bbox: [number, number, number, number],
  timeoutSeconds: number
): Promise<{ elements: unknown[] }> => {
  const query = buildOverpassQuery(bbox, timeoutSeconds);
  const controller = new AbortController();
  const timeoutMs = Math.max(timeoutSeconds * 1000 + 5000, 15000);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Overpass request failed (${response.status}): ${responseText.slice(0, 300)}`);
  }

  const responseText = await response.text();
  let payload: { elements?: unknown[] };
  try {
    payload = JSON.parse(responseText) as { elements?: unknown[] };
  } catch {
    throw new Error(`Overpass response was not JSON. First 300 chars: ${responseText.slice(0, 300)}`);
  }

  if (!Array.isArray(payload.elements)) {
    throw new Error("Overpass response did not include an elements array.");
  }

  return { elements: payload.elements };
};

const buildJobs = (options: FetchOptions): FetchJob[] => {
  const requestedChunkKeys = options.allBayArea ? getBayAreaChunkKeys() : options.chunkKeys;

  if (requestedChunkKeys.length > 0) {
    const jobs: FetchJob[] = [];
    const seenChunkKeys = new Set<string>();
    for (const chunkKey of requestedChunkKeys) {
      if (seenChunkKeys.has(chunkKey)) {
        continue;
      }
      seenChunkKeys.add(chunkKey);

      const chunk = getBayAreaChunk(chunkKey);
      if (!chunk) {
        throw new Error(
          `Unknown chunk "${chunkKey}". Valid chunks: ${getBayAreaChunkKeys().join(", ")}`
        );
      }

      const outputPath =
        requestedChunkKeys.length === 1 && options.chunkKeys.length === 1 && options.outputPath !== DEFAULT_OUTPUT
          ? options.outputPath
          : path.join(options.outputDir, chunk.outputFile);

      jobs.push({
        label: chunk.label,
        bbox: chunk.bbox,
        outputPath,
        defaultCity: chunk.defaultCity,
        defaultState: chunk.defaultState
      });
    }

    return jobs;
  }

  return [
    {
      label: "Custom bbox",
      bbox: options.bbox,
      outputPath: options.outputPath
    }
  ];
};

const run = async () => {
  const options = parseArgs();
  const jobs = buildJobs(options);

  for (const job of jobs) {
    console.log(`[seed:fetch:osm] Fetching ${job.label}...`);
    const payload = await fetchOverpassPayload(options.endpoint, job.bbox, options.timeoutSeconds);
    console.log(`[seed:fetch:osm] Retrieved ${payload.elements.length} amenity=toilets elements for ${job.label}.`);

    if (options.dryRun) {
      continue;
    }

    const resolvedOutputPath = path.resolve(job.outputPath);
    await mkdir(path.dirname(resolvedOutputPath), { recursive: true });
    await writeFile(resolvedOutputPath, JSON.stringify(payload, null, 2), "utf8");
    console.log(`[seed:fetch:osm] Wrote payload: ${resolvedOutputPath}`);

    if (job.defaultCity && job.defaultState) {
      console.log(
        `[seed:fetch:osm] Import command: npm run seed:import:restrooms -- --input ${resolvedOutputPath} --source openstreetmap --default-city "${job.defaultCity}" --default-state "${job.defaultState}"`
      );
    } else {
      console.log(
        `[seed:fetch:osm] Import command: npm run seed:import:restrooms -- --input ${resolvedOutputPath} --source openstreetmap`
      );
    }
  }

  if (options.dryRun) {
    console.log("[seed:fetch:osm] Dry run complete. No files written.");
    return;
  }

  if (jobs.length > 1) {
    console.log("[seed:fetch:osm] Completed multi-chunk fetch.");
  }
};

run().catch((error) => {
  console.error("[seed:fetch:osm] Failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
