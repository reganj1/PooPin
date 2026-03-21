"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { captureAnalyticsEvent } from "@/lib/analytics/posthog";
import type { AnalyticsViewportMode, MapProvider, NavigateClickSource } from "@/lib/analytics/posthog";
import {
  detectMapsPlatform,
  getPreferredDirectionsUrl,
  type MapsPlatform
} from "@/lib/utils/maps";

const SAME_TAB_NAVIGATION_DELAY_MS = 90;

interface TrackedNavigateLinkProps {
  latitude: number;
  longitude: number;
  bathroomId: string;
  source: NavigateClickSource;
  className: string;
  children: ReactNode;
  sourceSurface?: "restroom_card" | "restroom_detail" | "map_popup" | "mobile_preview" | "desktop_hover_popup";
  viewportMode?: AnalyticsViewportMode;
  hasUserLocation?: boolean;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  dataRestroomCardAction?: boolean;
}

export function TrackedNavigateLink({
  latitude,
  longitude,
  bathroomId,
  source,
  className,
  children,
  sourceSurface,
  viewportMode,
  hasUserLocation,
  onClick,
  dataRestroomCardAction = false
}: TrackedNavigateLinkProps) {
  const [platform, setPlatform] = useState<MapsPlatform>("desktop");

  useEffect(() => {
    setPlatform(detectMapsPlatform());
  }, []);

  const getMapProviderForPlatform = (destinationPlatform: MapsPlatform): MapProvider =>
    destinationPlatform === "ios" ? "apple_maps" : "google_maps";

  const captureNavigateClick = (mapProvider: MapProvider) => {
    captureAnalyticsEvent("navigate_clicked", {
      bathroom_id: bathroomId,
      source,
      map_provider: mapProvider,
      source_surface: sourceSurface,
      viewport_mode: viewportMode,
      has_user_location: hasUserLocation
    });
  };

  const navigateToUrl = (url: string, destinationPlatform: MapsPlatform) => {
    if (typeof window === "undefined") {
      return;
    }

    if (destinationPlatform === "desktop") {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    window.setTimeout(() => {
      window.location.assign(url);
    }, SAME_TAB_NAVIGATION_DELAY_MS);
  };

  const handlePrimaryClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) {
      return;
    }

    const destinationPlatform = detectMapsPlatform();
    event.preventDefault();
    captureNavigateClick(getMapProviderForPlatform(destinationPlatform));
    navigateToUrl(getPreferredDirectionsUrl(latitude, longitude, destinationPlatform), destinationPlatform);
  };

  return (
    <a
      href={getPreferredDirectionsUrl(latitude, longitude, platform)}
      target={platform === "desktop" ? "_blank" : undefined}
      rel={platform === "desktop" ? "noopener noreferrer" : undefined}
      className={className}
      onClick={handlePrimaryClick}
      data-restroom-card-action={dataRestroomCardAction ? "true" : undefined}
    >
      {children}
    </a>
  );
}
