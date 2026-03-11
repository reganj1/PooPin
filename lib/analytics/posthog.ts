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

interface PostHogRuntimeConfig {
  apiKey: string;
  apiHost: string;
}

declare global {
  interface Window {
    posthog?: typeof posthog;
    __poopinPostHogInitialized?: boolean;
    __poopinPostHogConfig?: PostHogRuntimeConfig;
  }
}

const normalizePostHogConfig = (config: Partial<PostHogRuntimeConfig>): PostHogRuntimeConfig | null => {
  const apiKey = config.apiKey?.trim() ?? "";
  const apiHost = config.apiHost?.trim().replace(/\/+$/, "") ?? "";

  if (!apiKey || !apiHost) {
    return null;
  }

  return {
    apiKey,
    apiHost
  };
};

const getPostHogConfig = (): PostHogRuntimeConfig | null => {
  if (typeof window !== "undefined") {
    return window.__poopinPostHogConfig ?? null;
  }

  return normalizePostHogConfig({
    apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    apiHost: process.env.NEXT_PUBLIC_POSTHOG_HOST
  });
};

const isDevPostHogOverrideEnabled = () => {
  const value = process.env.NEXT_PUBLIC_ENABLE_POSTHOG_DEV?.trim().toLowerCase();
  return value === "true" || value === "1";
};

export const shouldEnablePostHog = () => {
  const hasConfig = Boolean(getPostHogConfig());
  if (!hasConfig) {
    return false;
  }

  if (process.env.NODE_ENV === "production") {
    return true;
  }

  return isDevPostHogOverrideEnabled();
};

const canCaptureEvents = () => {
  if (typeof window === "undefined") {
    return false;
  }

  return Boolean(window.__poopinPostHogInitialized && typeof window.posthog?.capture === "function");
};

export const initPostHog = (config?: Partial<PostHogRuntimeConfig>) => {
  if (typeof window === "undefined") {
    return;
  }

  if (config) {
    const normalizedConfig = normalizePostHogConfig(config);
    window.__poopinPostHogConfig = normalizedConfig ?? undefined;
  }

  if (!shouldEnablePostHog()) {
    return;
  }

  const runtimeConfig = getPostHogConfig();
  if (!runtimeConfig) {
    return;
  }

  if (window.__poopinPostHogInitialized) {
    window.posthog = posthog;
    return;
  }

  posthog.init(runtimeConfig.apiKey, {
    api_host: runtimeConfig.apiHost,
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
  if (typeof window === "undefined" || !shouldEnablePostHog()) {
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
  if (!shouldEnablePostHog()) {
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
