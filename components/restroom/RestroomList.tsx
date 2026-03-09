import { NearbyBathroom } from "@/types";
import { RestroomCard } from "@/components/restroom/RestroomCard";

interface RestroomListProps {
  restrooms: NearbyBathroom[];
  helperText?: string;
  highlightedRestroomId?: string | null;
  onRestroomHoverChange?: (restroomId: string | null) => void;
}

export function RestroomList({
  restrooms,
  helperText = "Sorted by distance from your default city center location.",
  highlightedRestroomId = null,
  onRestroomHoverChange
}: RestroomListProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Nearby Restrooms</h2>
          <p className="text-sm text-slate-500">{helperText}</p>
        </div>
      </div>

      {restrooms.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          No restrooms match your selected filters.
        </div>
      ) : (
        <div className="space-y-3">
          {restrooms.map((restroom) => (
            <RestroomCard
              key={restroom.id}
              restroom={restroom}
              isHighlighted={highlightedRestroomId === restroom.id}
              onHoverChange={(isHovering) => onRestroomHoverChange?.(isHovering ? restroom.id : null)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
