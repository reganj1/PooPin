"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPanel } from "@/components/map/MapPanel";
import { RestroomList } from "@/components/restroom/RestroomList";
import { captureAnalyticsEvent } from "@/lib/analytics/posthog";
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

interface MapCamera {
  lat: number;
  lng: number;
  zoom: number;
}

type SortMode = "closest" | "recommended";

interface FilterState {
  publicOnly: boolean;
  accessible: boolean;
  babyStation: boolean;
}

interface BoundsApiResponse {
  restrooms: NearbyBathroom[];
}

const LIST_LIMIT = 20;
const HOME_MAP_STATE_STORAGE_KEY = "poopin:home-map-state:v1";
const HOME_MAP_STATE_TTL_MS = 30 * 60_000;
const roundToOne = (value: number) => Math.round(value * 10) / 10;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const isValidMapCoordinate = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng);
const isValidMapCamera = (camera: MapCamera | null): camera is MapCamera =>
  Boolean(
    camera &&
      Number.isFinite(camera.lat) &&
      Number.isFinite(camera.lng) &&
      Number.isFinite(camera.zoom) &&
      camera.lat >= -90 &&
      camera.lat <= 90 &&
      camera.lng >= -180 &&
      camera.lng <= 180 &&
      camera.zoom >= 0 &&
      camera.zoom <= 24
  );

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

const isLocalhostHost = (hostname: string) => hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

