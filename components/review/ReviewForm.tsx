"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { cn } from "@/lib/utils/cn";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { insertReview, toAddReviewErrorMessage } from "@/lib/supabase/reviews";
import {
  mapReviewFormToCreateInput,
  reviewFormSchema,
  ReviewDetailChoice,
  ReviewFormInput
} from "@/lib/validations/review";

interface ReviewFormProps {
  bathroomId: string;
}

type ReviewDetailField = "cleanliness_choice" | "smell_choice" | "wait_choice" | "privacy_choice";

interface DetailOption {
  label: string;
  value: ReviewDetailChoice;
}

interface DetailFieldConfig {
  field: ReviewDetailField;
  label: string;
  options: readonly DetailOption[];
}

const defaultValues: ReviewFormInput = {
  overall_rating: 0,
  smell_choice: undefined,
  cleanliness_choice: undefined,
  wait_choice: undefined,
  privacy_choice: undefined,
  review_text: ""
};

const starRatings = [1, 2, 3, 4, 5] as const;

const detailFieldConfigs: readonly DetailFieldConfig[] = [
  {
    field: "cleanliness_choice",
    label: "Cleanliness",
    options: [
      { label: "Clean", value: "high" },
      { label: "Okay", value: "medium" },
      { label: "Dirty", value: "low" }
    ]
  },
  {
    field: "smell_choice",
    label: "Smell",
    options: [
      { label: "Good", value: "high" },
      { label: "Neutral", value: "medium" },
      { label: "Bad", value: "low" }
    ]
  },
  {
    field: "wait_choice",
    label: "Wait",
    options: [
      { label: "No wait", value: "high" },
      { label: "Short wait", value: "medium" },
      { label: "Long wait", value: "low" }
    ]
  },
  {
    field: "privacy_choice",
    label: "Privacy",
    options: [
      { label: "Good", value: "high" },
      { label: "Average", value: "medium" },
      { label: "Poor", value: "low" }
    ]
  }
];

function StarIcon({ isActive }: { isActive: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("h-7 w-7", isActive ? "fill-amber-400" : "fill-slate-200")}>
      <path d="M12 2.8l2.68 5.44 6 0.87-4.34 4.22 1.02 5.98L12 16.47l-5.36 2.82 1.02-5.98-4.34-4.22 6-0.87L12 2.8z" />
    </svg>
  );
}

const shouldConfirmContradictoryReview = (values: ReviewFormInput) => {
  if (values.overall_rating > 2) {
    return false;
  }

  const detailChoices = [values.cleanliness_choice, values.smell_choice, values.wait_choice, values.privacy_choice].filter(
    (choice): choice is ReviewDetailChoice => choice !== undefined
  );

  if (detailChoices.length < 2) {
    return false;
  }

  const positiveCount = detailChoices.filter((choice) => choice === "high").length;
  const negativeCount = detailChoices.filter((choice) => choice === "low").length;

  return positiveCount >= 2 && positiveCount > negativeCount;
};

