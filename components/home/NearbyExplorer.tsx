"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FocusEvent as ReactFocusEvent,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { TrackedNavigateLink } from "@/components/analytics/TrackedNavigateLink";
import { MapPanel } from "@/components/map/MapPanel";
import { PlaceSearchBar } from "@/components/map/PlaceSearchBar";
import { MobileRestroomPreviewCard } from "@/components/map/MobileRestroomPreviewCard";
import { useLocationTracking } from "@/components/providers/LocationTrackingProvider";
import { RestroomCard } from "@/components/restroom/RestroomCard";
import { RestroomList } from "@/components/restroom/RestroomList";
import { captureAnalyticsEvent } from "@/lib/analytics/posthog";
import type { PlaceSearchResult } from "@/lib/mapbox/placeSearch";
import { getRecentRestrooms, type RecentRestroomSnapshot, storeRecentRestroom } from "@/lib/utils/recentRestrooms";
import { getRestroomCardSubtitle, getRestroomDisplayName, getRestroomSourceLabel } from "@/lib/utils/restroomPresentation";
import { getReviewQuickTagDescriptor, reviewQuickTagToneClassName } from "@/lib/utils/reviewSignals";
import { cn } from "@/lib/utils/cn";
import { formatDistanceLabel, type DistanceReferenceKind } from "@/lib/utils/distancePresentation";
import { buildLoginHref } from "@/lib/auth/login";
import {
  fetchRestroomPreviewPhoto,
  getCachedRestroomPreviewPhoto,
  primeRestroomPreviewPhoto,
  prefetchRestroomPreviewPhotos
} from "@/lib/utils/restroomPreviewClient";
import { NearbyBathroom } from "@/types";

interface NearbyExplorerProps {
  initialRestrooms: NearbyBathroom[];
  showSignupValue?: boolean;
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
type MobileSheetState = "collapsed" | "default" | "expanded";
type MobileExpandedOverlayMode = "sheet" | "selected" | "none";
type DistanceReferenceMode = "user" | "browse";

interface FilterState {
  publicOnly: boolean;
  accessible: boolean;
  babyStation: boolean;
}

interface BoundsApiResponse {
  restrooms: NearbyBathroom[];
}

interface NearbyApiResponse {
  restrooms: NearbyBathroom[];
}

interface PersistedHomeMapState {
  updatedAt: number;
  isMapExpanded: boolean;
  isExpandedListOpen: boolean;
  mapCamera: MapCamera | null;
  sortMode: SortMode;
  filters: FilterState;
  pendingRestore: boolean;
  scrollY: number;
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
const isValidSortMode = (value: unknown): value is SortMode => value === "closest" || value === "recommended";
const isValidFilterState = (value: unknown): value is FilterState =>
  Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as FilterState).publicOnly === "boolean" &&
      typeof (value as FilterState).accessible === "boolean" &&
      typeof (value as FilterState).babyStation === "boolean"
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

const toBoundsKey = (bounds: MapBounds) =>
  `${bounds.minLat.toFixed(4)}:${bounds.maxLat.toFixed(4)}:${bounds.minLng.toFixed(4)}:${bounds.maxLng.toFixed(4)}`;
const MOBILE_SHEET_COLLAPSED_VISIBLE_PX = 54;
const MOBILE_SHEET_DEFAULT_VISIBLE_RATIO = 0.5;
const MOBILE_SHEET_EXPANDED_VISIBLE_RATIO = 0.84;
const MOBILE_SHEET_MAX_HEIGHT_RATIO = 0.86;
const MOBILE_SHEET_SWIPE_VELOCITY_THRESHOLD = 0.55;
const MOBILE_SHEET_INTERACTION_COOLDOWN_MS = 320;
const BOUNDS_FETCH_DEBOUNCE_MS = 80;
const USER_NEARBY_FETCH_LIMIT = 120;
const USER_NEARBY_LOCATION_KEY_PRECISION = 4;
const topPickAccessScore: Record<NearbyBathroom["access_type"], number> = {
  public: 12,
  customer_only: 6,
  code_required: 4,
  staff_assisted: 3
};
const topPickSignalScore: Record<string, number> = {
  clean: 1.5,
  no_line: 1.25,
  smelly: -1.5,
  crowded: -1,
  no_toilet_paper: -1.75,
  locked: -2
};
const RECOMMENDATION_NEARBY_RADIUS_MILES = 2.5;
const RECOMMENDATION_EXTENDED_RADIUS_MILES = 6;
const RECOMMENDATION_FALLBACK_RADIUS_MILES = 12;
const RECOMMENDATION_TITLE = "Closest in this area";
const RECOMMENDATION_USER_TITLE = "Closest to you";
const RECOMMENDATION_MAP_AREA_HELPER_TEXT = "Based on the visible map area until you use your location.";
const RECOMMENDATION_CLOSEST_USER_HELPER_TEXT = "The closest visible option from your current location.";
const RECOMMENDATION_CLOSEST_AREA_HELPER_TEXT = "The closest visible option in the current map area.";
const RECOMMENDATION_WRAPPER_CLASSNAME =
  "rounded-2xl border border-brand-300 bg-brand-50/90 p-3 shadow-lg ring-2 ring-brand-100";
const RECOMMENDATION_CARD_CLASSNAME = "border-brand-300 bg-white shadow-lg ring-1 ring-brand-100";

interface RecommendationResult {
  restroom: NearbyBathroom;
  originDistanceMiles: number;
}

interface RecommendationCandidate extends RecommendationResult {
  score: number;
}

interface FeaturedRecommendation {
  restroom: NearbyBathroom;
  title: string;
  helperText: string;
}

interface DistanceReference {
  origin: Coordinate | null;
  kind: DistanceReferenceKind | null;
  label: string | null;
}

interface MobileSheetMetrics {
  height: number;
  minOffset: number;
  maxOffset: number;
  offsets: Record<MobileSheetState, number>;
}

const clampNumber = (value: number, min: number, max: number) => {
  const lowerBound = Math.min(min, max);
  const upperBound = Math.max(min, max);
  return Math.max(lowerBound, Math.min(upperBound, value));
};

const getMobileSheetMetrics = (viewportHeight: number): MobileSheetMetrics => {
  const clampedViewportHeight = Math.max(480, viewportHeight);
  const maxHeight = clampNumber(
    Math.round(clampedViewportHeight * MOBILE_SHEET_MAX_HEIGHT_RATIO),
    320,
    clampedViewportHeight - 56
  );

  const collapsedVisible = Math.min(MOBILE_SHEET_COLLAPSED_VISIBLE_PX, maxHeight);
  const expandedVisible = clampNumber(Math.round(clampedViewportHeight * MOBILE_SHEET_EXPANDED_VISIBLE_RATIO), 360, maxHeight - 8);
  const defaultVisible = clampNumber(
    Math.round(clampedViewportHeight * MOBILE_SHEET_DEFAULT_VISIBLE_RATIO),
    280,
    expandedVisible - 72
  );

  const expandedOffset = Math.max(0, maxHeight - expandedVisible);
  const defaultOffset = clampNumber(maxHeight - defaultVisible, expandedOffset, maxHeight - collapsedVisible);
  const collapsedOffset = Math.max(defaultOffset, maxHeight - collapsedVisible);

  return {
    height: maxHeight,
    minOffset: expandedOffset,
    maxOffset: collapsedOffset,
    offsets: {
      collapsed: collapsedOffset,
      default: defaultOffset,
      expanded: expandedOffset
    }
  };
};

const getRecommendationScore = (restroom: NearbyBathroom, originDistanceMiles: number) => {
  const signalScore = restroom.ratings.qualitySignals.slice(0, 2).reduce((total, signal) => total + (topPickSignalScore[signal] ?? 0), 0);
  const reviewCountBonus = Math.min(restroom.ratings.reviewCount, 6) * 0.35;
  const ratingBonus = restroom.ratings.reviewCount > 0 ? restroom.ratings.overall * 1.5 : 0;

  return (
    100 -
    originDistanceMiles * 28 +
    topPickAccessScore[restroom.access_type] +
    signalScore +
    reviewCountBonus +
    (restroom.is_accessible ? 2 : 0) +
    (restroom.has_baby_station ? 0.75 : 0) +
    (!restroom.requires_purchase ? 1.5 : -2.5) +
    ratingBonus
  );
};

const compareRecommendationCandidates = (a: RecommendationCandidate, b: RecommendationCandidate) => {
  if (b.score !== a.score) {
    return b.score - a.score;
  }

  if (a.originDistanceMiles !== b.originDistanceMiles) {
    return a.originDistanceMiles - b.originDistanceMiles;
  }

  if (b.restroom.ratings.overall !== a.restroom.ratings.overall) {
    return b.restroom.ratings.overall - a.restroom.ratings.overall;
  }

  if (b.restroom.ratings.reviewCount !== a.restroom.ratings.reviewCount) {
    return b.restroom.ratings.reviewCount - a.restroom.ratings.reviewCount;
  }

  return a.restroom.name.localeCompare(b.restroom.name);
};

const buildRecommendationCandidates = (candidates: NearbyBathroom[], origin: Coordinate | null): RecommendationCandidate[] => {
  if (!origin || candidates.length === 0) {
    return [];
  }

  return candidates
    .map((restroom) => {
      const originDistanceMiles = roundToOne(haversineDistanceMiles(origin, { lat: restroom.lat, lng: restroom.lng }));
      return {
        restroom,
        originDistanceMiles,
        score: getRecommendationScore(restroom, originDistanceMiles)
      };
    })
    .filter(({ originDistanceMiles }) => Number.isFinite(originDistanceMiles) && originDistanceMiles >= 0);
};

const sortRestroomsByRecommendation = (candidates: NearbyBathroom[], origin: Coordinate | null) => {
  const recommendationCandidates = buildRecommendationCandidates(candidates, origin);
  if (recommendationCandidates.length === 0) {
    return [...candidates].sort((a, b) => {
      if (b.ratings.overall !== a.ratings.overall) {
        return b.ratings.overall - a.ratings.overall;
      }

      if (b.ratings.reviewCount !== a.ratings.reviewCount) {
        return b.ratings.reviewCount - a.ratings.reviewCount;
      }

      return a.name.localeCompare(b.name);
    });
  }

  return [...recommendationCandidates].sort(compareRecommendationCandidates).map(({ restroom }) => restroom);
};

const resolveClosestRestroom = (candidates: NearbyBathroom[], origin: Coordinate | null): RecommendationResult | null => {
  if (!origin || candidates.length === 0) {
    return null;
  }

  return (
    candidates
      .map((restroom) => ({
        restroom,
        originDistanceMiles: roundToOne(haversineDistanceMiles(origin, { lat: restroom.lat, lng: restroom.lng }))
      }))
      .filter(({ originDistanceMiles }) => Number.isFinite(originDistanceMiles) && originDistanceMiles >= 0)
      .sort((a, b) => {
        if (a.originDistanceMiles !== b.originDistanceMiles) {
          return a.originDistanceMiles - b.originDistanceMiles;
        }

        if (b.restroom.ratings.overall !== a.restroom.ratings.overall) {
          return b.restroom.ratings.overall - a.restroom.ratings.overall;
        }

        if (b.restroom.ratings.reviewCount !== a.restroom.ratings.reviewCount) {
          return b.restroom.ratings.reviewCount - a.restroom.ratings.reviewCount;
        }

        return a.restroom.name.localeCompare(b.restroom.name);
      })[0] ?? null
  );
};

const resolveClosestInAreaRecommendation = (candidates: NearbyBathroom[], origin: Coordinate | null): RecommendationResult | null => {
  const candidatesWithDistance = buildRecommendationCandidates(candidates, origin);

  if (candidatesWithDistance.length === 0) {
    return null;
  }

  const distanceSortedCandidates = [...candidatesWithDistance].sort((a, b) => {
    if (a.originDistanceMiles !== b.originDistanceMiles) {
      return a.originDistanceMiles - b.originDistanceMiles;
    }

    if (b.restroom.ratings.overall !== a.restroom.ratings.overall) {
      return b.restroom.ratings.overall - a.restroom.ratings.overall;
    }

    if (b.restroom.ratings.reviewCount !== a.restroom.ratings.reviewCount) {
      return b.restroom.ratings.reviewCount - a.restroom.ratings.reviewCount;
    }

    return a.restroom.name.localeCompare(b.restroom.name);
  });

  const nearbyCandidates = distanceSortedCandidates.filter(
    ({ originDistanceMiles }) => originDistanceMiles <= RECOMMENDATION_NEARBY_RADIUS_MILES
  );
  const extendedCandidates = distanceSortedCandidates.filter(
    ({ originDistanceMiles }) => originDistanceMiles <= RECOMMENDATION_EXTENDED_RADIUS_MILES
  );
  const fallbackCandidates = distanceSortedCandidates.filter(
    ({ originDistanceMiles }) => originDistanceMiles <= RECOMMENDATION_FALLBACK_RADIUS_MILES
  );
  const farAwayCandidates = distanceSortedCandidates.slice(0, 8);

  const scopedCandidates =
    nearbyCandidates.length > 0
      ? nearbyCandidates.slice(0, 8)
      : extendedCandidates.length > 0
        ? extendedCandidates.slice(0, 10)
        : fallbackCandidates.length > 0
          ? fallbackCandidates.slice(0, 10)
          : farAwayCandidates;

  if (scopedCandidates.length === 0) {
    return null;
  }

  return (
    [...scopedCandidates].sort(compareRecommendationCandidates)[0] ?? null
  );
};

export function NearbyExplorer({ initialRestrooms, showSignupValue = false }: NearbyExplorerProps) {
  const router = useRouter();
  const {
    currentLocation: userLocation,
    lastKnownLocation,
    geoError,
    isLocating,
    isLocationTrackingEnabled,
    isFollowingUserLocation,
    locationCenterRequestKey,
    hasActiveUserLocation,
    requestLocationTracking,
    stopLocationTracking,
    setIsFollowingUserLocation
  } = useLocationTracking();
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [isExpandedListOpen, setIsExpandedListOpen] = useState(true);
  const [mobileSheetState, setMobileSheetState] = useState<MobileSheetState>("default");
  const [listHoveredRestroomId, setListHoveredRestroomId] = useState<string | null>(null);
  const [mapFocusedRestroomId, setMapFocusedRestroomId] = useState<string | null>(null);
  const [selectedRestroomId, setSelectedRestroomId] = useState<string | null>(null);
  const [mapCamera, setMapCamera] = useState<MapCamera | null>(null);
  const [selectedSearchPlace, setSelectedSearchPlace] = useState<PlaceSearchResult | null>(null);
  const [referenceMode, setReferenceMode] = useState<DistanceReferenceMode>(() =>
    isLocationTrackingEnabled && isFollowingUserLocation ? "user" : "browse"
  );
  const [searchCameraRequestKey, setSearchCameraRequestKey] = useState(0);
  const [sortMode, setSortMode] = useState<SortMode>("recommended");
  const [recentlyViewedRestrooms, setRecentlyViewedRestrooms] = useState<RecentRestroomSnapshot[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    publicOnly: false,
    accessible: false,
    babyStation: false
  });
  const [isHomeStateReady, setIsHomeStateReady] = useState(false);
  const [mapRestrooms, setMapRestrooms] = useState<NearbyBathroom[]>(initialRestrooms);
  const isLocationFollowing = isLocationTrackingEnabled && referenceMode === "user";
  const isLocationTrackingPaused = isLocationTrackingEnabled && !isLocationFollowing;

