"use client";

import { useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { hasExistingReportReasonPrefix, insertReport, toReportSubmissionErrorMessage } from "@/lib/supabase/reports";
import {
  buildReviewReportReason,
  buildReviewReportReasonPrefix,
  getOrCreateAnonymousBrowserId,
  hasReportedReviewLocally,
  recordReviewReportLocally,
  reviewReportOptions,
  ReviewReportCode
} from "@/lib/utils/communitySignals";

interface ReviewReportActionProps {
  bathroomId: string;
  reviewId: string;
}

export function ReviewReportAction({ bathroomId, reviewId }: ReviewReportActionProps) {
  const supabaseClient = useMemo(() => getSupabaseBrowserClient(), []);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedReason, setSelectedReason] = useState<ReviewReportCode>("abusive_language");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    setStatusMessage(null);
    setErrorMessage(null);

    if (!supabaseClient) {
      setErrorMessage("Reporting is currently unavailable.");
      return;
    }

    if (hasReportedReviewLocally(reviewId)) {
      setStatusMessage("You already reported this review. Thank you.");
      setIsOpen(false);
      return;
    }

    setIsSubmitting(true);
    try {
      const browserId = getOrCreateAnonymousBrowserId();
      const reasonPrefix = buildReviewReportReasonPrefix(reviewId, browserId);
      const alreadyReported = await hasExistingReportReasonPrefix(supabaseClient, bathroomId, reasonPrefix);

      if (!alreadyReported) {
        const reason = buildReviewReportReason(reviewId, selectedReason, browserId);
        await insertReport(supabaseClient, { bathroomId, reason });
      }

      recordReviewReportLocally(reviewId);
      setStatusMessage("Thanks. We will review this report.");
      setIsOpen(false);
    } catch (error) {
      setErrorMessage(toReportSubmissionErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-2 flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => {
          setIsOpen((current) => !current);
          setStatusMessage(null);
          setErrorMessage(null);
        }}
        className="text-xs font-medium text-slate-500 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-700"
      >
        Report review
      </button>

      {isOpen ? (
        <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <label htmlFor={`review-report-${reviewId}`} className="mb-1 block text-xs font-medium text-slate-600">
            Reason
          </label>
          <select
            id={`review-report-${reviewId}`}
            value={selectedReason}
            onChange={(event) => setSelectedReason(event.target.value as ReviewReportCode)}
            className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          >
            {reviewReportOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Sending..." : "Submit"}
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {statusMessage ? <p className="text-xs font-medium text-emerald-700">{statusMessage}</p> : null}
      {errorMessage ? <p className="text-xs font-medium text-rose-600">{errorMessage}</p> : null}
    </div>
  );
}

