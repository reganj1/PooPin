import { NearbyBathroom } from "@/types";

interface RatingPillsProps {
  ratings: NearbyBathroom["ratings"];
}

const pillClass =
  "inline-flex min-w-[90px] items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700";

const formatRating = (value: number) => (value > 0 ? value.toFixed(1) : "N/A");

export function RatingPills({ ratings }: RatingPillsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className={pillClass}>Overall {formatRating(ratings.overall)}</span>
      <span className={pillClass}>Smell {formatRating(ratings.smell)}</span>
      <span className={pillClass}>Clean {formatRating(ratings.cleanliness)}</span>
    </div>
  );
}
