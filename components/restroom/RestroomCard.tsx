import Link from "next/link";
import { NearbyBathroom } from "@/types";
import { RatingPills } from "@/components/restroom/RatingPills";
import { RestroomTags } from "@/components/restroom/RestroomTags";
import { cn } from "@/lib/utils/cn";

interface RestroomCardProps {
  restroom: NearbyBathroom;
  isHighlighted?: boolean;
  onHoverChange?: (isHovering: boolean) => void;
}

const toPlaceLabel = (value: string) => value.replaceAll("_", " ");
const toDisplayRating = (value: number) => (value > 0 ? value.toFixed(1) : "N/A");

export function RestroomCard({ restroom, isHighlighted = false, onHoverChange }: RestroomCardProps) {
  return (
    <Link
      href={`/restroom/${restroom.id}`}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      onFocus={() => onHoverChange?.(true)}
      onBlur={() => onHoverChange?.(false)}
      className={cn(
        "group block rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md sm:p-5",
        isHighlighted && "border-brand-300 shadow-md ring-2 ring-brand-100"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-slate-900 transition group-hover:text-brand-600">{restroom.name}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {restroom.address}, {restroom.city}
          </p>
        </div>
        <div className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
          {toPlaceLabel(restroom.place_type)}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
          Overall {toDisplayRating(restroom.ratings.overall)}
        </span>
        <span className="text-xs font-medium text-slate-500">{restroom.distanceMiles.toFixed(1)} mi away</span>
      </div>

      <div className="mt-3.5 flex flex-col gap-2.5">
        <RatingPills ratings={restroom.ratings} />
        <RestroomTags restroom={restroom} />
      </div>

      <div className="mt-3.5 text-xs font-medium text-slate-500">
        {restroom.ratings.reviewCount} review
        {restroom.ratings.reviewCount === 1 ? "" : "s"}
      </div>
    </Link>
  );
}
