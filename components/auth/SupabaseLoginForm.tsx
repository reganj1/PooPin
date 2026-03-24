"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

interface SupabaseLoginFormProps {
  returnTo: string;
  isAuthConfigured: boolean;
  errorParam: string | null;
  configIssue: string | null;
  accountSetupIssue?: string | null;
}

const errorMessages: Record<string, string> = {
  auth_callback: "That sign-in email could not be completed. Send a new code and try again.",
  auth_missing_code: "That sign-in email is missing a required code. Send a new one and try again.",
  auth_exchange_failed: "That sign-in email expired or could not be completed. Send a new code and try again.",
  auth_session_missing: "We could not finish signing you in. Verify a fresh code and try again.",
  profile_setup_failed: "We signed you in, but could not finish setting up your account. Refresh and try again."
};

const RESEND_COOLDOWN_SECONDS = 45;
const RESEND_COOLDOWN_BUFFER_SECONDS = 5;

interface AuthErrorLike {
  name?: string;
  message?: string;
  code?: string;
  status?: number;
}

const formatRawAuthError = (error: AuthErrorLike | null) => {
  if (!error) {
    return null;
  }

  const parts = [
    error.name || "AuthError",
    error.code ? `code=${error.code}` : null,
    typeof error.status === "number" ? `status=${error.status}` : null,
    error.message ?? null
  ].filter(Boolean);

  return parts.join(" | ");
};

const formatAuthErrorMessage = (message: string, mode: "send" | "verify") => {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("rate limit") ||
    normalized.includes("too many") ||
    normalized.includes("security purposes") ||
    normalized.includes("over_email_send_rate_limit")
  ) {
    return "Too many attempts right now. Wait a bit, then try again.";
  }

  if (normalized.includes("expired")) {
    return mode === "verify" ? "That code expired. Send a new one and try again." : "That code request expired. Try again.";
  }

  if (
    normalized.includes("invalid") ||
    normalized.includes("token") ||
    normalized.includes("otp") ||
    normalized.includes("one-time") ||
    normalized.includes("verification code")
  ) {
    return mode === "verify" ? "That code didn’t match. Check it and try again." : "We couldn’t send a code right now.";
  }

  return mode === "verify" ? "We couldn’t verify that code. Try again." : "We couldn’t send a code right now.";
};

const getRetryAfterSeconds = (message: string) => {
  const afterMatch = message.match(/after\s+(\d+)\s+seconds?/i);
  if (afterMatch) {
    return Number.parseInt(afterMatch[1], 10);
  }

  const inMatch = message.match(/in\s+(\d+)\s+seconds?/i);
  if (inMatch) {
    return Number.parseInt(inMatch[1], 10);
  }

  return null;
};

