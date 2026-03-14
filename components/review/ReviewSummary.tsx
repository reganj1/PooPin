import { cn } from "@/lib/utils/cn";
import {
  buildReviewAggregateSummary,
  describeCleanliness,
  describePrivacy,
  describeSmell,
  describeWait,
  reviewToneClassName
} from "@/lib/utils/reviewPresentation";
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

  const aggregateChips = [
    summary.cleanliness === null
      ? null
      : {
          title: "Cleanliness",
          score: summary.cleanliness,
          descriptor: describeCleanliness(summary.cleanliness)
        },
    summary.smell === null
      ? null
      : {
          title: "Smell",
          score: summary.smell,
          descriptor: describeSmell(summary.smell)
        },
    summary.wait === null
      ? null
      : {
          title: "Wait",
          score: summary.wait,
          descriptor: describeWait(summary.wait)
        },
    summary.privacy === null
      ? null
      : {
          title: "Privacy",
          score: summary.privacy,
          descriptor: describePrivacy(summary.privacy)
        }
  ].filter((chip) => chip !== null);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Review Snapshot</p>
          <h3 className="mt-1 text-base font-semibold text-slate-900 sm:text-lg">What visitors report</h3>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
          Overall {summary.overall.toFixed(1)} ({summary.reviewCount} review{summary.reviewCount === 1 ? "" : "s"})
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5 sm:gap-2">
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

      {aggregateChips.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">Category breakdown appears as visitors add standout detail tags.</p>
      ) : null}
    </section>
  );
}
