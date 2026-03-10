import { NearbyBathroom } from "@/types";
import { MAPBOX_ACCESS_TOKEN, isMapboxConfigured } from "@/lib/mapbox/config";
import { RestroomMap } from "@/components/map/RestroomMap";
import { cn } from "@/lib/utils/cn";

interface MapPanelProps {
  restrooms: NearbyBathroom[];
  userLocation?: {
    lat: number;
    lng: number;
  } | null;
  showDistance?: boolean;
  hoveredRestroomId?: string | null;
  onFocusedRestroomIdChange?: (restroomId: string | null) => void;
  onViewportBoundsChange?: (bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  }) => void;
  className?: string;
  mapClassName?: string;
  showHeader?: boolean;
  onExpandMap?: () => void;
}

export function MapPanel({
  restrooms,
  userLocation = null,
  showDistance = false,
  hoveredRestroomId = null,
  onFocusedRestroomIdChange,
  onViewportBoundsChange,
  className,
  mapClassName,
  showHeader = true,
  onExpandMap
}: MapPanelProps) {
  if (!isMapboxConfigured) {
    return (
      <section className={cn("overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm", className)}>
        {showHeader ? (
          <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Map view</h2>
              <p className="mt-1 text-xs text-slate-500">Enable Mapbox to display live restroom pins.</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {onExpandMap ? (
                <button
                  type="button"
                  onClick={onExpandMap}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Expand map
                </button>
              ) : null}
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                {restrooms.length} shown
              </span>
            </div>
          </header>
        ) : null}

        <div
          className={cn(
            "bg-slate-100/80 p-5",
            showHeader ? "h-[340px] sm:h-[440px] lg:h-[640px]" : "min-h-[320px] h-full",
            mapClassName
          )}
        >
          <div className="flex h-full flex-col justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Map setup pending</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">Map temporarily unavailable</h3>
              <p className="mt-2 max-w-lg text-sm text-slate-600">
                Live map rendering is temporarily unavailable. You can still browse restroom details and nearby results.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white/90 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Sample locations</p>
              <ul className="space-y-1 text-sm text-slate-700">
                {restrooms.slice(0, 4).map((restroom) => (
                  <li key={restroom.id}>• {restroom.name}{showDistance ? ` (${restroom.distanceMiles.toFixed(1)} mi away)` : ""}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={cn("overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm", className)}>
      {showHeader ? (
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Map view</h2>
            <p className="mt-1 text-xs text-slate-500">Move the map to explore restrooms in any area.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onExpandMap ? (
              <button
                type="button"
                onClick={onExpandMap}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Expand map
              </button>
            ) : null}
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
              {restrooms.length} shown
            </span>
          </div>
        </header>
      ) : null}

      <div className={cn(showHeader ? "h-[340px] sm:h-[440px] lg:h-[640px]" : "h-full min-h-[320px]", mapClassName)}>
        <RestroomMap
          restrooms={restrooms}
          accessToken={MAPBOX_ACCESS_TOKEN}
          userLocation={userLocation}
          showDistance={showDistance}
          hoveredRestroomId={hoveredRestroomId}
          onFocusedRestroomIdChange={onFocusedRestroomIdChange}
          onViewportBoundsChange={onViewportBoundsChange}
        />
      </div>
    </section>
  );
}