  const activeBoundsRequestIdRef = useRef(0);
  const boundsRequestAbortControllerRef = useRef<AbortController | null>(null);
  const boundsFetchDebounceTimeoutRef = useRef<number | null>(null);
  const lastRequestedBoundsKeyRef = useRef<string>("");
  const lastAppliedBoundsKeyRef = useRef<string>("");
  const activeNearbyRequestIdRef = useRef(0);
  const latestNearbyLocationKeyRef = useRef("");
  const invalidBoundsCoordinatesLogKeyRef = useRef<string>("");
  const distanceReferenceLogKeyRef = useRef("");
  const mapCameraRef = useRef<MapCamera | null>(null);
  const hasHydratedMapStateRef = useRef(false);
  const lockedScrollYRef = useRef(0);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const pendingExpandedMapScrollRestoreRef = useRef<number | null>(null);
  const hasCapturedExpandScrollRef = useRef(false);
  const mobileSheetRef = useRef<HTMLDivElement | null>(null);
  const primaryLocationActionRef = useRef<HTMLDivElement | null>(null);
  const mapSectionRef = useRef<HTMLElement | null>(null);
  const mobileSheetAnimationFrameRef = useRef<number | null>(null);
  const mobileSheetPendingOffsetRef = useRef<number | null>(null);
  const mobileSheetCurrentOffsetRef = useRef(0);
  const mobileSheetMetricsRef = useRef<MobileSheetMetrics | null>(null);
  const mobileSheetTouchStartYRef = useRef<number | null>(null);
  const mobileSheetTouchStartOffsetRef = useRef<number | null>(null);
  const mobileSheetTouchStartTimeRef = useRef<number | null>(null);
  const mobileSheetListTouchStartYRef = useRef<number | null>(null);
  const mobileSheetListTouchStartOffsetRef = useRef<number | null>(null);
  const mobileSheetListTouchStartTimeRef = useRef<number | null>(null);
  const mobileSheetListDidPullRef = useRef(false);
  const mobileSheetDidDragRef = useRef(false);
  const mobileSheetDragResetTimeoutRef = useRef<number | null>(null);
  const mobileSheetInteractionTimeoutRef = useRef<number | null>(null);
  const hasSeenInitialViewportBoundsRef = useRef(false);
  const expandedMobileRecommendationTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const expandedMobileRecommendationDidMoveRef = useRef(false);
  const didHandleExpandedMobileRecommendationTouchTapRef = useRef(false);
  const [mobilePreviewPhotoByRestroomId, setMobilePreviewPhotoByRestroomId] = useState<Record<string, string | null>>({});
  const [isMobilePreviewLayout, setIsMobilePreviewLayout] = useState(false);
  const [isPrimaryLocationActionVisible, setIsPrimaryLocationActionVisible] = useState(true);
  const [isMobileSheetInteractionLocked, setIsMobileSheetInteractionLocked] = useState(false);
  const [hasStartedBrowsing, setHasStartedBrowsing] = useState(false);
  const activeUserLocation = hasActiveUserLocation ? userLocation : null;
  const searchCameraTarget = useMemo<MapCamera | null>(() => {
    if (!selectedSearchPlace) {
      return null;
    }

    return {
      lat: selectedSearchPlace.lat,
      lng: selectedSearchPlace.lng,
      zoom: selectedSearchPlace.zoom
    };
  }, [selectedSearchPlace]);
  const selectedPlaceDistanceLabel = selectedSearchPlace?.name ?? selectedSearchPlace?.fullName ?? null;

  useEffect(() => {
    if (!isLocationFollowing || !activeUserLocation) {
      latestNearbyLocationKeyRef.current = "";
      activeNearbyRequestIdRef.current += 1;
      return;
    }

    const nextLocationKey = `${activeUserLocation.lat.toFixed(USER_NEARBY_LOCATION_KEY_PRECISION)}:${activeUserLocation.lng.toFixed(
      USER_NEARBY_LOCATION_KEY_PRECISION
    )}`;
    if (nextLocationKey === latestNearbyLocationKeyRef.current) {
      return;
    }

    latestNearbyLocationKeyRef.current = nextLocationKey;
    const requestId = activeNearbyRequestIdRef.current + 1;
    activeNearbyRequestIdRef.current = requestId;
    const controller = new AbortController();
    const params = new URLSearchParams({
      lat: activeUserLocation.lat.toString(),
      lng: activeUserLocation.lng.toString(),
      limit: USER_NEARBY_FETCH_LIMIT.toString()
    });

    if (process.env.NODE_ENV !== "production") {
      console.debug("[Poopin] Fetching nearby restrooms from live user location.", {
        location: {
          lat: Number(activeUserLocation.lat.toFixed(5)),
          lng: Number(activeUserLocation.lng.toFixed(5))
        },
        referenceSource: "user",
        limit: USER_NEARBY_FETCH_LIMIT
      });
    }

    void fetch(`/api/restrooms/nearby?${params.toString()}`, {
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to fetch nearby restrooms for live location.");
        }

        return (await response.json()) as NearbyApiResponse;
      })
      .then((payload) => {
        if (requestId !== activeNearbyRequestIdRef.current || !Array.isArray(payload.restrooms)) {
          return;
        }

        setMapRestrooms(payload.restrooms);

        if (process.env.NODE_ENV !== "production") {
          console.debug("[Poopin] Applied nearby restrooms from live user location.", {
            locationKey: nextLocationKey,
            restroomCount: payload.restrooms.length,
            featuredCandidateId: payload.restrooms[0]?.id ?? null
          });
        }
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name === "AbortError") {
          return;
        }

        if (process.env.NODE_ENV !== "production") {
          console.warn("[Poopin] Nearby user-location refresh failed. Keeping current viewport dataset.", {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });

    return () => {
      controller.abort();
    };
  }, [activeUserLocation, isLocationFollowing]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && boundsFetchDebounceTimeoutRef.current !== null) {
        window.clearTimeout(boundsFetchDebounceTimeoutRef.current);
      }
      boundsFetchDebounceTimeoutRef.current = null;
      boundsRequestAbortControllerRef.current?.abort();
      boundsRequestAbortControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isLocationTrackingEnabled) {
      setReferenceMode("browse");
      return;
    }

