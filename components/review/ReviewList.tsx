import { Review } from "@/types";
import { cn } from "@/lib/utils/cn";
import { toReviewQuickTagChips } from "@/lib/utils/reviewPresentation";
import { getReviewQuickTagDescriptor, reviewQuickTagToneClassName } from "@/lib/utils/reviewSignals";
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
      <div className="rounded-2xl bg-slate-50/80 px-4 py-5 text-sm text-slate-600 ring-1 ring-slate-200/80">
        <p className="font-semibold text-slate-800">No reviews yet</p>
        <p className="mt-1">Be the first to share a quick restroom update.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reviews.map((review) => (
        <article key={review.id} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 sm:gap-2">
            <span className="font-medium text-slate-600">{review.author_display_name?.trim() || "Anonymous"}</span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-700">
              Overall {review.overall_rating.toFixed(1)}
            </span>
            <span>Visited {formatDate(review.visit_time)}</span>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5 sm:gap-2">
            {toReviewQuickTagChips(review).map((tag) => {
              const descriptor = getReviewQuickTagDescriptor(tag);
              if (!descriptor) {
                return null;
              }

              return (
                <span
                  key={tag}
                  className={cn(
                    "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
                    reviewQuickTagToneClassName[descriptor.tone]
                  )}
                >
                  {descriptor.icon} {descriptor.label}
                </span>
              );
            })}
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
