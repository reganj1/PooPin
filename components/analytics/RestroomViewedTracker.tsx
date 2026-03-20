"use client";

import { useEffect } from "react";
import { captureAnalyticsEvent } from "@/lib/analytics/posthog";

interface RestroomViewedTrackerProps {
  bathroomId: string;
}

const viewedEventLastSentAtByBathroomId = new Map<string, number>();

export function RestroomViewedTracker({ bathroomId }: RestroomViewedTrackerProps) {
  useEffect(() => {
    const now = Date.now();
    const previousSentAt = viewedEventLastSentAtByBathroomId.get(bathroomId) ?? 0;
    if (now - previousSentAt < 2000) {
      return;
    }

    viewedEventLastSentAtByBathroomId.set(bathroomId, now);
    captureAnalyticsEvent("restroom_viewed", {
      bathroom_id: bathroomId,
      source: "detail_page",
      source_surface: "detail_page"
    });
  }, [bathroomId]);

  return null;
}
