"use client";

import { useMemo, useState } from "react";
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
    <div className="flex w-full flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => {
          setIsOpen((current) => !current);
          setErrorMessage(null);
          setSuccessMessage(null);
        }}
        className="inline-flex min-h-10 items-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
      >
        {isOpen ? "Close report form" : "Report an issue"}
      </button>

      {isOpen ? (
        <div className="w-full rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <label htmlFor={`restroom-issue-${bathroomId}`} className="mb-1 block text-xs font-medium text-slate-600">
            What is wrong?
          </label>
          <select
            id={`restroom-issue-${bathroomId}`}
            value={selectedIssue}
            onChange={(event) => setSelectedIssue(event.target.value as RestroomIssueCode)}
            className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
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
              className="inline-flex min-h-10 items-center rounded-xl border border-slate-300 bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Sending..." : "Submit"}
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="inline-flex min-h-10 items-center rounded-xl px-2.5 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
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
