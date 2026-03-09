import { NearbyBathroom } from "@/types";
import { MAPBOX_ACCESS_TOKEN, isMapboxConfigured } from "@/lib/mapbox/config";
import { RestroomMap } from "@/components/map/RestroomMap";

interface MapPanelProps {
  restrooms: NearbyBathroom[];
  userLocation?: {
    lat: number;
    lng: number;
  } | null;
  hoveredRestroomId?: string | null;
  onFocusedRestroomIdChange?: (restroomId: string | null) => void;
  onViewportBoundsChange?: (bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  }) => void;
}

export function MapPanel({
  restrooms,
  userLocation = null,
  hoveredRestroomId = null,
  onFocusedRestroomIdChange,
  onViewportBoundsChange
}: MapPanelProps) {
  if (!isMapboxConfigured) {
    return (
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Map view</h2>
            <p className="mt-1 text-xs text-slate-500">Enable Mapbox to display live restroom pins.</p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
            {restrooms.length} shown
          </span>
        </header>

        <div className="h-[340px] bg-slate-100/80 p-5 sm:h-[440px] lg:h-[640px]">
          <div className="flex h-full flex-col justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Map setup pending</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">Mapbox token not configured</h3>
              <p className="mt-2 max-w-lg text-sm text-slate-600">
                Add `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` to your environment to enable the live map. Restroom discovery
                and details will continue working.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white/90 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Sample locations</p>
              <ul className="space-y-1 text-sm text-slate-700">
                {restrooms.slice(0, 4).map((restroom) => (
                  <li key={restroom.id}>
                    • {restroom.name} ({restroom.distanceMiles.toFixed(1)} mi)
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Map view</h2>
          <p className="mt-1 text-xs text-slate-500">Move the map to explore restrooms in any area.</p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
          {restrooms.length} shown
        </span>
      </header>

      <div className="h-[340px] sm:h-[440px] lg:h-[640px]">
        <RestroomMap
          restrooms={restrooms}
          accessToken={MAPBOX_ACCESS_TOKEN}
          userLocation={userLocation}
          hoveredRestroomId={hoveredRestroomId}
          onFocusedRestroomIdChange={onFocusedRestroomIdChange}
          onViewportBoundsChange={onViewportBoundsChange}
        />
      </div>
    </section>
  );
}
