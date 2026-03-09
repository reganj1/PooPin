"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type mapboxgl from "mapbox-gl";
import type { FeatureCollection, Point } from "geojson";
import { NearbyBathroom } from "@/types";

interface RestroomMapProps {
  restrooms: NearbyBathroom[];
  accessToken: string;
  userLocation?: {
    lat: number;
    lng: number;
  } | null;
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
  address: string;
  overall_rating: number;
  smell_rating: number;
  cleanliness_rating: number;
}

const SOURCE_ID = "restrooms-source";
const MARKER_LAYER_ID = "restrooms-marker-layer";
const LABEL_LAYER_ID = "restrooms-label-layer";
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
          name: restroom.name,
          address: restroom.address,
          overall_rating: restroom.ratings.overall,
          smell_rating: restroom.ratings.smell,
          cleanliness_rating: restroom.ratings.cleanliness
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

const toDisplayRating = (value: number) => (value > 0 ? value.toFixed(1) : "N/A");

const getLocationKey = (location: { lat: number; lng: number } | null) =>
  location ? `${location.lat.toFixed(5)}:${location.lng.toFixed(5)}` : "";

export function RestroomMap({ restrooms, accessToken, userLocation = null, onViewportBoundsChange }: RestroomMapProps) {
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
  const clickHandlerRef = useRef<((event: mapboxgl.MapLayerMouseEvent) => void) | null>(null);
  const mouseEnterHandlerRef = useRef<(() => void) | null>(null);
  const mouseLeaveHandlerRef = useRef<(() => void) | null>(null);

  const markerData = useMemo(() => toFeatureCollection(restrooms), [restrooms]);
  const userLocationData = useMemo(() => toUserLocationFeatureCollection(userLocation), [userLocation]);

  useEffect(() => {
    let cancelled = false;

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
          map.off("click", MARKER_LAYER_ID, clickHandlerRef.current);
        }
        if (mouseEnterHandlerRef.current) {
          map.off("mouseenter", MARKER_LAYER_ID, mouseEnterHandlerRef.current);
        }
        if (mouseLeaveHandlerRef.current) {
          map.off("mouseleave", MARKER_LAYER_ID, mouseLeaveHandlerRef.current);
        }

        if (map.getLayer(LABEL_LAYER_ID)) {
          map.removeLayer(LABEL_LAYER_ID);
        }
        if (map.getLayer(MARKER_LAYER_ID)) {
          map.removeLayer(MARKER_LAYER_ID);
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
      clickHandlerRef.current = null;
      mouseEnterHandlerRef.current = null;
      mouseLeaveHandlerRef.current = null;
      mapRef.current = null;
      mapboxRef.current = null;
    };
  }, [accessToken]);

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

    const existingSource = map.getSource(SOURCE_ID);
    if (existingSource) {
      (existingSource as mapboxgl.GeoJSONSource).setData(markerData);
    } else {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: markerData
      });
    }

    if (!map.getLayer(MARKER_LAYER_ID)) {
      map.addLayer({
        id: MARKER_LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        paint: {
          "circle-color": "#111827",
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 10, 14, 12],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff"
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

        const { id, name, address, overall_rating, smell_rating, cleanliness_rating } = properties;
        if (!id || !name || !address) {
          return;
        }

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

        const addressLine = document.createElement("p");
        addressLine.className = "text-xs text-slate-600";
        addressLine.textContent = address;
        popupContent.appendChild(addressLine);

        const ratingsLine = document.createElement("p");
        ratingsLine.className = "text-xs text-slate-700";
        ratingsLine.textContent = `Overall ${toDisplayRating(overall_rating)} • Smell ${toDisplayRating(smell_rating)} • Clean ${toDisplayRating(cleanliness_rating)}`;
        popupContent.appendChild(ratingsLine);

        const detailButton = document.createElement("button");
        detailButton.type = "button";
        detailButton.className =
          "inline-flex rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50";
        detailButton.textContent = "Open restroom";
        detailButton.addEventListener("click", () => {
          router.push(`/restroom/${id}`);
        });
        popupContent.appendChild(detailButton);

        const popup = new mapbox.Popup({
          closeButton: false,
          offset: 14,
          maxWidth: "260px"
        })
          .setLngLat(feature.geometry.coordinates as [number, number])
          .setDOMContent(popupContent)
          .addTo(map);

        popup.on("close", () => {
          if (popupRef.current === popup) {
            popupRef.current = null;
          }
          if (activePopupRestroomIdRef.current === id) {
            activePopupRestroomIdRef.current = null;
          }
        });

        popupRef.current = popup;
        activePopupRestroomIdRef.current = id;
      };

      const mouseEnterHandler = () => {
        map.getCanvas().style.cursor = "pointer";
      };

      const mouseLeaveHandler = () => {
        map.getCanvas().style.cursor = "";
      };

      map.on("click", MARKER_LAYER_ID, clickHandler);
      map.on("mouseenter", MARKER_LAYER_ID, mouseEnterHandler);
      map.on("mouseleave", MARKER_LAYER_ID, mouseLeaveHandler);

      clickHandlerRef.current = clickHandler;
      mouseEnterHandlerRef.current = mouseEnterHandler;
      mouseLeaveHandlerRef.current = mouseLeaveHandler;
      hasBoundLayerEventsRef.current = true;
    }

    if (markerData.features.length === 0) {
      popupRef.current?.remove();
      popupRef.current = null;
      activePopupRestroomIdRef.current = null;
    }
  }, [isMapReady, markerData, restrooms.length, router, userLocationData]);

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
