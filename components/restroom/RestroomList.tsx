import { NearbyBathroom } from "@/types";
import { RestroomCard } from "@/components/restroom/RestroomCard";
import type { AnalyticsViewportMode } from "@/lib/analytics/posthog";
import { cn } from "@/lib/utils/cn";
import type { DistanceReferenceKind } from "@/lib/utils/distancePresentation";

interface RestroomListProps {
  restrooms: NearbyBathroom[];
  title?: string;
  helperText?: string;
  showDistance?: boolean;
  displayDistanceByRestroomId?: Record<string, number>;
  distanceReferenceKind?: DistanceReferenceKind | null;
  distanceReferenceLabel?: string | null;
  viewportMode?: AnalyticsViewportMode;
  hasUserLocation?: boolean;
  highlightedRestroomId?: string | null;
  onRestroomHoverChange?: (restroomId: string | null) => void;
  onRestroomFocusChange?: (restroomId: string | null) => void;
  onRestroomTouchSelect?: (restroomId: string) => void;
  onNavigateToDetail?: (restroomId: string) => void;
  compact?: boolean;
  className?: string;
  scrollClassName?: string;
}

export function RestroomList({
  restrooms,
  title = "Nearby restrooms",
  helperText = "Showing nearby restrooms for the current map context.",
  showDistance = false,
  displayDistanceByRestroomId,
  distanceReferenceKind = "user",
  distanceReferenceLabel = null,
  viewportMode = "homepage",
  hasUserLocation = false,
  highlightedRestroomId = null,
  onRestroomHoverChange,
  onRestroomFocusChange,
  onRestroomTouchSelect,
  onNavigateToDetail,
  compact = false,
  className,
  scrollClassName
}: RestroomListProps) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5",
        compact && "p-2.5 sm:p-3",
        className
      )}
    >
      <div className={cn("mb-4 flex items-start justify-between gap-3 border-b border-slate-100 pb-3", compact && "mb-2 pb-2")}>
        <div className="min-w-0">
          <h2 className={cn("text-lg font-semibold text-slate-900", compact && "text-sm")}>{title}</h2>
          <p className={cn("mt-1 text-sm leading-5 text-slate-500", compact && "mt-0.5 text-xs leading-4")}>{helperText}</p>
        </div>
        <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
          {restrooms.length}
        </span>
      </div>

      {restrooms.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          No restrooms match your selected filters.
        </div>
      ) : (
        <div className={cn("min-w-0 space-y-3 overflow-x-hidden lg:max-h-[540px] lg:overflow-y-auto lg:pr-1", compact && "space-y-2", scrollClassName)}>
          {restrooms.map((restroom) => (
            <RestroomCard
              key={restroom.id}
              restroom={restroom}
              showDistance={showDistance}
              displayDistanceMiles={displayDistanceByRestroomId?.[restroom.id] ?? null}
              distanceReferenceKind={distanceReferenceKind}
              distanceReferenceLabel={distanceReferenceLabel}
              viewportMode={viewportMode}
              hasUserLocation={hasUserLocation}
              isHighlighted={highlightedRestroomId === restroom.id}
              onHoverChange={(isHovering) => onRestroomHoverChange?.(isHovering ? restroom.id : null)}
              onFocusChange={(isFocused) => onRestroomFocusChange?.(isFocused ? restroom.id : null)}
              onTouchSelect={onRestroomTouchSelect}
              onNavigateToDetail={onNavigateToDetail}
            />
          ))}
        </div>
      )}
    </section>
  );
}
