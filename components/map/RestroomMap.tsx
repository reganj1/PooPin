"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type mapboxgl from "mapbox-gl";
import type { FeatureCollection, Point } from "geojson";
import { NearbyBathroom } from "@/types";
import { captureAnalyticsEvent } from "@/lib/analytics/posthog";
import type { AnalyticsViewportMode } from "@/lib/analytics/posthog";
import {
  fetchRestroomPreviewPhoto,
  getCachedRestroomPreviewPhoto,
  prefetchRestroomPreviewPhotos
} from "@/lib/utils/restroomPreviewClient";
import { getRestroomDisplayName, getRestroomPopupAddress } from "@/lib/utils/restroomPresentation";
import { getReviewQuickTagDescriptor } from "@/lib/utils/reviewSignals";

interface RestroomMapProps {
  restrooms: NearbyBathroom[];
  accessToken: string;
  userLocation?: {
    lat: number;
    lng: number;
  } | null;
  initialCamera?: {
    lat: number;
    lng: number;
    zoom: number;
  } | null;
  showDistance?: boolean;
  hasUserLocation?: boolean;
  analyticsViewportMode?: AnalyticsViewportMode;
  hoveredRestroomId?: string | null;
  focusedRestroomId?: string | null;
  onFocusedRestroomIdChange?: (restroomId: string | null) => void;
  onViewportBoundsChange?: (bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  }) => void;
  onCameraChange?: (camera: {
    lat: number;
    lng: number;
    zoom: number;
  }) => void;
  onNavigateToDetail?: (restroomId: string) => void;
  locationCenterRequestKey?: number;
  locationFollowEnabled?: boolean;
  onLocationFollowChange?: (enabled: boolean) => void;
  resizeKey?: string | number;
}

interface RestroomFeatureProperties {
  id: string;
  name: string;
  subtitle: string;
  distance_miles: number;
  overall_rating: number;
  quality_signals: string;
}

const SOURCE_ID = "restrooms-source";
const HOVER_HALO_LAYER_ID = "restrooms-hover-halo-layer";
const MARKER_LAYER_ID = "restrooms-marker-layer";
const LABEL_LAYER_ID = "restrooms-label-layer";
const HIT_LAYER_ID = "restrooms-hit-layer";
const USER_SOURCE_ID = "user-location-source";
const USER_RING_LAYER_ID = "user-location-ring-layer";
const USER_DOT_LAYER_ID = "user-location-dot-layer";
const DEFAULT_CENTER: [number, number] = [-122.4194, 37.7749];
const DEFAULT_ZOOM = 12;
const DESKTOP_PREVIEW_FETCH_INTENT_DELAY_MS = 130;

const isValidCoordinate = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng);
const isValidCamera = (
  camera: { lat: number; lng: number; zoom: number } | null | undefined
): camera is { lat: number; lng: number; zoom: number } =>
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

const toFeatureCollection = (restrooms: NearbyBathroom[]): FeatureCollection<Point, RestroomFeatureProperties> => {
  return {
    type: "FeatureCollection",
    features: restrooms
      .filter((restroom) => isValidCoordinate(restroom.lat, restroom.lng))
      .map((restroom) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [restroom.lng, restroom.lat]
        },
        properties: {
          id: restroom.id,
          name: getRestroomDisplayName(restroom),
          subtitle: getRestroomPopupAddress(restroom),
          distance_miles: restroom.distanceMiles,
          overall_rating: restroom.ratings.overall,
          quality_signals: restroom.ratings.qualitySignals.join("|")
        }
      }))
  };
};

const toUserLocationFeatureCollection = (
  userLocation: { lat: number; lng: number } | null
): FeatureCollection<Point, Record<string, never>> => {
  if (!userLocation || !isValidCoordinate(userLocation.lat, userLocation.lng)) {
    return {
      type: "FeatureCollection",
      features: []
    };
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [userLocation.lng, userLocation.lat]
        },
        properties: {}
      }
    ]
  };
};

const toDistanceLabel = (value: number) => {
  if (!Number.isFinite(value) || value < 0) {
    return "";
  }

  if (value < 0.1) {
    return "<0.1 mi straight-line";
  }

  return `${value.toFixed(1)} mi straight-line`;
};

const getLocationKey = (location: { lat: number; lng: number } | null) =>
  location ? `${location.lat.toFixed(5)}:${location.lng.toFixed(5)}` : "";

const toDisplayRating = (value: number) => (value > 0 ? value.toFixed(1) : "N/A");

