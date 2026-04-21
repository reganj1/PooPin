"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { cn } from "@/lib/utils/cn";
import { captureAnalyticsEvent } from "@/lib/analytics/posthog";
import { isPositiveReviewQuickTag, reviewQuickTagOptions } from "@/lib/utils/reviewSignals";
import { mapReviewFormToCreateInput, reviewFormSchema, ReviewFormInput } from "@/lib/validations/review";

interface ReviewFormProps {
  bathroomId: string;
  viewerDisplayName: string;
}

interface ReviewSubmissionResponse {
  success?: boolean;
  reviewId?: string;
  error?: string;
}

const MAX_QUICK_TAGS = 2;

const defaultValues: ReviewFormInput = {
  overall_rating: 0,
  quick_tags: [],
  review_text: ""
};

const starRatings = [1, 2, 3, 4, 5] as const;

function StarIcon({ isActive }: { isActive: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("h-7 w-7", isActive ? "fill-amber-400" : "fill-slate-200")}>
      <path d="M12 2.8l2.68 5.44 6 0.87-4.34 4.22 1.02 5.98L12 16.47l-5.36 2.82 1.02-5.98-4.34-4.22 6-0.87L12 2.8z" />
    </svg>
  );
}

const shouldConfirmContradictoryReview = (values: ReviewFormInput) => {
  if (values.overall_rating > 2 || values.quick_tags.length === 0) {
    return false;
  }

  return values.quick_tags.every((tag) => isPositiveReviewQuickTag(tag));
};

export function ReviewForm({ bathroomId, viewerDisplayName }: ReviewFormProps) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [showNoteField, setShowNoteField] = useState(false);
  const [quickTagHint, setQuickTagHint] = useState<string | null>(null);
  const hasTrackedReviewStartedRef = useRef(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<ReviewFormInput>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues
  });

  const trackReviewStarted = () => {
    if (hasTrackedReviewStartedRef.current) {
      return;
    }

    hasTrackedReviewStartedRef.current = true;
    captureAnalyticsEvent("review_started", {
      bathroom_id: bathroomId,
      source_surface: "review_form"
    });
  };

  const overallRating = watch("overall_rating");
  const selectedQuickTags = watch("quick_tags");
  const reviewText = watch("review_text");
  const canPickQuickTags = overallRating >= 1;

  const toggleQuickTag = (tag: ReviewFormInput["quick_tags"][number]) => {
    trackReviewStarted();
    const hasTag = selectedQuickTags.includes(tag);
    if (hasTag) {
      setValue(
        "quick_tags",
        selectedQuickTags.filter((item) => item !== tag),
        { shouldDirty: true, shouldValidate: true }
      );
      setQuickTagHint(null);
      return;
    }

    if (selectedQuickTags.length >= MAX_QUICK_TAGS) {
      setQuickTagHint(`Choose up to ${MAX_QUICK_TAGS} tags.`);
      return;
    }

    setQuickTagHint(null);
    setValue("quick_tags", [...selectedQuickTags, tag], { shouldDirty: true, shouldValidate: true });
  };

  const onSubmit = async (values: ReviewFormInput) => {
    setSubmitError(null);
    setSubmitSuccess(false);

    if (typeof window !== "undefined" && shouldConfirmContradictoryReview(values)) {
      const confirmed = window.confirm("Your rating is low but selected tags are positive. Submit this review as-is?");
      if (!confirmed) {
        return;
      }
    }

    const payload = mapReviewFormToCreateInput(bathroomId, values);

    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const result = (await response.json()) as ReviewSubmissionResponse;
      if (!response.ok) {
        setSubmitError(result.error ?? "Could not submit review right now. Please try again.");
        return;
      }


      captureAnalyticsEvent("review_submitted", {
        bathroom_id: bathroomId,
        overall_rating: values.overall_rating,
        quick_tag_count: values.quick_tags.length,
        source_surface: "review_form"
      });

      setSubmitSuccess(true);
      setShowNoteField(false);
      setQuickTagHint(null);
      reset(defaultValues);
      router.refresh();
    } catch (error) {
      console.error("[Poopin] review insert failed", error);
      setSubmitError("Could not submit review right now. Please try again.");
    }
  };

  return (
    <section id="add-review" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-600">Quick review</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-900">How was it?</h2>
        <p className="mt-1 text-sm text-slate-600">Share a quick update in a few taps as {viewerDisplayName}.</p>
      </div>

      {submitError ? (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{submitError}</div>
      ) : null}

      {submitSuccess ? (
        <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          Thanks for sharing. Your review is now live.
        </div>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5" noValidate>
        <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Overall rating</p>
            <span className="text-xs text-slate-400">Required</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {starRatings.map((ratingValue) => (
              <button
                key={ratingValue}
                type="button"
                onClick={() => {
                  trackReviewStarted();
                  setValue("overall_rating", ratingValue, { shouldDirty: true, shouldValidate: true });
                }}
                className="rounded-md p-1 transition hover:scale-[1.03]"
                aria-label={`Rate ${ratingValue} out of 5`}
              >
                <StarIcon isActive={overallRating >= ratingValue} />
              </button>
            ))}
            <span className="ml-2 text-sm font-medium text-slate-600">
              {overallRating >= 1 ? `${overallRating} out of 5` : "Tap a star"}
            </span>
          </div>
          {errors.overall_rating?.message ? (
            <p className="mt-2 text-xs font-medium text-rose-600">{errors.overall_rating.message}</p>
          ) : null}
        </section>

        {canPickQuickTags ? (
          <section className="rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  What stood out? <span className="font-medium text-slate-400">(optional)</span>
                </p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                {selectedQuickTags.length}/{MAX_QUICK_TAGS}
              </span>
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {reviewQuickTagOptions.map((option) => {
                const isSelected = selectedQuickTags.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleQuickTag(option.value)}
                    aria-pressed={isSelected}
                    className={cn(
                      "rounded-full border px-2.5 py-1.5 text-xs font-semibold transition sm:text-sm",
                      isSelected
                        ? "border-brand-300 bg-brand-50 text-brand-700"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    )}
                  >
                    {option.icon} {option.label}
                  </button>
                );
              })}
            </div>

            {quickTagHint ? <p className="mt-2 text-xs font-medium text-slate-600">{quickTagHint}</p> : null}
            {errors.quick_tags?.message ? <p className="mt-2 text-xs font-medium text-rose-600">{errors.quick_tags.message}</p> : null}
          </section>
        ) : null}

        <section className="rounded-xl border border-slate-200 bg-white p-3.5">
          {!showNoteField && reviewText.trim().length === 0 ? (
            <button
              type="button"
              onClick={() => setShowNoteField(true)}
              className="text-sm font-medium text-slate-700 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-900"
            >
              Add note (optional)
            </button>
          ) : (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="review_text" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Optional note
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setValue("review_text", "", { shouldDirty: true, shouldValidate: true });
                    setShowNoteField(false);
                  }}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700"
                >
                  {reviewText.trim().length > 0 ? "Remove note" : "Hide"}
                </button>
              </div>
              <textarea
                id="review_text"
                rows={3}
                {...register("review_text")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                placeholder="Optional tip to help the next person."
              />
              {errors.review_text?.message ? (
                <p className="mt-1 text-xs font-medium text-rose-600">{errors.review_text.message}</p>
              ) : null}
            </div>
          )}
        </section>

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex w-full items-center justify-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {isSubmitting ? "Submitting..." : "Submit review"}
        </button>
      </form>
    </section>
  );
}
