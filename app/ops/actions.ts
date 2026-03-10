"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { ModerationStatus } from "@/types";

const REVIEWED_REPORT_PREFIX = "reviewed:v1:";
const allowedStatuses = new Set<ModerationStatus>(["active", "pending", "flagged", "removed"]);

const getOpsKey = () => process.env.OPS_DASHBOARD_KEY?.trim() ?? "";

const hasValidOpsKey = (providedKey: unknown) => {
  const configuredKey = getOpsKey();
  if (!configuredKey) {
    return true;
  }

  return typeof providedKey === "string" && providedKey === configuredKey;
};

const getStringValue = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
};

const canRunModerationAction = (formData: FormData) => {
  const providedOpsKey = getStringValue(formData, "ops_key");
  if (!hasValidOpsKey(providedOpsKey)) {
    return false;
  }

  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    return false;
  }

  return supabaseAdmin;
};

const safeRevalidateOps = () => {
  revalidatePath("/ops");
};

export async function moderateBathroomAction(formData: FormData) {
  const supabaseAdmin = canRunModerationAction(formData);
  if (!supabaseAdmin) {
    return;
  }

  const bathroomId = getStringValue(formData, "bathroom_id");
  const nextStatus = getStringValue(formData, "status");
  if (!bathroomId || !allowedStatuses.has(nextStatus as ModerationStatus)) {
    return;
  }

  await supabaseAdmin.from("bathrooms").update({ status: nextStatus }).eq("id", bathroomId);
  safeRevalidateOps();
}

export async function moderatePhotoAction(formData: FormData) {
  const supabaseAdmin = canRunModerationAction(formData);
  if (!supabaseAdmin) {
    return;
  }

  const photoId = getStringValue(formData, "photo_id");
  const nextStatus = getStringValue(formData, "status");
  if (!photoId || !allowedStatuses.has(nextStatus as ModerationStatus)) {
    return;
  }

  await supabaseAdmin.from("photos").update({ status: nextStatus }).eq("id", photoId);
  safeRevalidateOps();
}

export async function moderateReviewAction(formData: FormData) {
  const supabaseAdmin = canRunModerationAction(formData);
  if (!supabaseAdmin) {
    return;
  }

  const reviewId = getStringValue(formData, "review_id");
  const nextStatus = getStringValue(formData, "status");
  if (!reviewId || !allowedStatuses.has(nextStatus as ModerationStatus)) {
    return;
  }

  await supabaseAdmin.from("reviews").update({ status: nextStatus }).eq("id", reviewId);
  safeRevalidateOps();
}

export async function markReportReviewedAction(formData: FormData) {
  const supabaseAdmin = canRunModerationAction(formData);
  if (!supabaseAdmin) {
    return;
  }

  const reportId = getStringValue(formData, "report_id");
  const reason = getStringValue(formData, "reason");
  if (!reportId || !reason) {
    return;
  }

  const nextReason = reason.startsWith(REVIEWED_REPORT_PREFIX)
    ? reason
    : `${REVIEWED_REPORT_PREFIX}${reason}`.slice(0, 1900);

  await supabaseAdmin.from("reports").update({ reason: nextReason }).eq("id", reportId);
  safeRevalidateOps();
}
