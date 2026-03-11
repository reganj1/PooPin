"use client";

import posthog from "posthog-js";

export type NavigateClickSource = "restroom_card" | "restroom_detail" | "map_popup";

export type PoopinAnalyticsEventName =
  | "restroom_viewed"
  | "review_submitted"
  | "restroom_submitted"
  | "photo_uploaded"
  | "expand_map_clicked"
  | "navigate_clicked";

interface PoopinAnalyticsEventProperties {
  restroom_viewed: {
    bathroom_id: string;
    source: "detail_page";
  };
  review_submitted: {
    bathroom_id: string;
    overall_rating: number;
    quick_tag_count: number;
  };
  restroom_submitted: {
    bathroom_id: string;
    status: string;
  };
  photo_uploaded: {
    bathroom_id: string;
    moderation_state: "pending";
  };
  expand_map_clicked: {
    source: "homepage_map";
  };
  navigate_clicked: {
    bathroom_id: string;
    source: NavigateClickSource;
  };
}

declare global {
  interface Window {
    posthog?: typeof posthog;
    __poopinPostHogInitialized?: boolean;
  }
}

const posthogApiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() ?? "";
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() ?? "";
const normalizedPosthogHost = posthogHost.replace(/\/+$/, "");

export const shouldEnablePostHog = process.env.NODE_ENV === "production" && Boolean(posthogApiKey && normalizedPosthogHost);

const canCaptureEvents = () => {
  if (typeof window === "undefined") {
    return false;
  }

  return Boolean(window.__poopinPostHogInitialized && typeof window.posthog?.capture === "function");
};

export const initPostHog = () => {
  if (!shouldEnablePostHog || typeof window === "undefined") {
    return;
  }

  if (window.__poopinPostHogInitialized) {
    window.posthog = posthog;
    return;
  }

  posthog.init(posthogApiKey, {
    api_host: normalizedPosthogHost,
    autocapture: false,
    capture_pageview: false,
    disable_session_recording: false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "[data-ph-mask]",
      blockSelector: "[data-ph-no-capture]"
    }
  });

  window.posthog = posthog;
  window.__poopinPostHogInitialized = true;
};

export const capturePageview = (pathname: string) => {
  if (!shouldEnablePostHog || typeof window === "undefined") {
    return;
  }

  if (!window.__poopinPostHogInitialized) {
    initPostHog();
  }

  if (canCaptureEvents()) {
    window.posthog?.capture("$pageview", {
      pathname,
      current_url: window.location.href
    });
  }
};

export const captureAnalyticsEvent = <T extends PoopinAnalyticsEventName>(
  eventName: T,
  properties: PoopinAnalyticsEventProperties[T]
) => {
  if (!shouldEnablePostHog) {
    return;
  }

  if (typeof window !== "undefined" && !window.__poopinPostHogInitialized) {
    initPostHog();
  }

  const payload = properties as unknown as Record<string, unknown>;
  if (canCaptureEvents()) {
    window.posthog?.capture(eventName, payload);
  }
};