export function SupabaseLoginForm({
  returnTo,
  isAuthConfigured,
  errorParam,
  configIssue,
  accountSetupIssue = null
}: SupabaseLoginFormProps) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const initialErrorMessage = errorParam ? errorMessages[errorParam] ?? null : null;
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialErrorMessage);
  const [rawErrorMessage, setRawErrorMessage] = useState<string | null>(initialErrorMessage);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  useEffect(() => {
    if (cooldownRemaining <= 0) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setCooldownRemaining((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [cooldownRemaining]);

  const startCooldown = (seconds = RESEND_COOLDOWN_SECONDS + RESEND_COOLDOWN_BUFFER_SECONDS) => setCooldownRemaining(seconds);

  const sendCode = async (normalizedEmail: string, mode: "initial" | "resend") => {
    if (!supabase || !isAuthConfigured) {
      setErrorMessage(configIssue ?? "Login is not configured yet.");
      setRawErrorMessage(configIssue ?? "Login is not configured yet.");
      return false;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: true
      }
    });

    if (error) {
      console.error("[Poopin] Supabase OTP send failed.", { error });
      const retryAfterSeconds = getRetryAfterSeconds(error.message || "");
      if (retryAfterSeconds !== null) {
        startCooldown(retryAfterSeconds + RESEND_COOLDOWN_BUFFER_SECONDS);
        setErrorMessage(
          `Please wait ${retryAfterSeconds} more second${retryAfterSeconds === 1 ? "" : "s"} before requesting another code.`
        );
        setRawErrorMessage(formatRawAuthError(error));
        return false;
      }

      if (mode === "resend") {
        startCooldown();
      }

      setErrorMessage(formatAuthErrorMessage(error.message || "", "send"));
      setRawErrorMessage(formatRawAuthError(error));
      return false;
    }

    setSentEmail(normalizedEmail);
    setStep("code");
    setCode("");
    setRawErrorMessage(null);
    setStatusMessage(
      mode === "resend" ? `We sent a new 6-digit code to ${normalizedEmail}.` : `We sent a 6-digit code to ${normalizedEmail}.`
    );
    startCooldown();
    return true;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);
    setRawErrorMessage(null);

    if (!supabase || !isAuthConfigured) {
      setErrorMessage(configIssue ?? "Login is not configured yet.");
      setRawErrorMessage(configIssue ?? "Login is not configured yet.");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setErrorMessage("Enter your email to continue.");
      setRawErrorMessage(null);
      return;
    }

    if (step === "email") {
      setIsSending(true);

      try {
        await sendCode(normalizedEmail, "initial");
      } catch (error) {
        console.error("[Poopin] Unexpected OTP send failure.", { error });
        setErrorMessage("We couldn’t send a code right now.");
        setRawErrorMessage(error instanceof Error ? error.message : "Unknown OTP send error.");
      } finally {
        setIsSending(false);
      }

      return;
    }

    const normalizedCode = code.replace(/\s+/g, "").trim();
    if (normalizedCode.length !== 6) {
      setErrorMessage("Enter the 6-digit code from your email.");
      setRawErrorMessage(null);
      return;
    }

    setIsVerifying(true);

    try {
      // Supabase's current docs use type "email" for user-entered email OTPs.
      // We keep that as the primary path, but first-time/unconfirmed users can still
      // receive signup-classified codes, so we fall back to "signup" if "email" fails.
      const verifyTypes: EmailOtpType[] = ["email", "signup"];
      let verified = false;
      let lastError: AuthErrorLike | null = null;

      for (const verifyType of verifyTypes) {
        const { error } = await supabase.auth.verifyOtp({
          email: normalizedEmail,
          token: normalizedCode,
          type: verifyType
        });

        if (!error) {
          verified = true;
          break;
        }

        console.error("[Poopin] Supabase OTP verify failed.", {
          verifyType,
          error
        });
        lastError = error;

        if (verifyType === "email") {
          continue;
        }
      }

      if (!verified) {
        setErrorMessage(formatAuthErrorMessage(lastError?.message || "", "verify"));
        setRawErrorMessage(formatRawAuthError(lastError));
        return;
      }

      setRawErrorMessage(null);
      setStatusMessage("Code verified. Signing you in...");
      window.location.assign(returnTo);
    } catch (error) {
      console.error("[Poopin] Unexpected OTP verify failure.", { error });
      setErrorMessage("We couldn’t verify that code. Try again.");
      setRawErrorMessage(error instanceof Error ? error.message : "Unknown OTP verify error.");
    } finally {
      setIsVerifying(false);
    }
  };

  const resetSentState = () => {
    setSentEmail(null);
    setStep("email");
    setCode("");
    setStatusMessage(null);
    setErrorMessage(null);
    setRawErrorMessage(null);
    setCooldownRemaining(0);
  };

  const handleResend = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || cooldownRemaining > 0) {
      return;
    }

    setStatusMessage(null);
    setErrorMessage(null);
    setRawErrorMessage(null);
    setIsSending(true);

    try {
      await sendCode(normalizedEmail, "resend");
    } catch (error) {
      console.error("[Poopin] Unexpected OTP resend failure.", { error });
      setErrorMessage("We couldn’t send a code right now.");
      setRawErrorMessage(error instanceof Error ? error.message : "Unknown OTP resend error.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <form id="login-form" onSubmit={handleSubmit} className="space-y-4">
      {step === "email" ? (
        <div className="space-y-2">
          <label htmlFor="login-email" className="block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 sm:text-sm"
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Code sent to</p>
            <p className="font-medium text-slate-900">{sentEmail ?? email.trim().toLowerCase()}</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="login-code" className="block text-sm font-medium text-slate-700">
              Code
            </label>
            <input
              id="login-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              enterKeyHint="done"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D+/g, "").slice(0, 6))}
              placeholder="123456"
              maxLength={6}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-center text-[1.35rem] tracking-[0.28em] text-slate-900 shadow-sm outline-none transition placeholder:tracking-normal placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 sm:text-lg sm:tracking-[0.35em]"
            />
          </div>
        </div>
      )}

      {configIssue ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-900">
          <p className="font-semibold">Supabase auth is not configured yet</p>
          <p className="mt-1 text-amber-800">{configIssue}</p>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm text-rose-700">
          <p>{errorMessage}</p>
          {rawErrorMessage ? (
            <p className="mt-2 break-all rounded-xl bg-rose-100/80 px-3 py-2 font-mono text-[11px] leading-5 text-rose-900">
              {rawErrorMessage}
            </p>
          ) : null}
        </div>
      ) : null}

      {accountSetupIssue ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm text-rose-700">
          {accountSetupIssue}
        </div>
      ) : null}

      {statusMessage ? (
        <div className="rounded-[24px] border border-emerald-200 bg-[linear-gradient(180deg,#f4fff8_0%,#ecfdf5_100%)] px-4 py-4 text-sm text-emerald-800 shadow-sm">
          <p className="leading-6">{statusMessage}</p>
          {step === "code" ? (
            <button
              type="button"
              onClick={resetSentState}
              className="mt-3 text-xs font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-900"
            >
              Use a different email
            </button>
          ) : null}
        </div>
      ) : null}

      {step === "email" ? (
        <div>
          <button
            type="submit"
            disabled={isSending || !isAuthConfigured}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSending ? "Sending..." : "Send code"}
          </button>
          <p className="mt-3 text-xs leading-5 text-slate-500">No password needed.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs leading-5 text-slate-500">Enter the newest 6-digit code from your email.</p>
          <button
            type="submit"
            disabled={isVerifying || !isAuthConfigured}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isVerifying ? "Verifying..." : "Verify code"}
          </button>
          <div className="flex flex-col gap-2 text-xs leading-5 text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <p>{cooldownRemaining > 0 ? `You can resend a code in ${cooldownRemaining}s.` : "Didn’t get it? You can resend a fresh code."}</p>
            <button
              type="button"
              onClick={handleResend}
              disabled={isSending || cooldownRemaining > 0 || !isAuthConfigured}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              {isSending ? "Sending..." : cooldownRemaining > 0 ? `Resend in ${cooldownRemaining}s` : "Resend code"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