const buildDesktopHoverPreviewContent = (
  restroom: NearbyBathroom,
  options: {
    showDistance: boolean;
    photoUrl: string | null;
  }
) => {
  const { showDistance, photoUrl } = options;
  const container = document.createElement("div");
  container.className = "w-[246px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl";

  const media = document.createElement("div");
  media.className = "relative h-24 w-full border-b border-slate-100 bg-slate-100";
  if (photoUrl) {
    const image = document.createElement("img");
    image.src = photoUrl;
    image.alt = `${getRestroomDisplayName(restroom)} preview`;
    image.className = "h-full w-full object-cover";
    image.loading = "eager";
    image.decoding = "async";
    image.setAttribute("fetchpriority", "high");
    media.appendChild(image);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "flex h-full w-full items-center justify-center text-[11px] font-semibold text-slate-500";
    placeholder.textContent = "No photo yet";
    media.appendChild(placeholder);
  }

  container.appendChild(media);

  const body = document.createElement("div");
  body.className = "space-y-1.5 p-3";

  const title = document.createElement("p");
  title.className = "truncate text-sm font-semibold text-slate-900";
  title.textContent = getRestroomDisplayName(restroom);
  body.appendChild(title);

  const subtitle = document.createElement("p");
  subtitle.className = "truncate text-xs text-slate-500";
  subtitle.textContent = getRestroomPopupAddress(restroom);
  body.appendChild(subtitle);

  const ratingLine = document.createElement("p");
  ratingLine.className = "text-xs font-semibold text-slate-700";
  ratingLine.textContent = `⭐ ${toDisplayRating(restroom.ratings.overall)} • ${restroom.ratings.reviewCount} review${restroom.ratings.reviewCount === 1 ? "" : "s"}`;
  body.appendChild(ratingLine);

  const topSignal = restroom.ratings.qualitySignals[0];
  if (topSignal) {
    const descriptor = getReviewQuickTagDescriptor(topSignal);
    if (descriptor) {
      const signalLine = document.createElement("p");
      signalLine.className = "text-xs font-medium text-slate-600";
      signalLine.textContent = `${descriptor.icon} ${descriptor.label}`;
      body.appendChild(signalLine);
    }
  }

  if (showDistance) {
    const distanceLabel = toDistanceLabel(restroom.distanceMiles);
    if (distanceLabel) {
      const distanceLine = document.createElement("p");
      distanceLine.className = "text-xs font-medium text-slate-500";
      distanceLine.textContent = distanceLabel;
      body.appendChild(distanceLine);
    }
  }

  container.appendChild(body);
  return container;
};

