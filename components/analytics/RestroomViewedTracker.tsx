"use client";

import { useEffect } from "react";
import { captureAnalyticsEvent } from "@/lib/analytics/posthog";

interface RestroomViewedTrackerProps {
  bathroomId: string;
}

export function RestroomViewedTracker({ bathroomId }: RestroomViewedTrackerProps) {
  useEffect(() => {
    captureAnalyticsEvent("restroom_viewed", {
      bathroom_id: bathroomId,
      source: "detail_page"
    });
  }, [bathroomId]);

  return null;
}
