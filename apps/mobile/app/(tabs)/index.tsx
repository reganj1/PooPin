import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Location from "expo-location";
import { useRouter, type Href } from "expo-router";
import type { NearbyBathroom } from "@poopin/domain";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Region } from "react-native-maps";
import { getBoundsRestrooms, getNearbyRestrooms, primeRestroomCache, searchPlaces, type PlaceSearchResult } from "../../src/lib/api";
import { ExpandedMapOverlay } from "../../src/features/browse-map/ExpandedMapOverlay";
import { getRegionChangeMetrics, regionToBounds, toBoundsKey } from "../../src/features/browse-map/mapBounds";
import { RestroomMapSurface } from "../../src/features/browse-map/RestroomMapSurface";
import { SelectedRestroomPreviewCard } from "../../src/features/browse-map/SelectedRestroomPreviewCard";
import { useCurrentLocation } from "../../src/hooks/use-current-location";
import { useSession } from "../../src/providers/session-provider";
import { mobileTheme } from "../../src/ui/theme";

const FALLBACK_QUERY = {
  lat: 37.7749,
  lng: -122.4194,
  limit: 24
} as const;
const BOUNDS_FETCH_DEBOUNCE_MS = 120;
const BOUNDS_FETCH_LIMIT = 400;
const MAX_BOUNDS_FETCH_DELTA = 2.0; // skip fetch when viewport > ~220 km tall — markers at that scale are useless
const MARKER_TAP_SUPPRESSION_MS = 1000;
const SHEET_SELECTION_SUPPRESSION_MS = 600;
const MARKER_EXPLORATION_IDLE_EXIT_MS = 1000;
const PLACE_SEARCH_REGION_DELTA = {
  latitudeDelta: 0.08,
  longitudeDelta: 0.08
} as const;
const PLACE_SUGGESTION_DEBOUNCE_MS = 240;
const MAX_LOCAL_SEARCH_SUGGESTIONS = 4;

type BrowseDataMode = "nearby" | "bounds";
type MapSheetState = "collapsed" | "default" | "expanded";
type PendingBoundsApply = {
  requestId: number;
  boundsKey: string;
  restrooms: NearbyBathroom[];
  region: Region;
};
type SearchSuggestion =
  | {
      id: string;
      type: "place";
      title: string;
      subtitle: string;
      place: PlaceSearchResult;
    }
  | {
      id: string;
      type: "restroom";
      title: string;
      subtitle: string;
      restroomId: string;
    };

const toLocationLine = (restroom: NearbyBathroom) => [restroom.address, restroom.city, restroom.state].filter(Boolean).join(", ");
const logMapDebug = (event: string, meta?: Record<string, unknown>) => {
  if (__DEV__) {
    console.log(`[mobile-map] ${event}`, meta ?? {});
  }
};

const formatRatingLabel = (restroom: NearbyBathroom) => {
  if (restroom.ratings.reviewCount <= 0 || restroom.ratings.overall <= 0) {
    return "No reviews yet";
  }

  return `${restroom.ratings.overall.toFixed(1)} overall • ${restroom.ratings.reviewCount} review${restroom.ratings.reviewCount === 1 ? "" : "s"}`;
};

const matchesRestroomSearch = (restroom: NearbyBathroom, query: string) => {
  if (!query) {
    return true;
  }

  const searchableText = [restroom.name, restroom.address, restroom.city, restroom.state].filter(Boolean).join(" ").toLowerCase();
  return searchableText.includes(query);
};

const isFallbackMapRegion = (region: Region | null) => {
  if (!region) {
    return true;
  }

  return (
    Math.abs(region.latitude - FALLBACK_QUERY.lat) < 0.02 &&
    Math.abs(region.longitude - FALLBACK_QUERY.lng) < 0.02
  );
};

