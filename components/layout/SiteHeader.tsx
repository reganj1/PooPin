"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AuthStatusNav } from "@/components/auth/AuthStatusNav";
import { cn } from "@/lib/utils/cn";

interface SiteHeaderProps {
  isAuthConfigured: boolean;
  viewerDisplayName: string | null;
}

export function SiteHeader({ isAuthConfigured, viewerDisplayName }: SiteHeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(96);
  const headerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const updateScrollState = () => {
      setIsScrolled(window.scrollY > 12);
    };

    updateScrollState();
    window.addEventListener("scroll", updateScrollState, { passive: true });

    return () => window.removeEventListener("scroll", updateScrollState);
  }, []);

  useEffect(() => {
    const node = headerRef.current;
    if (!node) {
      return undefined;
    }

    const updateHeight = () => {
      const nextHeight = Math.ceil(node.getBoundingClientRect().height);
      if (nextHeight > 0) {
        setHeaderHeight(nextHeight);
      }
    };

    updateHeight();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateHeight);
      return () => window.removeEventListener("resize", updateHeight);
    }

    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(node);
    window.addEventListener("resize", updateHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, []);

  return (
    <>
      <header
        ref={headerRef}
        className={cn(
          "fixed inset-x-0 top-0 z-50 border-b border-slate-200/90 bg-slate-100/98 backdrop-blur-xl supports-[backdrop-filter]:bg-slate-100/92",
          "transition-[background-color,box-shadow,border-color] duration-200",
          isScrolled ? "shadow-[0_18px_44px_rgba(15,23,42,0.14)]" : "shadow-[0_10px_26px_rgba(15,23,42,0.10)]"
        )}
      >
        <div className="mx-auto w-full max-w-[1320px] min-w-0 px-4 pt-[max(env(safe-area-inset-top),0px)] sm:px-6 lg:px-8">
          <div className="py-2 sm:py-3">
            <div
              className={cn(
                "rounded-[24px] border border-slate-200/95 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.08)]",
                "transition-[box-shadow,transform,border-color] duration-200",
                isScrolled && "shadow-[0_20px_42px_rgba(15,23,42,0.12)]"
              )}
            >
              <div className="space-y-2 px-3 py-3 lg:hidden">
                <div className="flex items-center justify-between gap-3">
                  <Link href="/" className="inline-flex min-w-0 items-center gap-2 text-slate-900">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-[10px] font-bold tracking-[0.16em] text-white">
                      WC
                    </span>
                    <div className="min-w-0">
                      <span className="block truncate text-base font-semibold tracking-tight">Poopin</span>
                    </div>
                  </Link>

                  <Link
                    href="/add"
                    className="inline-flex h-10 shrink-0 items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                  >
                    Add restroom
                  </Link>
                </div>

                <nav className="grid grid-cols-3 gap-2">
                  <Link
                    href="/leaderboard"
                    className="inline-flex h-9 items-center justify-center rounded-xl bg-slate-50 px-3 text-[13px] font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    Leaderboard
                  </Link>
                  <Link
                    href="/contact"
                    className="inline-flex h-9 items-center justify-center rounded-xl bg-slate-50 px-3 text-[13px] font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    Contact
                  </Link>
                  <AuthStatusNav isAuthConfigured={isAuthConfigured} viewerDisplayName={viewerDisplayName} variant="mobile" />
                </nav>
              </div>

              <div className="hidden items-center justify-between gap-4 px-3.5 py-2.5 lg:flex">
                <Link href="/" className="inline-flex min-w-0 items-center gap-2.5 text-slate-900">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-[10px] font-bold tracking-[0.16em] text-white">
                    WC
                  </span>
                  <div className="min-w-0">
                    <span className="block truncate text-lg font-semibold tracking-tight">Poopin</span>
                    <span className="block text-[11px] font-medium text-slate-500">California beta</span>
                  </div>
                </Link>

                <nav className="flex flex-wrap items-center justify-end gap-0.5">
                  <Link
                    href="/leaderboard"
                    className="inline-flex h-9 items-center rounded-xl px-3 text-[13px] font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    Leaderboard
                  </Link>
                  <Link
                    href="/contact"
                    className="inline-flex h-9 items-center rounded-xl px-3 text-[13px] font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    Contact
                  </Link>

                  <div className="ml-2 flex items-center gap-2">
                    <AuthStatusNav isAuthConfigured={isAuthConfigured} viewerDisplayName={viewerDisplayName} />
                    <Link
                      href="/add"
                      className="inline-flex h-9 items-center rounded-xl bg-slate-900 px-3.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-slate-800"
                    >
                      Add restroom
                    </Link>
                  </div>
                </nav>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div
        aria-hidden="true"
        className="h-[96px] sm:h-[102px] lg:h-[80px]"
        style={{ height: `${headerHeight}px` }}
      />
    </>
  );
}
