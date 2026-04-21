"use client";

import { type FormEvent, useState } from "react";
import {
  getOrCreateAnonymousBrowserId,
  restroomIssueOptions,
  type RestroomIssueCode
} from "@/lib/utils/communitySignals";

interface ReportIssueFormProps {
  bathroomId: string;
}

interface ReportSubmissionResponse {
  success?: boolean;
  reportId?: string;
  error?: string;
}

const reportCommentGuidance: Record<RestroomIssueCode, { helper: string; placeholder: string }> = {
  wrong_location: {
    helper:
      "If you know where it should be, describe it. Example: marker is on the wrong side of the park, restroom is near the playground.",
    placeholder: "Describe where the restroom actually is."
  },
  closed_restroom: {
    helper: "Tell us what seems closed or unavailable.",
    placeholder: "Example: doors are locked during listed open hours."
  },
  duplicate_listing: {
    helper: "If you noticed the matching listing, share its name or nearby clue.",
    placeholder: "Example: duplicate of the restroom by the main entrance."
  },
  not_a_restroom: {
    helper: "Tell us what this place actually is.",
    placeholder: "Example: this is a storage building, not a public restroom."
  },
  other: {
    helper: "Anything that helps us verify this?",
    placeholder: "Tell us what seems wrong."
  }
};

export function ReportIssueForm({ bathroomId }: ReportIssueFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<RestroomIssueCode>("wrong_location");
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isCommentRequired = selectedIssue === "other";
  const guidance = reportCommentGuidance[selectedIssue];

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const normalizedComment = comment.trim();
    if (isCommentRequired && normalizedComment.length === 0) {
      setErrorMessage("Add a short comment so we can verify what is wrong.");
      return;
    }

    setIsSubmitting(true);
    try {
      const browserId = getOrCreateAnonymousBrowserId();
      const response = await fetch(`/api/restrooms/${bathroomId}/reports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          issueCode: selectedIssue,
          browserId,
          comment: normalizedComment
        })
      });
      const result = (await response.json()) as ReportSubmissionResponse;

      if (!response.ok) {
        setErrorMessage(result.error ?? "Could not submit that report right now. Please try again.");
        return;
      }

      setSuccessMessage("Thanks. We will review this issue.");
      setIsOpen(false);
      setComment("");
    } catch (error) {
      console.error("[Poopin] listing report failed", error);
      setErrorMessage("Could not submit that report right now. Please try again.");
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
          <form onSubmit={handleSubmit}>
            <select
              id={`restroom-issue-${bathroomId}`}
              value={selectedIssue}
              onChange={(event) => {
                setSelectedIssue(event.target.value as RestroomIssueCode);
                setErrorMessage(null);
              }}
              className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              {restroomIssueOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <div className="mt-3">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={`restroom-issue-comment-${bathroomId}`} className="text-xs font-medium text-slate-600">
                  Anything that helps us verify this?
                </label>
                <span className="text-[11px] font-medium text-slate-400">{isCommentRequired ? "Required" : "Optional"}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">{guidance.helper}</p>
              <textarea
                id={`restroom-issue-comment-${bathroomId}`}
                rows={3}
                maxLength={500}
                value={comment}
                onChange={(event) => {
                  setComment(event.target.value);
                  setErrorMessage(null);
                }}
                placeholder={guidance.placeholder}
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="submit"
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
          </form>
        </div>
      ) : null}

      {successMessage ? <p className="text-xs font-medium text-emerald-700">{successMessage}</p> : null}
      {errorMessage ? <p className="text-xs font-medium text-rose-600">{errorMessage}</p> : null}
    </div>
  );
}
