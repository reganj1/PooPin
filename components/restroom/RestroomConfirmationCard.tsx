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
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Community trust</p>
          <p className="mt-1 text-sm font-semibold text-slate-800">{toConfirmationLabel(confirmationCount)}</p>
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={isSubmitting || hasConfirmed}
          className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-65"
        >
          {hasConfirmed ? "Confirmed" : isSubmitting ? "Confirming..." : "Confirm this restroom exists"}
        </button>
      </div>

      <p className="mt-2 text-xs text-slate-500">Anonymous confirmations help others trust listing accuracy.</p>
      {successMessage ? <p className="mt-2 text-xs font-medium text-emerald-700">{successMessage}</p> : null}
      {errorMessage ? <p className="mt-2 text-xs font-medium text-rose-600">{errorMessage}</p> : null}
    </section>
  );
}

