"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { captureAnalyticsEvent, capturePageview, initPostHog } from "@/lib/analytics/posthog";

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
    if (!pathname) {
      return;
    }

    capturePageview(pathname);

    if (pathname === "/") {
      captureAnalyticsEvent("page_view_home", {
        source_surface: "homepage",
        viewport_mode: "homepage"
      });
      return;
    }

    const restroomMatch = pathname.match(/^\/restroom\/([^/]+)$/);
    if (restroomMatch) {
      captureAnalyticsEvent("page_view_restroom_detail", {
        bathroom_id: restroomMatch[1],
        source_surface: "detail_page"
      });
    }
  }, [pathname]);

  return <>{children}</>;
}
