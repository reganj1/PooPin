import { NearbyBathroom } from "@/types";
import { RestroomCard } from "@/components/restroom/RestroomCard";

interface RestroomListProps {
  restrooms: NearbyBathroom[];
}

export function RestroomList({ restrooms }: RestroomListProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Nearby Restrooms</h2>
          <p className="text-sm text-slate-500">Sorted by distance from your default city center location.</p>
        </div>
      </div>

      <div className="space-y-3">
        {restrooms.map((restroom) => (
          <RestroomCard key={restroom.id} restroom={restroom} />
        ))}
      </div>
    </section>
  );
}
