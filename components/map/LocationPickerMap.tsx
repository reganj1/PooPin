"use client";

import { useEffect, useRef, useState } from "react";
import type mapboxgl from "mapbox-gl";
import { MAPBOX_ACCESS_TOKEN, isMapboxConfigured } from "@/lib/mapbox/config";
import { cn } from "@/lib/utils/cn";

interface Coordinates {
  lat: number;
  lng: number;
}

interface LocationPickerMapProps {
  coordinates: Coordinates;
  onCoordinatesChange: (coordinates: Coordinates) => void;
  className?: string;
}

const DEFAULT_CENTER: [number, number] = [-122.4194, 37.7749];
const DEFAULT_ZOOM = 13;

const isValidCoordinate = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

const toCoordinateKey = (coordinates: Coordinates) => `${coordinates.lat.toFixed(6)}:${coordinates.lng.toFixed(6)}`;

export function LocationPickerMap({ coordinates, onCoordinatesChange, className }: LocationPickerMapProps) {
  const [isMapReady, setIsMapReady] = useState(false);
  const coordinateLat = coordinates.lat;
  const coordinateLng = coordinates.lng;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const lastCoordinateKeyRef = useRef<string>("");
  const initialCoordinatesRef = useRef(coordinates);

  useEffect(() => {
    if (!isMapboxConfigured) {
      return;
    }

    let cancelled = false;

    const initMap = async () => {
      if (!containerRef.current || mapRef.current) {
        return;
      }

      const mapboxModule = await import("mapbox-gl");
      if (cancelled || !containerRef.current) {
        return;
      }

      const mapbox = mapboxModule.default;
      mapbox.accessToken = MAPBOX_ACCESS_TOKEN;

      const initialCoordinates = initialCoordinatesRef.current;
      const center = isValidCoordinate(initialCoordinates.lat, initialCoordinates.lng)
        ? ([initialCoordinates.lng, initialCoordinates.lat] as [number, number])
        : DEFAULT_CENTER;

      const map = new mapbox.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center,
        zoom: DEFAULT_ZOOM
      });

      map.addControl(new mapbox.NavigationControl(), "top-right");

      map.on("load", () => {
        if (cancelled) {
          return;
        }

        const marker = new mapbox.Marker({ draggable: true })
          .setLngLat(center)
          .addTo(map)
          .on("dragend", () => {
            const lngLat = marker.getLngLat();
            onCoordinatesChange({
              lat: Number(lngLat.lat.toFixed(6)),
              lng: Number(lngLat.lng.toFixed(6))
            });
          });

        markerRef.current = marker;
        lastCoordinateKeyRef.current = toCoordinateKey({
          lat: center[1],
          lng: center[0]
        });
        setIsMapReady(true);
      });

      map.on("click", (event) => {
        const marker = markerRef.current;
        if (!marker) {
          return;
        }

        const nextCoordinates = {
          lat: Number(event.lngLat.lat.toFixed(6)),
          lng: Number(event.lngLat.lng.toFixed(6))
        };

        marker.setLngLat([nextCoordinates.lng, nextCoordinates.lat]);
        onCoordinatesChange(nextCoordinates);
      });

      mapRef.current = map;
    };

    void initMap();

    return () => {
      cancelled = true;
      setIsMapReady(false);
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      lastCoordinateKeyRef.current = "";
    };
  }, [onCoordinatesChange]);

  useEffect(() => {
    if (!isMapboxConfigured || !isMapReady) {
      return;
    }

    if (!isValidCoordinate(coordinateLat, coordinateLng)) {
      return;
    }

    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) {
      return;
    }

    const nextKey = toCoordinateKey({ lat: coordinateLat, lng: coordinateLng });
    if (lastCoordinateKeyRef.current === nextKey) {
      return;
    }

    lastCoordinateKeyRef.current = nextKey;
    marker.setLngLat([coordinateLng, coordinateLat]);
    map.easeTo({
      center: [coordinateLng, coordinateLat],
      duration: 500
    });
  }, [coordinateLat, coordinateLng, isMapReady]);

  if (!isMapboxConfigured) {
    return (
      <div className={cn("rounded-2xl border border-slate-200 bg-slate-50 p-4", className)}>
        <p className="text-sm font-semibold text-slate-800">Map setup pending</p>
        <p className="mt-1 text-xs text-slate-600">
          Pin placement is temporarily unavailable. You can still submit using your current location and address details.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-slate-200 bg-white", className)}>
      <div ref={containerRef} className="h-[280px] w-full sm:h-[320px]" />
    </div>
  );
}
