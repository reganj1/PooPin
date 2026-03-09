import { SupabaseClient } from "@supabase/supabase-js";
import { Report } from "@/types";

type ReportInsertRow = Pick<Report, "id" | "bathroom_id" | "user_id" | "reason">;

export interface InsertReportInput {
  bathroomId: string;
  reason: string;
}

export interface InsertReportResult {
  reportId: string;
}

const toInsertPayload = (input: InsertReportInput, reportId: string): ReportInsertRow => ({
  id: reportId,
  bathroom_id: input.bathroomId,
  user_id: null,
  reason: input.reason
});

export const insertReport = async (
  supabaseClient: SupabaseClient,
  input: InsertReportInput
): Promise<InsertReportResult> => {
  const reportId = crypto.randomUUID();
  const payload = toInsertPayload(input, reportId);

  const { error } = await supabaseClient.from("reports").insert(payload);
  if (error) {
    throw new Error(error.message);
  }

  return { reportId };
};

export const hasExistingReportReason = async (
  supabaseClient: SupabaseClient,
  bathroomId: string,
  reason: string
): Promise<boolean> => {
  const { data, error } = await supabaseClient
    .from("reports")
    .select("id")
    .eq("bathroom_id", bathroomId)
    .eq("reason", reason)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data?.id);
};

export const hasExistingReportReasonPrefix = async (
  supabaseClient: SupabaseClient,
  bathroomId: string,
  reasonPrefix: string
): Promise<boolean> => {
  const { data, error } = await supabaseClient
    .from("reports")
    .select("id")
    .eq("bathroom_id", bathroomId)
    .like("reason", `${reasonPrefix}%`)
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) && data.length > 0;
};

export const toReportSubmissionErrorMessage = (error: unknown): string => {
  const fallback = "Could not submit that report right now. Please try again.";

  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = error.message.toLowerCase();
  if (message.includes("row-level security") || message.includes("permission denied")) {
    return "Reporting is temporarily unavailable. Please try again later.";
  }

  if (message.includes("failed to fetch") || message.includes("network")) {
    return "Network issue while sending your report. Please retry.";
  }

  return fallback;
};

