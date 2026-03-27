import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MapboxForwardFeature } from "@/lib/mapbox/forwardGeocodeParser";
import { parseMapboxPlaceSearch, type PlaceSearchResult } from "@/lib/mapbox/placeSearch";

const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(200),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional()
});

interface MapboxPlaceSearchResponse {
  features?: MapboxForwardFeature[];
}

interface PlaceSearchApiResponse {
  success: boolean;
  results: PlaceSearchResult[];
  message: string;
}

const MAPBOX_GEOCODING_BASE_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places";

const getMapboxToken = () =>
  process.env.MAPBOX_ACCESS_TOKEN?.trim() || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() || "";

const toJsonResponse = (payload: PlaceSearchApiResponse, status = 200) => NextResponse.json(payload, { status });

export async function GET(request: NextRequest) {
  const parsed = searchQuerySchema.safeParse({
    q: request.nextUrl.searchParams.get("q") ?? "",
    lat: request.nextUrl.searchParams.get("lat") ?? undefined,
    lng: request.nextUrl.searchParams.get("lng") ?? undefined
  });

  if (!parsed.success) {
    return toJsonResponse({
      success: false,
      results: [],
      message: "Type at least 2 characters to search."
    });
  }

  const token = getMapboxToken();
  if (!token) {
    return toJsonResponse({
      success: false,
      results: [],
      message: "Map search is not configured right now."
    });
  }

  const endpoint = `${MAPBOX_GEOCODING_BASE_URL}/${encodeURIComponent(parsed.data.q)}.json`;
  const query = new URLSearchParams({
    access_token: token,
    language: "en",
    worldview: "us",
    country: "us",
    autocomplete: "true",
    limit: "6",
    types: "poi,address,neighborhood,locality,place"
  });
  if (parsed.data.lat !== undefined && parsed.data.lng !== undefined) {
    query.set("proximity", `${parsed.data.lng},${parsed.data.lat}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 5000);

  try {
    const response = await fetch(`${endpoint}?${query.toString()}`, {
      signal: controller.signal
    });

    if (!response.ok) {
      return toJsonResponse({
        success: false,
        results: [],
        message: "Couldn't search that place right now."
      });
    }

    const payload = (await response.json()) as MapboxPlaceSearchResponse;
    const results = parseMapboxPlaceSearch(payload.features ?? []);

    return toJsonResponse({
      success: results.length > 0,
      results,
      message: results.length > 0 ? "Place matches found." : "No places found for that search."
    });
  } catch {
    return toJsonResponse({
      success: false,
      results: [],
      message: "Couldn't search that place right now."
    });
  } finally {
    clearTimeout(timeout);
  }
}
