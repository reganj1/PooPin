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

export function RestroomCard({ restroom, isHighlighted = false, onHoverChange }: RestroomCardProps) {
  return (
    <Link
      href={`/restroom/${restroom.id}`}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      onFocus={() => onHoverChange?.(true)}
      onBlur={() => onHoverChange?.(false)}
      className={cn(
        "group block rounded-2xl border border-slate-200 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md",
        isHighlighted && "border-brand-400 ring-2 ring-brand-100"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900 transition group-hover:text-brand-600">{restroom.name}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {restroom.address}, {restroom.city}
          </p>
        </div>
        <div className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-slate-600">
          {toPlaceLabel(restroom.place_type)}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <RatingPills ratings={restroom.ratings} />
        <RestroomTags restroom={restroom} />
      </div>

      <div className="mt-4 text-xs font-medium text-slate-500">
        {restroom.distanceMiles.toFixed(1)} mi away • {restroom.ratings.reviewCount} review
        {restroom.ratings.reviewCount === 1 ? "" : "s"}
      </div>
    </Link>
  );
}
