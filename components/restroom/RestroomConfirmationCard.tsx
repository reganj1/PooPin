"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { hasExistingReportReason, insertReport, toReportSubmissionErrorMessage } from "@/lib/supabase/reports";
import {
  buildRestroomConfirmationReason,
  getOrCreateAnonymousBrowserId,
  hasConfirmedRestroomLocally,
  recordRestroomConfirmationLocally
} from "@/lib/utils/communitySignals";

interface RestroomConfirmationCardProps {
  bathroomId: string;
  initialCount: number;
}

const toConfirmationLabel = (count: number) => `Confirmed by ${count} visitor${count === 1 ? "" : "s"}`;

export function RestroomConfirmationCard({ bathroomId, initialCount }: RestroomConfirmationCardProps) {
  const supabaseClient = useMemo(() => getSupabaseBrowserClient(), []);
  const [confirmationCount, setConfirmationCount] = useState(initialCount);
  const [hasConfirmed, setHasConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setHasConfirmed(hasConfirmedRestroomLocally(bathroomId));
  }, [bathroomId]);

  const handleConfirm = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (hasConfirmed) {
      setSuccessMessage("You already confirmed this restroom. Thank you.");
      return;
    }

    if (!supabaseClient) {
      setErrorMessage("Confirmation is currently unavailable.");
      return;
    }

    setIsSubmitting(true);

    try {
      const browserId = getOrCreateAnonymousBrowserId();
      const reason = buildRestroomConfirmationReason(browserId);
      const alreadyReported = await hasExistingReportReason(supabaseClient, bathroomId, reason);

      if (!alreadyReported) {
        await insertReport(supabaseClient, { bathroomId, reason });
        setConfirmationCount((current) => current + 1);
      }

      recordRestroomConfirmationLocally(bathroomId);
      setHasConfirmed(true);
      setSuccessMessage("Thanks for confirming this restroom.");
    } catch (error) {
      setErrorMessage(toReportSubmissionErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="flex h-full min-h-[172px] flex-col rounded-[26px] border border-slate-200/90 bg-slate-50/80 p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Community trust</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{toConfirmationLabel(confirmationCount)}</p>
          <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">
            Anonymous confirmations help other people trust that this listing is still accurate.
          </p>
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={isSubmitting || hasConfirmed}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-65 sm:w-auto"
        >
          {hasConfirmed ? "Confirmed" : isSubmitting ? "Confirming..." : "Confirm this restroom exists"}
        </button>
      </div>

      <div className="mt-auto pt-3">
        {successMessage ? <p className="text-xs font-medium text-emerald-700">{successMessage}</p> : null}
        {errorMessage ? <p className="text-xs font-medium text-rose-600">{errorMessage}</p> : null}
      </div>
    </section>
  );
}
