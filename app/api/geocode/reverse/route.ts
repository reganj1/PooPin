import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  MapboxFeature,
  ReverseGeocodeResolution,
  parseMapboxReverseGeocode
} from "@/lib/mapbox/reverseGeocodeParser";

const reverseGeocodeInputSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180)
});

interface MapboxReverseGeocodeResponse {
  features?: MapboxFeature[];
}

const MAPBOX_GEOCODING_BASE_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places";

const getMapboxToken = () =>
  process.env.MAPBOX_ACCESS_TOKEN?.trim() || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() || "";

const isDevelopment = process.env.NODE_ENV !== "production";

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

const toJsonResponse = (payload: ReverseGeocodeApiResponse, status: number) => NextResponse.json(payload, { status });

const toResultPayload = (
  method: "GET" | "POST",
  coordinates: { lat: number; lng: number },
  params: {
    success: boolean;
    address?: string;
    city?: string;
    state?: string;
    message: string;
    resolution?: ReverseGeocodeResolution | null;
    providerStatus?: number | null;
    featureTypes?: string[];
    error?: string | null;
  }
): ReverseGeocodeApiResponse => {
  const payload: ReverseGeocodeApiResponse = {
    success: params.success,
    address: params.address ?? "",
    city: params.city ?? "",
    state: params.state ?? "",
    message: params.message,
    resolution: params.resolution ?? null
  };

  if (isDevelopment) {
    payload.debug = {
      method,
      coordinates,
      providerStatus: params.providerStatus ?? null,
      featureTypes: params.featureTypes ?? [],
      tokenConfigured: Boolean(getMapboxToken()),
      error: params.error ?? null
    };
  }

  return payload;
};

const getParsedCoordinates = async (
  request: NextRequest,
  method: "GET" | "POST"
): Promise<{ lat: number; lng: number } | null> => {
  if (method === "GET") {
    const lat = request.nextUrl.searchParams.get("lat");
    const lng = request.nextUrl.searchParams.get("lng");
    const parsed = reverseGeocodeInputSchema.safeParse({ lat, lng });
    return parsed.success ? parsed.data : null;
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return null;
  }

  const parsed = reverseGeocodeInputSchema.safeParse(rawBody);
  return parsed.success ? parsed.data : null;
};

const handleReverseGeocode = async (request: NextRequest, method: "GET" | "POST") => {
  const coordinates = await getParsedCoordinates(request, method);
  if (!coordinates) {
    return toJsonResponse(
      toResultPayload(method, { lat: 0, lng: 0 }, {
        success: false,
        message: "Invalid coordinates. Provide numeric lat and lng values.",
        error: "invalid_coordinates"
      }),
      400
    );
  }

  if (isDevelopment) {
    console.info("[Poopin:add-restroom] reverse geocode request", {
      method,
      lat: coordinates.lat,
      lng: coordinates.lng
    });
  }

  const token = getMapboxToken();
  if (!token) {
    if (isDevelopment) {
      console.warn("[Poopin:add-restroom] reverse geocode skipped: missing token");
    }
    return toJsonResponse(
      toResultPayload(method, coordinates, {
        success: false,
        message: "Map geocoding is not configured right now. Enter address details manually.",
        error: "missing_token"
      }),
      200
    );
  }

  const endpoint = `${MAPBOX_GEOCODING_BASE_URL}/${coordinates.lng},${coordinates.lat}.json`;
  const query = new URLSearchParams({
    access_token: token,
    language: "en",
    worldview: "us"
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 7000);

  try {
    const response = await fetch(`${endpoint}?${query.toString()}`, {
      signal: controller.signal
    });

    if (isDevelopment) {
      console.info("[Poopin:add-restroom] reverse geocode provider status", {
        status: response.status
      });
    }

    if (!response.ok) {
      return toJsonResponse(
        toResultPayload(method, coordinates, {
          success: false,
          message: "Couldn’t fetch location details right now. You can enter them manually.",
          providerStatus: response.status,
          error: "provider_non_200"
        }),
        200
      );
    }

    const json = (await response.json()) as MapboxReverseGeocodeResponse;
    const { result, featureTypes } = parseMapboxReverseGeocode(json.features ?? []);

    if (isDevelopment) {
      console.info("[Poopin:add-restroom] reverse geocode parsed", {
        featureTypes,
        mapped: result
      });
    }

    if (!result) {
      return toJsonResponse(
        toResultPayload(method, coordinates, {
          success: false,
          message: "No nearby address details were found. You can enter them manually.",
          providerStatus: response.status,
          featureTypes,
          error: "no_usable_result"
        }),
        200
      );
    }

    return toJsonResponse(
      toResultPayload(method, coordinates, {
        success: true,
        address: result.address,
        city: result.city,
        state: result.state,
        resolution: result.resolution,
        message:
          result.resolution === "exact_address" || result.resolution === "street"
            ? "Address filled from map location."
            : "Nearby area details filled from map location.",
        providerStatus: response.status,
        featureTypes
      }),
      200
    );
  } catch (error) {
    if (isDevelopment) {
      console.warn("[Poopin:add-restroom] reverse geocode provider request failed", {
        error: error instanceof Error ? error.message : "unknown"
      });
    }
    return toJsonResponse(
      toResultPayload(method, coordinates, {
        success: false,
        message: "Couldn’t fetch location details right now. You can enter them manually.",
        error: error instanceof Error ? error.message : "provider_exception"
      }),
      200
    );
  } finally {
    clearTimeout(timeout);
  }
};

export async function GET(request: NextRequest) {
  return handleReverseGeocode(request, "GET");
}

export async function POST(request: NextRequest) {
  return handleReverseGeocode(request, "POST");
}
