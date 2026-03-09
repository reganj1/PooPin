"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { MapPanel } from "@/components/map/MapPanel";
import { RestroomList } from "@/components/restroom/RestroomList";
import { NearbyBathroom } from "@/types";

interface NearbyExplorerProps {
  initialRestrooms: NearbyBathroom[];
}

interface Coordinate {
  lat: number;
  lng: number;
}

interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

type SortMode = "closest" | "best_rated";

interface FilterState {
  publicOnly: boolean;
  accessible: boolean;
  babyStation: boolean;
}

interface BoundsApiResponse {
  restrooms: NearbyBathroom[];
}

const DEFAULT_CITY_CENTER: Coordinate = { lat: 37.7749, lng: -122.4194 };
const LIST_LIMIT = 20;
const roundToOne = (value: number) => Math.round(value * 10) / 10;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const haversineDistanceMiles = (origin: Coordinate, point: Coordinate) => {
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(point.lat - origin.lat);
  const dLng = toRadians(point.lng - origin.lng);
  const lat1 = toRadians(origin.lat);
  const lat2 = toRadians(point.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMiles * c;
};

const toGeoErrorMessage = (error: GeolocationPositionError) => {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Location permission denied. Showing default city-center results.";
    case error.POSITION_UNAVAILABLE:
      return "Location unavailable. Showing default city-center results.";
    case error.TIMEOUT:
      return "Location request timed out. Showing default city-center results.";
    default:
      return "Could not use your location. Showing default city-center results.";
  }
};

const toBoundsKey = (bounds: MapBounds) =>
  `${bounds.minLat.toFixed(4)}:${bounds.maxLat.toFixed(4)}:${bounds.minLng.toFixed(4)}:${bounds.maxLng.toFixed(4)}`;

