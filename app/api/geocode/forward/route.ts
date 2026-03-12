import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MapboxForwardFeature, parseMapboxForwardGeocode } from "@/lib/mapbox/forwardGeocodeParser";
import { ReverseGeocodeResolution } from "@/lib/mapbox/reverseGeocodeParser";

const forwardGeocodeInputSchema = z
  .object({
    address: z.string().trim().max(200).optional().default(""),
    city: z.string().trim().max(120).optional().default(""),
    state: z.string().trim().max(30).optional().default("")
  })
  .superRefine((value, context) => {
    if (!value.address && !value.city && !value.state) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least one location field."
      });
    }
  });

interface MapboxForwardGeocodeResponse {
  features?: MapboxForwardFeature[];
}

const MAPBOX_GEOCODING_BASE_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places";

const getMapboxToken = () =>
  process.env.MAPBOX_ACCESS_TOKEN?.trim() || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() || "";

const isDevelopment = process.env.NODE_ENV !== "production";

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

const toJsonResponse = (payload: ForwardGeocodeApiResponse, status: number) => NextResponse.json(payload, { status });

const toQueryText = (input: { address: string; city: string; state: string }) =>
  [input.address, input.city, input.state].filter(Boolean).join(", ");

const toResultPayload = (
  method: "GET" | "POST",
  queryText: string,
  params: {
    success: boolean;
    lat?: number | null;
    lng?: number | null;
    address?: string;
    city?: string;
    state?: string;
    message: string;
    resolution?: ReverseGeocodeResolution | null;
    providerStatus?: number | null;
    featureTypes?: string[];
    error?: string | null;
  }
): ForwardGeocodeApiResponse => {
  const payload: ForwardGeocodeApiResponse = {
    success: params.success,
    lat: params.lat ?? null,
    lng: params.lng ?? null,
    address: params.address ?? "",
    city: params.city ?? "",
    state: params.state ?? "",
    message: params.message,
    resolution: params.resolution ?? null
  };

  if (isDevelopment) {
    payload.debug = {
      method,
      query: queryText,
      providerStatus: params.providerStatus ?? null,
      featureTypes: params.featureTypes ?? [],
      tokenConfigured: Boolean(getMapboxToken()),
      error: params.error ?? null
    };
  }

  return payload;
};

const getParsedQuery = async (
  request: NextRequest,
  method: "GET" | "POST"
): Promise<{ address: string; city: string; state: string } | null> => {
  if (method === "GET") {
    const parsed = forwardGeocodeInputSchema.safeParse({
      address: request.nextUrl.searchParams.get("address") ?? "",
      city: request.nextUrl.searchParams.get("city") ?? "",
      state: request.nextUrl.searchParams.get("state") ?? ""
    });
    return parsed.success ? parsed.data : null;
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return null;
  }

  const parsed = forwardGeocodeInputSchema.safeParse(rawBody);
  return parsed.success ? parsed.data : null;
};

const handleForwardGeocode = async (request: NextRequest, method: "GET" | "POST") => {
  const input = await getParsedQuery(request, method);
  if (!input) {
    return toJsonResponse(
      toResultPayload(method, "", {
        success: false,
        message: "Invalid location input. Provide address, city, or state.",
        error: "invalid_input"
      }),
      400
    );
  }

  const queryText = toQueryText(input);

  if (isDevelopment) {
    console.info("[Poopin:add-restroom] forward geocode request", {
      method,
      queryText
    });
  }

  const token = getMapboxToken();
  if (!token) {
    if (isDevelopment) {
      console.warn("[Poopin:add-restroom] forward geocode skipped: missing token");
    }

    return toJsonResponse(
      toResultPayload(method, queryText, {
        success: false,
        message: "Map geocoding is not configured right now. You can place the pin manually.",
        error: "missing_token"
      }),
      200
    );
  }

  const endpoint = `${MAPBOX_GEOCODING_BASE_URL}/${encodeURIComponent(queryText)}.json`;
  const query = new URLSearchParams({
    access_token: token,
    language: "en",
    worldview: "us",
    country: "us",
    limit: "5",
    types: "address,poi,neighborhood,locality,place"
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
      console.info("[Poopin:add-restroom] forward geocode provider status", {
        status: response.status
      });
    }

    if (!response.ok) {
      return toJsonResponse(
        toResultPayload(method, queryText, {
          success: false,
          message: "Couldn't locate that address right now. You can move the pin manually.",
          providerStatus: response.status,
          error: "provider_non_200"
        }),
        200
      );
    }

    const json = (await response.json()) as MapboxForwardGeocodeResponse;
    const { result, featureTypes } = parseMapboxForwardGeocode(json.features ?? []);

    if (isDevelopment) {
      console.info("[Poopin:add-restroom] forward geocode parsed", {
        featureTypes,
        mapped: result
      });
    }

    if (!result) {
      return toJsonResponse(
        toResultPayload(method, queryText, {
          success: false,
          message: "We couldn't find a usable map location from that address. Move the pin manually.",
          providerStatus: response.status,
          featureTypes,
          error: "no_usable_result"
        }),
        200
      );
    }

    return toJsonResponse(
      toResultPayload(method, queryText, {
        success: true,
        lat: result.lat,
        lng: result.lng,
        address: result.address,
        city: result.city,
        state: result.state,
        resolution: result.resolution,
        message:
          result.resolution === "exact_address" || result.resolution === "street"
            ? "Address found and pin placed on map."
            : "Nearby area found and pin placed on map.",
        providerStatus: response.status,
        featureTypes
      }),
      200
    );
  } catch (error) {
    if (isDevelopment) {
      console.warn("[Poopin:add-restroom] forward geocode provider request failed", {
        error: error instanceof Error ? error.message : "unknown"
      });
    }

    return toJsonResponse(
      toResultPayload(method, queryText, {
        success: false,
        message: "Couldn't locate that address right now. You can move the pin manually.",
        error: error instanceof Error ? error.message : "provider_exception"
      }),
      200
    );
  } finally {
    clearTimeout(timeout);
  }
};

export async function GET(request: NextRequest) {
  return handleForwardGeocode(request, "GET");
}

export async function POST(request: NextRequest) {
  return handleForwardGeocode(request, "POST");
}
