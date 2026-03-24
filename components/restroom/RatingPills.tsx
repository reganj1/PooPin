import { NearbyBathroom } from "@/types";

interface RatingPillsProps {
  ratings: NearbyBathroom["ratings"];
}

const pillClass =
  "inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700";

const formatRating = (value: number) => (value > 0 ? value.toFixed(1) : null);

export function RatingPills({ ratings }: RatingPillsProps) {
  const overallRating = formatRating(ratings.overall);
  const smellRating = formatRating(ratings.smell);
  const cleanlinessRating = formatRating(ratings.cleanliness);
  const hasPills = Boolean(overallRating || smellRating || cleanlinessRating || ratings.reviewCount === 1);

  if (!hasPills) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {overallRating ? <span className={pillClass}>Overall {overallRating}</span> : null}
      {smellRating ? <span className={pillClass}>Smell {smellRating}</span> : null}
      {cleanlinessRating ? <span className={pillClass}>Clean {cleanlinessRating}</span> : null}
      {ratings.reviewCount === 1 ? <span className={pillClass}>Limited data</span> : null}
    </div>
  );
}
