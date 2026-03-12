import Link from "next/link";
import type { FocusEvent } from "react";
import { NearbyBathroom } from "@/types";
import { TrackedNavigateLink } from "@/components/analytics/TrackedNavigateLink";
import { RatingPills } from "@/components/restroom/RatingPills";
import { RestroomTags } from "@/components/restroom/RestroomTags";
import { cn } from "@/lib/utils/cn";
import { getGoogleMapsDirectionsUrl } from "@/lib/utils/maps";
import { getRestroomCardSubtitle, getRestroomDisplayName, getRestroomSourceLabel } from "@/lib/utils/restroomPresentation";
import { getReviewQuickTagDescriptor, reviewQuickTagToneClassName } from "@/lib/utils/reviewSignals";

interface RestroomCardProps {
  restroom: NearbyBathroom;
  showDistance?: boolean;
  isHighlighted?: boolean;
  onHoverChange?: (isHovering: boolean) => void;
  onNavigateToDetail?: (restroomId: string) => void;
}

const toPlaceLabel = (value: string) => value.replaceAll("_", " ");
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

export function RestroomCard({
  restroom,
  showDistance = false,
  isHighlighted = false,
  onHoverChange,
  onNavigateToDetail
}: RestroomCardProps) {
  const detailHref = `/restroom/${restroom.id}`;
  const navigateHref = getGoogleMapsDirectionsUrl(restroom.lat, restroom.lng);
  const displayName = getRestroomDisplayName(restroom);
  const subtitle = getRestroomCardSubtitle(restroom);
  const sourceLabel = getRestroomSourceLabel(restroom.source);
  const qualitySignals = restroom.ratings.qualitySignals.slice(0, 2);

  const handleBlurCapture = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      onHoverChange?.(false);
    }
  };

  const handleNavigateToDetail = () => {
    onNavigateToDetail?.(restroom.id);
  };

  return (
    <article
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      onFocusCapture={() => onHoverChange?.(true)}
      onBlurCapture={handleBlurCapture}
      className={cn(
        "group rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md sm:p-5",
        isHighlighted && "border-brand-300 shadow-md ring-2 ring-brand-100"
      )}
    >
      <Link
        href={detailHref}
        onClick={handleNavigateToDetail}
        className="block rounded-lg outline-none transition focus-visible:ring-2 focus-visible:ring-brand-200"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-slate-900 transition group-hover:text-brand-600">{displayName}</h3>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>
          <div className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
            {toPlaceLabel(restroom.place_type)}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
            Overall {toDisplayRating(restroom.ratings.overall)}
          </span>
          {showDistance ? <span className="text-xs font-medium text-slate-500">{toDistanceLabel(restroom.distanceMiles)}</span> : null}
        </div>

        {qualitySignals.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {qualitySignals.map((signal) => {
              const descriptor = getReviewQuickTagDescriptor(signal);
              if (!descriptor) {
                return null;
              }

              return (
                <span
                  key={signal}
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                    reviewQuickTagToneClassName[descriptor.tone]
                  )}
                >
                  {descriptor.icon} {descriptor.label}
                </span>
              );
            })}
          </div>
        ) : null}

        <div className="mt-3.5 flex flex-col gap-2.5">
          <RatingPills ratings={restroom.ratings} />
          <RestroomTags restroom={restroom} />
        </div>

        <div className="mt-3.5 text-xs font-medium text-slate-500">
          {restroom.ratings.reviewCount} review
          {restroom.ratings.reviewCount === 1 ? "" : "s"} • {sourceLabel}
        </div>
      </Link>

      <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
        <Link
          href={detailHref}
          onClick={handleNavigateToDetail}
          className="inline-flex items-center rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Details
        </Link>
        <TrackedNavigateLink
          href={navigateHref}
          bathroomId={restroom.id}
          source="restroom_card"
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
        >
          <NavigateIcon className="h-3.5 w-3.5" />
          Navigate
        </TrackedNavigateLink>
      </div>
    </article>
  );
}
