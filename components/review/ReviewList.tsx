import { Review } from "@/types";

interface ReviewListProps {
  reviews: Review[];
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));

export function ReviewList({ reviews }: ReviewListProps) {
  if (reviews.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        No reviews yet. This restroom is waiting for its first rating.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reviews.map((review) => (
        <article key={review.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-600">
              Overall {review.overall_rating.toFixed(1)}
            </span>
            <span>Smell {review.smell_rating.toFixed(1)}</span>
            <span>Clean {review.cleanliness_rating.toFixed(1)}</span>
            <span>Visited {formatDate(review.visit_time)}</span>
          </div>
          <p className="mt-3 text-sm text-slate-700">{review.review_text}</p>
        </article>
      ))}
    </div>
  );
}
