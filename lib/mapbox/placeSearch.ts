import { MapboxForwardFeature } from "@/lib/mapbox/forwardGeocodeParser";

export type PlaceSearchResultType = "address" | "poi" | "neighborhood" | "locality" | "place" | "region" | "unknown";

export interface PlaceSearchResult {
  id: string;
  name: string;
  secondaryName: string;
  fullName: string;
  lat: number;
  lng: number;
  zoom: number;
  placeType: PlaceSearchResultType;
}

interface PlaceSearchApiResponse {
  results?: PlaceSearchResult[];
}

const MAX_RESULTS = 6;

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const firstSegment = (value: string | undefined) => {
  if (!value) {
    return "";
  }

  return value.split(",")[0]?.trim() ?? "";
};

const normalizePlaceType = (placeTypes: string[] | undefined): PlaceSearchResultType => {
  const primaryType = placeTypes?.[0]?.trim().toLowerCase() ?? "";
  switch (primaryType) {
    case "address":
    case "poi":
    case "neighborhood":
    case "locality":
    case "place":
    case "region":
      return primaryType;
    default:
      return "unknown";
  }
};

const toCoordinates = (center: number[] | undefined): { lat: number; lng: number } | null => {
  if (!Array.isArray(center) || center.length < 2) {
    return null;
  }

  const [lng, lat] = center;
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }

  return {
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6))
  };
};

const toDisplayName = (feature: MapboxForwardFeature) => {
  const placeType = normalizePlaceType(feature.place_type);
  if (placeType === "address") {
    const numberedStreet = normalizeWhitespace(`${feature.address ?? ""} ${feature.text ?? ""}`);
    if (numberedStreet) {
      return numberedStreet;
    }
  }

  return feature.text?.trim() || firstSegment(feature.place_name) || "";
};

const toSecondaryName = (feature: MapboxForwardFeature, primaryName: string) => {
  const normalizedPlaceName = normalizeWhitespace(feature.place_name ?? "");
  if (!normalizedPlaceName) {
    return "";
  }

  if (normalizedPlaceName.toLowerCase() === primaryName.toLowerCase()) {
    return "";
  }

  if (normalizedPlaceName.toLowerCase().startsWith(primaryName.toLowerCase())) {
    const remainder = normalizedPlaceName.slice(primaryName.length).replace(/^,\s*/, "").trim();
    if (remainder) {
      return remainder;
    }
  }

  return normalizedPlaceName;
};

const toRecommendedZoom = (placeType: PlaceSearchResultType) => {
  switch (placeType) {
    case "address":
      return 15.5;
    case "poi":
      return 15;
    case "neighborhood":
      return 13.5;
    case "locality":
      return 12.8;
    case "place":
      return 12.4;
    case "region":
      return 10.8;
    default:
      return 13.5;
  }
};

export const parseMapboxPlaceSearch = (features: MapboxForwardFeature[]): PlaceSearchResult[] => {
  const results: PlaceSearchResult[] = [];
  const seenKeys = new Set<string>();

  for (const feature of features) {
    const coordinates = toCoordinates(feature.center);
    if (!coordinates) {
      continue;
    }

    const name = toDisplayName(feature);
    if (!name) {
      continue;
    }

    const secondaryName = toSecondaryName(feature, name);
    const fullName = secondaryName ? `${name}, ${secondaryName}` : name;
    const resultId = feature.id?.trim() || `${fullName.toLowerCase()}::${coordinates.lat}::${coordinates.lng}`;
    if (seenKeys.has(resultId)) {
      continue;
    }

    seenKeys.add(resultId);
    const placeType = normalizePlaceType(feature.place_type);
    results.push({
      id: resultId,
      name,
      secondaryName,
      fullName,
      lat: coordinates.lat,
      lng: coordinates.lng,
      zoom: toRecommendedZoom(placeType),
      placeType
    });

    if (results.length >= MAX_RESULTS) {
      break;
    }
  }

  return results;
};

export const searchPlaces = async (
  query: string,
  signal?: AbortSignal,
  proximity?: { lat: number; lng: number } | null
): Promise<PlaceSearchResult[]> => {
  const trimmedQuery = normalizeWhitespace(query);
  if (trimmedQuery.length < 2) {
    return [];
  }

  const params = new URLSearchParams({ q: trimmedQuery });
  if (proximity) {
    params.set("lng", proximity.lng.toFixed(4));
    params.set("lat", proximity.lat.toFixed(4));
  }

  const response = await fetch(`/api/geocode/search?${params.toString()}`, {
    signal,
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error("Place search request failed.");
  }

  const payload = (await response.json()) as PlaceSearchApiResponse;
  return Array.isArray(payload.results) ? payload.results : [];
};
