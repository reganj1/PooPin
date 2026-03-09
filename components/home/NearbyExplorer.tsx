"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { MapPanel } from "@/components/map/MapPanel";
import { RestroomList } from "@/components/restroom/RestroomList";
import { cn } from "@/lib/utils/cn";
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
  const toggleFilter = (filterKey: keyof FilterState) => {
    setFilters((current) => ({
      ...current,
      [filterKey]: !current[filterKey]
    }));
  };

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
      <section className="mb-4 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm sm:p-4 lg:mb-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleUseMyLocation}
              disabled={isLocating}
              className="inline-flex h-10 w-fit items-center rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLocating ? "Locating..." : "Use my location"}
            </button>

            {userLocation ? (
              <p className="text-xs font-medium text-emerald-700 sm:text-sm">
                Showing nearby results around your location.
              </p>
            ) : (
              <p className="text-xs text-slate-500 sm:text-sm">Browsing from the current map view.</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
              {mapRestrooms.length} pins in view
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
              {listRestrooms.length} in list
            </span>
          </div>
        </div>
      </section>

      {geoError ? (
        <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{geoError}</section>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(380px,1fr)] xl:grid-cols-[minmax(0,1.55fr)_430px]">
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
          <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Browse this area</h2>
                <p className="mt-1 text-xs text-slate-500">Filter and sort what you see on the map.</p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <fieldset>
                <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Filters</legend>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => toggleFilter("publicOnly")}
                    aria-pressed={filters.publicOnly}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                      filters.publicOnly
                        ? "border-brand-300 bg-brand-50 text-brand-700"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"
                    )}
                  >
                    Public only
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleFilter("accessible")}
                    aria-pressed={filters.accessible}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                      filters.accessible
                        ? "border-brand-300 bg-brand-50 text-brand-700"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"
                    )}
                  >
                    Accessible
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleFilter("babyStation")}
                    aria-pressed={filters.babyStation}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                      filters.babyStation
                        ? "border-brand-300 bg-brand-50 text-brand-700"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"
                    )}
                  >
                    Baby station
                  </button>
                </div>
              </fieldset>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
                <label htmlFor="sort-mode" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Sort
                </label>
                <select
                  id="sort-mode"
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as SortMode)}
                  className="h-9 w-[180px] rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
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
