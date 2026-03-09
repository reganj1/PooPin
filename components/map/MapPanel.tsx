import { NearbyBathroom } from "@/types";
import { isMapboxConfigured } from "@/lib/mapbox/config";

interface MapPanelProps {
  restrooms: NearbyBathroom[];
}

export function MapPanel({ restrooms }: MapPanelProps) {
  if (!isMapboxConfigured) {
    return (
      <section className="h-[320px] rounded-2xl border border-dashed border-slate-300 bg-slate-100/80 p-5 sm:h-[420px]">
        <div className="flex h-full flex-col justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Map Setup Pending</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">Mapbox token not configured</h2>
            <p className="mt-2 max-w-lg text-sm text-slate-600">
              Add `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` to your environment to enable the live map. The restroom list and
              detail pages still work with mock data.
            </p>
          </div>

          <div className="rounded-xl bg-white/80 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Sample pins ready</p>
            <ul className="space-y-1 text-sm text-slate-700">
              {restrooms.slice(0, 4).map((restroom) => (
                <li key={restroom.id}>
                  • {restroom.name} ({restroom.distanceMiles.toFixed(1)} mi)
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="h-[320px] rounded-2xl border border-slate-200 bg-gradient-to-br from-brand-50 to-white p-5 sm:h-[420px]">
      <div className="flex h-full flex-col justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Mapbox Ready</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">Live map is enabled</h2>
          <p className="mt-2 max-w-lg text-sm text-slate-600">
            Token detected. In the next iteration, plug in a Mapbox map component and render clustered restroom pins.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm text-slate-700 sm:grid-cols-3">
          {restrooms.slice(0, 6).map((restroom) => (
            <div key={restroom.id} className="rounded-lg border border-slate-200 bg-white/90 px-2 py-1.5">
              {restroom.name}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
