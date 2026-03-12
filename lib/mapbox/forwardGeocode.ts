import {
  ForwardGeocodeResult,
  MapboxForwardFeature,
  parseMapboxForwardGeocode
} from "@/lib/mapbox/forwardGeocodeParser";
import { ReverseGeocodeResolution } from "@/lib/mapbox/reverseGeocodeParser";

interface ForwardGeocodeInput {
  address: string;
  city?: string;
  state?: string;
}

interface ForwardGeocodeApiResponse {
  success: boolean;
  lat: number | null;
  lng: number | null;
  address: string;
  city: string;
  state: string;
  message: string;
  resolution: ReverseGeocodeResolution | null;
  debug?: {
    method: "GET" | "POST";
    query: string;
    providerStatus: number | null;
    featureTypes: string[];
    tokenConfigured: boolean;
    error: string | null;
  };
}

interface MapboxForwardGeocodeResponse {
  features?: MapboxForwardFeature[];
}

const isDevelopment = process.env.NODE_ENV !== "production";
const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ?? "";
const MAPBOX_GEOCODING_BASE_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places";

const toQueryText = (input: ForwardGeocodeInput) =>
  [input.address, input.city, input.state]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join(", ");

const forwardGeocodeWithMapboxClient = async (
  input: ForwardGeocodeInput,
  signal?: AbortSignal
): Promise<ForwardGeocodeResult | null> => {
  if (!mapboxToken || typeof window === "undefined") {
    return null;
  }

  const queryText = toQueryText(input);
  if (!queryText) {
    return null;
  }

  const endpoint = `${MAPBOX_GEOCODING_BASE_URL}/${encodeURIComponent(queryText)}.json`;
  const query = new URLSearchParams({
    access_token: mapboxToken,
    language: "en",
    worldview: "us",
    country: "us",
    limit: "5",
    types: "address,poi,neighborhood,locality,place"
  });

  const response = await fetch(`${endpoint}?${query.toString()}`, { signal });
  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as MapboxForwardGeocodeResponse;
  return parseMapboxForwardGeocode(json.features ?? []).result;
};

export const forwardGeocodeAddress = async (
  input: ForwardGeocodeInput,
  signal?: AbortSignal
): Promise<ForwardGeocodeResult | null> => {
  const normalizedInput: ForwardGeocodeInput = {
    address: input.address.trim(),
    city: input.city?.trim() ?? "",
    state: input.state?.trim() ?? ""
  };

  if (!toQueryText(normalizedInput)) {
    return null;
  }

  if (isDevelopment) {
    console.info("[Poopin:add-restroom] forward geocode client request", normalizedInput);
  }

  const response = await fetch("/api/geocode/forward", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(normalizedInput),
    signal
  });

  if (!response.ok) {
    if (isDevelopment) {
      console.warn("[Poopin:add-restroom] forward geocode route failed", {
        status: response.status
      });
    }
    try {
      return await forwardGeocodeWithMapboxClient(normalizedInput, signal);
    } catch {
      return null;
    }
  }

  const payload = (await response.json()) as ForwardGeocodeApiResponse;
  if (isDevelopment) {
    console.info("[Poopin:add-restroom] forward geocode route response", {
      success: payload.success,
      message: payload.message,
      debug: payload.debug
    });
  }

  if (payload.success && payload.lat !== null && payload.lng !== null) {
    const mappedResult: ForwardGeocodeResult = {
      lat: payload.lat,
      lng: payload.lng,
      address: payload.address ?? "",
      city: payload.city ?? "",
      state: payload.state ?? "",
      resolution: payload.resolution ?? "city_state"
    };
    if (isDevelopment) {
      console.info("[Poopin:add-restroom] forward geocode mapped result", mappedResult);
    }
    return mappedResult;
  }

  if (isDevelopment) {
    console.warn("[Poopin:add-restroom] forward geocode route returned no usable result; trying direct fallback");
  }

  try {
    const fallbackResult = await forwardGeocodeWithMapboxClient(normalizedInput, signal);
    if (isDevelopment) {
      console.info("[Poopin:add-restroom] forward geocode fallback result", fallbackResult);
    }
    return fallbackResult;
  } catch {
    return null;
  }
};