export function NearbyExplorer({ initialRestrooms }: NearbyExplorerProps) {
  const [userLocation, setUserLocation] = useState<Coordinate | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [listHoveredRestroomId, setListHoveredRestroomId] = useState<string | null>(null);
  const [mapFocusedRestroomId, setMapFocusedRestroomId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("closest");
  const [filters, setFilters] = useState<FilterState>({
    publicOnly: false,
    accessible: false,
    babyStation: false
  });
  const [mapRestrooms, setMapRestrooms] = useState<NearbyBathroom[]>(initialRestrooms);
  const [viewportCenter, setViewportCenter] = useState<Coordinate>(DEFAULT_CITY_CENTER);

  const latestBoundsKeyRef = useRef<string>("");
  const activeBoundsRequestIdRef = useRef(0);
  const distanceOrigin = userLocation ?? viewportCenter;

  const listBaseRestrooms = useMemo(() => {
    return [...mapRestrooms].map((restroom) => ({
      ...restroom,
      distanceMiles: roundToOne(haversineDistanceMiles(distanceOrigin, { lat: restroom.lat, lng: restroom.lng }))
    }));
  }, [distanceOrigin, mapRestrooms]);

  const listRestrooms = useMemo(() => {
    const filtered = listBaseRestrooms.filter((restroom) => {
      if (filters.publicOnly && restroom.access_type !== "public") {
        return false;
      }
      if (filters.accessible && !restroom.is_accessible) {
        return false;
      }
      if (filters.babyStation && !restroom.has_baby_station) {
        return false;
      }
      return true;
    });

    if (sortMode === "best_rated") {
      return [...filtered]
        .sort((a, b) => {
          if (b.ratings.overall !== a.ratings.overall) {
            return b.ratings.overall - a.ratings.overall;
          }
          if (b.ratings.reviewCount !== a.ratings.reviewCount) {
            return b.ratings.reviewCount - a.ratings.reviewCount;
          }
          return a.distanceMiles - b.distanceMiles;
        })
        .slice(0, LIST_LIMIT);
    }

    return [...filtered].sort((a, b) => a.distanceMiles - b.distanceMiles).slice(0, LIST_LIMIT);
  }, [filters, listBaseRestrooms, sortMode]);

  const listHelperText = useMemo(() => {
    const sourceText = userLocation ? "your location" : "the current map center";
    const areaText = userLocation ? "current map area around you" : "currently visible map area";
    if (sortMode === "best_rated") {
      return `Showing ${areaText}. Sorted by best rated with distance from ${sourceText}.`;
    }
    return `Showing ${areaText}. Sorted by closest distance from ${sourceText}.`;
  }, [sortMode, userLocation]);

  const highlightedListRestroomId = listHoveredRestroomId ?? mapFocusedRestroomId;

  const handleUseMyLocation = () => {
    setGeoError(null);

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Geolocation is not available in this browser. Showing default city-center results.");
      setUserLocation(null);
      return;
    }

    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setGeoError(null);
        setIsLocating(false);
      },
      (error) => {
        setGeoError(toGeoErrorMessage(error));
        setUserLocation(null);
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  };

  const handleViewportBoundsChange = useCallback((bounds: MapBounds) => {
    const center = {
      lat: (bounds.minLat + bounds.maxLat) / 2,
      lng: (bounds.minLng + bounds.maxLng) / 2
    };
    setViewportCenter(center);

    const nextBoundsKey = toBoundsKey(bounds);
    if (latestBoundsKeyRef.current === nextBoundsKey) {
      return;
    }

    latestBoundsKeyRef.current = nextBoundsKey;
    const requestId = activeBoundsRequestIdRef.current + 1;
    activeBoundsRequestIdRef.current = requestId;

    const params = new URLSearchParams({
      minLat: bounds.minLat.toString(),
      maxLat: bounds.maxLat.toString(),
      minLng: bounds.minLng.toString(),
      maxLng: bounds.maxLng.toString(),
      limit: "400"
    });

    void fetch(`/api/restrooms/bounds?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to fetch map bounds restrooms.");
        }

        const payload = (await response.json()) as BoundsApiResponse;
        if (!Array.isArray(payload.restrooms)) {
          throw new Error("Invalid map bounds response.");
        }

        if (requestId === activeBoundsRequestIdRef.current) {
          setMapRestrooms(payload.restrooms);
        }
      })
      .catch(() => {
        // Keep previous map dataset on bounds fetch failure.
      });
  }, []);

  return (
    <>
      <section className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={isLocating}
          className="inline-flex w-fit items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLocating ? "Locating..." : "Use my location"}
        </button>

        {userLocation ? (
          <p className="text-xs font-medium text-emerald-700">Using your location for map centering and distance sorting.</p>
        ) : (
          <p className="text-xs text-slate-500">Using default city center until location is granted.</p>
        )}
      </section>

      {geoError ? (
        <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{geoError}</section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-20 lg:self-start">
          <MapPanel
            restrooms={mapRestrooms}
            userLocation={userLocation}
            hoveredRestroomId={listHoveredRestroomId}
            onFocusedRestroomIdChange={setMapFocusedRestroomId}
            onViewportBoundsChange={handleViewportBoundsChange}
          />
        </div>

        <div className="space-y-3">
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <fieldset>
                <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Filters</legend>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={filters.publicOnly}
                      onChange={(event) =>
                        setFilters((current) => ({
                          ...current,
                          publicOnly: event.target.checked
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Public only
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={filters.accessible}
                      onChange={(event) =>
                        setFilters((current) => ({
                          ...current,
                          accessible: event.target.checked
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Accessible
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={filters.babyStation}
                      onChange={(event) =>
                        setFilters((current) => ({
                          ...current,
                          babyStation: event.target.checked
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Baby station
                  </label>
                </div>
              </fieldset>

              <div>
                <label htmlFor="sort-mode" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Sort
                </label>
                <select
                  id="sort-mode"
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as SortMode)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                >
                  <option value="closest">Closest</option>
                  <option value="best_rated">Best rated</option>
                </select>
              </div>
            </div>
          </section>

          <RestroomList
            restrooms={listRestrooms}
            helperText={listHelperText}
            highlightedRestroomId={highlightedListRestroomId}
            onRestroomHoverChange={setListHoveredRestroomId}
          />
        </div>
      </section>
    </>
  );
}
