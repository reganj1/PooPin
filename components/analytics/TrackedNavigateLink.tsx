"use client";

import type { ReactNode } from "react";
import { captureAnalyticsEvent, NavigateClickSource } from "@/lib/analytics/posthog";

interface TrackedNavigateLinkProps {
  href: string;
  bathroomId: string;
  source: NavigateClickSource;
  className: string;
  children: ReactNode;
}

export function TrackedNavigateLink({ href, bathroomId, source, className, children }: TrackedNavigateLinkProps) {
  const handleClick = () => {
    captureAnalyticsEvent("navigate_clicked", {
      bathroom_id: bathroomId,
      source
    });
  };

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={handleClick}>
      {children}
    </a>
  );
}
