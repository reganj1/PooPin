import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

interface FetchOptions {
  bbox: [number, number, number, number];
  outputPath: string;
  endpoint: string;
  timeoutSeconds: number;
  dryRun: boolean;
}

const DEFAULT_BBOX: [number, number, number, number] = [37.706, -122.524, 37.833, -122.356];
const DEFAULT_OUTPUT = "supabase/seeds/osm-sf-overpass.json";
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

const parseArgs = (): FetchOptions => {
  const args = process.argv.slice(2);

  const options: FetchOptions = {
    bbox: DEFAULT_BBOX,
    outputPath: DEFAULT_OUTPUT,
    endpoint: DEFAULT_ENDPOINT,
    timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
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
      case "--bbox":
        options.bbox = parseBbox(next);
        i += 1;
        break;
      case "--output":
        options.outputPath = next;
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

const run = async () => {
  const options = parseArgs();
  const query = buildOverpassQuery(options.bbox, options.timeoutSeconds);

  const controller = new AbortController();
  const timeoutMs = Math.max(options.timeoutSeconds * 1000 + 5000, 15000);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(options.endpoint, {
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

  const restroomElements = payload.elements.length;
  console.log(`[seed:fetch:osm] Retrieved ${restroomElements} amenity=toilets elements from Overpass.`);

  if (options.dryRun) {
    console.log("[seed:fetch:osm] Dry run complete. No file written.");
    return;
  }

  const outputPath = path.resolve(options.outputPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");

  console.log(`[seed:fetch:osm] Wrote Overpass payload: ${outputPath}`);
  console.log("[seed:fetch:osm] Next step:");
  console.log(
    `npm run seed:import:restrooms -- --input ${outputPath} --source openstreetmap --default-city "San Francisco" --default-state "CA"`
  );
};

run().catch((error) => {
  console.error("[seed:fetch:osm] Failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
