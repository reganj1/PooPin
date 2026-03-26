"use client";

import { KeyboardEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { NearbyBathroom } from "@/types";
import { TrackedNavigateLink } from "@/components/analytics/TrackedNavigateLink";
import type { AnalyticsViewportMode } from "@/lib/analytics/posthog";
import { formatDistanceLabel, type DistanceReferenceKind } from "@/lib/utils/distancePresentation";
import { getRestroomCardSubtitle, getRestroomDisplayName } from "@/lib/utils/restroomPresentation";

interface MobileRestroomPreviewCardProps {
  restroom: NearbyBathroom;
  showDistance?: boolean;
  distanceReferenceKind?: DistanceReferenceKind | null;
  distanceReferenceLabel?: string | null;
  hasUserLocation?: boolean;
  photoUrl?: string | null;
  viewportMode?: AnalyticsViewportMode;
  onNavigateToDetail?: (restroomId: string) => void;
}

function NavigateIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={className}>
      <path
        d="M18 2 9.5 10.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M18 2 12.7 17.1l-3-6.8L3 7.3z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

export function MobileRestroomPreviewCard({
  restroom,
  showDistance = false,
  distanceReferenceKind = "user",
  distanceReferenceLabel = null,
  hasUserLocation = false,
  photoUrl = null,
  viewportMode = "homepage",
  onNavigateToDetail
}: MobileRestroomPreviewCardProps) {
  const router = useRouter();
  const [didPhotoFail, setDidPhotoFail] = useState(false);
  const detailHref = `/restroom/${restroom.id}`;
  const displayName = getRestroomDisplayName(restroom);
  const subtitle = getRestroomCardSubtitle(restroom);
  const distanceLabel = showDistance
    ? formatDistanceLabel(restroom.distanceMiles, {
        referenceKind: distanceReferenceKind,
        referenceLabel: distanceReferenceLabel,
        compact: true
      })
    : "";
  const reviewSummary =
    restroom.ratings.reviewCount > 0 && restroom.ratings.overall > 0
      ? `⭐ ${restroom.ratings.overall.toFixed(1)} • ${restroom.ratings.reviewCount} review${restroom.ratings.reviewCount === 1 ? "" : "s"}`
      : null;
  const openRestroomDetails = () => {
    onNavigateToDetail?.(restroom.id);
    router.push(detailHref);
  };
  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    openRestroomDetails();
  };

  useEffect(() => {
    setDidPhotoFail(false);
  }, [photoUrl, restroom.id]);

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={openRestroomDetails}
      onKeyDown={handleCardKeyDown}
      className="cursor-pointer rounded-[1.35rem] border border-slate-200 bg-white p-3 shadow-xl transition active:scale-[0.995]"
    >
      <div className="flex items-start gap-3">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
          {photoUrl && !didPhotoFail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt={`${displayName} photo`}
              className="h-full w-full object-cover"
              loading="eager"
              decoding="async"
              onError={() => setDidPhotoFail(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-slate-900 text-xs font-semibold tracking-wide text-white">
              WC
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-slate-900">{displayName}</h3>
              <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>
            </div>
            {distanceLabel ? (
              <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                {distanceLabel}
              </span>
            ) : null}
          </div>

          {reviewSummary ? <p className="mt-1.5 text-[11px] font-medium text-slate-500">{reviewSummary}</p> : null}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
        <TrackedNavigateLink
          latitude={restroom.lat}
          longitude={restroom.lng}
          bathroomId={restroom.id}
          source="mobile_preview"
          sourceSurface="mobile_preview"
          viewportMode={viewportMode}
          hasUserLocation={hasUserLocation}
          className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
        >
          <NavigateIcon className="h-3.5 w-3.5" />
          Navigate
        </TrackedNavigateLink>
      </div>
    </article>
  );
}