export function NearbyExplorer({ initialRestrooms }: NearbyExplorerProps) {
  const [userLocation, setUserLocation] = useState<Coordinate | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [isExpandedListOpen, setIsExpandedListOpen] = useState(true);
  const [listHoveredRestroomId, setListHoveredRestroomId] = useState<string | null>(null);
  const [mapFocusedRestroomId, setMapFocusedRestroomId] = useState<string | null>(null);
  const [mapCamera, setMapCamera] = useState<MapCamera | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("recommended");
  const [filters, setFilters] = useState<FilterState>({
    publicOnly: false,
    accessible: false,
    babyStation: false
  });
  const [mapRestrooms, setMapRestrooms] = useState<NearbyBathroom[]>(initialRestrooms);

  const latestBoundsKeyRef = useRef<string>("");
  const activeBoundsRequestIdRef = useRef(0);
  const locationWatchIdRef = useRef<number | null>(null);
  const invalidBoundsCoordinatesLogKeyRef = useRef<string>("");
  const hasHydratedMapStateRef = useRef(false);
  const lockedScrollYRef = useRef(0);
  const hasRealUserLocation = userLocation !== null;
  const distanceOrigin = userLocation;
  const mapRenderableRestrooms = useMemo(
    () => mapRestrooms.filter((restroom) => isValidMapCoordinate(restroom.lat, restroom.lng)),
    [mapRestrooms]
  );

  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return;
    }

    const invalidRestrooms = mapRestrooms.filter((restroom) => !isValidMapCoordinate(restroom.lat, restroom.lng));
    if (invalidRestrooms.length === 0) {
      invalidBoundsCoordinatesLogKeyRef.current = "";
      return;
    }

    const invalidLogKey = invalidRestrooms
      .map((restroom) => restroom.id)
      .sort()
      .join("|");
    if (invalidLogKey === invalidBoundsCoordinatesLogKeyRef.current) {
      return;
    }

    invalidBoundsCoordinatesLogKeyRef.current = invalidLogKey;
    console.warn("[Poopin] Bounds results include restrooms with invalid coordinates. These entries are omitted from map/list hover sync.", {
      invalidCount: invalidRestrooms.length,
      invalidRestrooms: invalidRestrooms.map((restroom) => ({
        id: restroom.id,
        lat: restroom.lat,
        lng: restroom.lng,
        name: restroom.name
      }))
    });
  }, [mapRestrooms]);

  const listBaseRestrooms = useMemo(() => {
    if (!distanceOrigin) {
      return [...mapRenderableRestrooms];
    }

    return [...mapRenderableRestrooms].map((restroom) => ({
      ...restroom,
      distanceMiles: roundToOne(haversineDistanceMiles(distanceOrigin, { lat: restroom.lat, lng: restroom.lng }))
    }));
  }, [distanceOrigin, mapRenderableRestrooms]);

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

    if (sortMode === "closest" && hasRealUserLocation) {
      return [...filtered].sort((a, b) => a.distanceMiles - b.distanceMiles).slice(0, LIST_LIMIT);
    }

    if (sortMode === "recommended" || !hasRealUserLocation) {
      return [...filtered]
        .sort((a, b) => {
          if (b.ratings.overall !== a.ratings.overall) {
            return b.ratings.overall - a.ratings.overall;
          }
          if (b.ratings.reviewCount !== a.ratings.reviewCount) {
            return b.ratings.reviewCount - a.ratings.reviewCount;
          }
          return a.name.localeCompare(b.name);
        })
        .slice(0, LIST_LIMIT);
    }

    return filtered.slice(0, LIST_LIMIT);
  }, [filters, hasRealUserLocation, listBaseRestrooms, sortMode]);

  const listHelperText = useMemo(() => {
    if (!hasRealUserLocation) {
      return "Showing the currently visible map area. Enable location to see distance from you and sort by closest.";
    }

    if (sortMode === "closest") {
      return "Showing the currently visible map area. Sorted by distance from your live location.";
    }

    return "Showing the currently visible map area. Sorted by recommended quality near your location.";
  }, [hasRealUserLocation, sortMode]);

  const highlightedListRestroomId = listHoveredRestroomId ?? mapFocusedRestroomId;
  const handleExpandMap = () => {
    captureAnalyticsEvent("expand_map_clicked", {
      source: "homepage_map"
    });
    setIsExpandedListOpen(true);
    setIsMapExpanded(true);
  };

  const toggleFilter = (filterKey: keyof FilterState) => {
    setFilters((current) => ({
      ...current,
      [filterKey]: !current[filterKey]
    }));
  };

  const stopLocationWatch = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }

    if (locationWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(locationWatchIdRef.current);
      locationWatchIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || hasHydratedMapStateRef.current) {
      return;
    }

    hasHydratedMapStateRef.current = true;

    const rawState = window.sessionStorage.getItem(HOME_MAP_STATE_STORAGE_KEY);
    if (!rawState) {
      return;
    }

    try {
      const parsed = JSON.parse(rawState) as {
        updatedAt?: number;
        isMapExpanded?: boolean;
        isExpandedListOpen?: boolean;
        mapFocusedRestroomId?: string | null;
        mapCamera?: MapCamera | null;
      };

      const updatedAt = typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0;
      if (!updatedAt || Date.now() - updatedAt > HOME_MAP_STATE_TTL_MS) {
        window.sessionStorage.removeItem(HOME_MAP_STATE_STORAGE_KEY);
        return;
      }

      if (typeof parsed.isMapExpanded === "boolean") {
        setIsMapExpanded(parsed.isMapExpanded);
      }
      if (typeof parsed.isExpandedListOpen === "boolean") {
        setIsExpandedListOpen(parsed.isExpandedListOpen);
      }
      if (typeof parsed.mapFocusedRestroomId === "string") {
        setMapFocusedRestroomId(parsed.mapFocusedRestroomId);
        setListHoveredRestroomId(parsed.mapFocusedRestroomId);
      }

      const restoredMapCamera = parsed.mapCamera ?? null;
      if (isValidMapCamera(restoredMapCamera)) {
        setMapCamera(restoredMapCamera);
      }
    } catch {
      window.sessionStorage.removeItem(HOME_MAP_STATE_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !hasHydratedMapStateRef.current) {
      return;
    }

    const payload = {
      updatedAt: Date.now(),
      isMapExpanded,
      isExpandedListOpen,
      mapFocusedRestroomId,
      mapCamera
    };

    window.sessionStorage.setItem(HOME_MAP_STATE_STORAGE_KEY, JSON.stringify(payload));
  }, [isExpandedListOpen, isMapExpanded, mapCamera, mapFocusedRestroomId]);

  useEffect(() => {
    if (!isMapExpanded || typeof document === "undefined" || typeof window === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousWidth = document.body.style.width;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousOverscrollBehavior = document.body.style.overscrollBehavior;
    lockedScrollYRef.current = window.scrollY;

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${lockedScrollYRef.current}px`;
    document.body.style.width = "100%";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.width = previousWidth;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overscrollBehavior = previousOverscrollBehavior;
      window.scrollTo(0, lockedScrollYRef.current);
    };
  }, [isMapExpanded]);

  useEffect(() => {
    if (!isMapExpanded || typeof window === "undefined") {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMapExpanded(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isMapExpanded]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 80);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isMapExpanded, isExpandedListOpen]);

  useEffect(() => {
    if (!hasRealUserLocation && sortMode === "closest") {
      setSortMode("recommended");
    }
  }, [hasRealUserLocation, sortMode]);

  useEffect(() => {
    return () => {
      stopLocationWatch();
    };
  }, [stopLocationWatch]);

  const handleUseMyLocation = () => {
    setGeoError(null);

    if (typeof window !== "undefined" && !window.isSecureContext && !isLocalhostHost(window.location.hostname)) {
      setGeoError("Location needs HTTPS on mobile. Open Poopin over HTTPS (or localhost) to use Locate.");
      setIsLocating(false);
      stopLocationWatch();
      return;
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Geolocation is not available in this browser. Showing default city-center results.");
      setUserLocation(null);
      return;
    }

    if (locationWatchIdRef.current !== null) {
      stopLocationWatch();
    }

    setIsLocating(true);

    try {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
          setGeoError(null);
          setIsLocating(false);
        },
        (error) => {
          setGeoError(toGeoErrorMessage(error));
          setIsLocating(false);
          stopLocationWatch();

          if (error.code === error.PERMISSION_DENIED) {
            setUserLocation(null);
          }
        },
        {
          enableHighAccuracy: false,
          timeout: 12000,
          maximumAge: 15000
        }
      );

      locationWatchIdRef.current = watchId;
    } catch {
      setGeoError("Could not enable live location updates. Showing map results without user distance.");
      setIsLocating(false);
      stopLocationWatch();
    }
  };

  const handleViewportBoundsChange = useCallback((bounds: MapBounds) => {
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

  const handleMapCameraChange = useCallback((camera: MapCamera) => {
    setMapCamera(camera);
  }, []);

  const handleMapFocusedRestroomIdChange = useCallback((restroomId: string | null) => {
    setMapFocusedRestroomId(restroomId);
    if (restroomId) {
      setListHoveredRestroomId(null);
    }
  }, []);

  const renderListPanel = (variant: "default" | "expanded") => {
    const isExpandedVariant = variant === "expanded";

    return (
      <div className={cn("space-y-3", isExpandedVariant && "h-full")}>
        <section className={cn("rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm", isExpandedVariant && "p-3.5 sm:p-4")}>
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
              <label htmlFor={`sort-mode-${variant}`} className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Sort
              </label>
              <select
                id={`sort-mode-${variant}`}
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
                className="h-9 w-[180px] rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              >
                <option value="recommended">Recommended</option>
                <option value="closest" disabled={!hasRealUserLocation}>
                  Closest to you
                </option>
              </select>
            </div>
          </div>
        </section>

        <RestroomList
          restrooms={listRestrooms}
          helperText={listHelperText}
          showDistance={hasRealUserLocation}
          highlightedRestroomId={highlightedListRestroomId}
          onRestroomHoverChange={setListHoveredRestroomId}
          className={cn(isExpandedVariant && "p-3.5 sm:p-4")}
          scrollClassName={
            isExpandedVariant ? "sm:max-h-[calc(100vh-330px)] sm:overflow-y-auto sm:pr-1 lg:max-h-[calc(100vh-330px)]" : undefined
          }
        />
      </div>
    );
  };

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
              {isLocating ? "Locating..." : hasRealUserLocation ? "Location on" : "Use my location"}
            </button>

            {hasRealUserLocation ? (
              <p className="text-xs font-medium text-emerald-700 sm:text-sm">
                Showing distance and closest sorting from your live location.
              </p>
            ) : (
              <p className="text-xs text-slate-500 sm:text-sm">Browsing this map area. Enable location to see distance from you.</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
              {mapRenderableRestrooms.length} pins in view
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

      <section className="mb-5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600 sm:px-4">
        Community submissions, photos, and reviews may be reviewed before appearing publicly.
      </section>

      {!isMapExpanded ? (
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(380px,1fr)] xl:grid-cols-[minmax(0,1.55fr)_430px]">
          <div className="lg:sticky lg:top-20 lg:self-start">
            <MapPanel
              restrooms={mapRenderableRestrooms}
              userLocation={userLocation}
              showDistance={hasRealUserLocation}
              hoveredRestroomId={listHoveredRestroomId}
              onFocusedRestroomIdChange={handleMapFocusedRestroomIdChange}
              onViewportBoundsChange={handleViewportBoundsChange}
              onCameraChange={handleMapCameraChange}
              initialCamera={mapCamera}
              onExpandMap={handleExpandMap}
            />
          </div>

          {renderListPanel("default")}
        </section>
      ) : null}

      {isMapExpanded ? (
        <section className="fixed inset-0 z-[80] overflow-hidden bg-slate-950/45 backdrop-blur-[1.5px]">
          <div className="absolute inset-0 max-w-full overflow-hidden">
            <MapPanel
              restrooms={mapRenderableRestrooms}
              userLocation={userLocation}
              showDistance={hasRealUserLocation}
              hoveredRestroomId={listHoveredRestroomId}
              onFocusedRestroomIdChange={handleMapFocusedRestroomIdChange}
              onViewportBoundsChange={handleViewportBoundsChange}
              onCameraChange={handleMapCameraChange}
              initialCamera={mapCamera}
              className="h-full rounded-none border-0 shadow-none"
              mapClassName="h-full min-h-0"
              showHeader={false}
            />

            <div className="pointer-events-none absolute inset-x-2 top-[max(0.5rem,env(safe-area-inset-top))] sm:inset-x-4 sm:top-4">
              <div className="pointer-events-auto mx-auto flex w-full max-w-[1400px] min-w-0 flex-col gap-2 rounded-2xl border border-white/70 bg-white/95 px-3 py-2.5 shadow-xl backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Full map mode</p>
                  <p className="mt-1 hidden text-xs text-slate-700 sm:block">
                    Bay Area restroom map with live markers and nearby results.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={handleUseMyLocation}
                    disabled={isLocating}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isLocating ? "Locating..." : "Locate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsExpandedListOpen((current) => !current)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    {isExpandedListOpen ? "Hide list" : "Show list"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsMapExpanded(false)}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
                  >
                    Close map
                  </button>
                </div>

                {geoError ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs font-medium text-amber-800">
                    {geoError}
                  </p>
                ) : null}
              </div>
            </div>

            {isExpandedListOpen ? (
              <>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 overflow-hidden sm:hidden">
                  <div className="pointer-events-auto rounded-t-3xl border-t border-slate-200 bg-white shadow-2xl">
                    <div className="flex justify-center pt-2">
                      <span className="h-1.5 w-10 rounded-full bg-slate-300" />
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Nearby results</p>
                        <p className="text-xs text-slate-500">{listRestrooms.length} in current map area</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsExpandedListOpen(false)}
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700"
                      >
                        Hide
                      </button>
                    </div>
                    <div className="max-h-[58svh] overflow-x-hidden overflow-y-auto px-2 pb-[calc(env(safe-area-inset-bottom)+0.65rem)] pt-2">
                      {renderListPanel("expanded")}
                    </div>
                  </div>
                </div>
                <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 hidden max-h-[62vh] sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-[92px] sm:block sm:max-h-none sm:w-[400px]">
                  <div className="pointer-events-auto h-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl sm:p-3">
                    {renderListPanel("expanded")}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </section>
      ) : null}
    </>
  );
}
