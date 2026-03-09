import { access } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { BAY_AREA_OSM_CHUNKS, getBayAreaChunk, getBayAreaChunkKeys } from "./lib/bay-area-chunks";

interface ImportBayAreaOptions {
  inputDir: string;
  chunkKeys: string[];
  dryRun: boolean;
  distanceMiles: number;
}

const DEFAULT_INPUT_DIR = "supabase/seeds/bay-area";
const DEFAULT_DISTANCE_MILES = 0.08;

const parseChunkList = (value: string) =>
  value
    .split(",")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);

const parseArgs = (): ImportBayAreaOptions => {
  const args = process.argv.slice(2);
  const options: ImportBayAreaOptions = {
    inputDir: DEFAULT_INPUT_DIR,
    chunkKeys: [],
    dryRun: false,
    distanceMiles: DEFAULT_DISTANCE_MILES
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
      case "--input-dir":
        options.inputDir = next;
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

  if (options.chunkKeys.length === 0) {
    options.chunkKeys = getBayAreaChunkKeys();
  }

  return options;
};

const fileExists = async (filePath: string) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const runImportCommand = async (args: string[]) => {
  return new Promise<number>((resolve, reject) => {
    const child = spawn("npm", args, {
      stdio: "inherit",
      shell: process.platform === "win32"
    });

    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
};

const run = async () => {
  const options = parseArgs();
  const selectedChunks = options.chunkKeys.map((chunkKey) => {
    const chunk = getBayAreaChunk(chunkKey);
    if (!chunk) {
      throw new Error(`Unknown chunk "${chunkKey}". Valid chunks: ${getBayAreaChunkKeys().join(", ")}`);
    }
    return chunk;
  });

  const seenChunkKeys = new Set<string>();
  const importQueue = selectedChunks.filter((chunk) => {
    if (seenChunkKeys.has(chunk.key)) {
      return false;
    }
    seenChunkKeys.add(chunk.key);
    return true;
  });

  let imported = 0;
  let missing = 0;

  for (const chunk of importQueue) {
    const inputPath = path.resolve(options.inputDir, chunk.outputFile);
    const exists = await fileExists(inputPath);
    if (!exists) {
      missing += 1;
      console.warn(`[seed:import:bay-area] Missing file for ${chunk.label}: ${inputPath}`);
      console.warn(`[seed:import:bay-area] Skip this chunk or fetch it first.`);
      continue;
    }

    console.log(`[seed:import:bay-area] Importing ${chunk.label} from ${inputPath}`);

    const commandArgs = [
      "run",
      "seed:import:restrooms",
      "--",
      "--input",
      inputPath,
      "--source",
      "openstreetmap",
      "--default-city",
      chunk.defaultCity,
      "--default-state",
      chunk.defaultState,
      "--distance-miles",
      options.distanceMiles.toString()
    ];

    if (options.dryRun) {
      commandArgs.push("--dry-run");
    }

    const code = await runImportCommand(commandArgs);
    if (code !== 0) {
      throw new Error(`Import command failed for chunk "${chunk.key}" with exit code ${code}`);
    }

    imported += 1;
  }

  console.log("[seed:import:bay-area] Completed.");
  console.log(`[seed:import:bay-area] Chunks imported: ${imported}`);
  console.log(`[seed:import:bay-area] Chunks missing files: ${missing}`);
  console.log(`[seed:import:bay-area] Total configured chunks: ${BAY_AREA_OSM_CHUNKS.length}`);
};

run().catch((error) => {
  console.error("[seed:import:bay-area] Failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

