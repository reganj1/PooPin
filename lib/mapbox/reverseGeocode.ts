import {
  MapboxFeature,
  ReverseGeocodeResult,
  ReverseGeocodeResolution,
  parseMapboxReverseGeocode
} from "@/lib/mapbox/reverseGeocodeParser";

interface ReverseGeocodeApiResponse {
  success: boolean;
  address: string;
  city: string;
  state: string;
  message: string;
  resolution: ReverseGeocodeResolution | null;
  debug?: {
    method: "GET" | "POST";
    coordinates: {
      lat: number;
      lng: number;
    };
    providerStatus: number | null;
    featureTypes: string[];
    tokenConfigured: boolean;
    error: string | null;
  };
}

interface MapboxReverseGeocodeResponse {
  features?: MapboxFeature[];
}

const isDevelopment = process.env.NODE_ENV !== "production";
const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ?? "";
const MAPBOX_GEOCODING_BASE_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places";

const reverseGeocodeWithMapboxClient = async (
  coordinates: { lat: number; lng: number },
  signal?: AbortSignal
): Promise<ReverseGeocodeResult | null> => {
  if (!mapboxToken || typeof window === "undefined") {
    return null;
  }

  const endpoint = `${MAPBOX_GEOCODING_BASE_URL}/${coordinates.lng},${coordinates.lat}.json`;
  const query = new URLSearchParams({
    access_token: mapboxToken,
    language: "en",
    worldview: "us"
  });

  const response = await fetch(`${endpoint}?${query.toString()}`, { signal });
  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as MapboxReverseGeocodeResponse;
  return parseMapboxReverseGeocode(json.features ?? []).result;
};

export const reverseGeocodeCoordinates = async (
  coordinates: { lat: number; lng: number },
  signal?: AbortSignal
): Promise<ReverseGeocodeResult | null> => {
  if (isDevelopment) {
    console.info("[Poopin:add-restroom] reverse geocode client request", coordinates);
  }

  const response = await fetch("/api/geocode/reverse", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(coordinates),
    signal
  });

  if (!response.ok) {
    if (isDevelopment) {
      console.warn("[Poopin:add-restroom] reverse geocode route failed", { status: response.status });
    }
    try {
      return await reverseGeocodeWithMapboxClient(coordinates, signal);
    } catch {
      return null;
    }
  }

  const payload = (await response.json()) as ReverseGeocodeApiResponse;
  if (isDevelopment) {
    console.info("[Poopin:add-restroom] reverse geocode route response", {
      success: payload.success,
      message: payload.message,
      debug: payload.debug
    });
  }

  if (payload.success && (payload.address || payload.city || payload.state)) {
    const mappedResult: ReverseGeocodeResult = {
      address: payload.address ?? "",
      city: payload.city ?? "",
      state: payload.state ?? "",
      resolution: payload.resolution ?? "city_state"
    };
    if (isDevelopment) {
      console.info("[Poopin:add-restroom] reverse geocode mapped result", mappedResult);
    }
    return mappedResult;
  }

  if (isDevelopment) {
    console.warn("[Poopin:add-restroom] reverse geocode route returned no usable result; trying direct fallback");
  }

  try {
    const fallbackResult = await reverseGeocodeWithMapboxClient(coordinates, signal);
    if (isDevelopment) {
      console.info("[Poopin:add-restroom] reverse geocode fallback result", fallbackResult);
    }
    return fallbackResult;
  } catch {
    return null;
  }
};

export type { ReverseGeocodeResult };