export function ReviewForm({ bathroomId }: ReviewFormProps) {
  const router = useRouter();
  const supabaseClient = useMemo(() => getSupabaseBrowserClient(), []);
  const isSupabaseConfigured = Boolean(supabaseClient);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [showExtendedDetails, setShowExtendedDetails] = useState(false);

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

  const overallRating = watch("overall_rating");
  const showOptionalDetails = overallRating >= 1;
  const detailSelections = watch(["cleanliness_choice", "smell_choice", "wait_choice", "privacy_choice"]);
  const detailChoiceByField: Record<ReviewDetailField, ReviewDetailChoice | undefined> = {
    cleanliness_choice: detailSelections[0],
    smell_choice: detailSelections[1],
    wait_choice: detailSelections[2],
    privacy_choice: detailSelections[3]
  };
  const selectedDetailCount = detailSelections.filter((choice) => choice !== undefined).length;
  const hasExtendedSelection = detailSelections.slice(2).some((choice) => choice !== undefined);
  const shouldShowExtendedDetails = showExtendedDetails || hasExtendedSelection;
  const primaryDetailConfigs = detailFieldConfigs.slice(0, 2);
  const extendedDetailConfigs = detailFieldConfigs.slice(2);

  const onSubmit = async (values: ReviewFormInput) => {
    setSubmitError(null);
    setSubmitSuccess(false);

    if (typeof window !== "undefined" && shouldConfirmContradictoryReview(values)) {
      const confirmed = window.confirm(
        "Your overall rating is low, but most selected details are positive. Submit this review as-is?"
      );
      if (!confirmed) {
        return;
      }
    }

    if (!supabaseClient) {
      setSubmitError("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }

    const payload = mapReviewFormToCreateInput(bathroomId, values);

    try {
      const result = await insertReview(supabaseClient, payload);

      console.groupCollapsed("[Poopin] review payload (supabase)");
      console.log("Form values:", values);
      console.log("Payload inserted:", payload);
      console.log("Supabase review insert result:", result);
      console.groupEnd();

      setSubmitSuccess(true);
      reset(defaultValues);
      setShowExtendedDetails(false);
      router.refresh();
    } catch (error) {
      console.error("[Poopin] review insert failed", error);
      setSubmitError(toAddReviewErrorMessage(error));
    }
  };

  return (
    <section id="add-review" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
      <div className="mb-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Share Your Visit</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-900">Add a review</h2>
        <p className="mt-1 text-sm text-slate-600">Start with an overall rating, then add any optional details.</p>
      </div>

      {!isSupabaseConfigured ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Supabase environment variables are missing, so review submission is unavailable.
        </div>
      ) : null}

      {submitError ? (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{submitError}</div>
      ) : null}

      {submitSuccess ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          Review submitted successfully. Ratings and reviews have been refreshed.
        </div>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="text-sm font-semibold text-slate-900">Overall rating</p>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {starRatings.map((ratingValue) => (
              <button
                key={ratingValue}
                type="button"
                onClick={() => setValue("overall_rating", ratingValue, { shouldDirty: true, shouldValidate: true })}
                className="rounded-md p-1 transition hover:scale-[1.03]"
                aria-label={`Rate ${ratingValue} out of 5`}
              >
                <StarIcon isActive={overallRating >= ratingValue} />
              </button>
            ))}
            <span className="ml-2 text-sm font-medium text-slate-600">
              {overallRating >= 1 ? `${overallRating} out of 5` : "Tap a star to rate"}
            </span>
          </div>
          {errors.overall_rating?.message ? (
            <p className="mt-2 text-xs font-medium text-rose-600">{errors.overall_rating.message}</p>
          ) : null}
        </div>

        {showOptionalDetails ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">What stood out? <span className="text-slate-400">(optional)</span></p>
                <p className="mt-1 text-xs text-slate-500">Pick only what mattered during your visit.</p>
              </div>
              <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600">
                {selectedDetailCount} selected
              </span>
            </div>

            <div className="mt-3 space-y-3">
              {primaryDetailConfigs.map((config) => {
                const selectedChoice = detailChoiceByField[config.field];

                return (
                  <div key={config.field}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-700">{config.label}</p>
                      {selectedChoice ? (
                        <button
                          type="button"
                          onClick={() => setValue(config.field, undefined, { shouldDirty: true, shouldValidate: true })}
                          className="text-xs font-medium text-slate-500 hover:text-slate-700"
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {config.options.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setValue(config.field, option.value, { shouldDirty: true, shouldValidate: true })}
                          aria-pressed={selectedChoice === option.value}
                          className={cn(
                            "rounded-full border px-3 py-1 text-sm font-medium transition",
                            selectedChoice === option.value
                              ? "border-brand-300 bg-brand-50 text-brand-700"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}

              {!shouldShowExtendedDetails ? (
                <button
                  type="button"
                  onClick={() => setShowExtendedDetails(true)}
                  className="text-xs font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-900"
                >
                  Add more detail (wait, privacy)
                </button>
              ) : (
                <>
                  <div className="h-px bg-slate-200" />

                  {extendedDetailConfigs.map((config) => {
                    const selectedChoice = detailChoiceByField[config.field];

                    return (
                      <div key={config.field}>
                        <div className="mb-1.5 flex items-center justify-between">
                          <p className="text-sm font-medium text-slate-700">{config.label}</p>
                          {selectedChoice ? (
                            <button
                              type="button"
                              onClick={() => setValue(config.field, undefined, { shouldDirty: true, shouldValidate: true })}
                              className="text-xs font-medium text-slate-500 hover:text-slate-700"
                            >
                              Clear
                            </button>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {config.options.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setValue(config.field, option.value, { shouldDirty: true, shouldValidate: true })}
                              aria-pressed={selectedChoice === option.value}
                              className={cn(
                                "rounded-full border px-3 py-1 text-sm font-medium transition",
                                selectedChoice === option.value
                                  ? "border-brand-300 bg-brand-50 text-brand-700"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                              )}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setShowExtendedDetails(false)}
                    className="text-xs font-medium text-slate-500 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-700"
                  >
                    Show fewer detail options
                  </button>
                </>
              )}
            </div>
          </div>
        ) : null}

        <div>
          <label htmlFor="review_text" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Notes (optional)
          </label>
          <textarea
            id="review_text"
            rows={4}
            {...register("review_text")}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            placeholder="Optional note: share access tips, peak times, or anything useful."
          />
          {errors.review_text?.message ? <p className="mt-1 text-xs font-medium text-rose-600">{errors.review_text.message}</p> : null}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Submitting..." : "Submit review"}
        </button>
      </form>
    </section>
  );
}