export function RestroomMap({
  restrooms,
  accessToken,
  userLocation = null,
  initialCamera = null,
  showDistance = false,
  hasUserLocation = false,
  analyticsViewportMode = "homepage",
  hoveredRestroomId = null,
  focusedRestroomId = null,
  onFocusedRestroomIdChange,
  onViewportBoundsChange,
  onCameraChange,
  onNavigateToDetail,
  locationCenterRequestKey = 0,
  locationFollowEnabled = false,
  onLocationFollowChange,
  resizeKey
}: RestroomMapProps) {
  const router = useRouter();
  const [isMapReady, setIsMapReady] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapboxRef = useRef<typeof mapboxgl | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const initialCameraRef = useRef(initialCamera);
  const activePopupRestroomIdRef = useRef<string | null>(null);
  const hasBoundLayerEventsRef = useRef(false);
  const hasInitializedCameraRef = useRef(false);
  const hasAppliedRestoredCameraRef = useRef(false);
  const previousLocationKeyRef = useRef<string>("");
  const mapHoveredRestroomIdRef = useRef<string | null>(null);
  const appliedHoveredRestroomIdRef = useRef<string | null>(null);
  const clickHandlerRef = useRef<((event: mapboxgl.MapLayerMouseEvent) => void) | null>(null);
  const mapClickHandlerRef = useRef<((event: mapboxgl.MapMouseEvent) => void) | null>(null);
  const mouseMoveHandlerRef = useRef<((event: mapboxgl.MapLayerMouseEvent) => void) | null>(null);
  const mouseLeaveHandlerRef = useRef<(() => void) | null>(null);
  const dragStartHandlerRef = useRef<(() => void) | null>(null);
  const zoomStartHandlerRef = useRef<(() => void) | null>(null);
  const desktopPopupRestroomIdRef = useRef<string | null>(null);
  const desktopPreviewFetchIntentTimeoutRef = useRef<number | null>(null);
  const desktopPreviewFetchIntentRestroomIdRef = useRef<string | null>(null);
  const missingHoveredMarkerLogRef = useRef<Set<string>>(new Set());
  const invalidCoordinatesLogKeyRef = useRef<string>("");
  const isCoarsePointerRef = useRef(false);
  const reenableTouchZoomTimeoutRef = useRef<number | null>(null);
  const appliedLocationCenterRequestRef = useRef(locationCenterRequestKey);
  const userInteractionHandlerRef = useRef<(() => void) | null>(null);
  const locationFollowEnabledRef = useRef(locationFollowEnabled);
  const onLocationFollowChangeRef = useRef(onLocationFollowChange);
  const manualInteractionSignalRef = useRef(false);
  const manualInteractionResetTimeoutRef = useRef<number | null>(null);

  const markerData = useMemo(() => toFeatureCollection(restrooms), [restrooms]);
  const restroomById = useMemo(() => new Map(restrooms.map((restroom) => [restroom.id, restroom])), [restrooms]);
  const userLocationData = useMemo(() => toUserLocationFeatureCollection(userLocation), [userLocation]);
  const markerFeatureIds = useMemo(() => new Set(markerData.features.map((feature) => feature.properties.id)), [markerData]);

  useEffect(() => {
    initialCameraRef.current = initialCamera;
  }, [initialCamera]);

  useEffect(() => {
    locationFollowEnabledRef.current = locationFollowEnabled;
  }, [locationFollowEnabled]);

  useEffect(() => {
    onLocationFollowChangeRef.current = onLocationFollowChange;
  }, [onLocationFollowChange]);

  useEffect(() => {
    const prioritizedRestroomIds = [focusedRestroomId, hoveredRestroomId].filter((value): value is string => Boolean(value));
    const candidateRestroomIds = [...prioritizedRestroomIds, ...restrooms.map((restroom) => restroom.id)];
    prefetchRestroomPreviewPhotos(candidateRestroomIds, 14);
  }, [focusedRestroomId, hoveredRestroomId, restrooms]);

  useEffect(() => {
    let cancelled = false;
    const missingHoveredMarkerLogSet = missingHoveredMarkerLogRef.current;

    const initMap = async () => {
      if (!mapContainerRef.current || mapRef.current) {
        return;
      }

      const mapboxModule = await import("mapbox-gl");
      if (cancelled || !mapContainerRef.current) {
        return;
      }

      const mapbox = mapboxModule.default;
      mapbox.accessToken = accessToken;
      mapboxRef.current = mapbox;
      const savedInitialCamera = initialCameraRef.current;
      let initialCenter: [number, number] = DEFAULT_CENTER;
      let initialZoom = DEFAULT_ZOOM;
      const hasInitialCamera = isValidCamera(savedInitialCamera);
      if (hasInitialCamera) {
        initialCenter = [savedInitialCamera.lng, savedInitialCamera.lat];
        initialZoom = savedInitialCamera.zoom;
      }
      const coarsePointer = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
      isCoarsePointerRef.current = coarsePointer;

      const map = new mapbox.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: initialCenter,
        zoom: initialZoom
      });

      map.addControl(new mapbox.NavigationControl(), "top-right");
      map.touchZoomRotate.disableRotation();
      map.dragRotate.disable();
      map.getCanvas().style.touchAction = coarsePointer ? "pan-x pan-y" : "auto";
      if (coarsePointer) {
        map.doubleClickZoom.disable();
      }
      (map as unknown as { touchPitch?: { disable: () => void } }).touchPitch?.disable();
      if (hasInitialCamera) {
        hasInitializedCameraRef.current = true;
        hasAppliedRestoredCameraRef.current = true;
      }

      const markUserInteraction = () => {
        manualInteractionSignalRef.current = true;
        if (typeof window !== "undefined") {
          if (manualInteractionResetTimeoutRef.current !== null) {
            window.clearTimeout(manualInteractionResetTimeoutRef.current);
          }

          manualInteractionResetTimeoutRef.current = window.setTimeout(() => {
            manualInteractionSignalRef.current = false;
            manualInteractionResetTimeoutRef.current = null;
          }, 320);
        }
      };
      userInteractionHandlerRef.current = markUserInteraction;
      const canvas = map.getCanvas();
      canvas.addEventListener("touchstart", markUserInteraction, { passive: true });
      canvas.addEventListener("mousedown", markUserInteraction, { passive: true });
      canvas.addEventListener("wheel", markUserInteraction, { passive: true });
      map.on("load", () => {
        setIsMapReady(true);
      });
      mapRef.current = map;
    };

    void initMap();

    return () => {
      cancelled = true;
      setIsMapReady(false);
      activePopupRestroomIdRef.current = null;
      desktopPopupRestroomIdRef.current = null;
      if (desktopPreviewFetchIntentTimeoutRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(desktopPreviewFetchIntentTimeoutRef.current);
      }
      desktopPreviewFetchIntentTimeoutRef.current = null;
      desktopPreviewFetchIntentRestroomIdRef.current = null;
      popupRef.current?.remove();
      popupRef.current = null;

      const map = mapRef.current;
      if (map) {
        if (clickHandlerRef.current) {
          map.off("click", HIT_LAYER_ID, clickHandlerRef.current);
        }
        if (mapClickHandlerRef.current) {
          map.off("click", mapClickHandlerRef.current);
        }
        if (mouseMoveHandlerRef.current) {
          map.off("mousemove", HIT_LAYER_ID, mouseMoveHandlerRef.current);
        }
        if (mouseLeaveHandlerRef.current) {
          map.off("mouseleave", HIT_LAYER_ID, mouseLeaveHandlerRef.current);
        }
        if (dragStartHandlerRef.current) {
          map.off("dragstart", dragStartHandlerRef.current);
        }
        if (zoomStartHandlerRef.current) {
          map.off("zoomstart", zoomStartHandlerRef.current);
        }

        if (map.getLayer(MARKER_LAYER_ID)) {
          map.removeLayer(MARKER_LAYER_ID);
        }
        if (map.getLayer(HIT_LAYER_ID)) {
          map.removeLayer(HIT_LAYER_ID);
        }
        if (map.getLayer(HOVER_HALO_LAYER_ID)) {
          map.removeLayer(HOVER_HALO_LAYER_ID);
        }
        if (map.getLayer(LABEL_LAYER_ID)) {
          map.removeLayer(LABEL_LAYER_ID);
        }
        if (map.getLayer(USER_DOT_LAYER_ID)) {
          map.removeLayer(USER_DOT_LAYER_ID);
        }
        if (map.getLayer(USER_RING_LAYER_ID)) {
          map.removeLayer(USER_RING_LAYER_ID);
        }
        if (map.getSource(SOURCE_ID)) {
          map.removeSource(SOURCE_ID);
        }
        if (map.getSource(USER_SOURCE_ID)) {
          map.removeSource(USER_SOURCE_ID);
        }

        const canvas = map.getCanvas();
        const userInteractionHandler = userInteractionHandlerRef.current;
        if (userInteractionHandler) {
          canvas.removeEventListener("touchstart", userInteractionHandler);
          canvas.removeEventListener("mousedown", userInteractionHandler);
          canvas.removeEventListener("wheel", userInteractionHandler);
        }
        map.remove();
      }

      hasBoundLayerEventsRef.current = false;
      hasInitializedCameraRef.current = false;
      hasAppliedRestoredCameraRef.current = false;
      previousLocationKeyRef.current = "";
      mapHoveredRestroomIdRef.current = null;
      appliedHoveredRestroomIdRef.current = null;
      if (reenableTouchZoomTimeoutRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(reenableTouchZoomTimeoutRef.current);
      }
      reenableTouchZoomTimeoutRef.current = null;
      if (manualInteractionResetTimeoutRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(manualInteractionResetTimeoutRef.current);
      }
      manualInteractionResetTimeoutRef.current = null;
      manualInteractionSignalRef.current = false;
      missingHoveredMarkerLogSet.clear();
      invalidCoordinatesLogKeyRef.current = "";
      clickHandlerRef.current = null;
      mapClickHandlerRef.current = null;
      mouseMoveHandlerRef.current = null;
      mouseLeaveHandlerRef.current = null;
      dragStartHandlerRef.current = null;
      zoomStartHandlerRef.current = null;
      userInteractionHandlerRef.current = null;
      mapRef.current = null;
      mapboxRef.current = null;
      onFocusedRestroomIdChange?.(null);
    };
  }, [accessToken, onFocusedRestroomIdChange]);

  useEffect(() => {
    if (!isMapReady) {
      return;
    }

    const map = mapRef.current;
    const mapbox = mapboxRef.current;
    if (!map || !mapbox) {
      return;
    }

    if (process.env.NODE_ENV !== "production" && markerData.features.length !== restrooms.length) {
      console.warn("[Poopin] Some restrooms have invalid coordinates and were skipped for map markers.");
    }

    const setHoveredFeatureState = (restroomId: string | null) => {
      const previousId = appliedHoveredRestroomIdRef.current;

      if (previousId === restroomId) {
        return;
      }

      if (previousId) {
        try {
          map.setFeatureState({ source: SOURCE_ID, id: previousId }, { hovered: false });
        } catch {
          // Ignore stale feature ids while viewport data updates.
        }
      }

      if (restroomId) {
        try {
          map.setFeatureState({ source: SOURCE_ID, id: restroomId }, { hovered: true });
        } catch {
          // Ignore stale feature ids while viewport data updates.
        }
      }

      appliedHoveredRestroomIdRef.current = restroomId;
    };

    const resolveHoveredRestroomId = () => {
      if (isCoarsePointerRef.current) {
        return focusedRestroomId;
      }

      return hoveredRestroomId ?? mapHoveredRestroomIdRef.current ?? focusedRestroomId;
    };

    const clearDesktopHoverPopup = () => {
      if (isCoarsePointerRef.current) {
        return;
      }

      if (desktopPreviewFetchIntentTimeoutRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(desktopPreviewFetchIntentTimeoutRef.current);
      }
      desktopPreviewFetchIntentTimeoutRef.current = null;
      desktopPreviewFetchIntentRestroomIdRef.current = null;

      popupRef.current?.remove();
      popupRef.current = null;
      desktopPopupRestroomIdRef.current = null;
    };

    const requestDesktopPreviewPhoto = (restroomId: string) => {
      const cachedPhotoUrl = getCachedRestroomPreviewPhoto(restroomId);
      if (cachedPhotoUrl !== undefined) {
        return;
      }

      void fetchRestroomPreviewPhoto(restroomId).finally(() => {
        if (desktopPopupRestroomIdRef.current === restroomId) {
          showDesktopHoverPopup(restroomId);
        }
      });
    };

    const showDesktopHoverPopup = (restroomId: string) => {
      if (isCoarsePointerRef.current) {
        return;
      }

      const restroom = restroomById.get(restroomId);
      if (!restroom) {
        clearDesktopHoverPopup();
        return;
      }

      const cachedPhotoUrl = getCachedRestroomPreviewPhoto(restroomId);
      const hasPreviewPhoto = cachedPhotoUrl !== undefined;
      const photoUrl = hasPreviewPhoto ? cachedPhotoUrl : null;
      const popupContent = buildDesktopHoverPreviewContent(restroom, {
        showDistance,
        photoUrl
      });

      let popup = popupRef.current;
      if (!popup) {
        popup = new mapbox.Popup({
          closeButton: false,
          closeOnClick: false,
          closeOnMove: false,
          offset: 14,
          maxWidth: "280px"
        });
        popupRef.current = popup;
      }

      popup.setLngLat([restroom.lng, restroom.lat]).setDOMContent(popupContent);
      if (!popup.isOpen()) {
        popup.addTo(map);
      }
      if (desktopPopupRestroomIdRef.current !== restroomId) {
        captureAnalyticsEvent("restroom_popup_opened", {
          bathroom_id: restroomId,
          source_surface: "desktop_hover_popup",
          viewport_mode: analyticsViewportMode,
          has_user_location: hasUserLocation
        });
      }
      desktopPopupRestroomIdRef.current = restroomId;

      if (hasPreviewPhoto) {
        if (desktopPreviewFetchIntentTimeoutRef.current !== null && typeof window !== "undefined") {
          window.clearTimeout(desktopPreviewFetchIntentTimeoutRef.current);
        }
        desktopPreviewFetchIntentTimeoutRef.current = null;
        desktopPreviewFetchIntentRestroomIdRef.current = null;
        return;
      }

      if (desktopPreviewFetchIntentRestroomIdRef.current === restroomId) {
        return;
      }

      if (desktopPreviewFetchIntentTimeoutRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(desktopPreviewFetchIntentTimeoutRef.current);
      }

      desktopPreviewFetchIntentRestroomIdRef.current = restroomId;
      if (typeof window === "undefined") {
        requestDesktopPreviewPhoto(restroomId);
        return;
      }

      desktopPreviewFetchIntentTimeoutRef.current = window.setTimeout(() => {
        desktopPreviewFetchIntentTimeoutRef.current = null;
        desktopPreviewFetchIntentRestroomIdRef.current = null;
        if (desktopPopupRestroomIdRef.current !== restroomId) {
          return;
        }

        requestDesktopPreviewPhoto(restroomId);
      }, DESKTOP_PREVIEW_FETCH_INTENT_DELAY_MS);
    };

    const syncDesktopHoverPopup = () => {
      if (isCoarsePointerRef.current) {
        return;
      }

      const targetRestroomId = hoveredRestroomId ?? mapHoveredRestroomIdRef.current;
      if (!targetRestroomId) {
        clearDesktopHoverPopup();
        return;
      }

      if (!restroomById.has(targetRestroomId)) {
        clearDesktopHoverPopup();
        return;
      }

      showDesktopHoverPopup(targetRestroomId);
    };
    // Keep hover/active emphasis consistent across desktop/mobile and avoid dramatic size jumps.
    const hoverHaloRadiusZoom10 = 17;
    const hoverHaloRadiusZoom14 = 22;
    const activeMarkerRadiusZoom10 = 12;
    const activeMarkerRadiusZoom14 = 15;
    const activeMarkerStrokeZoom10 = 4;
    const activeMarkerStrokeZoom14 = 5;

    const existingSource = map.getSource(SOURCE_ID);
    if (existingSource) {
      (existingSource as mapboxgl.GeoJSONSource).setData(markerData);
    } else {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: markerData,
        promoteId: "id"
      });
    }

    if (!map.getLayer(HOVER_HALO_LAYER_ID)) {
      map.addLayer({
        id: HOVER_HALO_LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        paint: {
          "circle-color": "#93c5fd",
          "circle-opacity": ["case", ["boolean", ["feature-state", "hovered"], false], 0.35, 0],
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            ["case", ["boolean", ["feature-state", "hovered"], false], hoverHaloRadiusZoom10, 0],
            14,
            ["case", ["boolean", ["feature-state", "hovered"], false], hoverHaloRadiusZoom14, 0]
          ],
          "circle-blur": ["case", ["boolean", ["feature-state", "hovered"], false], 0.22, 0]
        }
      });
    }

    if (!map.getLayer(MARKER_LAYER_ID)) {
      map.addLayer({
        id: MARKER_LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        paint: {
          "circle-color": "#111827",
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            ["case", ["boolean", ["feature-state", "hovered"], false], activeMarkerRadiusZoom10, 10],
            14,
            ["case", ["boolean", ["feature-state", "hovered"], false], activeMarkerRadiusZoom14, 12]
          ],
          "circle-stroke-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            ["case", ["boolean", ["feature-state", "hovered"], false], activeMarkerStrokeZoom10, 2],
            14,
            ["case", ["boolean", ["feature-state", "hovered"], false], activeMarkerStrokeZoom14, 2]
          ],
          "circle-stroke-color": ["case", ["boolean", ["feature-state", "hovered"], false], "#f8fafc", "#ffffff"],
          "circle-opacity": ["case", ["boolean", ["feature-state", "hovered"], false], 1, 0.95]
        }
      });
    }

    if (!map.getLayer(LABEL_LAYER_ID)) {
      map.addLayer({
        id: LABEL_LAYER_ID,
        type: "symbol",
        source: SOURCE_ID,
        layout: {
          "text-field": "WC",
          "text-size": 8,
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-allow-overlap": true,
          "text-ignore-placement": true
        },
        paint: {
          "text-color": "#ffffff"
        }
      });
    }

    if (!map.getLayer(HIT_LAYER_ID)) {
      map.addLayer({
        id: HIT_LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        paint: {
          "circle-opacity": 0,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            20,
            14,
            24
          ]
        }
      });
    }

    const existingUserSource = map.getSource(USER_SOURCE_ID);
    if (existingUserSource) {
      (existingUserSource as mapboxgl.GeoJSONSource).setData(userLocationData);
    } else {
      map.addSource(USER_SOURCE_ID, {
        type: "geojson",
        data: userLocationData
      });
    }

    if (!map.getLayer(USER_RING_LAYER_ID)) {
      map.addLayer({
        id: USER_RING_LAYER_ID,
        type: "circle",
        source: USER_SOURCE_ID,
        paint: {
          "circle-color": "#2563eb",
          "circle-opacity": 0.2,
          "circle-radius": 12
        }
      });
    }

    if (!map.getLayer(USER_DOT_LAYER_ID)) {
      map.addLayer({
        id: USER_DOT_LAYER_ID,
        type: "circle",
        source: USER_SOURCE_ID,
        paint: {
          "circle-color": "#2563eb",
          "circle-radius": 5,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2
        }
      });
    }

    if (!hasBoundLayerEventsRef.current) {
      const clearFocusedSelection = () => {
        popupRef.current?.remove();
        popupRef.current = null;
        activePopupRestroomIdRef.current = null;
        mapHoveredRestroomIdRef.current = null;
        onFocusedRestroomIdChange?.(null);
        setHoveredFeatureState(null);
      };

      const clickHandler = (event: mapboxgl.MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== "Point") {
          return;
        }

        const properties = feature.properties as RestroomFeatureProperties | undefined;
        if (!properties) {
          return;
        }

        const { id } = properties;
        if (!id) {
          return;
        }

        captureAnalyticsEvent("restroom_marker_clicked", {
          bathroom_id: id,
          source_surface: "map_marker",
          viewport_mode: analyticsViewportMode,
          has_user_location: hasUserLocation
        });

        onFocusedRestroomIdChange?.(id);
        mapHoveredRestroomIdRef.current = null;
        if (isCoarsePointerRef.current) {
          if (activePopupRestroomIdRef.current !== id) {
            captureAnalyticsEvent("restroom_popup_opened", {
              bathroom_id: id,
              source_surface: "mobile_preview",
              viewport_mode: analyticsViewportMode,
              has_user_location: hasUserLocation
            });
          }
          popupRef.current?.remove();
          popupRef.current = null;
          activePopupRestroomIdRef.current = id;
          setHoveredFeatureState(id);
          map.touchZoomRotate.disable();
          if (reenableTouchZoomTimeoutRef.current !== null && typeof window !== "undefined") {
            window.clearTimeout(reenableTouchZoomTimeoutRef.current);
          }
          if (typeof window !== "undefined") {
            reenableTouchZoomTimeoutRef.current = window.setTimeout(() => {
              if (mapRef.current !== map) {
                return;
              }
              map.touchZoomRotate.enable();
              map.touchZoomRotate.disableRotation();
              reenableTouchZoomTimeoutRef.current = null;
            }, 260);
          }
          return;
        }

        clearDesktopHoverPopup();
        onNavigateToDetail?.(id);
        router.push(`/restroom/${id}`);
      };

      const mapClickHandler = (event: mapboxgl.MapMouseEvent) => {
        if (!isCoarsePointerRef.current) {
          return;
        }

        const markerFeatures = map.queryRenderedFeatures(event.point, {
          layers: [HIT_LAYER_ID]
        });
        if (markerFeatures.length > 0) {
          return;
        }

        clearFocusedSelection();
      };

      const mouseEnterHandler = (event: mapboxgl.MapLayerMouseEvent) => {
        if (isCoarsePointerRef.current) {
          return;
        }

        const feature = event.features?.[0];
        const restroomId = feature?.properties?.id;
        if (typeof restroomId === "string" && mapHoveredRestroomIdRef.current !== restroomId) {
          mapHoveredRestroomIdRef.current = restroomId;
          setHoveredFeatureState(resolveHoveredRestroomId());
          onFocusedRestroomIdChange?.(restroomId);
          syncDesktopHoverPopup();
        }
        map.getCanvas().style.cursor = "pointer";
      };

      const mouseLeaveHandler = () => {
        if (isCoarsePointerRef.current) {
          return;
        }

        mapHoveredRestroomIdRef.current = null;
        setHoveredFeatureState(resolveHoveredRestroomId());
        onFocusedRestroomIdChange?.(hoveredRestroomId ?? null);
        syncDesktopHoverPopup();
        map.getCanvas().style.cursor = "";
      };

      const clearFocusedSelectionOnMapMoveStart = () => {
        if (isCoarsePointerRef.current) {
          if (!activePopupRestroomIdRef.current) {
            return;
          }
          clearFocusedSelection();
          return;
        }

        if (!mapHoveredRestroomIdRef.current && !hoveredRestroomId && !focusedRestroomId) {
          return;
        }

        mapHoveredRestroomIdRef.current = null;
        setHoveredFeatureState(resolveHoveredRestroomId());
        onFocusedRestroomIdChange?.(hoveredRestroomId ?? null);
        syncDesktopHoverPopup();
      };

      const maybeDisableLocationFollow = (requireManualSignal: boolean) => {
        if (!locationFollowEnabledRef.current) {
          return;
        }

        if (requireManualSignal && !manualInteractionSignalRef.current) {
          return;
        }

        onLocationFollowChangeRef.current?.(false);
      };

      const dragStartHandler = () => {
        maybeDisableLocationFollow(false);
        clearFocusedSelectionOnMapMoveStart();
      };

      const zoomStartHandler = () => {
        maybeDisableLocationFollow(true);
        clearFocusedSelectionOnMapMoveStart();
      };

      map.on("click", HIT_LAYER_ID, clickHandler);
      map.on("click", mapClickHandler);
      map.on("mousemove", HIT_LAYER_ID, mouseEnterHandler);
      map.on("mouseleave", HIT_LAYER_ID, mouseLeaveHandler);
      map.on("dragstart", dragStartHandler);
      map.on("zoomstart", zoomStartHandler);

      clickHandlerRef.current = clickHandler;
      mapClickHandlerRef.current = mapClickHandler;
      mouseMoveHandlerRef.current = mouseEnterHandler;
      mouseLeaveHandlerRef.current = mouseLeaveHandler;
      dragStartHandlerRef.current = dragStartHandler;
      zoomStartHandlerRef.current = zoomStartHandler;
      hasBoundLayerEventsRef.current = true;
    }

    if (markerData.features.length === 0) {
      popupRef.current?.remove();
      popupRef.current = null;
      activePopupRestroomIdRef.current = null;
      desktopPopupRestroomIdRef.current = null;
      mapHoveredRestroomIdRef.current = null;
      setHoveredFeatureState(null);
      onFocusedRestroomIdChange?.(null);
    }
    setHoveredFeatureState(resolveHoveredRestroomId());
    syncDesktopHoverPopup();
  }, [
    analyticsViewportMode,
    focusedRestroomId,
    hasUserLocation,
    hoveredRestroomId,
    isMapReady,
    markerData,
    restroomById,
    onFocusedRestroomIdChange,
    onNavigateToDetail,
    restrooms.length,
    router,
    showDistance,
    userLocationData
  ]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return;
    }

    const invalidRestrooms = restrooms.filter((restroom) => !isValidCoordinate(restroom.lat, restroom.lng));
    const invalidLogKey = invalidRestrooms
      .map((restroom) => restroom.id)
      .sort()
      .join("|");

    if (invalidRestrooms.length > 0 && invalidLogKey !== invalidCoordinatesLogKeyRef.current) {
      invalidCoordinatesLogKeyRef.current = invalidLogKey;
      console.warn("[Poopin] RestroomMap skipped marker features due to invalid coordinates.", {
        invalidCount: invalidRestrooms.length,
        invalidRestrooms: invalidRestrooms.map((restroom) => ({
          id: restroom.id,
          lat: restroom.lat,
          lng: restroom.lng,
          name: restroom.name
        }))
      });
    }
  }, [restrooms]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return;
    }

    if (!hoveredRestroomId || markerFeatureIds.has(hoveredRestroomId)) {
      return;
    }

    if (missingHoveredMarkerLogRef.current.has(hoveredRestroomId)) {
      return;
    }

    missingHoveredMarkerLogRef.current.add(hoveredRestroomId);
    console.warn("[Poopin] Hovered restroom id has no matching visible marker feature.", {
      hoveredRestroomId,
      visibleMarkerCount: markerData.features.length
    });
  }, [hoveredRestroomId, markerData.features.length, markerFeatureIds]);

  useEffect(() => {
    if (!isMapReady) {
      return;
    }

    const map = mapRef.current;
    if (!map) {
      return;
    }

    const previousLocationKey = previousLocationKeyRef.current;
    const currentLocationKey = getLocationKey(userLocation);
    const hasLocationChanged = previousLocationKey !== currentLocationKey;
    previousLocationKeyRef.current = currentLocationKey;
    const hasPendingLocateRequest = locationCenterRequestKey !== appliedLocationCenterRequestRef.current;

    if (userLocation && isValidCoordinate(userLocation.lat, userLocation.lng) && hasPendingLocateRequest) {
      const currentZoom = map.getZoom();
      const targetZoom = currentZoom < 13 ? 13 : currentZoom;
      map.easeTo({ center: [userLocation.lng, userLocation.lat], zoom: targetZoom, duration: 700 });
      hasInitializedCameraRef.current = true;
      appliedLocationCenterRequestRef.current = locationCenterRequestKey;
      return;
    }

    if (
      userLocation &&
      isValidCoordinate(userLocation.lat, userLocation.lng) &&
      hasLocationChanged &&
      locationFollowEnabled
    ) {
      map.easeTo({ center: [userLocation.lng, userLocation.lat], zoom: map.getZoom(), duration: 500 });
      hasInitializedCameraRef.current = true;
      return;
    }

    if (hasInitializedCameraRef.current) {
      return;
    }

    if (markerData.features.length === 0) {
      map.easeTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, duration: 0 });
      hasInitializedCameraRef.current = true;
      return;
    }

    if (markerData.features.length === 1) {
      const [lng, lat] = markerData.features[0].geometry.coordinates;
      map.easeTo({ center: [lng, lat], zoom: 14, duration: 700 });
      hasInitializedCameraRef.current = true;
      return;
    }

    const mapbox = mapboxRef.current;
    if (!mapbox) {
      return;
    }

    const bounds = new mapbox.LngLatBounds();
    markerData.features.forEach((feature) => {
      bounds.extend(feature.geometry.coordinates as [number, number]);
    });

    map.fitBounds(bounds, {
      padding: 48,
      maxZoom: 14,
      duration: 700
    });
    hasInitializedCameraRef.current = true;
  }, [isMapReady, locationCenterRequestKey, locationFollowEnabled, markerData, userLocation]);

  useEffect(() => {
    if (!isMapReady) {
      return;
    }

    const map = mapRef.current;
    if (!map) {
      return;
    }

    if (hasAppliedRestoredCameraRef.current) {
      return;
    }

    const restoredCamera = initialCameraRef.current;
    if (!isValidCamera(restoredCamera)) {
      return;
    }

    map.jumpTo({
      center: [restoredCamera.lng, restoredCamera.lat],
      zoom: restoredCamera.zoom
    });
    hasInitializedCameraRef.current = true;
    hasAppliedRestoredCameraRef.current = true;
  }, [initialCamera, isMapReady]);

  useEffect(() => {
    if (!isMapReady || (!onViewportBoundsChange && !onCameraChange)) {
      return;
    }

    const map = mapRef.current;
    if (!map) {
      return;
    }

    const emitBounds = () => {
      const bounds = map.getBounds();
      if (!bounds) {
        return;
      }

      onViewportBoundsChange?.({
        minLat: bounds.getSouth(),
        maxLat: bounds.getNorth(),
        minLng: bounds.getWest(),
        maxLng: bounds.getEast()
      });

      const center = map.getCenter();
      onCameraChange?.({
        lat: center.lat,
        lng: center.lng,
        zoom: map.getZoom()
      });
    };

    map.on("moveend", emitBounds);
    emitBounds();

    return () => {
      map.off("moveend", emitBounds);
    };
  }, [isMapReady, onCameraChange, onViewportBoundsChange]);

  useEffect(() => {
    if (!isMapReady || typeof window === "undefined") {
      return;
    }

    const map = mapRef.current;
    if (!map) {
      return;
    }

    const resizeMap = () => {
      if (mapRef.current !== map) {
        return;
      }

      map.resize();
    };

    const firstFrame = window.requestAnimationFrame(() => {
      resizeMap();
      window.requestAnimationFrame(resizeMap);
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
    };
  }, [isMapReady, resizeKey]);

  useEffect(() => {
    if (!isMapReady || typeof ResizeObserver === "undefined") {
      return;
    }

    const map = mapRef.current;
    const container = mapContainerRef.current;
    if (!map || !container) {
      return;
    }

    const observer = new ResizeObserver(() => {
      map.resize();
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [isMapReady]);

  return <div ref={mapContainerRef} className="h-full w-full" />;
}
