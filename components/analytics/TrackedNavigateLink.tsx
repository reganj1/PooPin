"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { captureAnalyticsEvent } from "@/lib/analytics/posthog";
import type { AnalyticsViewportMode, NavigateClickSource } from "@/lib/analytics/posthog";
import { cn } from "@/lib/utils/cn";
import {
  detectMapsPlatform,
  getGoogleMapsDirectionsUrl,
  getPreferredDirectionsUrl,
  type MapsPlatform
} from "@/lib/utils/maps";

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
  showIOSGoogleMapsOption?: boolean;
  alternateClassName?: string;
  alternateLabel?: string;
  containerClassName?: string;
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
  dataRestroomCardAction = false,
  showIOSGoogleMapsOption = false,
  alternateClassName,
  alternateLabel = "Open in Google Maps",
  containerClassName
}: TrackedNavigateLinkProps) {
  const [platform, setPlatform] = useState<MapsPlatform>("desktop");

  useEffect(() => {
    setPlatform(detectMapsPlatform());
  }, []);

  const captureNavigateClick = () => {
    captureAnalyticsEvent("navigate_clicked", {
      bathroom_id: bathroomId,
      source,
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

    window.location.assign(url);
  };

  const handlePrimaryClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) {
      return;
    }

    event.preventDefault();
    captureNavigateClick();

    const destinationPlatform = detectMapsPlatform();
    navigateToUrl(getPreferredDirectionsUrl(latitude, longitude, destinationPlatform), destinationPlatform);
  };

  const handleAlternateClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.stopPropagation();
    onClick?.(event);
    if (event.defaultPrevented) {
      return;
    }

    event.preventDefault();
    captureNavigateClick();
    navigateToUrl(getGoogleMapsDirectionsUrl(latitude, longitude), "ios");
  };

  const primaryLink = (
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

  if (!(showIOSGoogleMapsOption && platform === "ios")) {
    return primaryLink;
  }

  return (
    <div className={cn("flex flex-col items-start gap-1.5", containerClassName)}>
      {primaryLink}
      <a
        href={getGoogleMapsDirectionsUrl(latitude, longitude)}
        className={cn(
          "text-[11px] font-medium text-slate-500 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-700",
          alternateClassName
        )}
        onClick={handleAlternateClick}
        data-restroom-card-action={dataRestroomCardAction ? "true" : undefined}
      >
        {alternateLabel}
      </a>
    </div>
  );
}
