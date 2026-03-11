"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  ContactSubmissionInput,
  contactSubmissionSchema,
  contactTopicOptions
} from "@/lib/validations/contact";

interface ContactResponsePayload {
  success?: boolean;
  message?: string;
  submissionId?: string;
  error?: string;
  fieldErrors?: Partial<Record<keyof ContactSubmissionInput, string[]>>;
}

type ServerFieldErrors = Partial<Record<keyof ContactSubmissionInput, string>>;

const defaultValues: ContactSubmissionInput = {
  name: "",
  email: "",
  topic: "general_feedback",
  message: "",
  restroomReference: "",
  cityLocation: ""
};

const topicLabel: Record<(typeof contactTopicOptions)[number], string> = {
  general_feedback: "General feedback",
  incorrect_restroom_info: "Report incorrect restroom info",
  photo_or_content_issue: "Report photo or content issue",
  business_or_partnership: "Business or partnership inquiry",
  press_or_media: "Press or media",
  other: "Other"
};

const toFirstFieldErrors = (
  fieldErrors: Partial<Record<keyof ContactSubmissionInput, string[]>> | undefined
): ServerFieldErrors => {
  if (!fieldErrors) {
    return {};
  }

  const nextErrors: ServerFieldErrors = {};
  for (const [key, value] of Object.entries(fieldErrors)) {
    const firstError = value?.[0];
    if (firstError) {
      nextErrors[key as keyof ContactSubmissionInput] = firstError;
    }
  }

  return nextErrors;
};

const inputBaseClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

export function ContactForm() {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccessMessage, setSubmitSuccessMessage] = useState<string | null>(null);
  const [submitReference, setSubmitReference] = useState<string | null>(null);
  const [serverFieldErrors, setServerFieldErrors] = useState<ServerFieldErrors>({});

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<ContactSubmissionInput>({
    resolver: zodResolver(contactSubmissionSchema),
    defaultValues
  });

  const getFieldError = (field: keyof ContactSubmissionInput) => errors[field]?.message ?? serverFieldErrors[field];

  const onSubmit = async (values: ContactSubmissionInput) => {
    setSubmitError(null);
    setSubmitSuccessMessage(null);
    setSubmitReference(null);
    setServerFieldErrors({});

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(values)
      });

      const payload = (await response.json()) as ContactResponsePayload;

      if (!response.ok) {
        setServerFieldErrors(toFirstFieldErrors(payload.fieldErrors));
        setSubmitError(payload.error ?? "Could not send your message right now. Please try again.");
        return;
      }

      setSubmitSuccessMessage(payload.message ?? "Thanks for reaching out. We will get back to you soon.");
      setSubmitReference(payload.submissionId ?? null);
      reset(defaultValues);
    } catch {
      setSubmitError("Could not send your message right now. Please check your connection and try again.");
    }
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card sm:p-7">
      <div className="mb-6 border-b border-slate-200 pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">Contact</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[2rem]">Get in touch</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Use this form to report listing issues, request content removal, share feedback, or contact the team.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          If this is about a specific restroom, include the restroom link or listing ID.
        </p>
        <p className="mt-3 text-sm text-slate-600">
          You can also reach us at{" "}
          <a href="mailto:hello@poopinapp.com" className="font-semibold text-brand-600 hover:text-brand-700">
            hello@poopinapp.com
          </a>
          .
        </p>
      </div>

      {submitError ? (
        <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{submitError}</div>
      ) : null}

      {submitSuccessMessage ? (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-700">{submitSuccessMessage}</p>
          {submitReference ? (
            <p className="mt-1 text-xs text-emerald-700">
              Reference: <span className="font-semibold">{submitReference}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="contact-name" className="mb-1.5 block text-sm font-medium text-slate-700">
              Name
            </label>
            <input id="contact-name" {...register("name")} className={inputBaseClass} placeholder="Your name" />
            {getFieldError("name") ? <p className="mt-1 text-xs font-medium text-rose-600">{getFieldError("name")}</p> : null}
          </div>

          <div>
            <label htmlFor="contact-email" className="mb-1.5 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="contact-email"
              type="email"
              autoComplete="email"
              {...register("email")}
              className={inputBaseClass}
              placeholder="you@example.com"
            />
            {getFieldError("email") ? (
              <p className="mt-1 text-xs font-medium text-rose-600">{getFieldError("email")}</p>
            ) : null}
          </div>
        </div>

        <div>
          <label htmlFor="contact-topic" className="mb-1.5 block text-sm font-medium text-slate-700">
            Reason or topic
          </label>
          <select id="contact-topic" {...register("topic")} className={inputBaseClass}>
            {contactTopicOptions.map((option) => (
              <option key={option} value={option}>
                {topicLabel[option]}
              </option>
            ))}
          </select>
          {getFieldError("topic") ? <p className="mt-1 text-xs font-medium text-rose-600">{getFieldError("topic")}</p> : null}
        </div>

        <div>
          <label htmlFor="contact-message" className="mb-1.5 block text-sm font-medium text-slate-700">
            Message
          </label>
          <textarea
            id="contact-message"
            rows={6}
            {...register("message")}
            className={`${inputBaseClass} resize-y`}
            placeholder="Share what happened or what you need help with."
          />
          {getFieldError("message") ? (
            <p className="mt-1 text-xs font-medium text-rose-600">{getFieldError("message")}</p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="contact-restroom-reference" className="mb-1.5 block text-sm font-medium text-slate-700">
              Restroom URL or listing ID (optional)
            </label>
            <input
              id="contact-restroom-reference"
              {...register("restroomReference")}
              className={inputBaseClass}
              placeholder="/restroom/abc123"
            />
            {getFieldError("restroomReference") ? (
              <p className="mt-1 text-xs font-medium text-rose-600">{getFieldError("restroomReference")}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="contact-city-location" className="mb-1.5 block text-sm font-medium text-slate-700">
              City or location (optional)
            </label>
            <input
              id="contact-city-location"
              {...register("cityLocation")}
              className={inputBaseClass}
              placeholder="San Francisco"
            />
            {getFieldError("cityLocation") ? (
              <p className="mt-1 text-xs font-medium text-rose-600">{getFieldError("cityLocation")}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-5">
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Sending..." : "Send message"}
          </button>
          <p className="text-xs text-slate-500">For feedback, issue reports, and partnership inquiries. No account required.</p>
        </div>
      </form>
    </section>
  );
}
