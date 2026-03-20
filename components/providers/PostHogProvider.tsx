"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { captureAnalyticsEvent, initPostHog } from "@/lib/analytics/posthog";

interface PostHogProviderProps {
  children: React.ReactNode;
  posthogKey?: string;
  posthogHost?: string;
}

export function PostHogProvider({ children, posthogKey = "", posthogHost = "" }: PostHogProviderProps) {
  const pathname = usePathname();

  useEffect(() => {
    initPostHog({
      apiKey: posthogKey,
      apiHost: posthogHost
    });
  }, [posthogHost, posthogKey]);

  useEffect(() => {
    if (pathname === "/") {
      captureAnalyticsEvent("page_view_home", {
        source_surface: "homepage",
        viewport_mode: "homepage"
      });
    }
  }, [pathname]);

  return <>{children}</>;
}
