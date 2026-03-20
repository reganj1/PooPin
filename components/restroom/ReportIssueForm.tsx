"use client";

import { useMemo, useState } from "react";
import { captureAnalyticsEvent } from "@/lib/analytics/posthog";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { insertReport, toReportSubmissionErrorMessage } from "@/lib/supabase/reports";
import {
  buildRestroomIssueReason,
  getOrCreateAnonymousBrowserId,
  restroomIssueOptions,
  RestroomIssueCode
} from "@/lib/utils/communitySignals";

interface ReportIssueFormProps {
  bathroomId: string;
}

export function ReportIssueForm({ bathroomId }: ReportIssueFormProps) {
  const supabaseClient = useMemo(() => getSupabaseBrowserClient(), []);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<RestroomIssueCode>("wrong_location");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!supabaseClient) {
      setErrorMessage("Issue reporting is currently unavailable.");
      return;
    }

    setIsSubmitting(true);
    try {
      const browserId = getOrCreateAnonymousBrowserId();
      const reason = buildRestroomIssueReason(selectedIssue, browserId);
      await insertReport(supabaseClient, { bathroomId, reason });
      setSuccessMessage("Thanks. We will review this issue.");
      setIsOpen(false);
    } catch (error) {
      setErrorMessage(toReportSubmissionErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => {
          setIsOpen((current) => {
            const nextValue = !current;
            if (nextValue) {
              captureAnalyticsEvent("report_listing_clicked", {
                bathroom_id: bathroomId,
                source_surface: "report_issue_form"
              });
            }
            return nextValue;
          });
          setErrorMessage(null);
          setSuccessMessage(null);
        }}
        className="text-xs font-medium text-slate-500 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-700"
      >
        Report an issue
      </button>

      {isOpen ? (
        <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <label htmlFor={`restroom-issue-${bathroomId}`} className="mb-1 block text-xs font-medium text-slate-600">
            What is wrong?
          </label>
          <select
            id={`restroom-issue-${bathroomId}`}
            value={selectedIssue}
            onChange={(event) => setSelectedIssue(event.target.value as RestroomIssueCode)}
            className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          >
            {restroomIssueOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="mt-2 flex flex-wrap items-center gap-2">
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

      {successMessage ? <p className="text-xs font-medium text-emerald-700">{successMessage}</p> : null}
      {errorMessage ? <p className="text-xs font-medium text-rose-600">{errorMessage}</p> : null}
    </div>
  );
}