export default function HomeScreen() {
  const router = useRouter();
  const { user, signOut } = useSession();
  const { coordinates, errorMessage: locationErrorMessage, permissionStatus } = useCurrentLocation();
  const [restrooms, setRestrooms] = useState<NearbyBathroom[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingNearby, setIsRefreshingNearby] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [resultSource, setResultSource] = useState<"fallback" | "live">("fallback");
  const [isExpandedMapOpen, setIsExpandedMapOpen] = useState(false);
  const [browseDataMode, setBrowseDataMode] = useState<BrowseDataMode>("nearby");
  const [mapRegion, setMapRegion] = useState<Region | null>(null);
  const [mapSheetState, setMapSheetState] = useState<MapSheetState>("default");
  const [selectedRestroomId, setSelectedRestroomId] = useState<string | null>(null);
  const [showExpandedMapSelectionPopup, setShowExpandedMapSelectionPopup] = useState(false);
  const [mapFocusedRestroomId, setMapFocusedRestroomId] = useState<string | null>(null);
  const [mapFocusRequestKey, setMapFocusRequestKey] = useState(0);
  const [locationCenterRequestKey, setLocationCenterRequestKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedLocalSearchQuery, setSubmittedLocalSearchQuery] = useState("");
  const [searchErrorMessage, setSearchErrorMessage] = useState<string | null>(null);
  const [isPlaceSearchSubmitting, setIsPlaceSearchSubmitting] = useState(false);
  const [isPlaceSuggestionsLoading, setIsPlaceSuggestionsLoading] = useState(false);
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSearchResult[]>([]);
  const [searchTargetRegion, setSearchTargetRegion] = useState<Region | null>(null);
  const [searchPanRequestKey, setSearchPanRequestKey] = useState(0);
  const appliedLiveLocationKeyRef = useRef<string | null>(null);
  const browseDataModeRef = useRef<BrowseDataMode>("nearby");
  const boundsDebounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestBoundsRequestIdRef = useRef(0);
  const lastQueuedBoundsKeyRef = useRef<string | null>(null);
  const lastAppliedBoundsKeyRef = useRef<string | null>(null);
  const lastAcceptedRegionRef = useRef<Region | null>(null);
  const lastMeaningfulRegionRef = useRef<Region | null>(null);
  const selectedRestroomIdRef = useRef<string | null>(null);
  const boundsSuppressedUntilRef = useRef(0);
  const markerExplorationActiveRef = useRef(false);
  const pendingBoundsApplyRef = useRef<PendingBoundsApply | null>(null);
  const pendingBoundsApplyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markerExplorationIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAppliedInitialLiveMapCenterRef = useRef(false);
  const isApplyingInitialLiveMapCenterRef = useRef(false);
  const hasUserPositionedMapRef = useRef(false);
  const skipNextBoundsFetchReasonRef = useRef<string | null>(null);
  const latestPlaceSearchRequestIdRef = useRef(0);
  const placeSuggestionAbortRef = useRef<AbortController | null>(null);
  // Guards the one-shot initial bounds fetch that fires when the expanded map
  // first opens.  Reset each time the overlay closes so re-expanding triggers
  // a fresh fetch.
  const expandedMapInitialFetchFiredRef = useRef(false);
  // Mirrors latest values into refs so the initial-expand effect can read them
  // without adding them as reactive deps (we only want to fire once per open).
  const latestMapRegionRef = useRef<Region | null>(null);
  const latestCoordinatesRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    browseDataModeRef.current = browseDataMode;
  }, [browseDataMode]);

  // Keep mirror refs current on every render.
  latestMapRegionRef.current = mapRegion;
  latestCoordinatesRef.current = coordinates;

  // ─── One-shot initial bounds fetch on expand ─────────────────────────────
  // The first onRegionChangeComplete fired by RestroomMapSurface is always
  // discarded (hasHandledInitialRegionChangeRef) to avoid double-fetching on
  // the compact map.  That means the expanded map never gets an automatic
  // viewport fetch unless the user pans.  This effect compensates by firing a
  // single getBoundsRestrooms call the moment the overlay opens, using the
  // map's current region (or the GPS / fallback origin as a safe default).
  // It also resets the region-change baseline refs so the first user pan
  // after opening is always treated as meaningful regardless of size.
  useEffect(() => {
    if (!isExpandedMapOpen) {
      expandedMapInitialFetchFiredRef.current = false;
      return;
    }

    if (expandedMapInitialFetchFiredRef.current) {
      return;
    }

    expandedMapInitialFetchFiredRef.current = true;

    // Reset movement baseline so the very first pan after opening is always
    // treated as meaningful, no matter how small.
    lastMeaningfulRegionRef.current = null;
    lastAcceptedRegionRef.current = null;

    const coords = latestCoordinatesRef.current;
    const currentRegion: Region = latestMapRegionRef.current ?? {
      latitude: coords?.lat ?? FALLBACK_QUERY.lat,
      longitude: coords?.lng ?? FALLBACK_QUERY.lng,
      latitudeDelta: 0.12,
      longitudeDelta: 0.12
    };

    const fetchRegion: Region = {
      ...currentRegion,
      latitudeDelta: Math.min(currentRegion.latitudeDelta, MAX_BOUNDS_FETCH_DELTA),
      longitudeDelta: Math.min(currentRegion.longitudeDelta, MAX_BOUNDS_FETCH_DELTA)
    };

    const bounds = regionToBounds(fetchRegion);
    const boundsKey = toBoundsKey(bounds);

    if (boundsKey === lastAppliedBoundsKeyRef.current || boundsKey === lastQueuedBoundsKeyRef.current) {
      logMapDebug("initial expand fetch skipped", { reason: "already fetched or queued", boundsKey });
      return;
    }

    lastQueuedBoundsKeyRef.current = boundsKey;
    const requestId = latestBoundsRequestIdRef.current + 1;
    latestBoundsRequestIdRef.current = requestId;
    logMapDebug("initial expand fetch start", { requestId, boundsKey, latitudeDelta: fetchRegion.latitudeDelta });

    void (async () => {
      try {
        const response = await getBoundsRestrooms({ ...bounds, limit: BOUNDS_FETCH_LIMIT });
        // Use currentRegion (not fetchRegion) so refs store the real viewport
        // delta for subsequent pan comparisons.
        applyBoundsResult(response.restrooms, boundsKey, requestId, currentRegion);
      } catch (error) {
        if (requestId === latestBoundsRequestIdRef.current) {
          setErrorMessage(error instanceof Error ? error.message : "Could not load restrooms for this map area.");
        }
      } finally {
        if (lastQueuedBoundsKeyRef.current === boundsKey) {
          lastQueuedBoundsKeyRef.current = null;
        }
      }
    })();
    // Intentionally omit mapRegion / coordinates from deps — this must fire
    // exactly once per expand, capturing values at the moment of opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpandedMapOpen]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const normalizedSubmittedLocalSearchQuery = submittedLocalSearchQuery.trim().toLowerCase();
  const localSuggestionRestrooms = useMemo(
    () =>
      normalizedSearchQuery
        ? restrooms.filter((restroom) => matchesRestroomSearch(restroom, normalizedSearchQuery)).slice(0, MAX_LOCAL_SEARCH_SUGGESTIONS)
        : [],
    [normalizedSearchQuery, restrooms]
  );
  const expandedMapRestrooms = useMemo(
    () =>
      normalizedSubmittedLocalSearchQuery
        ? restrooms.filter((restroom) => matchesRestroomSearch(restroom, normalizedSubmittedLocalSearchQuery))
        : restrooms,
    [normalizedSubmittedLocalSearchQuery, restrooms]
  );
  const searchSuggestions = useMemo<SearchSuggestion[]>(
    () => [
      ...placeSuggestions.map((place) => ({
        id: `place:${place.id}`,
        type: "place" as const,
        title: place.name,
        subtitle: place.secondaryName,
        place
      })),
      ...localSuggestionRestrooms.map((restroom) => ({
        id: `restroom:${restroom.id}`,
        type: "restroom" as const,
        title: restroom.name,
        subtitle: toLocationLine(restroom),
        restroomId: restroom.id
      }))
    ],
    [localSuggestionRestrooms, placeSuggestions]
  );

  useEffect(() => {
    placeSuggestionAbortRef.current?.abort();

    if (normalizedSearchQuery.length < 2) {
      setPlaceSuggestions([]);
      setIsPlaceSuggestionsLoading(false);
      return;
    }

    const controller = new AbortController();
    placeSuggestionAbortRef.current = controller;
    const timeoutId = setTimeout(() => {
      setIsPlaceSuggestionsLoading(true);

      void searchPlaces(normalizedSearchQuery, {
        signal: controller.signal,
        proximity: coordinates
      })
        .then((results) => {
          if (controller.signal.aborted) {
            return;
          }

          setPlaceSuggestions(results);
        })
        .catch((error) => {
          if (controller.signal.aborted) {
            return;
          }

          console.warn("[mobile-map] place suggestions failed", error);
          setPlaceSuggestions([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsPlaceSuggestionsLoading(false);
          }
        });
    }, PLACE_SUGGESTION_DEBOUNCE_MS);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [coordinates, normalizedSearchQuery]);

  useEffect(() => {
    return () => {
      placeSuggestionAbortRef.current?.abort();

      if (boundsDebounceTimeoutRef.current) {
        clearTimeout(boundsDebounceTimeoutRef.current);
      }

      if (pendingBoundsApplyTimeoutRef.current) {
        clearTimeout(pendingBoundsApplyTimeoutRef.current);
      }

      if (markerExplorationIdleTimeoutRef.current) {
        clearTimeout(markerExplorationIdleTimeoutRef.current);
      }
    };
  }, []);

  const loadNearbyRestrooms = useCallback(
    async (
      nextCoordinates: { lat: number; lng: number },
      options?: { forceApply?: boolean; isCancelled?: () => boolean }
    ) => {
      const isCancelled = options?.isCancelled ?? (() => false);
      const shouldForceApply = options?.forceApply ?? false;
      const locationKey = `${nextCoordinates.lat.toFixed(4)}:${nextCoordinates.lng.toFixed(4)}`;

      setIsRefreshingNearby(true);
      setErrorMessage(null);

      try {
        const response = await getNearbyRestrooms({
          lat: nextCoordinates.lat,
          lng: nextCoordinates.lng,
          limit: FALLBACK_QUERY.limit
        });

        if (isCancelled()) {
          return;
        }

        appliedLiveLocationKeyRef.current = locationKey;
        primeRestroomCache(response.restrooms);
        if (!shouldForceApply && browseDataModeRef.current !== "nearby") {
          return;
        }

        if (shouldForceApply) {
          browseDataModeRef.current = "nearby";
          setBrowseDataMode("nearby");
          lastAppliedBoundsKeyRef.current = null;
          lastQueuedBoundsKeyRef.current = null;
          pendingBoundsApplyRef.current = null;
          clearPendingBoundsApplyTimeout();
        }

        setRestrooms(response.restrooms);
        setResultSource("live");
      } catch (error) {
        if (isCancelled()) {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : "Could not refresh nearby restrooms with your location.");
      } finally {
        if (!isCancelled()) {
          setIsRefreshingNearby(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    const loadFallback = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await getNearbyRestrooms(FALLBACK_QUERY);
        if (cancelled) {
          return;
        }

        primeRestroomCache(response.restrooms);
        if (browseDataModeRef.current !== "nearby") {
          return;
        }

        setRestrooms(response.restrooms);
        setResultSource("fallback");
      } catch (error) {
        if (cancelled || browseDataModeRef.current !== "nearby") {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : "Could not load nearby restrooms right now.");
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadFallback();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!coordinates) {
      return;
    }

    const locationKey = `${coordinates.lat.toFixed(4)}:${coordinates.lng.toFixed(4)}`;
    if (appliedLiveLocationKeyRef.current === locationKey) {
      return;
    }

    let cancelled = false;

    const loadLiveNearby = async () => {
      await loadNearbyRestrooms(coordinates, {
        isCancelled: () => cancelled
      });
    };

    void loadLiveNearby();

    return () => {
      cancelled = true;
    };
  }, [coordinates, loadNearbyRestrooms]);

  useEffect(() => {
    selectedRestroomIdRef.current = selectedRestroomId;

    if (!selectedRestroomId) {
      setMapFocusedRestroomId(null);
      setShowExpandedMapSelectionPopup(false);
    }
  }, [selectedRestroomId]);

  useEffect(() => {
    if (permissionStatus !== "granted" || !coordinates) {
      return;
    }

    if (hasAppliedInitialLiveMapCenterRef.current || isApplyingInitialLiveMapCenterRef.current || hasUserPositionedMapRef.current) {
      return;
    }

    if (!isExpandedMapOpen && !isFallbackMapRegion(mapRegion)) {
      return;
    }

    isApplyingInitialLiveMapCenterRef.current = true;
    skipNextBoundsFetchReasonRef.current = "initial live location center";
    logMapDebug("initial live center requested", {
      source: isExpandedMapOpen ? "expanded open" : "live location available",
      latitude: coordinates.lat,
      longitude: coordinates.lng
    });
    setLocationCenterRequestKey((current) => current + 1);
  }, [coordinates, isExpandedMapOpen, mapRegion, permissionStatus]);

  const clearPendingBoundsApplyTimeout = () => {
    if (pendingBoundsApplyTimeoutRef.current) {
      clearTimeout(pendingBoundsApplyTimeoutRef.current);
      pendingBoundsApplyTimeoutRef.current = null;
    }
  };

  const clearMarkerExplorationIdleTimeout = () => {
    if (markerExplorationIdleTimeoutRef.current) {
      clearTimeout(markerExplorationIdleTimeoutRef.current);
      markerExplorationIdleTimeoutRef.current = null;
    }
  };

  const applyBoundsResult = (nextRestrooms: NearbyBathroom[], boundsKey: string, requestId: number, region: Region) => {
    if (requestId !== latestBoundsRequestIdRef.current) {
      logMapDebug("bounds response ignored", {
        requestId,
        boundsKey,
        reason: "stale apply"
      });
      return;
    }

    pendingBoundsApplyRef.current = null;
    lastAppliedBoundsKeyRef.current = boundsKey;
    lastAcceptedRegionRef.current = region;
    lastMeaningfulRegionRef.current = region;
    browseDataModeRef.current = "bounds";
    setBrowseDataMode("bounds");
    setErrorMessage(null);
    setIsLoading(false);
    setRestrooms(nextRestrooms);

    const currentSelectedRestroomId = selectedRestroomIdRef.current;
    if (currentSelectedRestroomId && !nextRestrooms.some((restroom) => restroom.id === currentSelectedRestroomId)) {
      logMapDebug("selection cleared", {
        restroomId: currentSelectedRestroomId,
        boundsKey,
        requestId
      });
      setSelectedRestroomId(null);
    }

    logMapDebug("bounds response applied", {
      requestId,
      boundsKey,
      count: nextRestrooms.length
    });
  };

  const schedulePendingBoundsApply = () => {
    clearPendingBoundsApplyTimeout();

    if (!pendingBoundsApplyRef.current || markerExplorationActiveRef.current) {
      return;
    }

    const delay = Math.max(0, boundsSuppressedUntilRef.current - Date.now());
    pendingBoundsApplyTimeoutRef.current = setTimeout(() => {
      pendingBoundsApplyTimeoutRef.current = null;

      if (markerExplorationActiveRef.current) {
        return;
      }

      const pendingApply = pendingBoundsApplyRef.current;
      if (!pendingApply) {
        return;
      }

      if (pendingApply.requestId !== latestBoundsRequestIdRef.current) {
        logMapDebug("bounds response ignored", {
          requestId: pendingApply.requestId,
          boundsKey: pendingApply.boundsKey,
          reason: "stale deferred apply"
        });
        pendingBoundsApplyRef.current = null;
        return;
      }

      pendingBoundsApplyRef.current = null;
      logMapDebug("bounds result accepted after marker interaction settles", {
        requestId: pendingApply.requestId,
        boundsKey: pendingApply.boundsKey,
        count: pendingApply.restrooms.length
      });
      applyBoundsResult(pendingApply.restrooms, pendingApply.boundsKey, pendingApply.requestId, pendingApply.region);
    }, delay);
  };

  const beginBoundsSuppression = (reason: string, durationMs: number, meta?: Record<string, unknown>) => {
    boundsSuppressedUntilRef.current = Date.now() + durationMs;
    logMapDebug("bounds suppression start", {
      reason,
      durationMs,
      ...(meta ?? {})
    });

    schedulePendingBoundsApply();
  };

  const exitMarkerExplorationMode = (reason: string, options?: { discardDeferred?: boolean }) => {
    if (!markerExplorationActiveRef.current) {
      return;
    }

    markerExplorationActiveRef.current = false;
    boundsSuppressedUntilRef.current = 0;
    clearMarkerExplorationIdleTimeout();

    logMapDebug("marker exploration mode ends", { reason });

    if (options?.discardDeferred && pendingBoundsApplyRef.current) {
      logMapDebug("deferred bounds result discarded", {
        requestId: pendingBoundsApplyRef.current.requestId,
        boundsKey: pendingBoundsApplyRef.current.boundsKey,
        reason
      });
      pendingBoundsApplyRef.current = null;
      clearPendingBoundsApplyTimeout();
    }

    schedulePendingBoundsApply();
  };

  const startMarkerExplorationIdleExit = () => {
    if (!markerExplorationActiveRef.current) {
      return;
    }

    clearMarkerExplorationIdleTimeout();
    markerExplorationIdleTimeoutRef.current = setTimeout(() => {
      markerExplorationIdleTimeoutRef.current = null;
      exitMarkerExplorationMode("selection cleared and idle");
    }, MARKER_EXPLORATION_IDLE_EXIT_MS);
  };

  const enterMarkerExplorationMode = (restroomId: string) => {
    clearMarkerExplorationIdleTimeout();
    clearPendingBoundsApplyTimeout();
    markerExplorationActiveRef.current = true;
    boundsSuppressedUntilRef.current = Date.now() + MARKER_TAP_SUPPRESSION_MS;
    logMapDebug("marker exploration mode starts", {
      restroomId,
      durationMs: MARKER_TAP_SUPPRESSION_MS
    });
  };

  const handleMapSheetStateChange = (nextState: MapSheetState) => {
    if (nextState !== "collapsed") {
      setShowExpandedMapSelectionPopup(false);
    }
    setMapSheetState(nextState);
  };

  const handleMapSelectionChange = (restroomId: string | null) => {
    if (restroomId) {
      enterMarkerExplorationMode(restroomId);
      setMapFocusedRestroomId(null);
      setSelectedRestroomId(restroomId);

      if (isExpandedMapOpen) {
        setMapSheetState("collapsed");
        setShowExpandedMapSelectionPopup(true);
      }
      return;
    }

    startMarkerExplorationIdleExit();
    setShowExpandedMapSelectionPopup(false);
    setSelectedRestroomId(restroomId);
  };

  const handleSelectRestroomFromSheet = (restroomId: string) => {
    logMapDebug("row selection", { restroomId });
    beginBoundsSuppression("row selection", SHEET_SELECTION_SUPPRESSION_MS, { restroomId });
    setShowExpandedMapSelectionPopup(false);
    setSelectedRestroomId(restroomId);
    setMapFocusedRestroomId(restroomId);
    setMapFocusRequestKey((current) => current + 1);
  };

  const handleMapRegionSettled = (region: Region) => {
    setMapRegion(region);

    logMapDebug("region settled", {
      latitude: region.latitude,
      longitude: region.longitude,
      latitudeDelta: region.latitudeDelta,
      longitudeDelta: region.longitudeDelta,
      previousLatitude: (lastMeaningfulRegionRef.current ?? lastAcceptedRegionRef.current)?.latitude,
      previousLongitude: (lastMeaningfulRegionRef.current ?? lastAcceptedRegionRef.current)?.longitude
    });

    const regionChange = getRegionChangeMetrics(lastMeaningfulRegionRef.current ?? lastAcceptedRegionRef.current, region);
    if (!regionChange.meaningful) {
      logMapDebug("bounds result skipped due to insignificant region change", {
        latitudeShift: regionChange.latitudeShift,
        longitudeShift: regionChange.longitudeShift,
        minimumLatitudeShift: regionChange.minimumLatitudeShift,
        minimumLongitudeShift: regionChange.minimumLongitudeShift,
        latitudeDeltaChangeRatio: regionChange.latitudeDeltaChangeRatio,
        longitudeDeltaChangeRatio: regionChange.longitudeDeltaChangeRatio,
        minimumDeltaChangeRatio: regionChange.minimumDeltaChangeRatio
      });
      return;
    }

    const skipBoundsReason = skipNextBoundsFetchReasonRef.current;
    if (skipBoundsReason) {
      skipNextBoundsFetchReasonRef.current = null;

      if (isApplyingInitialLiveMapCenterRef.current) {
        isApplyingInitialLiveMapCenterRef.current = false;
        hasAppliedInitialLiveMapCenterRef.current = true;
      }

      lastAcceptedRegionRef.current = region;
      lastMeaningfulRegionRef.current = region;
      logMapDebug("bounds request skipped", {
        reason: skipBoundsReason,
        latitude: region.latitude,
        longitude: region.longitude
      });
      return;
    }

    if (isApplyingInitialLiveMapCenterRef.current) {
      isApplyingInitialLiveMapCenterRef.current = false;
      hasAppliedInitialLiveMapCenterRef.current = true;
      logMapDebug("initial live center applied", {
        latitude: region.latitude,
        longitude: region.longitude
      });
    } else {
      hasUserPositionedMapRef.current = true;
    }

    if (markerExplorationActiveRef.current) {
      exitMarkerExplorationMode("meaningful pan", { discardDeferred: true });
    }

    if (Date.now() < boundsSuppressedUntilRef.current) {
      logMapDebug("bounds request ignored", {
        reason: "suppressed region settle",
        suppressedUntil: boundsSuppressedUntilRef.current
      });
      return;
    }

    // When the viewport is very large, cap the fetch area to the centre
    // MAX_BOUNDS_FETCH_DELTA × MAX_BOUNDS_FETCH_DELTA degrees rather than
    // silently returning nothing.  Markers appear in the centre of the screen;
    // zooming in reveals the full picture.  The actual region (uncapped) is
    // kept in lastMeaningfulRegionRef so subsequent pan comparisons are
    // correct.
    const isZoomedOut =
      region.latitudeDelta > MAX_BOUNDS_FETCH_DELTA || region.longitudeDelta > MAX_BOUNDS_FETCH_DELTA;
    const fetchRegion: Region = isZoomedOut
      ? {
          ...region,
          latitudeDelta: Math.min(region.latitudeDelta, MAX_BOUNDS_FETCH_DELTA),
          longitudeDelta: Math.min(region.longitudeDelta, MAX_BOUNDS_FETCH_DELTA)
        }
      : region;

    if (isZoomedOut) {
      logMapDebug("viewport capped for bounds fetch", {
        originalLatDelta: region.latitudeDelta,
        cappedLatDelta: fetchRegion.latitudeDelta
      });
    }

    const bounds = regionToBounds(fetchRegion);
    const boundsKey = toBoundsKey(bounds);
    if (boundsKey === lastAppliedBoundsKeyRef.current || boundsKey === lastQueuedBoundsKeyRef.current) {
      return;
    }

    if (boundsDebounceTimeoutRef.current) {
      clearTimeout(boundsDebounceTimeoutRef.current);
    }

    lastMeaningfulRegionRef.current = region;
    lastQueuedBoundsKeyRef.current = boundsKey;
    boundsDebounceTimeoutRef.current = setTimeout(() => {
      boundsDebounceTimeoutRef.current = null;

      if (Date.now() < boundsSuppressedUntilRef.current) {
        logMapDebug("bounds request ignored", {
          reason: "suppressed before fetch",
          boundsKey
        });

        if (lastQueuedBoundsKeyRef.current === boundsKey) {
          lastQueuedBoundsKeyRef.current = null;
        }

        return;
      }

      const requestId = latestBoundsRequestIdRef.current + 1;
      latestBoundsRequestIdRef.current = requestId;
      logMapDebug("bounds request start", {
        requestId,
        boundsKey
      });

      void (async () => {
        try {
          const response = await getBoundsRestrooms({
            ...bounds,
            limit: BOUNDS_FETCH_LIMIT
          });

          if (requestId !== latestBoundsRequestIdRef.current) {
            logMapDebug("bounds response ignored", {
              requestId,
              boundsKey,
              reason: "stale response"
            });
            return;
          }

          if (Date.now() < boundsSuppressedUntilRef.current) {
            pendingBoundsApplyRef.current = {
              requestId,
              boundsKey,
              restrooms: response.restrooms,
              region
            };
            logMapDebug("bounds response deferred", {
              requestId,
              boundsKey,
              count: response.restrooms.length
            });
            schedulePendingBoundsApply();
            return;
          }

          if (markerExplorationActiveRef.current) {
            pendingBoundsApplyRef.current = {
              requestId,
              boundsKey,
              restrooms: response.restrooms,
              region
            };
            logMapDebug("bounds response deferred", {
              requestId,
              boundsKey,
              count: response.restrooms.length,
              reason: "marker exploration mode active"
            });
            return;
          }

          applyBoundsResult(response.restrooms, boundsKey, requestId, region);
        } catch (error) {
          if (requestId !== latestBoundsRequestIdRef.current) {
            logMapDebug("bounds response ignored", {
              requestId,
              boundsKey,
              reason: "stale error"
            });
            return;
          }

          setErrorMessage(error instanceof Error ? error.message : "Could not load restrooms for this map area.");
        } finally {
          if (lastQueuedBoundsKeyRef.current === boundsKey) {
            lastQueuedBoundsKeyRef.current = null;
          }
        }
      })();
    }, BOUNDS_FETCH_DEBOUNCE_MS);
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);

    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  const showFallbackBanner = permissionStatus === "denied" || permissionStatus === "unavailable";
  const showLiveRefreshNotice =
    browseDataMode === "nearby" && permissionStatus === "granted" && (isRefreshingNearby || resultSource === "live");
  const selectedRestroom = selectedRestroomId ? restrooms.find((restroom) => restroom.id === selectedRestroomId) ?? null : null;
  const expandedSelectedRestroom =
    selectedRestroomId ? expandedMapRestrooms.find((restroom) => restroom.id === selectedRestroomId) ?? null : null;
  const expandedSelectedRestroomId = expandedSelectedRestroom ? selectedRestroomId : null;
  const mapOrigin = coordinates ?? FALLBACK_QUERY;
  const canRecenter = permissionStatus === "granted" && coordinates !== null;
  const mapSurfaceProps = {
    coordinates,
    focusRequestKey: mapFocusRequestKey,
    focusedRestroomId: mapFocusedRestroomId,
    initialCenter: mapOrigin,
    locationCenterRequestKey,
    onRegionSettled: handleMapRegionSettled,
    onSelectRestroom: handleMapSelectionChange,
    permissionStatus,
    restrooms,
    restoredRegion: mapRegion,
    searchRegion: null,
    searchRegionRequestKey: 0,
    selectedRestroomId
  } as const;
  const openExpandedMap = () => {
    setMapSheetState("default");
    setShowExpandedMapSelectionPopup(false);
    setIsExpandedMapOpen(true);
  };
  const closeExpandedMap = () => {
    latestPlaceSearchRequestIdRef.current += 1;
    placeSuggestionAbortRef.current?.abort();
    setIsPlaceSearchSubmitting(false);
    setIsPlaceSuggestionsLoading(false);
    setPlaceSuggestions([]);
    setSearchQuery("");
    setSubmittedLocalSearchQuery("");
    setSearchErrorMessage(null);
    setSearchTargetRegion(null);
    setShowExpandedMapSelectionPopup(false);
    setIsExpandedMapOpen(false);
  };
  const handleRecenterRequest = () => {
    exitMarkerExplorationMode("recenter", { discardDeferred: true });
    skipNextBoundsFetchReasonRef.current = "manual location recenter";

    if (coordinates) {
      void loadNearbyRestrooms(coordinates, { forceApply: true });
    }

    setLocationCenterRequestKey((current) => current + 1);
  };
  const panToSearchRegion = useCallback((region: Region) => {
    exitMarkerExplorationMode("place search", { discardDeferred: true });
    setMapFocusedRestroomId(null);
    setSelectedRestroomId(null);
    setSubmittedLocalSearchQuery("");
    setShowExpandedMapSelectionPopup(false);
    setSearchTargetRegion(region);
    setSearchPanRequestKey((current) => current + 1);
  }, []);
  const handleSelectSearchSuggestion = useCallback(
    (suggestion: SearchSuggestion) => {
      setSearchQuery(suggestion.type === "place" ? suggestion.place.fullName : suggestion.title);
      setSearchErrorMessage(null);

      if (suggestion.type === "place") {
        panToSearchRegion({
          latitude: suggestion.place.lat,
          longitude: suggestion.place.lng,
          ...PLACE_SEARCH_REGION_DELTA
        });
        return;
      }

      beginBoundsSuppression("local search suggestion", SHEET_SELECTION_SUPPRESSION_MS, { restroomId: suggestion.restroomId });
      setSubmittedLocalSearchQuery("");
      setShowExpandedMapSelectionPopup(false);
      setSelectedRestroomId(suggestion.restroomId);
      setMapFocusedRestroomId(suggestion.restroomId);
      setMapFocusRequestKey((current) => current + 1);
    },
    [panToSearchRegion]
  );
  const handleSearchQueryChange = useCallback((nextQuery: string) => {
    latestPlaceSearchRequestIdRef.current += 1;
    setIsPlaceSearchSubmitting(false);
    setSubmittedLocalSearchQuery("");
    setSearchQuery(nextQuery);
    setSearchErrorMessage(null);
  }, []);
  const handleExpandedMapSearchSubmit = useCallback(async () => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      setSubmittedLocalSearchQuery("");
      setSearchErrorMessage(null);
      return;
    }

    const requestId = latestPlaceSearchRequestIdRef.current + 1;
    latestPlaceSearchRequestIdRef.current = requestId;
    setIsPlaceSearchSubmitting(true);
    setSearchErrorMessage(null);

    try {
      const results = await Location.geocodeAsync(trimmedQuery);
      if (requestId !== latestPlaceSearchRequestIdRef.current) {
        return;
      }

      const firstResult = results[0];
      if (!firstResult) {
        if (restrooms.some((restroom) => matchesRestroomSearch(restroom, trimmedQuery.toLowerCase()))) {
          setSubmittedLocalSearchQuery(trimmedQuery);
          setSearchErrorMessage(null);
          return;
        }

        setSubmittedLocalSearchQuery("");
        setSearchErrorMessage(`Couldn't find a place or visible restroom for "${trimmedQuery}".`);
        return;
      }

      panToSearchRegion({
        latitude: firstResult.latitude,
        longitude: firstResult.longitude,
        ...PLACE_SEARCH_REGION_DELTA
      });
      setSearchErrorMessage(null);
    } catch (error) {
      if (requestId !== latestPlaceSearchRequestIdRef.current) {
        return;
      }

      if (restrooms.some((restroom) => matchesRestroomSearch(restroom, trimmedQuery.toLowerCase()))) {
        setSubmittedLocalSearchQuery(trimmedQuery);
        setSearchErrorMessage(null);
      } else {
        setSubmittedLocalSearchQuery("");
        setSearchErrorMessage(error instanceof Error ? error.message : "Place search is unavailable right now.");
      }
    } finally {
      if (requestId === latestPlaceSearchRequestIdRef.current) {
        setIsPlaceSearchSubmitting(false);
      }
    }
  }, [panToSearchRegion, restrooms, searchQuery]);
  const homeMapStatusContent = (
    <>
      {showFallbackBanner ? (
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>Using a default nearby area</Text>
          <Text style={styles.noticeCopy}>
            {locationErrorMessage ?? "Enable location to swap these fallback results for restrooms near you."}
          </Text>
        </View>
      ) : null}

      {showLiveRefreshNotice ? (
        <View style={styles.liveNotice}>
          <Text style={styles.liveNoticeText}>
            {isRefreshingNearby ? "Refreshing with your current location…" : "Showing restrooms near your current location."}
          </Text>
        </View>
      ) : null}

      {errorMessage ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>
            {browseDataMode === "bounds" ? "Unable to load restrooms in this map area" : "Unable to load nearby restrooms"}
          </Text>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}
    </>
  );
  const overlayMapStatusContent = errorMessage ? (
    <View style={styles.overlayErrorCard}>
      <Text style={styles.overlayErrorTitle}>
        {browseDataMode === "bounds" ? "Unable to load restrooms in this map area" : "Unable to load nearby restrooms"}
      </Text>
      <Text style={styles.overlayErrorText}>{errorMessage}</Text>
    </View>
  ) : null;
  const listHeaderContent = (
    <View style={styles.header}>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>Find a restroom</Text>

        {user ? (
          <View style={styles.screenHeaderAuth}>
            <Text style={[styles.sessionLabel, styles.sessionLabelInline]} numberOfLines={1}>
              {user.email ?? "Signed in"}
            </Text>
            <Pressable
              onPress={handleSignOut}
              disabled={isSigningOut}
              style={({ pressed }) => [styles.screenHeaderSignOut, pressed ? styles.buttonPressed : null]}
            >
              <Text style={styles.screenHeaderSignOutText}>{isSigningOut ? "Signing out…" : "Sign out"}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => router.push("/sign-in?returnTo=%2F" as Href)}
            style={({ pressed }) => [styles.screenHeaderSignIn, pressed ? styles.buttonPressed : null]}
          >
            <Text style={styles.screenHeaderSignInText}>Sign in</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.compactMapPreviewCard}>
        <View style={styles.compactMapPreviewHeader}>
          <Text style={styles.compactMapPreviewTitle}>Restroom map</Text>
          <Pressable onPress={openExpandedMap} style={({ pressed }) => [styles.expandMapButton, pressed ? styles.buttonPressed : null]}>
            <Text style={styles.expandMapButtonText}>Explore map</Text>
          </Pressable>
        </View>

        {homeMapStatusContent}

        <View style={styles.compactMapPreviewSurface}>
          {!isExpandedMapOpen ? <RestroomMapSurface {...mapSurfaceProps} /> : null}

          <View style={styles.mapControlOverlay}>
            <Pressable
              disabled={!canRecenter}
              onPress={handleRecenterRequest}
              style={({ pressed }) => [
                styles.mapControlButton,
                !canRecenter ? styles.mapControlButtonDisabled : null,
                pressed ? styles.buttonPressed : null
              ]}
            >
              <Text style={[styles.mapControlButtonText, !canRecenter ? styles.mapControlButtonTextDisabled : null]}>Recenter</Text>
            </Pressable>
          </View>

          {selectedRestroom && !isExpandedMapOpen ? (
            <View pointerEvents="box-none" style={styles.compactSelectedPreviewOverlay}>
              <SelectedRestroomPreviewCard
                onPress={() => router.push(`/restrooms/${selectedRestroom.id}` as Href)}
                restroom={selectedRestroom}
                variant="compact"
              />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
  const stateCard = isLoading ? (
    <View style={styles.stateCard}>
      <ActivityIndicator color={mobileTheme.colors.brandStrong} />
      <Text style={styles.stateText}>
        {browseDataMode === "bounds" ? "Loading restrooms in this map area…" : "Loading nearby restrooms…"}
      </Text>
    </View>
  ) : (
    <View style={styles.stateCard}>
      <Text style={styles.stateText}>
        {browseDataMode === "bounds"
          ? "No restrooms are visible in this map area right now."
          : "No nearby restrooms are available right now."}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <FlatList
          data={restrooms}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={listHeaderContent}
          ListEmptyComponent={stateCard}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/restrooms/${item.id}` as Href)}
              style={({ pressed }) => [styles.rowCard, pressed ? styles.cardPressed : null]}
            >
              <View style={styles.rowHeader}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <View style={styles.distanceBadge}>
                  <Text style={styles.rowDistance}>
                    {typeof item.distanceMiles === "number" ? `${item.distanceMiles.toFixed(1)} mi` : "Nearby"}
                  </Text>
                </View>
              </View>
              <Text style={styles.rowLocation}>{toLocationLine(item)}</Text>
              <Text style={styles.rowRating}>{formatRatingLabel(item)}</Text>
            </Pressable>
          )}
        />

        {isExpandedMapOpen ? (
          <ExpandedMapOverlay
            canRecenter={canRecenter}
            coordinates={coordinates}
            focusRequestKey={mapFocusRequestKey}
            focusedRestroomId={mapFocusedRestroomId}
            initialCenter={mapOrigin}
            isPlaceSearchSubmitting={isPlaceSearchSubmitting}
            locationCenterRequestKey={locationCenterRequestKey}
            onClose={closeExpandedMap}
            onChangeSearchQuery={handleSearchQueryChange}
            onPressDetails={(restroomId) => router.push(`/restrooms/${restroomId}` as Href)}
            onPressUseLocation={handleRecenterRequest}
            onRegionSettled={handleMapRegionSettled}
            onSelectRestroom={handleMapSelectionChange}
            onSelectRestroomFromSheet={handleSelectRestroomFromSheet}
            onSelectSearchSuggestion={handleSelectSearchSuggestion}
            onSubmitSearchQuery={handleExpandedMapSearchSubmit}
            onSheetStateChange={handleMapSheetStateChange}
            currentRegion={mapRegion}
            permissionStatus={permissionStatus}
            restoredRegion={mapRegion}
            restrooms={expandedMapRestrooms}
            searchErrorMessage={searchErrorMessage}
            searchSuggestions={searchSuggestions}
            searchPanRequestKey={searchPanRequestKey}
            searchQuery={searchQuery}
            searchTargetRegion={searchTargetRegion}
            showSubmittedLocalSearchResults={normalizedSubmittedLocalSearchQuery.length > 0}
            isPlaceSuggestionsLoading={isPlaceSuggestionsLoading}
            selectedRestroom={expandedSelectedRestroom}
            selectedRestroomId={expandedSelectedRestroomId}
            selectedPopupVisible={showExpandedMapSelectionPopup && expandedSelectedRestroom !== null}
            sheetState={mapSheetState}
            statusContent={overlayMapStatusContent}
            onPressSelectedPopup={() => {
              if (!expandedSelectedRestroom) {
                return;
              }

              router.push(`/restrooms/${expandedSelectedRestroom.id}` as Href);
            }}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: mobileTheme.colors.pageBackground
  },
  screen: {
    flex: 1
  },
  listContent: {
    paddingHorizontal: mobileTheme.spacing.screenX,
    paddingBottom: 32,
    paddingTop: mobileTheme.spacing.screenTop
  },
  header: {
    marginBottom: 12
  },
  compactMapPreviewCard: {
    marginTop: 10
  },
  compactMapPreviewHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6
  },
  compactMapPreviewTitle: {
    color: mobileTheme.colors.textPrimary,
    flex: 1,
    fontSize: 16,
    fontWeight: "700"
  },
  expandMapButton: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.brand,
    borderRadius: mobileTheme.radii.pill,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 8
  },
  expandMapButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700"
  },
  compactMapPreviewSurface: {
    borderRadius: mobileTheme.radii.xl,
    height: 236,
    marginTop: 8,
    overflow: "hidden",
    position: "relative",
    ...mobileTheme.shadows.hero
  },
  compactSelectedPreviewOverlay: {
    bottom: 10,
    left: 10,
    position: "absolute",
    right: 10
  },
  mapControlOverlay: {
    position: "absolute",
    right: 12,
    top: 12
  },
  mapControlButton: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.borderSubtle,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    minWidth: 92,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...mobileTheme.shadows.card
  },
  mapControlButtonDisabled: {
    backgroundColor: mobileTheme.colors.surfaceMuted
  },
  mapControlButtonText: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "700"
  },
  mapControlButtonTextDisabled: {
    color: mobileTheme.colors.textFaint
  },
  screenHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14
  },
  screenTitle: {
    color: mobileTheme.colors.textPrimary,
    flex: 1,
    fontSize: 22,
    fontWeight: "700"
  },
  screenHeaderSignIn: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  screenHeaderSignInText: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "600"
  },
  screenHeaderAuth: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: 8,
    marginLeft: 10
  },
  screenHeaderSignOut: {
    paddingHorizontal: 2,
    paddingVertical: 4
  },
  screenHeaderSignOutText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    fontWeight: "500"
  },
  sessionLabel: {
    alignSelf: "flex-start",
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    color: mobileTheme.colors.textSecondary,
    fontSize: 13,
    marginTop: 16,
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  sessionLabelInline: {
    alignSelf: "center",
    flexShrink: 1,
    marginTop: 0
  },
  buttonPressed: {
    opacity: 0.85
  },
  noticeCard: {
    backgroundColor: mobileTheme.colors.surfaceBrandTint,
    borderColor: mobileTheme.colors.infoBorder,
    borderRadius: mobileTheme.radii.sm,
    borderWidth: 1,
    marginTop: 16,
    padding: 14
  },
  overlayNoticeCard: {
    backgroundColor: "rgba(244,249,255,0.94)",
    borderColor: mobileTheme.colors.infoBorder,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  noticeTitle: {
    color: mobileTheme.colors.brandDeep,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6
  },
  overlayNoticeTitle: {
    color: mobileTheme.colors.brandDeep,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4
  },
  noticeCopy: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19
  },
  overlayNoticeCopy: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 17
  },
  liveNotice: {
    backgroundColor: mobileTheme.colors.infoTint,
    borderColor: mobileTheme.colors.infoBorder,
    borderRadius: mobileTheme.radii.sm,
    borderWidth: 1,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  overlayLiveNotice: {
    backgroundColor: "rgba(239,246,255,0.95)",
    borderColor: mobileTheme.colors.infoBorder,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  liveNoticeText: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 13,
    fontWeight: "600"
  },
  overlayLiveNoticeText: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 12,
    fontWeight: "600"
  },
  errorCard: {
    backgroundColor: mobileTheme.colors.errorTint,
    borderColor: mobileTheme.colors.errorBorder,
    borderRadius: mobileTheme.radii.sm,
    borderWidth: 1,
    marginTop: 16,
    padding: 14
  },
  overlayErrorCard: {
    backgroundColor: "rgba(254,242,242,0.95)",
    borderColor: mobileTheme.colors.errorBorder,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  errorTitle: {
    color: mobileTheme.colors.errorText,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4
  },
  overlayErrorTitle: {
    color: mobileTheme.colors.errorText,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4
  },
  errorText: {
    color: mobileTheme.colors.errorText,
    fontSize: 13,
    lineHeight: 19
  },
  overlayErrorText: {
    color: mobileTheme.colors.errorText,
    fontSize: 12,
    lineHeight: 17
  },
  stateCard: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.borderSubtle,
    borderRadius: mobileTheme.radii.lg,
    borderWidth: 1,
    gap: 12,
    padding: 24,
    ...mobileTheme.shadows.card
  },
  stateText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center"
  },
  rowCard: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.borderSubtle,
    borderRadius: mobileTheme.radii.lg,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16,
    ...mobileTheme.shadows.card
  },
  cardPressed: {
    opacity: 0.92
  },
  rowHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8
  },
  rowTitle: {
    color: mobileTheme.colors.textPrimary,
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    paddingRight: 12
  },
  distanceBadge: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surfaceBrandTintStrong,
    borderColor: mobileTheme.colors.infoBorder,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  rowDistance: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 13,
    fontWeight: "700"
  },
  rowLocation: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 6
  },
  rowRating: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19
  }
});
