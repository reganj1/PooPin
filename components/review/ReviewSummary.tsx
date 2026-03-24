import { cn } from "@/lib/utils/cn";
import { buildReviewAggregateSummary, reviewToneClassName } from "@/lib/utils/reviewPresentation";
import { getReviewQuickTagDescriptor, reviewQuickTagToneClassName } from "@/lib/utils/reviewSignals";
import { Review } from "@/types";

interface ReviewSummaryProps {
  reviews: Review[];
}

export function ReviewSummary({ reviews }: ReviewSummaryProps) {
  const summary = buildReviewAggregateSummary(reviews);
  if (!summary) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Review Snapshot</p>
          <h3 className="mt-1 text-base font-semibold text-slate-900 sm:text-lg">What visitors report</h3>
          <p className="mt-1 text-sm text-slate-500">{summary.summaryNote}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{summary.summaryLabel}</p>
          <p className="mt-1 text-base font-semibold text-slate-900">Overall {summary.overall.toFixed(1)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {summary.reviewCount} review{summary.reviewCount === 1 ? "" : "s"}
            {summary.recentReviewCount > 0 ? ` · ${summary.recentReviewCount} recent` : ""}
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5 sm:gap-2">
        {summary.categoryInsights.map((insight) => (
          <span
            key={insight.key}
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
              reviewToneClassName[insight.tone]
            )}
          >
            {insight.label}
          </span>
        ))}

        {summary.topSignals.map((signal) => {
          const descriptor = getReviewQuickTagDescriptor(signal);
          if (!descriptor) {
            return null;
          }

          return (
            <span
              key={signal}
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

      {summary.categoryInsights.length === 0 && summary.topSignals.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">Detail is still limited here. Newer reviews with standout tags will sharpen this snapshot.</p>
      ) : null}
    </section>
  );
}
