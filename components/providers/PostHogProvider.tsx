"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { capturePageview, initPostHog, shouldEnablePostHog } from "@/lib/analytics/posthog";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    initPostHog();
  }, []);

  useEffect(() => {
    if (!shouldEnablePostHog || !pathname) {
      return;
    }

    capturePageview(pathname);
  }, [pathname]);

  return <>{children}</>;
}
