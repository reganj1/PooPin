"use client";

import type { ReactNode } from "react";
import { captureAnalyticsEvent } from "@/lib/analytics/posthog";
import type { AnalyticsViewportMode, NavigateClickSource } from "@/lib/analytics/posthog";

interface TrackedNavigateLinkProps {
  href: string;
  bathroomId: string;
  source: NavigateClickSource;
  className: string;
  children: ReactNode;
  sourceSurface?: "restroom_card" | "restroom_detail" | "map_popup" | "mobile_preview" | "desktop_hover_popup";
  viewportMode?: AnalyticsViewportMode;
  hasUserLocation?: boolean;
}

export function TrackedNavigateLink({
  href,
  bathroomId,
  source,
  className,
  children,
  sourceSurface,
  viewportMode,
  hasUserLocation
}: TrackedNavigateLinkProps) {
  const handleClick = () => {
    captureAnalyticsEvent("navigate_clicked", {
      bathroom_id: bathroomId,
      source,
      source_surface: sourceSurface,
      viewport_mode: viewportMode,
      has_user_location: hasUserLocation
    });
  };

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={handleClick}>
      {children}
    </a>
  );
}
