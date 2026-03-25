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
        "inline-flex min-h-10 items-center gap-1.5 py-1 text-sm font-medium text-brand-600 transition hover:text-brand-700",
        "md:hidden",
        className
      )}
    >
      <span aria-hidden="true" className="text-sm leading-none">
        ←
      </span>
      <span>{label}</span>
    </Link>
  );
}
