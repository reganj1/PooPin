"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MouseEvent } from "react";
import { getPreviousMeaningfulRoute } from "@/lib/navigation/history";
import { cn } from "@/lib/utils/cn";

interface MobileBackButtonProps {
  fallbackHref: string;
  preferredHref?: string | null;
  label?: string;
  className?: string;
}

export function MobileBackButton({
  fallbackHref,
  preferredHref,
  label = "Back",
  className
}: MobileBackButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();

    const currentQueryString = searchParams.toString();
    const currentRoute = `${pathname}${currentQueryString ? `?${currentQueryString}` : ""}`;
    const previousRoute = getPreviousMeaningfulRoute(currentRoute);
    const destination = previousRoute ?? preferredHref ?? fallbackHref;

    if (destination === currentRoute) {
      router.replace(fallbackHref);
      return;
    }

    router.replace(destination);
  };

  return (
    <Link
      href={preferredHref ?? fallbackHref}
      onClick={handleClick}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50",
        "md:hidden",
        className
      )}
    >
      <span aria-hidden="true" className="text-base leading-none">
        ←
      </span>
      <span>{label}</span>
    </Link>
  );
}
