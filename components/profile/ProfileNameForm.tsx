"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

interface ProfileNameFormProps {
  initialDisplayName: string;
}

interface UpdateProfileResponse {
  success?: boolean;
  displayName?: string;
  error?: string;
}

export function ProfileNameForm({ initialDisplayName }: ProfileNameFormProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/profile/display-name", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ displayName })
      });

      const payload = (await response.json()) as UpdateProfileResponse;
      if (!response.ok) {
        setErrorMessage(payload.error ?? "Could not update your name right now.");
        return;
      }

      if (payload.displayName) {
        setDisplayName(payload.displayName);
      }

      setStatusMessage("Display name updated.");
      router.refresh();
    } catch {
      setErrorMessage("Could not update your name right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-600">Public name</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-900">Update your display name</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        This is what other visitors see on your reviews and public profile.
      </p>

      <div className="mt-4 space-y-2">
        <label htmlFor="display-name" className="block text-sm font-medium text-slate-700">
          Display name
        </label>
        <input
          id="display-name"
          type="text"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={40}
          autoComplete="nickname"
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 sm:text-sm"
          placeholder="poopin1234"
        />
      </div>

      {errorMessage ? (
        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">{errorMessage}</div>
      ) : null}
      {statusMessage ? (
        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-700">
          {statusMessage}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {isSubmitting ? "Saving..." : "Save name"}
      </button>
    </form>
  );
}
