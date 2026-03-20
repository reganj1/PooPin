"use client";

import posthog from "posthog-js";

export type NavigateClickSource = "restroom_card" | "restroom_detail" | "map_popup" | "mobile_preview";
export type AnalyticsViewportMode = "homepage" | "expanded_map";
export type AnalyticsSurface =
  | "homepage"
  | "detail_page"
  | "restroom_card"
  | "restroom_detail"
  | "map_marker"
  | "desktop_hover_popup"
  | "map_popup"
  | "mobile_preview"
  | "homepage_controls"
  | "expanded_map_controls"
  | "add_restroom_form"
  | "review_form"
  | "photo_upload_form";

interface AnalyticsContextProperties {
  source_surface?: AnalyticsSurface;
  viewport_mode?: AnalyticsViewportMode;
  has_user_location?: boolean;
}

export type PoopinAnalyticsEventName =
  | "page_view_home"
  | "expand_map_clicked"
  | "locate_clicked"
  | "restroom_marker_clicked"
  | "restroom_popup_opened"
  | "restroom_viewed"
  | "navigate_clicked"
  | "add_restroom_started"
  | "restroom_submitted"
  | "review_started"
  | "review_submitted"
  | "photo_uploaded";

interface PoopinAnalyticsEventProperties {
  page_view_home: {
    source_surface: "homepage";
    viewport_mode: "homepage";
  };
  expand_map_clicked: {
    source: "homepage_map";
  } & AnalyticsContextProperties;
  locate_clicked: AnalyticsContextProperties & {
    source_surface: "homepage_controls" | "expanded_map_controls" | "add_restroom_form";
    status: "requested" | "recenter_requested";
  };
  restroom_marker_clicked: AnalyticsContextProperties & {
    bathroom_id: string;
    source_surface: "map_marker";
  };
  restroom_popup_opened: AnalyticsContextProperties & {
    bathroom_id: string;
    source_surface: "desktop_hover_popup" | "mobile_preview";
  };
  restroom_viewed: {
    bathroom_id: string;
    source: "detail_page";
    source_surface: "detail_page";
  };
  navigate_clicked: {
    bathroom_id: string;
    source: NavigateClickSource;
  } & AnalyticsContextProperties;
  add_restroom_started: {
    source_surface: "add_restroom_form";
  };
  restroom_submitted: {
    bathroom_id: string;
    status: string;
    source_surface: "add_restroom_form";
  };
  review_started: {
    bathroom_id: string;
    source_surface: "review_form";
  };
  review_submitted: {
    bathroom_id: string;
    overall_rating: number;
    quick_tag_count: number;
    source_surface: "review_form";
  };
  photo_uploaded: {
    bathroom_id: string;
    moderation_state: "pending";
    source_surface: "photo_upload_form";
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

const buildEventPayload = <T extends PoopinAnalyticsEventName>(properties: PoopinAnalyticsEventProperties[T]) => {
  if (typeof window === "undefined") {
    return properties as Record<string, unknown>;
  }

  return {
    ...(properties as Record<string, unknown>),
    app_hostname: window.location.hostname,
    app_pathname: window.location.pathname
  };
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

  const payload = buildEventPayload(properties);
  if (canCaptureEvents()) {
    window.posthog?.capture(eventName, payload);
  }
};
