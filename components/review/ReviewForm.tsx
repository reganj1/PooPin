"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { insertReview, toAddReviewErrorMessage } from "@/lib/supabase/reviews";
import { reviewFormSchema, ReviewFormInput } from "@/lib/validations/review";

interface ReviewFormProps {
  bathroomId: string;
}

const defaultValues: ReviewFormInput = {
  overall_rating: 4,
  smell_rating: 4,
  cleanliness_rating: 4,
  wait_rating: 4,
  privacy_rating: 4,
  review_text: ""
};

interface RatingFieldProps {
  id: keyof Omit<ReviewFormInput, "review_text">;
  label: string;
  error?: string;
  register: ReturnType<typeof useForm<ReviewFormInput>>["register"];
}

function RatingField({ id, label, error, register }: RatingFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
        {label}
      </label>
      <input
        id={id}
        type="number"
        step="0.1"
        min={1}
        max={5}
        {...register(id, {
          setValueAs: (value) => (value === "" ? undefined : Number(value))
        })}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
      {error ? <p className="mt-1 text-xs font-medium text-rose-600">{error}</p> : null}
    </div>
  );
}

export function ReviewForm({ bathroomId }: ReviewFormProps) {
  const router = useRouter();
  const supabaseClient = useMemo(() => getSupabaseBrowserClient(), []);
  const isSupabaseConfigured = Boolean(supabaseClient);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<ReviewFormInput>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues
  });

  const onSubmit = async (values: ReviewFormInput) => {
    setSubmitError(null);
    setSubmitSuccess(false);

    if (!supabaseClient) {
      setSubmitError("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }

    try {
      const result = await insertReview(supabaseClient, {
        bathroom_id: bathroomId,
        ...values
      });

      console.groupCollapsed("[Poopin] review payload (supabase)");
      console.log("Payload inserted:", { bathroom_id: bathroomId, ...values });
      console.log("Supabase review insert result:", result);
      console.groupEnd();

      setSubmitSuccess(true);
      reset(defaultValues);
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
        <p className="mt-1 text-sm text-slate-600">Ratings use a 1.0 to 5.0 scale.</p>
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <RatingField id="overall_rating" label="Overall" error={errors.overall_rating?.message} register={register} />
          <RatingField id="smell_rating" label="Smell" error={errors.smell_rating?.message} register={register} />
          <RatingField
            id="cleanliness_rating"
            label="Cleanliness"
            error={errors.cleanliness_rating?.message}
            register={register}
          />
          <RatingField id="wait_rating" label="Wait" error={errors.wait_rating?.message} register={register} />
          <RatingField id="privacy_rating" label="Privacy" error={errors.privacy_rating?.message} register={register} />
        </div>

        <div>
          <label htmlFor="review_text" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Review text
          </label>
          <textarea
            id="review_text"
            rows={4}
            {...register("review_text")}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            placeholder="Share what stood out: smell, cleanliness, wait, and access friction."
          />
          {errors.review_text?.message ? (
            <p className="mt-1 text-xs font-medium text-rose-600">{errors.review_text.message}</p>
          ) : null}
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
