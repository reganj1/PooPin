import { cn } from "@/lib/utils/cn";
import {
  buildReviewAggregateSummary,
  describeCleanliness,
  describePrivacy,
  describeSmell,
  describeWait,
  reviewToneClassName
} from "@/lib/utils/reviewPresentation";
import { Review } from "@/types";

interface ReviewSummaryProps {
  reviews: Review[];
}

export function ReviewSummary({ reviews }: ReviewSummaryProps) {
  const summary = buildReviewAggregateSummary(reviews);
  if (!summary) {
    return null;
  }

  const aggregateChips = [
    {
      title: "Cleanliness",
      score: summary.cleanliness,
      descriptor: describeCleanliness(summary.cleanliness)
    },
    {
      title: "Smell",
      score: summary.smell,
      descriptor: describeSmell(summary.smell)
    },
    {
      title: "Wait",
      score: summary.wait,
      descriptor: describeWait(summary.wait)
    },
    {
      title: "Privacy",
      score: summary.privacy,
      descriptor: describePrivacy(summary.privacy)
    }
  ] as const;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Review Snapshot</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">What visitors report</h3>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
          Overall {summary.overall.toFixed(1)} ({summary.reviewCount} review{summary.reviewCount === 1 ? "" : "s"})
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {aggregateChips.map((chip) => (
          <span
            key={chip.title}
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
              reviewToneClassName[chip.descriptor.tone]
            )}
          >
            {chip.title}: {chip.descriptor.label} ({chip.score.toFixed(1)})
          </span>
        ))}
      </div>
    </section>
  );
}
