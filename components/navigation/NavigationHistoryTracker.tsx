"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { rememberNavigationRoute } from "@/lib/navigation/history";

export function NavigationHistoryTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const queryString = searchParams.toString();
    const currentRoute = `${pathname}${queryString ? `?${queryString}` : ""}`;
    rememberNavigationRoute(currentRoute);
  }, [pathname, searchParams]);

  return null;
}
