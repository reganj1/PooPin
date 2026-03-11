"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { capturePageview, initPostHog } from "@/lib/analytics/posthog";

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
  }, [pathname]);

  return <>{children}</>;
}
