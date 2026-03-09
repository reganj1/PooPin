"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type mapboxgl from "mapbox-gl";
import { NearbyBathroom } from "@/types";

interface RestroomMapProps {
  restrooms: NearbyBathroom[];
  accessToken: string;
}

interface MarkerRecord {
  marker: mapboxgl.Marker;
  element: HTMLButtonElement;
  handleClick: () => void;
}

const DEFAULT_CENTER: [number, number] = [-122.4194, 37.7749];
const DEFAULT_ZOOM = 12;

const isValidCoordinate = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng);

export function RestroomMap({ restrooms, accessToken }: RestroomMapProps) {
  const router = useRouter();
  const [isMapReady, setIsMapReady] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapboxRef = useRef<typeof mapboxgl | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRefs = useRef<MarkerRecord[]>([]);

  useEffect(() => {
    const clearMarkers = () => {
      markerRefs.current.forEach(({ marker, element, handleClick }) => {
        element.removeEventListener("click", handleClick);
        marker.remove();
      });
      markerRefs.current = [];
    };

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
      clearMarkers();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
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

    const clearMarkers = () => {
      markerRefs.current.forEach(({ marker, element, handleClick }) => {
        element.removeEventListener("click", handleClick);
        marker.remove();
      });
      markerRefs.current = [];
    };

    const applyMarkers = () => {
      clearMarkers();

      const validRestrooms = restrooms.filter((restroom) => isValidCoordinate(restroom.lat, restroom.lng));
      if (process.env.NODE_ENV !== "production" && validRestrooms.length !== restrooms.length) {
        console.warn("[Poopin] Some restrooms have invalid coordinates and were skipped for map markers.");
      }

      if (validRestrooms.length === 0) {
        map.easeTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, duration: 0 });
        return;
      }

      const bounds = new mapbox.LngLatBounds();

      validRestrooms.forEach((restroom) => {
        const element = document.createElement("button");
        element.type = "button";
        element.className = "transition hover:scale-110";
        element.style.width = "18px";
        element.style.height = "18px";
        element.style.borderRadius = "9999px";
        element.style.border = "2px solid #ffffff";
        element.style.background = "#1876f2";
        element.style.boxShadow = "0 0 0 1px rgba(15, 37, 74, 0.22)";
        element.style.cursor = "pointer";
        element.setAttribute("aria-label", `Open ${restroom.name}`);

        const handleClick = () => {
          router.push(`/restroom/${restroom.id}`);
        };

        element.addEventListener("click", handleClick);

        const marker = new mapbox.Marker({ element, anchor: "center" })
          .setLngLat([restroom.lng, restroom.lat])
          .addTo(map);

        markerRefs.current.push({ marker, element, handleClick });
        bounds.extend([restroom.lng, restroom.lat]);
      });

      if (validRestrooms.length === 1) {
        map.easeTo({ center: [validRestrooms[0].lng, validRestrooms[0].lat], zoom: 14, duration: 700 });
        return;
      }

      map.fitBounds(bounds, {
        padding: 48,
        maxZoom: 14,
        duration: 700
      });
    };

    applyMarkers();

    return () => {
      clearMarkers();
    };
  }, [isMapReady, restrooms, router]);

  return <div ref={mapContainerRef} className="h-full w-full" />;
}
