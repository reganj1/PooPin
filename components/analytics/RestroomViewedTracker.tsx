"use client";

import { useEffect } from "react";
import { captureAnalyticsEvent } from "@/lib/analytics/posthog";
import type { BathroomAccessType } from "@/types";

interface RestroomViewedTrackerProps {
  bathroomId: string;
  city?: string;
  accessType?: BathroomAccessType;
}

export function RestroomViewedTracker({ bathroomId, city, accessType }: RestroomViewedTrackerProps) {
  useEffect(() => {
    captureAnalyticsEvent("restroom_viewed", {
      bathroom_id: bathroomId,
      source: "detail_page",
      source_surface: "detail_page",
      city,
      access_type: accessType
    });
  }, [accessType, bathroomId, city]);

  return null;
}
