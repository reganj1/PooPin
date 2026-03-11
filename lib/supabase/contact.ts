import { SupabaseClient } from "@supabase/supabase-js";
import { ContactSubmissionInput } from "@/lib/validations/contact";

type ContactSubmissionInsertRow = {
  id: string;
  name: string;
  email: string;
  topic: string;
  message: string;
  restroom_url_or_id: string | null;
  city_or_location: string | null;
  user_agent: string | null;
};

interface ContactSubmissionMeta {
  userAgent?: string | null;
}

export interface InsertContactSubmissionResult {
  submissionId: string;
}

const sanitizeUserAgent = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, 500);
};

const toInsertPayload = (
  submissionId: string,
  input: ContactSubmissionInput,
  meta: ContactSubmissionMeta
): ContactSubmissionInsertRow => ({
  id: submissionId,
  name: input.name,
  email: input.email,
  topic: input.topic,
  message: input.message,
  restroom_url_or_id: input.restroomReference ?? null,
  city_or_location: input.cityLocation ?? null,
  user_agent: sanitizeUserAgent(meta.userAgent)
});

export const insertContactSubmission = async (
  supabaseClient: SupabaseClient,
  input: ContactSubmissionInput,
  meta: ContactSubmissionMeta = {}
): Promise<InsertContactSubmissionResult> => {
  const submissionId = `contact_${crypto.randomUUID()}`;
  const payload = toInsertPayload(submissionId, input, meta);

  const { error } = await supabaseClient.from("contact_submissions").insert(payload);
  if (error) {
    throw new Error(error.message);
  }

  return {
    submissionId
  };
};

export const toContactSubmissionErrorMessage = (error: unknown) => {
  const fallback = "Could not send your message right now. Please try again in a moment.";

  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = error.message.toLowerCase();
  if (message.includes("row-level security") || message.includes("permission denied")) {
    return "Contact is temporarily unavailable. Please try again later.";
  }

  if (message.includes("network") || message.includes("fetch")) {
    return "Could not reach the contact service. Please check your connection and try again.";
  }

  return fallback;
};
