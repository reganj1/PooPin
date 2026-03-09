import { Review } from "@/types";
import { cn } from "@/lib/utils/cn";
import { reviewToneClassName, toReviewDetailChips } from "@/lib/utils/reviewPresentation";
import { ReviewReportAction } from "@/components/review/ReviewReportAction";

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
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
        <p className="font-semibold text-slate-700">No reviews yet</p>
        <p className="mt-1">Be the first to help others by sharing your experience.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reviews.map((review) => (
        <article key={review.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-700">
              Overall {review.overall_rating.toFixed(1)}
            </span>
            <span>Visited {formatDate(review.visit_time)}</span>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-2">
            {toReviewDetailChips(review).map((chip) => (
              <span
                key={chip.key}
                className={cn(
                  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
                  reviewToneClassName[chip.descriptor.tone]
                )}
              >
                {chip.title}: {chip.descriptor.label}
              </span>
            ))}
          </div>

          {review.review_text.trim().length > 0 ? (
            <p className="mt-3 text-sm text-slate-700">{review.review_text}</p>
          ) : (
            <p className="mt-3 text-sm italic text-slate-500">No additional notes shared.</p>
          )}

          <ReviewReportAction bathroomId={review.bathroom_id} reviewId={review.id} />
        </article>
      ))}
    </div>
  );
}
