"use client";

import { KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { NearbyBathroom } from "@/types";
import { TrackedNavigateLink } from "@/components/analytics/TrackedNavigateLink";
import type { AnalyticsViewportMode } from "@/lib/analytics/posthog";
import { cn } from "@/lib/utils/cn";
import { getGoogleMapsDirectionsUrl } from "@/lib/utils/maps";
import { getRestroomCardSubtitle, getRestroomDisplayName } from "@/lib/utils/restroomPresentation";
import { getReviewQuickTagDescriptor, reviewQuickTagToneClassName } from "@/lib/utils/reviewSignals";

interface MobileRestroomPreviewCardProps {
  restroom: NearbyBathroom;
  showDistance?: boolean;
  photoUrl?: string | null;
  viewportMode?: AnalyticsViewportMode;
  onNavigateToDetail?: (restroomId: string) => void;
}

const toDisplayRating = (value: number) => (value > 0 ? value.toFixed(1) : "N/A");
const toDistanceLabel = (value: number) => {
  if (!Number.isFinite(value) || value < 0) {
    return "";
  }

  if (value < 0.1) {
    return "<0.1 mi straight-line";
  }

  return `${value.toFixed(1)} mi straight-line`;
};

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
  photoUrl = null,
  viewportMode = "homepage",
  onNavigateToDetail
}: MobileRestroomPreviewCardProps) {
  const router = useRouter();
  const detailHref = `/restroom/${restroom.id}`;
  const navigateHref = getGoogleMapsDirectionsUrl(restroom.lat, restroom.lng);
  const displayName = getRestroomDisplayName(restroom);
  const subtitle = getRestroomCardSubtitle(restroom);
  const qualitySignal = restroom.ratings.qualitySignals[0];
  const qualitySignalDescriptor = qualitySignal ? getReviewQuickTagDescriptor(qualitySignal) : null;
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

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={openRestroomDetails}
      onKeyDown={handleCardKeyDown}
      className="cursor-pointer rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur transition active:scale-[0.995]"
    >
      <div className="flex items-start gap-3">
        <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={`${displayName} photo`} className="h-full w-full object-cover" loading="eager" decoding="async" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-slate-100 text-[11px] font-semibold text-slate-500">
              No photo
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-slate-900">{displayName}</h3>
            <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
              ⭐ {toDisplayRating(restroom.ratings.overall)}
            </span>
            {showDistance ? (
              <span className="text-[11px] font-medium text-slate-500">{toDistanceLabel(restroom.distanceMiles)}</span>
            ) : null}
          </div>

          <div className="mt-1.5 min-h-[20px]">
            {qualitySignalDescriptor ? (
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                  reviewQuickTagToneClassName[qualitySignalDescriptor.tone]
                )}
              >
                {qualitySignalDescriptor.icon} {qualitySignalDescriptor.label}
              </span>
            ) : (
              <span className="text-[11px] text-slate-400">No recent standout signals</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
        <TrackedNavigateLink
          href={navigateHref}
          bathroomId={restroom.id}
          source="mobile_preview"
          sourceSurface="mobile_preview"
          viewportMode={viewportMode}
          hasUserLocation={showDistance}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
        >
          <NavigateIcon className="h-3.5 w-3.5" />
          Navigate
        </TrackedNavigateLink>
      </div>
    </article>
  );
}
