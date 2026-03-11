"use client";

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

type PendingEvent = {
  eventName: string;
  properties?: Record<string, unknown>;
};

interface PostHogClient {
  init: (apiKey: string, options?: Record<string, unknown>) => void;
  capture: (eventName: string, properties?: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    posthog?: PostHogClient;
    __poopinPostHogLoaded?: boolean;
    __poopinPostHogLoading?: boolean;
  }
}

const posthogApiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() ?? "";
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() ?? "";
const normalizedPosthogHost = posthogHost.replace(/\/+$/, "");
const POSTHOG_SCRIPT_PATH = "/static/array.js";
const MAX_PENDING_EVENTS = 120;

const pendingEvents: PendingEvent[] = [];

export const shouldEnablePostHog = process.env.NODE_ENV === "production" && Boolean(posthogApiKey && normalizedPosthogHost);

const canCaptureEvents = () => typeof window !== "undefined" && typeof window.posthog?.capture === "function";

const queueEvent = (eventName: string, properties?: Record<string, unknown>) => {
  if (pendingEvents.length >= MAX_PENDING_EVENTS) {
    pendingEvents.shift();
  }

  pendingEvents.push({ eventName, properties });
};

const flushPendingEvents = () => {
  if (!canCaptureEvents()) {
    return;
  }

  while (pendingEvents.length > 0) {
    const next = pendingEvents.shift();
    if (!next) {
      continue;
    }

    window.posthog?.capture(next.eventName, next.properties);
  }
};

export const initPostHog = () => {
  if (!shouldEnablePostHog || typeof window === "undefined") {
    return;
  }

  if (window.__poopinPostHogLoaded) {
    flushPendingEvents();
    return;
  }

  if (window.__poopinPostHogLoading) {
    return;
  }

  window.__poopinPostHogLoading = true;

  const script = document.createElement("script");
  script.async = true;
  script.src = `${normalizedPosthogHost}${POSTHOG_SCRIPT_PATH}`;
  script.onload = () => {
    if (typeof window.posthog?.init === "function") {
      window.posthog.init(posthogApiKey, {
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
    }

    window.__poopinPostHogLoaded = true;
    window.__poopinPostHogLoading = false;
    flushPendingEvents();
  };

  script.onerror = () => {
    window.__poopinPostHogLoading = false;
  };

  document.head.appendChild(script);
};

export const capturePageview = (pathname: string) => {
  if (!shouldEnablePostHog) {
    return;
  }

  const properties = {
    pathname
  };

  if (canCaptureEvents()) {
    window.posthog?.capture("$pageview", properties);
    return;
  }

  queueEvent("$pageview", properties);
};

export const captureAnalyticsEvent = <T extends PoopinAnalyticsEventName>(
  eventName: T,
  properties: PoopinAnalyticsEventProperties[T]
) => {
  if (!shouldEnablePostHog) {
    return;
  }

  const payload = properties as unknown as Record<string, unknown>;
  if (canCaptureEvents()) {
    window.posthog?.capture(eventName, payload);
    return;
  }

  queueEvent(eventName, payload);
};
