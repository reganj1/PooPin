import Link from "next/link";
import { useRef, type FocusEvent, type TouchEvent as ReactTouchEvent } from "react";
import { NearbyBathroom } from "@/types";
import { TrackedNavigateLink } from "@/components/analytics/TrackedNavigateLink";
import type { AnalyticsViewportMode } from "@/lib/analytics/posthog";
import { RatingPills } from "@/components/restroom/RatingPills";
import { RestroomTags } from "@/components/restroom/RestroomTags";
import { cn } from "@/lib/utils/cn";
import { getRestroomCardSubtitle, getRestroomDisplayName, getRestroomSourceLabel } from "@/lib/utils/restroomPresentation";
import { getReviewQuickTagDescriptor, reviewQuickTagToneClassName } from "@/lib/utils/reviewSignals";

interface RestroomCardProps {
  restroom: NearbyBathroom;
  showDistance?: boolean;
  isHighlighted?: boolean;
  isFeaturedRecommendation?: boolean;
  viewportMode?: AnalyticsViewportMode;
  hasUserLocation?: boolean;
  onHoverChange?: (isHovering: boolean) => void;
  onTouchSelect?: (restroomId: string) => void;
  onNavigateToDetail?: (restroomId: string) => void;
  className?: string;
}

const toPlaceLabel = (value: string) => value.replaceAll("_", " ");
const toDisplayRating = (value: number) => (value > 0 ? value.toFixed(1) : "N/A");
const toAccessLabel = (value: NearbyBathroom["access_type"]) => {
  switch (value) {
    case "public":
      return "Public access";
    case "customer_only":
      return "Customer only";
    case "code_required":
      return "Code required";
    case "staff_assisted":
      return "Staff assisted";
    default:
      return "Restroom";
  }
};
const toDistanceLabel = (value: number) => {
  if (!Number.isFinite(value) || value < 0) {
    return "";
  }

  if (value < 0.1) {
    return "Very close";
  }

  return `~${value.toFixed(1)} mi away`;
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
  isFeaturedRecommendation = false,
  viewportMode = "homepage",
  hasUserLocation = false,
  onHoverChange,
  onTouchSelect,
  onNavigateToDetail,
  className
}: RestroomCardProps) {
  const detailHref = `/restroom/${restroom.id}`;
  const displayName = getRestroomDisplayName(restroom);
  const subtitle = getRestroomCardSubtitle(restroom);
  const sourceLabel = getRestroomSourceLabel(restroom.source);
  const qualitySignals = restroom.ratings.qualitySignals.slice(0, 2);
  const positiveRecommendationSignals = qualitySignals
    .map((signal) => getReviewQuickTagDescriptor(signal))
    .filter((descriptor): descriptor is NonNullable<ReturnType<typeof getReviewQuickTagDescriptor>> => Boolean(descriptor?.tone === "positive"));
  const touchStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const didTouchMoveRef = useRef(false);

  const handleBlurCapture = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      onHoverChange?.(false);
    }
  };

  const handleNavigateToDetail = () => {
    onNavigateToDetail?.(restroom.id);
  };

  const resetTouchSelectionState = () => {
    touchStartPointRef.current = null;
    didTouchMoveRef.current = false;
  };

  const handleTouchStart = (event: ReactTouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) {
      resetTouchSelectionState();
      return;
    }

    touchStartPointRef.current = { x: touch.clientX, y: touch.clientY };
    didTouchMoveRef.current = false;
  };

  const handleTouchMove = (event: ReactTouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    const startPoint = touchStartPointRef.current;
    if (!touch || !startPoint) {
      return;
    }

    if (Math.abs(touch.clientX - startPoint.x) > 8 || Math.abs(touch.clientY - startPoint.y) > 8) {
      didTouchMoveRef.current = true;
    }
  };

  const handleTouchEnd = (event: ReactTouchEvent<HTMLElement>) => {
    const startPoint = touchStartPointRef.current;
    if (!startPoint || didTouchMoveRef.current) {
      resetTouchSelectionState();
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-restroom-card-action='true']")) {
      resetTouchSelectionState();
      return;
    }

    onTouchSelect?.(restroom.id);
    resetTouchSelectionState();
  };

  return (
    <article
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      onFocusCapture={() => onHoverChange?.(true)}
      onBlurCapture={handleBlurCapture}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={resetTouchSelectionState}
      className={cn(
        "group rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md sm:p-5",
        isHighlighted && "border-brand-300 shadow-md ring-2 ring-brand-100",
        className
      )}
    >
      <Link
        href={detailHref}
        onClick={handleNavigateToDetail}
        data-restroom-card-action="true"
        className="block rounded-lg outline-none transition focus-visible:ring-2 focus-visible:ring-brand-200"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-slate-900 transition group-hover:text-brand-600">{displayName}</h3>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>
          <div
            className={cn(
              "shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
              isFeaturedRecommendation
                ? "border border-brand-200 bg-brand-50 text-brand-800"
                : "border border-slate-200 bg-slate-50 text-slate-600"
            )}
          >
            {isFeaturedRecommendation ? toAccessLabel(restroom.access_type) : toPlaceLabel(restroom.place_type)}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          {(!isFeaturedRecommendation || restroom.ratings.overall > 0) ? (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                isFeaturedRecommendation
                  ? "border border-brand-200 bg-brand-50 text-brand-900"
                  : "border border-slate-200 bg-slate-50 text-slate-700"
              )}
            >
              {isFeaturedRecommendation && restroom.ratings.overall > 0
                ? `⭐ ${restroom.ratings.overall.toFixed(1)} from ${restroom.ratings.reviewCount} review${restroom.ratings.reviewCount === 1 ? "" : "s"}`
                : `Overall ${toDisplayRating(restroom.ratings.overall)}`}
            </span>
          ) : (
            <span />
          )}
          {showDistance ? (
            <span className={cn("text-xs font-medium", isFeaturedRecommendation ? "text-slate-700" : "text-slate-500")}>
              {toDistanceLabel(restroom.distanceMiles)}
            </span>
          ) : null}
        </div>

        {isFeaturedRecommendation ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {positiveRecommendationSignals.slice(0, 2).map((descriptor) => (
              <span
                key={descriptor.value}
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                  reviewQuickTagToneClassName[descriptor.tone]
                )}
              >
                {descriptor.icon} {descriptor.label}
              </span>
            ))}
            {restroom.is_accessible ? (
              <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                ♿ Accessible
              </span>
            ) : null}
            {restroom.has_baby_station ? (
              <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                👶 Baby station
              </span>
            ) : null}
            {restroom.ratings.reviewCount > 0 && restroom.ratings.overall <= 0 ? (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                {restroom.ratings.reviewCount} review{restroom.ratings.reviewCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        ) : (
          <>
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
          </>
        )}
      </Link>

      <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
        <Link
          href={detailHref}
          onClick={handleNavigateToDetail}
          data-restroom-card-action="true"
          className="inline-flex items-center rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Details
        </Link>
        <TrackedNavigateLink
          latitude={restroom.lat}
          longitude={restroom.lng}
          bathroomId={restroom.id}
          source="restroom_card"
          sourceSurface="restroom_card"
          viewportMode={viewportMode}
          hasUserLocation={hasUserLocation}
          dataRestroomCardAction
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
        >
          <NavigateIcon className="h-3.5 w-3.5" />
          Navigate
        </TrackedNavigateLink>
      </div>
    </article>
  );
}
