"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type mapboxgl from "mapbox-gl";
import type { FeatureCollection, Point } from "geojson";
import { captureAnalyticsEvent } from "@/lib/analytics/posthog";
import { NearbyBathroom } from "@/types";
import { getGoogleMapsDirectionsUrl } from "@/lib/utils/maps";
import { getRestroomDisplayName, getRestroomPopupAddress } from "@/lib/utils/restroomPresentation";
import { getReviewQuickTagDescriptor, normalizeReviewQuickTags } from "@/lib/utils/reviewSignals";

interface RestroomMapProps {
  restrooms: NearbyBathroom[];
  accessToken: string;
  userLocation?: {
    lat: number;
    lng: number;
  } | null;
  showDistance?: boolean;
  hoveredRestroomId?: string | null;
  onFocusedRestroomIdChange?: (restroomId: string | null) => void;
  onViewportBoundsChange?: (bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  }) => void;
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

const isValidCoordinate = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng);

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
    return "<0.1 mi away";
  }

  return `${value.toFixed(1)} mi away`;
};

const getLocationKey = (location: { lat: number; lng: number } | null) =>
  location ? `${location.lat.toFixed(5)}:${location.lng.toFixed(5)}` : "";

export function RestroomMap({
  restrooms,
  accessToken,
  userLocation = null,
  showDistance = false,
  hoveredRestroomId = null,
  onFocusedRestroomIdChange,
  onViewportBoundsChange
}: RestroomMapProps) {
  const router = useRouter();
  const [isMapReady, setIsMapReady] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapboxRef = useRef<typeof mapboxgl | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const activePopupRestroomIdRef = useRef<string | null>(null);
  const hasBoundLayerEventsRef = useRef(false);
  const hasInitializedCameraRef = useRef(false);
  const previousLocationKeyRef = useRef<string>("");
  const mapHoveredRestroomIdRef = useRef<string | null>(null);
  const appliedHoveredRestroomIdRef = useRef<string | null>(null);
  const clickHandlerRef = useRef<((event: mapboxgl.MapLayerMouseEvent) => void) | null>(null);
  const mouseEnterHandlerRef = useRef<((event: mapboxgl.MapLayerMouseEvent) => void) | null>(null);
  const mouseLeaveHandlerRef = useRef<(() => void) | null>(null);
  const missingHoveredMarkerLogRef = useRef<Set<string>>(new Set());
  const invalidCoordinatesLogKeyRef = useRef<string>("");

  const markerData = useMemo(() => toFeatureCollection(restrooms), [restrooms]);
  const userLocationData = useMemo(() => toUserLocationFeatureCollection(userLocation), [userLocation]);
  const markerFeatureIds = useMemo(() => new Set(markerData.features.map((feature) => feature.properties.id)), [markerData]);

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

      const map = new mapbox.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM
      });

      map.addControl(new mapbox.NavigationControl(), "top-right");
      map.touchZoomRotate.disableRotation();
      map.dragRotate.disable();
      map.getCanvas().style.touchAction = "manipulation";
      if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) {
        map.doubleClickZoom.disable();
      }
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
      popupRef.current?.remove();
      popupRef.current = null;

      const map = mapRef.current;
      if (map) {
        if (clickHandlerRef.current) {
          map.off("click", HIT_LAYER_ID, clickHandlerRef.current);
        }
        if (mouseEnterHandlerRef.current) {
          map.off("mouseenter", HIT_LAYER_ID, mouseEnterHandlerRef.current);
        }
        if (mouseLeaveHandlerRef.current) {
          map.off("mouseleave", HIT_LAYER_ID, mouseLeaveHandlerRef.current);
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

        map.remove();
      }

      hasBoundLayerEventsRef.current = false;
      hasInitializedCameraRef.current = false;
      previousLocationKeyRef.current = "";
      mapHoveredRestroomIdRef.current = null;
      appliedHoveredRestroomIdRef.current = null;
      missingHoveredMarkerLogSet.clear();
      invalidCoordinatesLogKeyRef.current = "";
      clickHandlerRef.current = null;
      mouseEnterHandlerRef.current = null;
      mouseLeaveHandlerRef.current = null;
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

      if (previousId !== restroomId) {
        try {
          map.removeFeatureState({ source: SOURCE_ID });
        } catch {
          // Ignore feature-state reset errors while data sources refresh.
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

    const resolveHoveredRestroomId = () =>
      hoveredRestroomId ?? mapHoveredRestroomIdRef.current ?? activePopupRestroomIdRef.current;

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
            ["case", ["boolean", ["feature-state", "hovered"], false], 24, 0],
            14,
            ["case", ["boolean", ["feature-state", "hovered"], false], 32, 0]
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
            ["case", ["boolean", ["feature-state", "hovered"], false], 17, 10],
            14,
            ["case", ["boolean", ["feature-state", "hovered"], false], 21, 12]
          ],
          "circle-stroke-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            ["case", ["boolean", ["feature-state", "hovered"], false], 6, 2],
            14,
            ["case", ["boolean", ["feature-state", "hovered"], false], 7, 2]
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
      const clickHandler = (event: mapboxgl.MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== "Point") {
          return;
        }

        const properties = feature.properties as RestroomFeatureProperties | undefined;
        if (!properties) {
          return;
        }

        const { id, name, subtitle, distance_miles, overall_rating, quality_signals } = properties;
        if (!id || !name || !subtitle) {
          return;
        }

        onFocusedRestroomIdChange?.(id);

        if (activePopupRestroomIdRef.current === id) {
          router.push(`/restroom/${id}`);
          return;
        }

        popupRef.current?.remove();

        const popupContent = document.createElement("div");
        popupContent.className = "min-w-[210px] space-y-2 p-1";

        const title = document.createElement("p");
        title.className = "text-sm font-semibold text-slate-900";
        title.textContent = name;
        popupContent.appendChild(title);

        const subtitleLine = document.createElement("p");
        subtitleLine.className = "text-xs text-slate-600";
        subtitleLine.textContent = subtitle;
        popupContent.appendChild(subtitleLine);

        const qualitySignals = normalizeReviewQuickTags((quality_signals ?? "").split("|")).slice(0, 2);
        const overallRatingValue =
          typeof overall_rating === "number"
            ? overall_rating
            : typeof overall_rating === "string"
              ? Number.parseFloat(overall_rating)
              : NaN;
        const qualityLine = document.createElement("p");
        qualityLine.className = "text-xs font-semibold text-slate-700";

        const overallRatingLabel =
          Number.isFinite(overallRatingValue) && overallRatingValue > 0 ? `⭐ ${overallRatingValue.toFixed(1)}` : "⭐ N/A";
        if (qualitySignals.length > 0) {
          const signalLabel = qualitySignals
            .map((signal) => {
              const descriptor = getReviewQuickTagDescriptor(signal);
              return descriptor ? `${descriptor.icon} ${descriptor.label}` : signal;
            })
            .join(" • ");
          qualityLine.textContent = `${overallRatingLabel} • ${signalLabel}`;
        } else {
          qualityLine.textContent = overallRatingLabel;
        }
        popupContent.appendChild(qualityLine);

        const distanceMilesValue =
          typeof distance_miles === "number"
            ? distance_miles
            : typeof distance_miles === "string"
              ? Number.parseFloat(distance_miles)
              : NaN;
        const distanceLabel = showDistance ? toDistanceLabel(distanceMilesValue) : "";
        if (showDistance && distanceLabel) {
          const distanceLine = document.createElement("p");
          distanceLine.className = "text-xs font-semibold text-slate-700";
          distanceLine.textContent = distanceLabel;
          popupContent.appendChild(distanceLine);
        }

        const actions = document.createElement("div");
        actions.className = "flex items-center gap-2";

        const detailButton = document.createElement("button");
        detailButton.type = "button";
        detailButton.className =
          "inline-flex rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50";
        detailButton.textContent = "View details";
        detailButton.addEventListener("click", () => {
          router.push(`/restroom/${id}`);
        });
        actions.appendChild(detailButton);

        const [featureLng, featureLat] = feature.geometry.coordinates as [number, number];
        const navigateLink = document.createElement("a");
        navigateLink.href = getGoogleMapsDirectionsUrl(featureLat, featureLng);
        navigateLink.target = "_blank";
        navigateLink.rel = "noopener noreferrer";
        navigateLink.className =
          "inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-800";
        navigateLink.textContent = "Navigate";
        navigateLink.addEventListener("click", () => {
          captureAnalyticsEvent("navigate_clicked", {
            bathroom_id: id,
            source: "map_popup"
          });
        });
        actions.appendChild(navigateLink);

        popupContent.appendChild(actions);

        const popup = new mapbox.Popup({
          closeButton: false,
          offset: 14,
          maxWidth: "260px"
        })
          .setLngLat([featureLng, featureLat])
          .setDOMContent(popupContent)
          .addTo(map);

        popup.on("close", () => {
          if (popupRef.current === popup) {
            popupRef.current = null;
          }
          if (activePopupRestroomIdRef.current === id) {
            activePopupRestroomIdRef.current = null;
            onFocusedRestroomIdChange?.(null);
            setHoveredFeatureState(resolveHoveredRestroomId());
          }
        });

        popupRef.current = popup;
        activePopupRestroomIdRef.current = id;
        setHoveredFeatureState(resolveHoveredRestroomId());
      };

      const mouseEnterHandler = (event: mapboxgl.MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        const restroomId = feature?.properties?.id;
        if (typeof restroomId === "string") {
          mapHoveredRestroomIdRef.current = restroomId;
          setHoveredFeatureState(resolveHoveredRestroomId());
          onFocusedRestroomIdChange?.(restroomId);
        }
        map.getCanvas().style.cursor = "pointer";
      };

      const mouseLeaveHandler = () => {
        mapHoveredRestroomIdRef.current = null;
        setHoveredFeatureState(resolveHoveredRestroomId());
        if (activePopupRestroomIdRef.current) {
          onFocusedRestroomIdChange?.(activePopupRestroomIdRef.current);
        } else {
          onFocusedRestroomIdChange?.(null);
        }
        map.getCanvas().style.cursor = "";
      };

      map.on("click", HIT_LAYER_ID, clickHandler);
      map.on("mouseenter", HIT_LAYER_ID, mouseEnterHandler);
      map.on("mouseleave", HIT_LAYER_ID, mouseLeaveHandler);

      clickHandlerRef.current = clickHandler;
      mouseEnterHandlerRef.current = mouseEnterHandler;
      mouseLeaveHandlerRef.current = mouseLeaveHandler;
      hasBoundLayerEventsRef.current = true;
    }

    if (markerData.features.length === 0) {
      popupRef.current?.remove();
      popupRef.current = null;
      activePopupRestroomIdRef.current = null;
      mapHoveredRestroomIdRef.current = null;
      setHoveredFeatureState(null);
      onFocusedRestroomIdChange?.(null);
    }
    setHoveredFeatureState(resolveHoveredRestroomId());
  }, [hoveredRestroomId, isMapReady, markerData, onFocusedRestroomIdChange, restrooms.length, router, showDistance, userLocationData]);

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

    const currentLocationKey = getLocationKey(userLocation);
    const hasLocationChanged = previousLocationKeyRef.current !== currentLocationKey;
    previousLocationKeyRef.current = currentLocationKey;

    if (userLocation && isValidCoordinate(userLocation.lat, userLocation.lng) && hasLocationChanged) {
      map.easeTo({ center: [userLocation.lng, userLocation.lat], zoom: 13, duration: 700 });
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
  }, [isMapReady, markerData, userLocation]);

  useEffect(() => {
    if (!isMapReady || !onViewportBoundsChange) {
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

      onViewportBoundsChange({
        minLat: bounds.getSouth(),
        maxLat: bounds.getNorth(),
        minLng: bounds.getWest(),
        maxLng: bounds.getEast()
      });
    };

    map.on("moveend", emitBounds);
    emitBounds();

    return () => {
      map.off("moveend", emitBounds);
    };
  }, [isMapReady, onViewportBoundsChange]);

  return <div ref={mapContainerRef} className="h-full w-full" />;
}
