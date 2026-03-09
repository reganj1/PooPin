export interface BayAreaOsmChunk {
  key: "sf" | "east_bay" | "peninsula" | "south_bay" | "north_bay";
  label: string;
  bbox: [number, number, number, number];
  defaultCity: string;
  defaultState: string;
  outputFile: string;
}

export const BAY_AREA_OSM_CHUNKS: readonly BayAreaOsmChunk[] = [
  {
    key: "sf",
    label: "San Francisco",
    bbox: [37.6395, -122.531, 37.9298, -122.2818],
    defaultCity: "San Francisco",
    defaultState: "CA",
    outputFile: "osm-sf-overpass.json"
  },
  {
    key: "east_bay",
    label: "East Bay (Oakland/Berkeley)",
    bbox: [37.511, -122.368, 38.0301, -121.795],
    defaultCity: "Oakland",
    defaultState: "CA",
    outputFile: "osm-east_bay-overpass.json"
  },
  {
    key: "peninsula",
    label: "Peninsula",
    bbox: [37.178, -122.536, 37.6885, -122.0505],
    defaultCity: "San Mateo",
    defaultState: "CA",
    outputFile: "osm-peninsula-overpass.json"
  },
  {
    key: "south_bay",
    label: "South Bay (San Jose)",
    bbox: [36.965, -122.083, 37.4699, -121.469],
    defaultCity: "San Jose",
    defaultState: "CA",
    outputFile: "osm-south_bay-overpass.json"
  },
  {
    key: "north_bay",
    label: "North Bay",
    bbox: [37.9001, -123.173, 38.7712, -122.113],
    defaultCity: "San Rafael",
    defaultState: "CA",
    outputFile: "osm-north_bay-overpass.json"
  }
] as const;

const bayAreaChunkByKey = new Map<string, BayAreaOsmChunk>(
  BAY_AREA_OSM_CHUNKS.map((chunk) => [chunk.key, chunk])
);

export const getBayAreaChunk = (key: string) => bayAreaChunkByKey.get(key);

export const getBayAreaChunkKeys = () => BAY_AREA_OSM_CHUNKS.map((chunk) => chunk.key);