    if (isFollowingUserLocation) {
      setReferenceMode("user");
    }
  }, [isFollowingUserLocation, isLocationTrackingEnabled]);

  const userDistanceOrigin = useMemo<Coordinate | null>(() => {
    if (!isLocationFollowing) {
      return null;
    }

    if (userLocation && isValidMapCoordinate(userLocation.lat, userLocation.lng)) {
      return userLocation;
    }

    if (lastKnownLocation && isValidMapCoordinate(lastKnownLocation.lat, lastKnownLocation.lng)) {
      return lastKnownLocation;
    }

    return activeUserLocation;
  }, [activeUserLocation, isLocationFollowing, lastKnownLocation, userLocation]);
  const distanceReference = useMemo<DistanceReference>(() => {
    if (isLocationFollowing) {
      if (userDistanceOrigin) {
        return {
          origin: userDistanceOrigin,
          kind: "user",
          label: null
        };
      }

      return {
        origin: null,
        kind: null,
        label: null
      };
    }

    if (mapCamera && isValidMapCoordinate(mapCamera.lat, mapCamera.lng)) {
      return {
        origin: {
          lat: mapCamera.lat,
          lng: mapCamera.lng
        },
        kind: "map",
        label: null
      };
    }

    if (searchCameraTarget) {
      return {
        origin: {
          lat: searchCameraTarget.lat,
          lng: searchCameraTarget.lng
        },
        kind: "place",
        label: selectedPlaceDistanceLabel
      };
    }

    if (activeUserLocation) {
      return {
        origin: activeUserLocation,
        kind: "user",
        label: null
      };
    }

    return {
      origin: null,
      kind: null,
      label: null
    };
  }, [activeUserLocation, isLocationFollowing, mapCamera, searchCameraTarget, selectedPlaceDistanceLabel, userDistanceOrigin]);
  // Reference model:
  // - `browseOrigin` drives the featured recommendation and the "recommended" list order.
  // - `listDisplayOrigin` drives the miles shown on list cards and the "nearest" list order when a live user location is available.
  // QA checklist:
  // - "Closest in this area" should stay tied to browse origin.
  // - "Nearest" should match the miles shown on list cards.
  // - "Recommended" should stay stable for the same viewport on desktop and mobile.
  const browseOrigin = distanceReference.origin;
  const showReferenceDistance = Boolean(distanceReference.origin);
  const recommendationModeSource = isLocationFollowing ? "user" : distanceReference.kind ? "browse" : "none";
  const listDisplayOrigin = activeUserLocation && isValidMapCoordinate(activeUserLocation.lat, activeUserLocation.lng) ? activeUserLocation : null;
  const listDistanceReferenceKind: DistanceReferenceKind | null = listDisplayOrigin ? "user" : distanceReference.kind;
  const listDistanceReferenceLabel = listDisplayOrigin ? null : distanceReference.label;
  const showListDistance = Boolean(listDisplayOrigin || distanceReference.origin);
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
    if (!browseOrigin) {
      return [...mapRenderableRestrooms];
    }

    return [...mapRenderableRestrooms].map((restroom) => ({
      ...restroom,
      distanceMiles: roundToOne(haversineDistanceMiles(browseOrigin, { lat: restroom.lat, lng: restroom.lng }))
    }));
  }, [browseOrigin, mapRenderableRestrooms]);
  const mapDisplayRestrooms = listBaseRestrooms;

  const filteredRestrooms = useMemo(
    () =>
      listBaseRestrooms.filter((restroom) => {
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
      }),
    [filters, listBaseRestrooms]
  );
  const listUserDistanceByRestroomId = useMemo<Record<string, number>>(() => {
    if (!listDisplayOrigin) {
      return {};
    }

    return Object.fromEntries(
      filteredRestrooms.map((restroom) => [
        restroom.id,
        roundToOne(haversineDistanceMiles(listDisplayOrigin, { lat: restroom.lat, lng: restroom.lng }))
      ])
    );
  }, [filteredRestrooms, listDisplayOrigin]);

  const listRestrooms = useMemo(() => {
    const filtered = filteredRestrooms;

    if (sortMode === "closest") {
      return [...filtered]
        .sort((a, b) => {
          const aDistanceMiles = listDisplayOrigin ? listUserDistanceByRestroomId[a.id] ?? Number.POSITIVE_INFINITY : a.distanceMiles;
          const bDistanceMiles = listDisplayOrigin ? listUserDistanceByRestroomId[b.id] ?? Number.POSITIVE_INFINITY : b.distanceMiles;

          if (aDistanceMiles !== bDistanceMiles) {
            return aDistanceMiles - bDistanceMiles;
          }

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

    if (sortMode === "recommended") {
      return sortRestroomsByRecommendation(filtered, browseOrigin).slice(0, LIST_LIMIT);
    }

    return filtered.slice(0, LIST_LIMIT);
  }, [browseOrigin, filteredRestrooms, listDisplayOrigin, listUserDistanceByRestroomId, sortMode]);
  const listDisplayDistanceByRestroomId = useMemo<Record<string, number>>(() => {
    if (!listDisplayOrigin) {
      return {};
    }

    return Object.fromEntries(
      listRestrooms.map((restroom) => [restroom.id, listUserDistanceByRestroomId[restroom.id] ?? restroom.distanceMiles])
    );
  }, [listDisplayOrigin, listRestrooms, listUserDistanceByRestroomId]);
  const getUserDisplayDistanceMiles = useCallback(
    (restroom: NearbyBathroom) => {
      if (!listDisplayOrigin) {
        return null;
      }

      return roundToOne(haversineDistanceMiles(listDisplayOrigin, { lat: restroom.lat, lng: restroom.lng }));
    },
    [listDisplayOrigin]
  );

  const recommendationOrigin = distanceReference.origin;

  const recommendation = useMemo<RecommendationResult | null>(() => {
    return resolveClosestInAreaRecommendation(filteredRestrooms, recommendationOrigin);
  }, [filteredRestrooms, recommendationOrigin]);
  const topPickRestroom = recommendation?.restroom ?? null;
  const closestUserRestroom = useMemo(
    () => resolveClosestRestroom(filteredRestrooms, listDisplayOrigin)?.restroom ?? null,
    [filteredRestrooms, listDisplayOrigin]
  );
  const closestBrowseRestroom = useMemo(
    () => resolveClosestRestroom(filteredRestrooms, browseOrigin)?.restroom ?? null,
    [browseOrigin, filteredRestrooms]
  );
  const featuredRecommendation = useMemo<FeaturedRecommendation | null>(() => {
    if (closestUserRestroom) {
      return {
        restroom: closestUserRestroom,
        title: RECOMMENDATION_USER_TITLE,
        helperText: RECOMMENDATION_CLOSEST_USER_HELPER_TEXT
      };
    }

    if (closestBrowseRestroom) {
      return {
        restroom: closestBrowseRestroom,
        title: RECOMMENDATION_TITLE,
        helperText: RECOMMENDATION_CLOSEST_AREA_HELPER_TEXT
      };
    }

    if (!topPickRestroom) {
      return null;
    }

    return {
      restroom: topPickRestroom,
      title: RECOMMENDATION_TITLE,
      helperText: RECOMMENDATION_MAP_AREA_HELPER_TEXT
    };
  }, [closestBrowseRestroom, closestUserRestroom, topPickRestroom]);
  const featuredRestroom = featuredRecommendation?.restroom ?? null;
  const expandedMapRecommendation = featuredRestroom;
  const mapVisibleRestroomIds = useMemo(() => new Set(mapDisplayRestrooms.map((restroom) => restroom.id)), [mapDisplayRestrooms]);

  const restroomLookup = useMemo(() => {
    const lookup = new Map<string, NearbyBathroom>();
    for (const restroom of [...initialRestrooms, ...mapRestrooms, ...listBaseRestrooms, ...listRestrooms]) {
      lookup.set(restroom.id, restroom);
    }
    return lookup;
  }, [initialRestrooms, listBaseRestrooms, listRestrooms, mapRestrooms]);

  const recentRestroomsForDisplay = useMemo(() => {
    const seenRestroomIds = new Set<string>();
    const restroomsForDisplay: RecentRestroomSnapshot[] = [];

    for (const restroom of recentlyViewedRestrooms) {
      if (restroom.id === featuredRestroom?.id || seenRestroomIds.has(restroom.id)) {
        continue;
      }

      seenRestroomIds.add(restroom.id);
      restroomsForDisplay.push(restroom);
    }

    return restroomsForDisplay;
  }, [featuredRestroom?.id, recentlyViewedRestrooms]);

  const listHelperText = useMemo(() => {
    if (!distanceReference.origin) {
      if (isLocationFollowing) {
        return "Waiting for your live location so we can show nearby restrooms around you.";
      }

      return "Showing the currently visible map area. Move the map or search another area to browse nearby restrooms.";
    }

    if (isLocationFollowing) {
      if (sortMode === "closest") {
        return "Showing the currently visible map area. Sorted by straight-line distance from your live location.";
      }

      return "Showing the currently visible map area. Ranked by quick quality signals near your location.";
    }

    if (listDisplayOrigin) {
      if (sortMode === "closest") {
        return "Showing the currently visible map area. Sorted by straight-line distance from your location.";
      }

      return "Showing the currently visible map area. Ranked for this area while distance labels stay tied to your location.";
    }

    if (sortMode === "closest") {
      if (distanceReference.kind === "place") {
        return "Showing the currently visible map area. Sorted by straight-line distance from the searched area.";
      }

      return "Showing the currently visible map area. Sorted by straight-line distance from map center.";
    }

    if (distanceReference.kind === "place") {
      return "Showing the currently visible map area. Ranked by quick quality signals near the searched area.";
    }

    return "Showing the currently visible map area. Ranked by quick quality signals near map center.";
  }, [distanceReference.kind, distanceReference.origin, isLocationFollowing, listDisplayOrigin, sortMode]);

  const highlightedListRestroomId = isMobilePreviewLayout ? selectedRestroomId : listHoveredRestroomId ?? mapFocusedRestroomId;
  const isRailRestroomHighlighted = useCallback(
    (restroomId: string) => mapVisibleRestroomIds.has(restroomId) && highlightedListRestroomId === restroomId,
    [highlightedListRestroomId, mapVisibleRestroomIds]
  );
  const handleRailRestroomHoverChange = useCallback(
    (restroomId: string, isHovering: boolean) => {
      if (isMobilePreviewLayout) {
        return;
      }

      if (isHovering) {
        if (!mapVisibleRestroomIds.has(restroomId)) {
          return;
        }

        setListHoveredRestroomId(restroomId);
        return;
      }

      setListHoveredRestroomId((current) => (current === restroomId ? null : current));
    },
    [isMobilePreviewLayout, mapVisibleRestroomIds]
  );
  const handleRailRestroomFocusChange = useCallback(
    (restroomId: string, isFocused: boolean) => {
      if (isMobilePreviewLayout) {
        return;
      }

      if (isFocused) {
        if (!mapVisibleRestroomIds.has(restroomId)) {
          return;
        }

        setMapFocusedRestroomId(restroomId);
        return;
      }

      setMapFocusedRestroomId((current) => (current === restroomId ? null : current));
    },
    [isMobilePreviewLayout, mapVisibleRestroomIds]
  );
  const handleRailRestroomBlur = useCallback(
    (restroomId: string, event: ReactFocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        handleRailRestroomFocusChange(restroomId, false);
      }
    },
    [handleRailRestroomFocusChange]
  );
  const selectedMapRestroom = useMemo(
    () => (selectedRestroomId ? mapDisplayRestrooms.find((restroom) => restroom.id === selectedRestroomId) ?? null : null),
    [mapDisplayRestrooms, selectedRestroomId]
  );
  const selectedMapRestroomId = selectedMapRestroom?.id ?? null;
  const selectedMapRestroomPreviewPhotoUrl =
    selectedMapRestroom?.previewPhotoUrl !== undefined
      ? selectedMapRestroom.previewPhotoUrl
      : selectedMapRestroomId
        ? mobilePreviewPhotoByRestroomId[selectedMapRestroomId] ?? null
        : null;

  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return;
    }

    const originKey = browseOrigin ? `${browseOrigin.lat.toFixed(5)}:${browseOrigin.lng.toFixed(5)}` : "none";
    const mapCameraKey = mapCamera ? `${mapCamera.lat.toFixed(5)}:${mapCamera.lng.toFixed(5)}@${mapCamera.zoom.toFixed(2)}` : "none";
    const nextLogKey = [
      isLocationTrackingEnabled ? "tracking" : "not_tracking",
      isFollowingUserLocation ? "provider_following" : "provider_not_following",
      referenceMode,
      hasActiveUserLocation ? "active_user" : "no_active_user",
      distanceReference.kind ?? "none",
      originKey,
      mapCameraKey,
      selectedSearchPlace?.id ?? "no_place",
      selectedMapRestroomId ?? "no_selected_restroom",
      featuredRestroom?.id ?? "no_featured"
    ].join("|");

    if (nextLogKey === distanceReferenceLogKeyRef.current) {
      return;
    }

    distanceReferenceLogKeyRef.current = nextLogKey;
    console.debug("[Poopin] Explorer distance reference", {
      userLocation: userLocation
        ? {
            lat: Number(userLocation.lat.toFixed(5)),
            lng: Number(userLocation.lng.toFixed(5))
          }
        : null,
      lastKnownLocation: lastKnownLocation
        ? {
            lat: Number(lastKnownLocation.lat.toFixed(5)),
            lng: Number(lastKnownLocation.lng.toFixed(5))
          }
        : null,
      isLocationTrackingEnabled,
      providerFollowingUserLocation: isFollowingUserLocation,
      referenceMode,
      isLocationFollowing,
      hasActiveUserLocation,
      selectedSearchPlace: selectedSearchPlace?.fullName ?? null,
      mapCamera: mapCamera
        ? {
            lat: Number(mapCamera.lat.toFixed(5)),
            lng: Number(mapCamera.lng.toFixed(5)),
            zoom: Number(mapCamera.zoom.toFixed(2))
          }
        : null,
      distanceReference: {
        kind: distanceReference.kind,
        origin: browseOrigin
          ? {
              lat: Number(browseOrigin.lat.toFixed(5)),
              lng: Number(browseOrigin.lng.toFixed(5))
            }
          : null
      },
      distanceReferenceSource: isLocationFollowing ? "user" : distanceReference.kind ?? "none",
      recommendationModeSource,
      areaRecommendationCard: topPickRestroom
        ? {
            id: topPickRestroom.id,
            distanceMiles: topPickRestroom.distanceMiles
          }
        : null,
      featuredCard: featuredRestroom
        ? {
            id: featuredRestroom.id,
            sortMode
          }
        : null,
      listSample: listRestrooms.slice(0, 3).map((restroom) => ({
        id: restroom.id,
        browseDistanceMiles: restroom.distanceMiles,
        displayDistanceMiles: listDisplayOrigin ? listUserDistanceByRestroomId[restroom.id] ?? null : null
      })),
      mobilePreviewRestroomId: selectedMapRestroomId
    });
  }, [
    browseOrigin,
    distanceReference.kind,
    hasActiveUserLocation,
    isFollowingUserLocation,
    isLocationFollowing,
    isLocationTrackingEnabled,
    lastKnownLocation,
    featuredRestroom,
    listDisplayOrigin,
    listUserDistanceByRestroomId,
    listRestrooms,
    mapCamera,
    recommendationModeSource,
    referenceMode,
    sortMode,
    selectedMapRestroomId,
    selectedSearchPlace?.fullName,
    selectedSearchPlace?.id,
    topPickRestroom,
    userLocation
  ]);

  const isMobileExpandedSheetWinning =
    isMapExpanded && isMobilePreviewLayout && (mobileSheetState !== "collapsed" || isMobileSheetInteractionLocked);
  const resolvedMobileExpandedOverlayMode = useMemo<MobileExpandedOverlayMode>(() => {
    if (!isMapExpanded || !isMobilePreviewLayout) {
      return "none";
    }

    if (isMobileExpandedSheetWinning) {
      return "sheet";
    }

    if (selectedMapRestroom) {
      return "selected";
    }

    return "none";
  }, [
    isMapExpanded,
    isMobileExpandedSheetWinning,
    isMobilePreviewLayout,
    selectedMapRestroom
  ]);
  const shouldShowExpandedMapTopPick =
    isMapExpanded && expandedMapRecommendation && !mapFocusedRestroomId && !isMobilePreviewLayout && !isExpandedListOpen;

  const clearMobileSheetInteractionTimeout = useCallback(() => {
    if (typeof window === "undefined" || mobileSheetInteractionTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(mobileSheetInteractionTimeoutRef.current);
    mobileSheetInteractionTimeoutRef.current = null;
  }, []);

  const lockMobileSheetInteraction = useCallback(() => {
    if (!isMobilePreviewLayout) {
      return;
    }

    clearMobileSheetInteractionTimeout();
    setIsMobileSheetInteractionLocked(true);
    setHasStartedBrowsing(true);
  }, [clearMobileSheetInteractionTimeout, isMobilePreviewLayout]);

  const settleMobileSheetInteraction = useCallback(
    (delayMs = MOBILE_SHEET_INTERACTION_COOLDOWN_MS) => {
      if (!isMobilePreviewLayout || typeof window === "undefined") {
        return;
      }

      clearMobileSheetInteractionTimeout();
      setIsMobileSheetInteractionLocked(true);
      mobileSheetInteractionTimeoutRef.current = window.setTimeout(() => {
        mobileSheetInteractionTimeoutRef.current = null;
        setIsMobileSheetInteractionLocked(false);
      }, delayMs);
    },
    [clearMobileSheetInteractionTimeout, isMobilePreviewLayout]
  );

  const handleExpandMap = () => {
    if (typeof window !== "undefined") {
      lockedScrollYRef.current = window.scrollY;
      hasCapturedExpandScrollRef.current = true;
    }

    setHasStartedBrowsing(true);
    captureAnalyticsEvent("expand_map_clicked", {
      source: "homepage_map",
      source_surface: "homepage_controls",
      viewport_mode: "homepage",
      has_user_location: hasActiveUserLocation
    });
    setIsExpandedListOpen(true);
    setMobileSheetState("default");
    setIsMapExpanded(true);
  };

  const focusExpandedRecommendation = useCallback(
    (restroomId: string) => {
      if (!mapVisibleRestroomIds.has(restroomId)) {
        return;
      }

      if (isMobilePreviewLayout) {
        setHasStartedBrowsing(true);
        settleMobileSheetInteraction();
        setSelectedRestroomId(restroomId);
        setMapFocusedRestroomId(null);
        setListHoveredRestroomId(null);
        setMobileSheetState("collapsed");
        return;
      }

      setMapFocusedRestroomId(restroomId);
      setSelectedRestroomId(null);
      setListHoveredRestroomId(null);
    },
    [isMobilePreviewLayout, mapVisibleRestroomIds, settleMobileSheetInteraction]
  );

  const scheduleMobileSheetOffset = useCallback((offset: number, animated: boolean) => {
    const sheetElement = mobileSheetRef.current;
    if (!sheetElement || typeof window === "undefined") {
      return;
    }

    if (animated) {
      if (mobileSheetAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(mobileSheetAnimationFrameRef.current);
        mobileSheetAnimationFrameRef.current = null;
      }

      mobileSheetPendingOffsetRef.current = null;
      sheetElement.style.transition = "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";
      sheetElement.style.transform = `translateY(${offset}px)`;
      mobileSheetCurrentOffsetRef.current = offset;
      return;
    }

    mobileSheetPendingOffsetRef.current = offset;
    if (mobileSheetAnimationFrameRef.current !== null) {
      return;
    }

    mobileSheetAnimationFrameRef.current = window.requestAnimationFrame(() => {
      mobileSheetAnimationFrameRef.current = null;
      const nextOffset = mobileSheetPendingOffsetRef.current;
      const currentSheet = mobileSheetRef.current;
      if (nextOffset === null || !currentSheet) {
        return;
      }

      currentSheet.style.transition = "none";
      currentSheet.style.transform = `translateY(${nextOffset}px)`;
      mobileSheetCurrentOffsetRef.current = nextOffset;
      mobileSheetPendingOffsetRef.current = null;
    });
  }, []);

  const applyMobileSheetState = useCallback(
    (state: MobileSheetState, animated: boolean) => {
      if (typeof window === "undefined") {
        return;
      }

      const sheetElement = mobileSheetRef.current;
      if (!sheetElement) {
        return;
      }

      const metrics = getMobileSheetMetrics(window.innerHeight);
      mobileSheetMetricsRef.current = metrics;
      sheetElement.style.height = `${metrics.height}px`;
      scheduleMobileSheetOffset(metrics.offsets[state], animated);
    },
    [scheduleMobileSheetOffset]
  );

  const collapseMobileSheetToSelectedPreview = useCallback(() => {
    clearMobileSheetInteractionTimeout();
    setIsMobileSheetInteractionLocked(false);
    mobileSheetTouchStartYRef.current = null;
    mobileSheetTouchStartOffsetRef.current = null;
    mobileSheetTouchStartTimeRef.current = null;
    mobileSheetListTouchStartYRef.current = null;
    mobileSheetListTouchStartOffsetRef.current = null;
    mobileSheetListTouchStartTimeRef.current = null;
    mobileSheetListDidPullRef.current = false;
    mobileSheetDidDragRef.current = false;

    if (typeof window !== "undefined" && mobileSheetDragResetTimeoutRef.current !== null) {
      window.clearTimeout(mobileSheetDragResetTimeoutRef.current);
      mobileSheetDragResetTimeoutRef.current = null;
    }

    setMobileSheetState("collapsed");
    applyMobileSheetState("collapsed", true);
  }, [applyMobileSheetState, clearMobileSheetInteractionTimeout]);

  const applyMobileExpandedRestroomSelection = useCallback(
    (restroomId: string) => {
      if (!mapVisibleRestroomIds.has(restroomId)) {
        return false;
      }

      setHasStartedBrowsing(true);
      setSelectedRestroomId(restroomId);
      setMapFocusedRestroomId(null);
      setListHoveredRestroomId(null);
      collapseMobileSheetToSelectedPreview();
      return true;
    },
    [collapseMobileSheetToSelectedPreview, mapVisibleRestroomIds]
  );

  const handleRailRestroomTouchSelect = useCallback(
    (restroomId: string) => {
      if (!mapVisibleRestroomIds.has(restroomId)) {
        return;
      }

      if (isMapExpanded && isMobilePreviewLayout && applyMobileExpandedRestroomSelection(restroomId)) {
        return;
      }

      setHasStartedBrowsing(true);
      if (isMobilePreviewLayout) {
        setSelectedRestroomId(restroomId);
        setMapFocusedRestroomId(null);
      } else {
        setMapFocusedRestroomId(restroomId);
        setSelectedRestroomId(null);
      }
      setListHoveredRestroomId(null);
      settleMobileSheetInteraction();
    },
    [
      applyMobileExpandedRestroomSelection,
      isMapExpanded,
      isMobilePreviewLayout,
      mapVisibleRestroomIds,
      settleMobileSheetInteraction
    ]
  );

  const getNearestMobileSheetState = useCallback((offset: number, metrics: MobileSheetMetrics): MobileSheetState => {
    const offsetEntries = Object.entries(metrics.offsets) as Array<[MobileSheetState, number]>;
    return offsetEntries.reduce<MobileSheetState>((closestState, [candidateState, candidateOffset]) => {
      const currentDelta = Math.abs(candidateOffset - offset);
      const closestDelta = Math.abs(metrics.offsets[closestState] - offset);
      return currentDelta < closestDelta ? candidateState : closestState;
    }, "default");
  }, []);

  const resolveMobileSheetSnapState = useCallback(
    (endOffset: number, deltaY: number, durationMs: number, metrics: MobileSheetMetrics): MobileSheetState => {
      const duration = Math.max(1, durationMs);
      const velocity = deltaY / duration;

      if (Math.abs(velocity) >= MOBILE_SHEET_SWIPE_VELOCITY_THRESHOLD) {
        return velocity < 0 ? "expanded" : "collapsed";
      }

      return getNearestMobileSheetState(endOffset, metrics);
    },
    [getNearestMobileSheetState]
  );

  const handleMobileSheetHandleTap = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    lockMobileSheetInteraction();

    if (mobileSheetDidDragRef.current) {
      if (typeof window !== "undefined" && mobileSheetDragResetTimeoutRef.current !== null) {
        window.clearTimeout(mobileSheetDragResetTimeoutRef.current);
        mobileSheetDragResetTimeoutRef.current = null;
      }
      mobileSheetDidDragRef.current = false;
      settleMobileSheetInteraction();
      return;
    }

    setMobileSheetState((current) => {
      if (current === "collapsed") {
        return "default";
      }
      if (current === "expanded") {
        return "default";
      }
      return "collapsed";
    });
    settleMobileSheetInteraction();
  }, [lockMobileSheetInteraction, settleMobileSheetInteraction]);

  const handleMobileSheetHandleTouchStart = useCallback(
    (event: TouchEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      lockMobileSheetInteraction();

      if (typeof window === "undefined") {
        return;
      }

      const metrics = getMobileSheetMetrics(window.innerHeight);
      mobileSheetMetricsRef.current = metrics;
      const sheetElement = mobileSheetRef.current;
      if (sheetElement) {
        sheetElement.style.height = `${metrics.height}px`;
      }

      const startY = event.touches[0]?.clientY;
      if (typeof startY !== "number") {
        mobileSheetTouchStartYRef.current = null;
        mobileSheetTouchStartOffsetRef.current = null;
        mobileSheetTouchStartTimeRef.current = null;
        return;
      }

      if (typeof window !== "undefined" && mobileSheetDragResetTimeoutRef.current !== null) {
        window.clearTimeout(mobileSheetDragResetTimeoutRef.current);
        mobileSheetDragResetTimeoutRef.current = null;
      }
      mobileSheetDidDragRef.current = false;
      mobileSheetTouchStartYRef.current = startY;
      mobileSheetTouchStartTimeRef.current = performance.now();
      const currentOffset =
        mobileSheetCurrentOffsetRef.current === 0 ? metrics.offsets[mobileSheetState] : mobileSheetCurrentOffsetRef.current;
      mobileSheetCurrentOffsetRef.current = currentOffset;
      mobileSheetTouchStartOffsetRef.current = currentOffset;
      scheduleMobileSheetOffset(currentOffset, false);
    },
    [lockMobileSheetInteraction, mobileSheetState, scheduleMobileSheetOffset]
  );

  const handleMobileSheetHandleTouchMove = useCallback(
    (event: TouchEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      lockMobileSheetInteraction();

      const startY = mobileSheetTouchStartYRef.current;
      const startOffset = mobileSheetTouchStartOffsetRef.current;
      if (typeof startY !== "number" || typeof startOffset !== "number") {
        return;
      }

      const touchY = event.touches[0]?.clientY;
      if (typeof touchY !== "number") {
        return;
      }

      const metrics = mobileSheetMetricsRef.current;
      if (!metrics) {
        return;
      }

      if (Math.abs(touchY - startY) > 4) {
        mobileSheetDidDragRef.current = true;
      }
      event.preventDefault();
      const nextOffset = clampNumber(startOffset + (touchY - startY), metrics.minOffset, metrics.maxOffset);
      scheduleMobileSheetOffset(nextOffset, false);
    },
    [lockMobileSheetInteraction, scheduleMobileSheetOffset]
  );

  const handleMobileSheetHandleTouchCancel = useCallback(() => {
    settleMobileSheetInteraction();
    const metrics = mobileSheetMetricsRef.current;
    mobileSheetTouchStartYRef.current = null;
    mobileSheetTouchStartOffsetRef.current = null;
    mobileSheetTouchStartTimeRef.current = null;
    mobileSheetDidDragRef.current = false;
    if (!metrics) {
      return;
    }

    const targetState = getNearestMobileSheetState(mobileSheetCurrentOffsetRef.current, metrics);
    setMobileSheetState(targetState);
  }, [getNearestMobileSheetState, settleMobileSheetInteraction]);

  const handleMobileSheetHandleTouchEnd = useCallback(
    (event: TouchEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      settleMobileSheetInteraction();

      const startY = mobileSheetTouchStartYRef.current;
      const startOffset = mobileSheetTouchStartOffsetRef.current;
      const startTime = mobileSheetTouchStartTimeRef.current;
      const metrics = mobileSheetMetricsRef.current;
      mobileSheetTouchStartYRef.current = null;
      mobileSheetTouchStartOffsetRef.current = null;
      mobileSheetTouchStartTimeRef.current = null;
      if (typeof startY !== "number" || typeof startOffset !== "number" || typeof startTime !== "number" || !metrics) {
        return;
      }

      const endY = event.changedTouches[0]?.clientY;
      if (typeof endY !== "number") {
        return;
      }

      const endOffset = clampNumber(startOffset + (endY - startY), metrics.minOffset, metrics.maxOffset);
      const targetState = resolveMobileSheetSnapState(endOffset, endY - startY, performance.now() - startTime, metrics);
      setMobileSheetState(targetState);

      if (mobileSheetDidDragRef.current && typeof window !== "undefined") {
        mobileSheetDragResetTimeoutRef.current = window.setTimeout(() => {
          mobileSheetDidDragRef.current = false;
          mobileSheetDragResetTimeoutRef.current = null;
        }, 260);
      }
    },
    [resolveMobileSheetSnapState, settleMobileSheetInteraction]
  );

  const handleMobileSheetContentTouchStart = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      event.stopPropagation();
      lockMobileSheetInteraction();

      if (typeof window === "undefined") {
        return;
      }

      const startY = event.touches[0]?.clientY;
      if (typeof startY !== "number") {
        mobileSheetListTouchStartYRef.current = null;
        mobileSheetListTouchStartOffsetRef.current = null;
        mobileSheetListTouchStartTimeRef.current = null;
        return;
      }

      const metrics = getMobileSheetMetrics(window.innerHeight);
      mobileSheetMetricsRef.current = metrics;
      const currentOffset =
        mobileSheetCurrentOffsetRef.current === 0 ? metrics.offsets[mobileSheetState] : mobileSheetCurrentOffsetRef.current;

      mobileSheetCurrentOffsetRef.current = currentOffset;
      mobileSheetListTouchStartYRef.current = startY;
      mobileSheetListTouchStartOffsetRef.current = currentOffset;
      mobileSheetListTouchStartTimeRef.current = performance.now();
      mobileSheetListDidPullRef.current = false;
    },
    [lockMobileSheetInteraction, mobileSheetState]
  );

  const handleMobileSheetContentTouchMove = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      event.stopPropagation();
      lockMobileSheetInteraction();

      const startY = mobileSheetListTouchStartYRef.current;
      const startOffset = mobileSheetListTouchStartOffsetRef.current;
      if (typeof startY !== "number" || typeof startOffset !== "number") {
        return;
      }

      const touchY = event.touches[0]?.clientY;
      if (typeof touchY !== "number") {
        return;
      }

      const metrics = mobileSheetMetricsRef.current;
      if (!metrics) {
        return;
      }

      const deltaY = touchY - startY;
      const isPullingDownFromTop = event.currentTarget.scrollTop <= 0 && deltaY > 0;
      if (!mobileSheetListDidPullRef.current && !isPullingDownFromTop) {
        return;
      }

      mobileSheetListDidPullRef.current = true;
      event.preventDefault();
      const nextOffset = clampNumber(startOffset + deltaY, metrics.minOffset, metrics.maxOffset);
      scheduleMobileSheetOffset(nextOffset, false);
    },
    [lockMobileSheetInteraction, scheduleMobileSheetOffset]
  );

  const finishMobileSheetContentTouchGesture = useCallback((event?: TouchEvent<HTMLDivElement>) => {
    event?.stopPropagation();
    settleMobileSheetInteraction();
    const metrics = mobileSheetMetricsRef.current;
    const didPullSheet = mobileSheetListDidPullRef.current;
    const startY = mobileSheetListTouchStartYRef.current;
    const startTime = mobileSheetListTouchStartTimeRef.current;
    mobileSheetListTouchStartYRef.current = null;
    mobileSheetListTouchStartOffsetRef.current = null;
    mobileSheetListTouchStartTimeRef.current = null;
    mobileSheetListDidPullRef.current = false;

    if (!didPullSheet || !metrics) {
      return;
    }

    const endY = event?.changedTouches?.[0]?.clientY ?? startY ?? 0;
    const deltaY = typeof startY === "number" ? endY - startY : 0;
    const duration = typeof startTime === "number" ? performance.now() - startTime : 0;
    const targetState = resolveMobileSheetSnapState(mobileSheetCurrentOffsetRef.current, deltaY, duration, metrics);
    setMobileSheetState(targetState);
  }, [resolveMobileSheetSnapState, settleMobileSheetInteraction]);

  const toggleFilter = (filterKey: keyof FilterState) => {
    setFilters((current) => ({
      ...current,
      [filterKey]: !current[filterKey]
    }));
  };

  const persistHomeMapState = useCallback(
    (overrides?: Partial<PersistedHomeMapState>) => {
      if (typeof window === "undefined") {
        return;
      }

      const payload: PersistedHomeMapState = {
        updatedAt: Date.now(),
        isMapExpanded,
        isExpandedListOpen,
        mapCamera: mapCameraRef.current,
        sortMode,
        filters,
        pendingRestore: false,
        scrollY: pendingExpandedMapScrollRestoreRef.current ?? window.scrollY,
        ...overrides
      };

      window.sessionStorage.setItem(HOME_MAP_STATE_STORAGE_KEY, JSON.stringify(payload));
    },
    [filters, isExpandedListOpen, isMapExpanded, sortMode]
  );

  useEffect(() => {
    if (typeof window === "undefined" || hasHydratedMapStateRef.current) {
      return;
    }

    hasHydratedMapStateRef.current = true;
    const rawState = window.sessionStorage.getItem(HOME_MAP_STATE_STORAGE_KEY);

    try {
      if (!rawState) {
        return;
      }

      const parsed = JSON.parse(rawState) as Partial<PersistedHomeMapState>;
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

      const restoredMapCamera = parsed.mapCamera ?? null;
      if (isValidMapCamera(restoredMapCamera)) {
        mapCameraRef.current = restoredMapCamera;
        setMapCamera(restoredMapCamera);
      }

      if (isValidSortMode(parsed.sortMode)) {
        setSortMode(parsed.sortMode);
      }

      if (isValidFilterState(parsed.filters)) {
        setFilters(parsed.filters);
      }

      if (parsed.pendingRestore && typeof parsed.scrollY === "number" && Number.isFinite(parsed.scrollY)) {
        pendingScrollRestoreRef.current = Math.max(0, parsed.scrollY);
      }
    } catch {
      window.sessionStorage.removeItem(HOME_MAP_STATE_STORAGE_KEY);
    } finally {
      setIsHomeStateReady(true);
    }
  }, []);

  useEffect(() => {
    setRecentlyViewedRestrooms(getRecentRestrooms());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") {
      return;
    }

    const element = primaryLocationActionRef.current;
    if (!element) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsPrimaryLocationActionVisible(entry?.isIntersecting ?? false);
      },
      {
        threshold: 0.35
      }
    );

    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleScroll = () => {
      if (window.scrollY > 140) {
        setHasStartedBrowsing(true);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !hasHydratedMapStateRef.current) {
      return;
    }
    persistHomeMapState();
  }, [isExpandedListOpen, isMapExpanded, mapCamera, persistHomeMapState]);

  useEffect(() => {
    if (!isHomeStateReady || typeof window === "undefined") {
      return;
    }

    if (pendingScrollRestoreRef.current === null) {
      return;
    }

    const targetScrollY = pendingScrollRestoreRef.current;
    pendingScrollRestoreRef.current = null;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: targetScrollY, left: 0, behavior: "auto" });
      });
    });

    persistHomeMapState({
      pendingRestore: false,
      scrollY: targetScrollY
    });
  }, [isHomeStateReady, persistHomeMapState]);

  useEffect(() => {
    if (!isMapExpanded) {
      return;
    }

    applyMobileSheetState(mobileSheetState, true);
  }, [applyMobileSheetState, isMapExpanded, mobileSheetState]);

  useEffect(() => {
    if (!isMapExpanded || typeof window === "undefined") {
      return;
    }

    const handleResize = () => {
      applyMobileSheetState(mobileSheetState, false);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [applyMobileSheetState, isMapExpanded, mobileSheetState]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQueryList = window.matchMedia("(max-width: 639px)");
    const syncLayout = () => {
      setIsMobilePreviewLayout(mediaQueryList.matches);
    };

    syncLayout();
    mediaQueryList.addEventListener("change", syncLayout);
    return () => {
      mediaQueryList.removeEventListener("change", syncLayout);
    };
  }, []);

  useEffect(() => {
    const likelyPreviewRestrooms = [
      selectedMapRestroom,
      featuredRestroom,
      topPickRestroom,
      ...listRestrooms.slice(0, 2)
    ].filter((restroom): restroom is NearbyBathroom => restroom !== null);

    const warmedRestroomIds = new Set<string>();
    let warmedCount = 0;
    for (const restroom of likelyPreviewRestrooms) {
      if (warmedRestroomIds.has(restroom.id)) {
        continue;
      }

      warmedRestroomIds.add(restroom.id);
      if (restroom.previewPhotoUrl === undefined) {
        continue;
      }

      primeRestroomPreviewPhoto(restroom.id, restroom.previewPhotoUrl);
      warmedCount += 1;
      if (warmedCount >= 3) {
        break;
      }
    }
  }, [featuredRestroom, listRestrooms, selectedMapRestroom, topPickRestroom]);

  useEffect(() => {
    const prioritizedPreviewRestroomIds = [
      selectedMapRestroomId,
      mapFocusedRestroomId,
      listHoveredRestroomId
    ].filter((value): value is string => Boolean(value));
    if (prioritizedPreviewRestroomIds.length === 0) {
      return;
    }

    const previewFetchFallbackIds: string[] = [];
    for (const restroomId of prioritizedPreviewRestroomIds) {
      const restroom = restroomLookup.get(restroomId);
      if (restroom?.previewPhotoUrl !== undefined) {
        primeRestroomPreviewPhoto(restroomId, restroom.previewPhotoUrl);
        continue;
      }

      previewFetchFallbackIds.push(restroomId);
    }

    // Mobile has a dedicated selected-preview fetch, and desktop hover already lazy-loads
    // on intent. Restricting prefetch to active interaction targets keeps the UX intact
    // while avoiding a large fan-out across every visible restroom in the list/map.
    if (previewFetchFallbackIds.length > 0) {
      prefetchRestroomPreviewPhotos(previewFetchFallbackIds, previewFetchFallbackIds.length);
    }
  }, [listHoveredRestroomId, mapFocusedRestroomId, restroomLookup, selectedMapRestroomId]);

  useEffect(() => {
    if (!isMobilePreviewLayout) {
      return;
    }

    if (!selectedMapRestroomId) {
      return;
    }

    const restroomId = selectedMapRestroomId;
    if (selectedMapRestroom?.previewPhotoUrl !== undefined) {
      primeRestroomPreviewPhoto(restroomId, selectedMapRestroom.previewPhotoUrl);
      return;
    }

    const cachedPhotoUrl = getCachedRestroomPreviewPhoto(restroomId);
    if (cachedPhotoUrl !== undefined) {
      setMobilePreviewPhotoByRestroomId((current) => {
        if (current[restroomId] === cachedPhotoUrl) {
          return current;
        }

        return {
          ...current,
          [restroomId]: cachedPhotoUrl
        };
      });
      return;
    }

    let cancelled = false;
    void fetchRestroomPreviewPhoto(restroomId).then((photoUrl) => {
      if (cancelled) {
        return;
      }

      setMobilePreviewPhotoByRestroomId((current) => {
        if (current[restroomId] === photoUrl) {
          return current;
        }

        return {
          ...current,
          [restroomId]: photoUrl
        };
      });
    });

    return () => {
      cancelled = true;
    };
  }, [isMobilePreviewLayout, selectedMapRestroom, selectedMapRestroomId]);

  useEffect(() => {
    if (!isMapExpanded || !isMobilePreviewLayout) {
      clearMobileSheetInteractionTimeout();
      setIsMobileSheetInteractionLocked(false);
      return;
    }
  }, [clearMobileSheetInteractionTimeout, isMapExpanded, isMobilePreviewLayout]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && mobileSheetAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(mobileSheetAnimationFrameRef.current);
      }
      mobileSheetAnimationFrameRef.current = null;
      mobileSheetPendingOffsetRef.current = null;
      if (typeof window !== "undefined" && mobileSheetDragResetTimeoutRef.current !== null) {
        window.clearTimeout(mobileSheetDragResetTimeoutRef.current);
      }
      mobileSheetDragResetTimeoutRef.current = null;
      if (typeof window !== "undefined" && mobileSheetInteractionTimeoutRef.current !== null) {
        window.clearTimeout(mobileSheetInteractionTimeoutRef.current);
      }
      mobileSheetInteractionTimeoutRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapFocusedRestroomId) {
      return;
    }

    const isFocusedRestroomVisible = mapRenderableRestrooms.some((restroom) => restroom.id === mapFocusedRestroomId);
    if (isFocusedRestroomVisible) {
      return;
    }

    setMapFocusedRestroomId(null);
    if (listHoveredRestroomId === mapFocusedRestroomId) {
      setListHoveredRestroomId(null);
    }
  }, [listHoveredRestroomId, mapFocusedRestroomId, mapRenderableRestrooms]);

  useEffect(() => {
    if (!selectedRestroomId) {
      return;
    }

    const isSelectedRestroomVisible = mapRenderableRestrooms.some((restroom) => restroom.id === selectedRestroomId);
    if (isSelectedRestroomVisible) {
      return;
    }

    setSelectedRestroomId(null);
  }, [mapRenderableRestrooms, selectedRestroomId]);

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
    const scrollYToLock = hasCapturedExpandScrollRef.current ? lockedScrollYRef.current : window.scrollY;
    lockedScrollYRef.current = scrollYToLock;
    hasCapturedExpandScrollRef.current = false;

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollYToLock}px`;
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
      pendingExpandedMapScrollRestoreRef.current = lockedScrollYRef.current;
    };
  }, [isMapExpanded]);

  useEffect(() => {
    if (isMapExpanded || typeof window === "undefined") {
      return;
    }

    const targetScrollY = pendingExpandedMapScrollRestoreRef.current;
    if (targetScrollY === null) {
      return;
    }

    pendingExpandedMapScrollRestoreRef.current = null;
    let secondFrameId: number | null = null;
    const firstFrameId = window.requestAnimationFrame(() => {
      secondFrameId = window.requestAnimationFrame(() => {
        window.scrollTo({ top: targetScrollY, left: 0, behavior: "auto" });
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrameId);
      if (secondFrameId !== null) {
        window.cancelAnimationFrame(secondFrameId);
      }
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

    const handlePageShow = (event: PageTransitionEvent) => {
      const navigationEntry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const isBackForwardNavigation = event.persisted || navigationEntry?.type === "back_forward";
      if (!isBackForwardNavigation) {
        return;
      }

      // Avoid stale "selected without popup" state when returning from detail pages.
      setSelectedRestroomId(null);
      setMapFocusedRestroomId(null);
      setListHoveredRestroomId(null);
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  const handleUseMyLocation = () => {
    setReferenceMode("user");
    setIsFollowingUserLocation(true);
    setSelectedSearchPlace(null);
    mapCameraRef.current = null;
    setMapCamera(null);
    setSelectedRestroomId(null);
    setMapFocusedRestroomId(null);
    setListHoveredRestroomId(null);
    const sourceSurface = isMapExpanded ? "expanded_map_controls" : "homepage_controls";
    const viewportMode = isMapExpanded ? "expanded_map" : "homepage";
    captureAnalyticsEvent("locate_clicked", {
      source_surface: sourceSurface,
      viewport_mode: viewportMode,
      has_user_location: hasActiveUserLocation,
      status: isLocationTrackingEnabled ? "recenter_requested" : "requested"
    });
    requestLocationTracking();
  };

  const handleStopLocationTracking = () => {
    setReferenceMode("browse");
    setSelectedRestroomId(null);
    setMapFocusedRestroomId(null);
    setListHoveredRestroomId(null);
    stopLocationTracking();
  };

  const handlePlaceSearchClear = useCallback(() => {
    setSelectedSearchPlace(null);
    setSelectedRestroomId(null);
    setMapFocusedRestroomId(null);
    setListHoveredRestroomId(null);
  }, []);

  const handlePlaceSearchSelect = useCallback(
    (place: PlaceSearchResult) => {
      setReferenceMode("browse");
      setSelectedSearchPlace(place);
      setSearchCameraRequestKey((current) => current + 1);
      setHasStartedBrowsing(true);
      setIsFollowingUserLocation(false);
      setSelectedRestroomId(null);
      setMapFocusedRestroomId(null);
      setListHoveredRestroomId(null);
    },
    [setIsFollowingUserLocation]
  );

  const handleLocationFollowChange = useCallback(
    (enabled: boolean) => {
      setReferenceMode(enabled ? "user" : "browse");
      setIsFollowingUserLocation(enabled);
    },
    [setIsFollowingUserLocation]
  );

  const handleViewportBoundsChange = useCallback((bounds: MapBounds) => {
    const nextBoundsKey = toBoundsKey(bounds);
    const isInitialViewportBounds = !hasSeenInitialViewportBoundsRef.current;

    if (isInitialViewportBounds) {
      hasSeenInitialViewportBoundsRef.current = true;
    } else {
      setHasStartedBrowsing(true);
    }

    const hasPendingDebounce = boundsFetchDebounceTimeoutRef.current !== null;
    const hasInFlightRequest = boundsRequestAbortControllerRef.current !== null;
    if (
      !hasPendingDebounce &&
      !hasInFlightRequest &&
      lastAppliedBoundsKeyRef.current === nextBoundsKey
    ) {
      return;
    }

    if (lastRequestedBoundsKeyRef.current === nextBoundsKey) {
      return;
    }

    const clearPendingBoundsDebounce = () => {
      if (typeof window !== "undefined" && boundsFetchDebounceTimeoutRef.current !== null) {
        window.clearTimeout(boundsFetchDebounceTimeoutRef.current);
      }
      boundsFetchDebounceTimeoutRef.current = null;
    };

    const startBoundsFetch = (requestBounds: MapBounds, requestBoundsKey: string) => {
      const previousController = boundsRequestAbortControllerRef.current;
      if (previousController) {
        previousController.abort();
      }

      const requestId = activeBoundsRequestIdRef.current + 1;
      activeBoundsRequestIdRef.current = requestId;
      const controller = new AbortController();
      boundsRequestAbortControllerRef.current = controller;
      lastRequestedBoundsKeyRef.current = requestBoundsKey;

      const params = new URLSearchParams({
        minLat: requestBounds.minLat.toString(),
        maxLat: requestBounds.maxLat.toString(),
        minLng: requestBounds.minLng.toString(),
        maxLng: requestBounds.maxLng.toString(),
        limit: "400"
      });

      let didApplyBounds = false;

      void fetch(`/api/restrooms/bounds?${params.toString()}`, {
        signal: controller.signal
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Failed to fetch map bounds restrooms.");
          }

          const payload = (await response.json()) as BoundsApiResponse;
          if (!Array.isArray(payload.restrooms)) {
            throw new Error("Invalid map bounds response.");
          }

          if (controller.signal.aborted || requestId !== activeBoundsRequestIdRef.current) {
            return;
          }

          setMapRestrooms(payload.restrooms);
          lastAppliedBoundsKeyRef.current = requestBoundsKey;
          didApplyBounds = true;
        })
        .catch((error: unknown) => {
          if ((error as { name?: string })?.name === "AbortError") {
            return;
          }

          // Keep previous map dataset on bounds fetch failure.
        })
        .finally(() => {
          if (boundsRequestAbortControllerRef.current === controller) {
            boundsRequestAbortControllerRef.current = null;
          }

          if (!didApplyBounds && requestId === activeBoundsRequestIdRef.current && lastRequestedBoundsKeyRef.current === requestBoundsKey) {
            lastRequestedBoundsKeyRef.current = "";
          }
        });
    };

    clearPendingBoundsDebounce();
    lastRequestedBoundsKeyRef.current = nextBoundsKey;

    if (isInitialViewportBounds || typeof window === "undefined") {
      startBoundsFetch(bounds, nextBoundsKey);
      return;
    }

    boundsRequestAbortControllerRef.current?.abort();
    boundsFetchDebounceTimeoutRef.current = window.setTimeout(() => {
      boundsFetchDebounceTimeoutRef.current = null;
      startBoundsFetch(bounds, nextBoundsKey);
    }, BOUNDS_FETCH_DEBOUNCE_MS);
  }, []);

  const handleMapCameraChange = useCallback((camera: MapCamera) => {
    mapCameraRef.current = camera;
    setMapCamera(camera);
  }, []);

  const handleNavigateToDetail = useCallback(
    (restroomId?: string) => {
      setHasStartedBrowsing(true);
      if (restroomId) {
        const restroom = restroomLookup.get(restroomId);
        if (restroom) {
          setRecentlyViewedRestrooms(storeRecentRestroom(restroom));
        }
      }

      persistHomeMapState({
        pendingRestore: true,
        scrollY: typeof window !== "undefined" ? window.scrollY : 0
      });
    },
    [persistHomeMapState, restroomLookup]
  );

  const handleMapHoveredRestroomIdChange = useCallback((restroomId: string | null) => {
    if (isMobilePreviewLayout) {
      return;
    }

    if (restroomId && !mapVisibleRestroomIds.has(restroomId)) {
      return;
    }

    setListHoveredRestroomId(restroomId);
  }, [isMobilePreviewLayout, mapVisibleRestroomIds]);

  const handleMapFocusedRestroomIdChange = useCallback((restroomId: string | null) => {
    if (isMobilePreviewLayout) {
      return;
    }

    if (restroomId) {
      setHasStartedBrowsing(true);
    }
    setMapFocusedRestroomId(restroomId);
    if (restroomId) {
      setSelectedRestroomId(null);
      setListHoveredRestroomId(null);
    }
  }, [isMobilePreviewLayout]);

  const handleMapSelectedRestroomIdChange = useCallback((restroomId: string | null) => {
    if (restroomId && isMapExpanded && isMobilePreviewLayout && applyMobileExpandedRestroomSelection(restroomId)) {
      return;
    }

    if (restroomId && isMapExpanded && isMobilePreviewLayout && isMobileSheetInteractionLocked) {
      return;
    }

    if (restroomId) {
      setHasStartedBrowsing(true);
    }

    setSelectedRestroomId(restroomId);
    setMapFocusedRestroomId(null);
    setListHoveredRestroomId(null);
  }, [
    applyMobileExpandedRestroomSelection,
    isMapExpanded,
    isMobilePreviewLayout,
    isMobileSheetInteractionLocked
  ]);

  const renderMobileMapPreviewCard = (variant: "default" | "expanded") => {
    if (!selectedMapRestroom) {
      return null;
    }

    const isExpandedVariant = variant === "expanded";
    if (isExpandedVariant && isMobilePreviewLayout && resolvedMobileExpandedOverlayMode !== "selected") {
      return null;
    }

    const bottomStyle = isExpandedVariant ? { bottom: "calc(env(safe-area-inset-bottom) + 84px)" } : undefined;

    return (
      <div
        className={cn(
          "pointer-events-none absolute inset-x-2.5 sm:hidden",
          isExpandedVariant ? "z-[12] transition-[bottom] duration-200 ease-out" : "bottom-3 z-[24]"
        )}
        style={bottomStyle}
      >
        <div className="pointer-events-auto mx-auto max-w-[430px]">
          <MobileRestroomPreviewCard
            restroom={selectedMapRestroom}
            showDistance={showReferenceDistance}
            distanceReferenceKind={distanceReference.kind}
            distanceReferenceLabel={distanceReference.label}
            hasUserLocation={hasActiveUserLocation}
            photoUrl={selectedMapRestroomPreviewPhotoUrl}
            viewportMode={isExpandedVariant ? "expanded_map" : "homepage"}
            onNavigateToDetail={handleNavigateToDetail}
          />
        </div>
      </div>
    );
  };

  const renderRecommendationSection = ({
    restroom,
    title,
    helperText,
    viewportMode,
    className,
    disablePointerEvents = false
  }: {
    restroom: NearbyBathroom;
    title: string;
    helperText: string;
    viewportMode: "homepage" | "expanded_map";
    className?: string;
    disablePointerEvents?: boolean;
  }) => {
    const isHighlighted = isRailRestroomHighlighted(restroom.id);
    const displayDistanceMiles = getUserDisplayDistanceMiles(restroom);

    return (
      <section
        className={cn(
          RECOMMENDATION_WRAPPER_CLASSNAME,
          disablePointerEvents && "pointer-events-none",
          className
        )}
      >
        <div className="mb-2.5 px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-800">{title}</p>
          <p className="mt-0.5 text-xs leading-5 text-slate-600">{helperText}</p>
        </div>

        <RestroomCard
          restroom={restroom}
          showDistance={showListDistance}
          displayDistanceMiles={displayDistanceMiles}
          distanceReferenceKind={listDistanceReferenceKind}
          distanceReferenceLabel={listDistanceReferenceLabel}
          isFeaturedRecommendation
          viewportMode={viewportMode}
          hasUserLocation={hasActiveUserLocation}
          isHighlighted={isHighlighted}
          onHoverChange={(isHovering) => handleRailRestroomHoverChange(restroom.id, isHovering)}
          onFocusChange={(isFocused) => handleRailRestroomFocusChange(restroom.id, isFocused)}
          onNavigateToDetail={handleNavigateToDetail}
          className={RECOMMENDATION_CARD_CLASSNAME}
        />
      </section>
    );
  };

  const renderTopPickCard = (variant: "mobile" | "desktop") => {
    if (!featuredRecommendation || !featuredRestroom) {
      return null;
    }

    const isDesktopVariant = variant === "desktop";
    if (!isDesktopVariant && selectedMapRestroom && !isMapExpanded) {
      return null;
    }

    return renderRecommendationSection({
      restroom: featuredRestroom,
      title: featuredRecommendation.title,
      helperText: featuredRecommendation.helperText,
      viewportMode: "homepage",
      className: isDesktopVariant ? "hidden lg:block" : "lg:hidden"
    });
  };

  const renderExpandedDesktopRecommendationSection = () => {
    if (isMobilePreviewLayout || !isMapExpanded || !featuredRecommendation || !expandedMapRecommendation) {
      return null;
    }

    return renderRecommendationSection({
      restroom: expandedMapRecommendation,
      title: featuredRecommendation.title,
      helperText: featuredRecommendation.helperText,
      viewportMode: "expanded_map"
    });
  };

  const renderExpandedMapTopPickOverlay = () => {
    if (!shouldShowExpandedMapTopPick || !featuredRecommendation) {
      return null;
    }

    const expandedTopPickRestroom = expandedMapRecommendation;
    if (!expandedTopPickRestroom) {
      return null;
    }

    const displayDistanceMiles = getUserDisplayDistanceMiles(expandedTopPickRestroom);
    const distanceLabel = showListDistance
      ? formatDistanceLabel(displayDistanceMiles ?? expandedTopPickRestroom.distanceMiles, {
          referenceKind: listDistanceReferenceKind,
          referenceLabel: listDistanceReferenceLabel
        })
      : "";
    const recommendationSignalDescriptors = expandedTopPickRestroom.ratings.qualitySignals
      .map((signal) => getReviewQuickTagDescriptor(signal))
      .filter((descriptor): descriptor is NonNullable<ReturnType<typeof getReviewQuickTagDescriptor>> => descriptor?.tone === "positive")
      .slice(0, 2);
    const activateRecommendation = () => {
      focusExpandedRecommendation(expandedTopPickRestroom.id);
    };
    const stopCardActionPropagation = (event: ReactMouseEvent<HTMLElement>) => {
      event.stopPropagation();
    };

    return (
      <>
        <div className="pointer-events-none absolute bottom-4 left-4 z-20 hidden sm:block">
          <div className="pointer-events-auto w-[320px] max-w-[calc(100vw-2rem)]">
            <article
              role="button"
              tabIndex={0}
              onClick={activateRecommendation}
              onMouseEnter={() => handleRailRestroomHoverChange(expandedTopPickRestroom.id, true)}
              onMouseLeave={() => handleRailRestroomHoverChange(expandedTopPickRestroom.id, false)}
              onFocusCapture={() => handleRailRestroomFocusChange(expandedTopPickRestroom.id, true)}
              onBlurCapture={(event) => handleRailRestroomBlur(expandedTopPickRestroom.id, event)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") {
                  return;
                }

                event.preventDefault();
                activateRecommendation();
              }}
              className="rounded-2xl border border-brand-300/80 bg-white/96 p-4 shadow-xl ring-2 ring-brand-100/80 backdrop-blur"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-800">{featuredRecommendation.title}</p>
                  <h2 className="mt-1 truncate text-base font-semibold text-slate-900">{getRestroomDisplayName(expandedTopPickRestroom)}</h2>
                  <p className="mt-0.5 truncate text-sm text-slate-500">{getRestroomCardSubtitle(expandedTopPickRestroom)}</p>
                </div>
                {distanceLabel ? (
                  <p className="shrink-0 max-w-[10rem] text-right text-sm font-semibold leading-5 text-slate-700">{distanceLabel}</p>
                ) : null}
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {recommendationSignalDescriptors.map((descriptor) => (
                  <span
                    key={descriptor.value}
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                      reviewQuickTagToneClassName[descriptor.tone]
                    )}
                  >
                    {descriptor.icon} {descriptor.label}
                  </span>
                ))}
                {expandedTopPickRestroom.is_accessible ? (
                  <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                    ♿ Accessible
                  </span>
                ) : null}
                {expandedTopPickRestroom.ratings.overall > 0 ? (
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    ⭐ {expandedTopPickRestroom.ratings.overall.toFixed(1)} · {expandedTopPickRestroom.ratings.reviewCount} reviews
                  </span>
                ) : expandedTopPickRestroom.ratings.reviewCount > 0 ? (
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    {expandedTopPickRestroom.ratings.reviewCount} reviews
                  </span>
                ) : null}
              </div>

              <p className="mt-2 text-xs font-medium text-slate-500">
                {featuredRecommendation.helperText}
              </p>

              <div className="mt-3 flex items-center gap-2" onClick={stopCardActionPropagation}>
                <TrackedNavigateLink
                  latitude={expandedTopPickRestroom.lat}
                  longitude={expandedTopPickRestroom.lng}
                  bathroomId={expandedTopPickRestroom.id}
                  source="restroom_card"
                  sourceSurface="restroom_card"
                  viewportMode="expanded_map"
                  hasUserLocation={hasActiveUserLocation}
                  onClick={stopCardActionPropagation}
                  className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                >
                  Navigate
                </TrackedNavigateLink>
                <Link
                  href={`/restroom/${expandedTopPickRestroom.id}`}
                  onClick={(event) => {
                    stopCardActionPropagation(event);
                    handleNavigateToDetail(expandedTopPickRestroom.id);
                  }}
                  className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  View
                </Link>
              </div>
            </article>
          </div>
        </div>
      </>
    );
  };

  const renderRecentlyViewedSection = (variant: "mobile" | "desktop") => {
    if (recentRestroomsForDisplay.length < 2) {
      return null;
    }

    const isDesktopVariant = variant === "desktop";

    return (
      <section
        className={cn(
          "rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm",
          isDesktopVariant ? "hidden lg:block" : "lg:hidden"
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Recently viewed</h2>
            <p className="mt-1 text-xs text-slate-500">Jump back into a restroom you already checked.</p>
          </div>
        </div>

        {isDesktopVariant ? (
          <div className="mt-3 space-y-2">
            {recentRestroomsForDisplay.slice(0, 4).map((restroom) => {
              const topSignalDescriptor = restroom.ratings.qualitySignals[0]
                ? getReviewQuickTagDescriptor(restroom.ratings.qualitySignals[0])
                : null;
              const isHighlighted = isRailRestroomHighlighted(restroom.id);

              return (
                <Link
                  key={restroom.id}
                  href={`/restroom/${restroom.id}`}
                  onClick={() => handleNavigateToDetail(restroom.id)}
                  onMouseEnter={() => handleRailRestroomHoverChange(restroom.id, true)}
                  onMouseLeave={() => handleRailRestroomHoverChange(restroom.id, false)}
                  onFocusCapture={() => handleRailRestroomFocusChange(restroom.id, true)}
                  onBlurCapture={(event) => handleRailRestroomBlur(restroom.id, event)}
                  onTouchStart={() => handleRailRestroomTouchSelect(restroom.id)}
                  className={cn(
                    "block rounded-xl border border-slate-200 px-3 py-2.5 transition hover:border-slate-300 hover:bg-slate-50",
                    isHighlighted && "border-brand-300 bg-brand-50/40 shadow-md ring-2 ring-brand-100"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{getRestroomDisplayName(restroom)}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{getRestroomCardSubtitle(restroom)}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      ⭐ {restroom.ratings.overall > 0 ? restroom.ratings.overall.toFixed(1) : "N/A"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      {getRestroomSourceLabel(restroom.source)}
                    </span>
                    {topSignalDescriptor ? (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                          reviewQuickTagToneClassName[topSignalDescriptor.tone]
                        )}
                      >
                        {topSignalDescriptor.icon} {topSignalDescriptor.label}
                      </span>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="-mx-1 mt-3 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
            {recentRestroomsForDisplay.map((restroom) => {
              const isHighlighted = isRailRestroomHighlighted(restroom.id);

              return (
                <Link
                  key={restroom.id}
                  href={`/restroom/${restroom.id}`}
                  onClick={() => handleNavigateToDetail(restroom.id)}
                  onTouchStart={() => handleRailRestroomTouchSelect(restroom.id)}
                  className={cn(
                    "min-w-[220px] snap-start rounded-2xl border border-slate-200 bg-slate-50/60 p-3 transition hover:border-slate-300 hover:bg-slate-50",
                    isHighlighted && "border-brand-300 bg-brand-50/50 shadow-md ring-2 ring-brand-100"
                  )}
                >
                  <p className="truncate text-sm font-semibold text-slate-900">{getRestroomDisplayName(restroom)}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{getRestroomCardSubtitle(restroom)}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      ⭐ {restroom.ratings.overall > 0 ? restroom.ratings.overall.toFixed(1) : "N/A"}
                    </span>
                    <span className="text-[11px] font-medium text-slate-500">{getRestroomSourceLabel(restroom.source)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  const renderBrowseControls = (variant: "default" | "expanded") => {
    const isExpandedVariant = variant === "expanded";
    const closestSortLabel = hasActiveUserLocation ? "Nearest to you" : "Nearest in this area";

    return (
      <section
        className={cn(
          "rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm",
          isExpandedVariant && "p-2 sm:p-2.5"
        )}
      >
        <div className={cn("mb-3 flex items-end justify-between gap-3", isExpandedVariant && "mb-1.5")}>
          <div>
            <h2 className={cn("text-base font-semibold text-slate-900", isExpandedVariant && "text-sm")}>Browse this area</h2>
            <p className={cn("mt-1 text-xs text-slate-500", isExpandedVariant && "mt-0 text-[11px]")}>
              Filter and sort what you see on the map.
            </p>
          </div>
        </div>

        <div className={cn("flex flex-col gap-3", isExpandedVariant && "gap-1.5")}>
          <fieldset>
            <legend className={cn("mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500", isExpandedVariant && "mb-1 text-[11px]")}>
              Filters
            </legend>
            <div className={cn("flex flex-wrap gap-2", isExpandedVariant && "gap-1.5")}>
              <button
                type="button"
                onClick={() => toggleFilter("publicOnly")}
                aria-pressed={filters.publicOnly}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                  isExpandedVariant && "px-2.5 py-1 text-xs",
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
                  isExpandedVariant && "px-2.5 py-1 text-xs",
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
                  isExpandedVariant && "px-2.5 py-1 text-xs",
                  filters.babyStation
                    ? "border-brand-300 bg-brand-50 text-brand-700"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"
                )}
              >
                Baby station
              </button>
            </div>
          </fieldset>

          <div
            className={cn(
              "flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5",
              isExpandedVariant && "p-1.5"
            )}
          >
            <label htmlFor={`sort-mode-${variant}`} className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Sort
            </label>
            <select
              id={`sort-mode-${variant}`}
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              className={cn(
                "h-9 min-w-0 max-w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 sm:w-[180px]",
                isExpandedVariant && "h-7 px-2 text-xs sm:w-[140px]"
              )}
            >
              <option value="recommended">Recommended</option>
              <option value="closest">
                {closestSortLabel}
              </option>
            </select>
          </div>
        </div>
      </section>
    );
  };

  const renderExpandedMobileRecommendationSection = () => {
    if (!isMobilePreviewLayout || !isMapExpanded || !featuredRecommendation || !expandedMapRecommendation) {
      return null;
    }

    const recommendationRestroom = expandedMapRecommendation;
    const resetExpandedMobileRecommendationTouchState = () => {
      expandedMobileRecommendationTouchStartRef.current = null;
      expandedMobileRecommendationDidMoveRef.current = false;
    };
    const openExpandedMobileRecommendationDetail = () => {
      handleNavigateToDetail(recommendationRestroom.id);
      router.push(`/restroom/${recommendationRestroom.id}`);
    };
    const handleExpandedMobileRecommendationTouchStart = (event: TouchEvent<HTMLDivElement>) => {
      const touch = event.touches[0];
      if (!touch) {
        resetExpandedMobileRecommendationTouchState();
        return;
      }

      expandedMobileRecommendationTouchStartRef.current = { x: touch.clientX, y: touch.clientY };
      expandedMobileRecommendationDidMoveRef.current = false;
    };
    const handleExpandedMobileRecommendationTouchMove = (event: TouchEvent<HTMLDivElement>) => {
      const touch = event.touches[0];
      const startPoint = expandedMobileRecommendationTouchStartRef.current;
      if (!touch || !startPoint) {
        return;
      }

      if (Math.abs(touch.clientX - startPoint.x) > 8 || Math.abs(touch.clientY - startPoint.y) > 8) {
        expandedMobileRecommendationDidMoveRef.current = true;
      }
    };
    const handleExpandedMobileRecommendationTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
      const startPoint = expandedMobileRecommendationTouchStartRef.current;
      if (!startPoint || expandedMobileRecommendationDidMoveRef.current) {
        resetExpandedMobileRecommendationTouchState();
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-restroom-card-footer-actions='true']")) {
        resetExpandedMobileRecommendationTouchState();
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      didHandleExpandedMobileRecommendationTouchTapRef.current = true;
      openExpandedMobileRecommendationDetail();
      resetExpandedMobileRecommendationTouchState();
    };
    const handleExpandedMobileRecommendationClick = (event: ReactMouseEvent<HTMLDivElement>) => {
      if (didHandleExpandedMobileRecommendationTouchTapRef.current) {
        didHandleExpandedMobileRecommendationTouchTapRef.current = false;
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-restroom-card-footer-actions='true']")) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      openExpandedMobileRecommendationDetail();
    };

    return (
      <div
        className={cn("sm:hidden", isMobileSheetInteractionLocked && "pointer-events-none")}
        onClickCapture={handleExpandedMobileRecommendationClick}
        onTouchStartCapture={handleExpandedMobileRecommendationTouchStart}
        onTouchMoveCapture={handleExpandedMobileRecommendationTouchMove}
        onTouchEndCapture={handleExpandedMobileRecommendationTouchEnd}
        onTouchCancelCapture={resetExpandedMobileRecommendationTouchState}
      >
        {renderRecommendationSection({
          restroom: recommendationRestroom,
          title: featuredRecommendation.title,
          helperText: featuredRecommendation.helperText,
          viewportMode: "expanded_map"
        })}
      </div>
    );
  };

  const renderRestroomListSection = (variant: "default" | "expanded") => {
    const isExpandedVariant = variant === "expanded";
    const viewportMode = isExpandedVariant ? "expanded_map" : "homepage";
    const recommendationRestroomId = isExpandedVariant ? expandedMapRecommendation?.id ?? null : featuredRestroom?.id ?? null;
    const restroomsForSection =
      recommendationRestroomId ? listRestrooms.filter((restroom) => restroom.id !== recommendationRestroomId) : listRestrooms;
    const sectionTitle =
      recommendationRestroomId ? "More nearby restrooms" : "Nearby restrooms";

    return (
      <RestroomList
        restrooms={restroomsForSection}
        title={sectionTitle}
        helperText={
          !isExpandedVariant && featuredRestroom
            ? "Start with the closest option above, then compare a few more choices here."
            : isExpandedVariant && expandedMapRecommendation
              ? "Start with the closest option above, then compare the rest of the visible options."
              : listHelperText
        }
        showDistance={showListDistance}
        displayDistanceByRestroomId={listDisplayDistanceByRestroomId}
        distanceReferenceKind={listDistanceReferenceKind}
        distanceReferenceLabel={listDistanceReferenceLabel}
        viewportMode={viewportMode}
        hasUserLocation={hasActiveUserLocation}
        highlightedRestroomId={highlightedListRestroomId}
        onRestroomHoverChange={setListHoveredRestroomId}
        onRestroomFocusChange={(restroomId) => setMapFocusedRestroomId(restroomId)}
        onRestroomTouchSelect={handleRailRestroomTouchSelect}
        onNavigateToDetail={handleNavigateToDetail}
        compact={isExpandedVariant}
        className={cn(isExpandedVariant && "p-2.5 sm:p-3")}
        scrollClassName={
          isExpandedVariant ? "sm:max-h-[calc(100vh-290px)] sm:overflow-y-auto sm:pr-1 lg:max-h-[calc(100vh-290px)]" : undefined
        }
      />
    );
  };

  const renderPlaceSearchControls = (variant: "default" | "expanded") => {
    const isExpandedVariant = variant === "expanded";

    return (
      <div className={cn("w-full", isExpandedVariant ? "sm:max-w-[420px] lg:max-w-[460px]" : "")}>
        <PlaceSearchBar
          selectedPlace={selectedSearchPlace}
          onPlaceSelect={handlePlaceSearchSelect}
          onClear={handlePlaceSearchClear}
          compact={isExpandedVariant}
          mapCenter={mapCamera}
        />
        {!isExpandedVariant ? (
          <p className="mt-1.5 hidden px-1 text-xs text-slate-500 sm:block">Jump to a city, neighborhood, or street address to browse nearby restrooms.</p>
        ) : null}
      </div>
    );
  };

  const renderExpandedListPanel = () => {
    if (isMobilePreviewLayout) {
      return (
        <div className="min-w-0 space-y-2.5">
          {renderExpandedMobileRecommendationSection()}
          {renderBrowseControls("expanded")}
          {renderRestroomListSection("expanded")}
        </div>
      );
    }

    return (
      <div className="min-w-0 space-y-3">
        {renderExpandedDesktopRecommendationSection()}
        {renderBrowseControls("expanded")}
        {renderRestroomListSection("expanded")}
      </div>
    );
  };

  const renderDefaultListColumn = () => {
    const areaDensityLabel = `${mapDisplayRestrooms.length} pins • ${listRestrooms.length} listed`;

    return (
      <div className="min-w-0">
        <section className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-600 lg:hidden">
          {areaDensityLabel}
        </section>

        <div className="mt-3 flex min-w-0 flex-col gap-3 lg:hidden">
          {renderTopPickCard("mobile")}
          {renderBrowseControls("default")}
          {renderRestroomListSection("default")}
          {renderRecentlyViewedSection("mobile")}
        </div>

        <div className="mt-4 hidden min-w-0 flex-col gap-4 lg:flex">
          {renderTopPickCard("desktop")}
          {renderBrowseControls("default")}
          {renderRestroomListSection("default")}
          {renderRecentlyViewedSection("desktop")}
        </div>
      </div>
    );
  };

  const isMobileSheetCollapsed = mobileSheetState === "collapsed";
  const activeMapPreviewVariant = isMapExpanded ? "expanded" : "default";
  const shouldShowStickyMobilePrimaryAction =
    !isMapExpanded && !isLocationTrackingEnabled && !isLocating && !isPrimaryLocationActionVisible && !hasStartedBrowsing;

  return (
    <>
      <div className={cn(shouldShowStickyMobilePrimaryAction && "pb-24 sm:pb-0")}>
        <section
          ref={primaryLocationActionRef}
          className="mb-4 rounded-2xl border border-slate-200/80 bg-white px-5 py-4 shadow-sm sm:rounded-3xl sm:px-6 sm:py-5 lg:px-7"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            {/* Title block */}
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-600 sm:text-[11px]">
                California Restroom Map
              </p>
              <h1 className="mt-1 text-[1.25rem] font-semibold leading-tight tracking-tight text-slate-900 sm:text-[1.45rem] lg:text-[1.65rem]">
                Never get stuck without a bathroom again
              </h1>
              {/* Mobile: compact one-liner badge below heading */}
              <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-slate-500 sm:hidden">
                <span className="inline-flex h-5 items-center rounded-full border border-brand-200 bg-brand-50 px-2 text-[11px] font-semibold text-brand-700">2,000+</span>
                restrooms across California
              </p>
              {/* Desktop: full subtitle with all details */}
              <p className="mt-0.5 hidden text-[13px] leading-5 text-slate-500 sm:flex sm:flex-wrap sm:items-center sm:gap-1.5">
                Find clean, nearby restrooms in seconds
                <span className="text-slate-300">·</span>
                <span className="inline-flex h-5 items-center rounded-full border border-brand-200 bg-brand-50 px-2 text-[11px] font-semibold text-brand-700">2,000+</span>
                <span>mapped across California</span>
              </p>
            </div>

            {/* CTA block */}
            <div className="flex shrink-0 flex-col gap-1.5">
              {!isLocationTrackingEnabled ? (
                <button
                  type="button"
                  onClick={() => {
                    handleUseMyLocation();
                    mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  disabled={isLocating}
                  className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {isLocating ? "Finding bathrooms..." : "Find a bathroom near you"}
                </button>
              ) : null}

              {(isLocationFollowing || isLocationTrackingPaused || isLocationTrackingEnabled) ? (
                <div className="flex flex-wrap gap-2">
                  {isLocationFollowing ? (
                    <span className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700">
                      📍 Following you
                    </span>
                  ) : null}
                  {isLocationTrackingPaused ? (
                    <button
                      type="button"
                      onClick={handleUseMyLocation}
                      className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      Return to me
                    </button>
                  ) : null}
                  {isLocationTrackingEnabled ? (
                    <button
                      type="button"
                      onClick={handleStopLocationTracking}
                      className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                    >
                      Stop
                    </button>
                  ) : null}
                </div>
              ) : null}

              {geoError ? (
                <p className="text-[12px] font-medium text-amber-700">{geoError}</p>
              ) : null}

              {showSignupValue && !isLocationTrackingEnabled ? (
                <p className="text-[12px] text-slate-500">
                  <Link
                    href={buildLoginHref("/")}
                    className="font-semibold text-slate-700 underline-offset-2 hover:underline"
                  >
                    Create a free account
                  </Link>
                  {" "}— earn points &amp; collect cards
                </p>
              ) : null}
            </div>
          </div>

        </section>

        <section ref={mapSectionRef} className="grid min-w-0 gap-5 overflow-x-clip lg:grid-cols-[minmax(0,1.45fr)_minmax(360px,1fr)] xl:grid-cols-[minmax(0,1.55fr)_420px]">
        <div
          className={cn(
            "min-w-0",
            isMapExpanded ? "fixed inset-0 z-[80]" : "relative lg:sticky lg:top-20 lg:self-start"
          )}
        >
          {!isMapExpanded ? (
            <div className="mb-3">
              {renderPlaceSearchControls("default")}
            </div>
          ) : null}

          {isMapExpanded ? <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-[1.5px]" /> : null}

          <div className={cn("min-w-0", isMapExpanded && "absolute inset-0 max-w-full overflow-hidden")}>
            {isHomeStateReady ? (
              <MapPanel
                restrooms={mapDisplayRestrooms}
                userLocation={activeUserLocation}
                showDistance={showReferenceDistance}
                distanceReferenceKind={distanceReference.kind}
                distanceReferenceLabel={distanceReference.label}
                hasUserLocation={hasActiveUserLocation}
                hoveredRestroomId={isMobilePreviewLayout ? null : listHoveredRestroomId}
                focusedRestroomId={isMobilePreviewLayout ? null : mapFocusedRestroomId}
                selectedRestroomId={selectedRestroomId}
                onHoveredRestroomIdChange={handleMapHoveredRestroomIdChange}
                onFocusedRestroomIdChange={handleMapFocusedRestroomIdChange}
                onSelectedRestroomIdChange={handleMapSelectedRestroomIdChange}
                onViewportBoundsChange={handleViewportBoundsChange}
                onCameraChange={handleMapCameraChange}
                onNavigateToDetail={handleNavigateToDetail}
                initialCamera={mapCamera}
                searchCamera={searchCameraTarget}
                locationCenterRequestKey={locationCenterRequestKey}
                searchCameraRequestKey={searchCameraRequestKey}
                locationFollowEnabled={isLocationFollowing}
                onLocationFollowChange={handleLocationFollowChange}
                analyticsViewportMode={isMapExpanded ? "expanded_map" : "homepage"}
                className={cn(isMapExpanded && "relative z-10 h-full rounded-none border-0 shadow-none")}
                mapClassName={cn(isMapExpanded && "h-full min-h-0")}
                showHeader={!isMapExpanded}
                onExpandMap={!isMapExpanded ? handleExpandMap : undefined}
              />
            ) : (
              <div
                className={cn(
                  "rounded-3xl border border-slate-200 bg-slate-100/70 shadow-sm",
                  isMapExpanded ? "h-full w-full rounded-none border-0" : "h-[340px] sm:h-[440px] lg:h-[640px]"
                )}
              />
            )}
            {renderMobileMapPreviewCard(activeMapPreviewVariant)}
            {renderExpandedMapTopPickOverlay()}

            {isMapExpanded ? (
              <>
                <div
                  className={cn(
                    "pointer-events-none absolute left-2 right-2 top-[max(0.5rem,env(safe-area-inset-top))] z-20 sm:left-4 sm:top-4",
                    isExpandedListOpen && !isMobilePreviewLayout ? "sm:right-[428px]" : "sm:right-4"
                  )}
                >
                  <div className="pointer-events-auto mr-auto w-full max-w-[820px] min-w-0 rounded-[20px] border border-white/75 bg-white/90 px-2.5 py-1.5 shadow-[0_20px_44px_rgba(15,23,42,0.16)] backdrop-blur-xl sm:rounded-[24px] sm:px-4 sm:py-3">
                    <div className="flex flex-col gap-1.5 sm:gap-2.5">
                      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                        <div className="min-w-0 sm:max-w-[430px]">
                          <p className="text-[13px] font-semibold text-slate-900 sm:text-sm">Restroom map</p>
                          <p className="mt-0.5 hidden text-xs text-slate-600 lg:block">Move the map to browse nearby options.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1 sm:justify-end sm:gap-2">
                          {!isLocationTrackingEnabled ? (
                            <button
                              type="button"
                              onClick={handleUseMyLocation}
                              disabled={isLocating}
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:px-3 sm:py-2 sm:text-xs"
                            >
                              {isLocating ? "Locating..." : "Use my location"}
                            </button>
                          ) : null}
                          {isLocationFollowing ? (
                            <span className="inline-flex min-h-[32px] items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 shadow-sm sm:min-h-[36px] sm:px-3 sm:py-2 sm:text-xs">
                              📍 Following you
                            </span>
                          ) : null}
                          {isLocationTrackingPaused ? (
                            <button
                              type="button"
                              onClick={handleUseMyLocation}
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 sm:px-3 sm:py-2 sm:text-xs"
                            >
                              Return to me
                            </button>
                          ) : null}
                          {isLocationTrackingEnabled ? (
                            <button
                              type="button"
                              onClick={handleStopLocationTracking}
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 sm:px-3 sm:py-2 sm:text-xs"
                            >
                              Stop
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setIsExpandedListOpen((current) => !current)}
                            className="hidden rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 sm:inline-flex"
                          >
                            {isExpandedListOpen ? "Hide list" : "Show list"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsMapExpanded(false)}
                            className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-slate-800 sm:px-3 sm:py-2 sm:text-xs"
                          >
                            Done
                          </button>
                        </div>
                      </div>

                      {renderPlaceSearchControls("expanded")}

                      {geoError ? (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800 sm:py-2 sm:text-xs">
                          {geoError}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 overflow-hidden sm:hidden">
                  <div
                    ref={mobileSheetRef}
                    className="pointer-events-auto mx-0 overflow-hidden rounded-t-3xl border-t border-slate-200 bg-white shadow-2xl will-change-transform"
                    style={{
                      height: `${Math.round(MOBILE_SHEET_MAX_HEIGHT_RATIO * 100)}svh`,
                      transform:
                        mobileSheetState === "collapsed"
                          ? `translateY(calc(${Math.round(MOBILE_SHEET_MAX_HEIGHT_RATIO * 100)}svh - ${MOBILE_SHEET_COLLAPSED_VISIBLE_PX}px))`
                          : mobileSheetState === "expanded"
                            ? `translateY(calc(${Math.round(MOBILE_SHEET_MAX_HEIGHT_RATIO * 100)}svh - ${Math.round(MOBILE_SHEET_EXPANDED_VISIBLE_RATIO * 100)}svh))`
                            : `translateY(calc(${Math.round(MOBILE_SHEET_MAX_HEIGHT_RATIO * 100)}svh - ${Math.round(MOBILE_SHEET_DEFAULT_VISIBLE_RATIO * 100)}svh))`
                    }}
                  >
                    <button
                      type="button"
                      aria-label={
                        mobileSheetState === "collapsed" ? "Expand nearby restrooms sheet" : "Collapse nearby restrooms sheet"
                      }
                      onClick={handleMobileSheetHandleTap}
                      onTouchStart={handleMobileSheetHandleTouchStart}
                      onTouchMove={handleMobileSheetHandleTouchMove}
                      onTouchEnd={handleMobileSheetHandleTouchEnd}
                      onTouchCancel={handleMobileSheetHandleTouchCancel}
                      className={cn(
                        "flex w-full touch-none flex-col items-center border-b border-slate-200 px-4",
                        isMobileSheetCollapsed ? "gap-1 pb-1.5 pt-2" : "gap-1.5 pb-2 pt-2.5"
                      )}
                    >
                      <span className="h-1.5 w-10 rounded-full bg-slate-300" />
                      {isMobileSheetCollapsed ? (
                        <div className="flex w-full items-center justify-between">
                          <p className="text-xs font-semibold text-slate-700">Nearby results</p>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Show</span>
                        </div>
                      ) : (
                        <div className="flex w-full items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">Nearby results</p>
                            <p className="text-xs text-slate-500">{listRestrooms.length} in current map area</p>
                          </div>
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Hide</span>
                        </div>
                      )}
                    </button>

                    {mobileSheetState !== "collapsed" ? (
                      <div
                        className="h-[calc(100%-68px)] overflow-x-hidden overflow-y-auto px-2 pb-[calc(env(safe-area-inset-bottom)+0.65rem)] pt-2"
                        onTouchStart={handleMobileSheetContentTouchStart}
                        onTouchMove={handleMobileSheetContentTouchMove}
                        onTouchEnd={finishMobileSheetContentTouchGesture}
                        onTouchCancel={finishMobileSheetContentTouchGesture}
                      >
                        {renderExpandedListPanel()}
                      </div>
                    ) : null}
                  </div>
                </div>

                {isExpandedListOpen ? (
                  <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 hidden max-h-[62vh] sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-[92px] sm:block sm:max-h-none sm:w-[400px]">
                    <div className="pointer-events-auto h-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl sm:p-3">
                      {renderExpandedListPanel()}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        {!isMapExpanded ? renderDefaultListColumn() : null}
      </section>

        {shouldShowStickyMobilePrimaryAction ? (
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:hidden">
            <div className="pointer-events-auto rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-2xl backdrop-blur">
              <button
                type="button"
                onClick={handleUseMyLocation}
                className="inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Find a bathroom near you
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
