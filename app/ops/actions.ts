"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  clearOpsSessionCookie,
  isOpsSessionAuthenticated,
  setOpsSessionCookie,
  verifyOpsDashboardPassword
} from "@/lib/ops/auth";
import { ModerationStatus } from "@/types";

const REVIEWED_REPORT_PREFIX = "reviewed:v1:";
const allowedStatuses = new Set<ModerationStatus>(["active", "pending", "flagged", "removed"]);
type OpsActionResult = "success" | "error";
type DuplicateWarningDecision = "keep" | "reopen";

const getStringValue = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
};

const getModerationClient = async () => {
  const isAuthenticated = await isOpsSessionAuthenticated();
  if (!isAuthenticated) {
    return {
      client: null,
      error: "Session expired. Sign in again to continue moderating."
    };
  }

  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    return {
      client: null,
      error: "Supabase service role is missing. Ops actions are read-only."
    };
  }

  return {
    client: supabaseAdmin,
    error: null
  };
};

const getModerationClientOrRedirect = async (
  action: string
): Promise<NonNullable<ReturnType<typeof getSupabaseAdminClient>>> => {
  const { client, error } = await getModerationClient();
  if (!client) {
    redirectWithOpsResult(action, "error", error ?? "Could not authenticate moderation action.");
  }

  return client as NonNullable<ReturnType<typeof getSupabaseAdminClient>>;
};

const sanitizeMessage = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 160);

const toReviewedReportReason = (reason: string) =>
  reason.startsWith(REVIEWED_REPORT_PREFIX) ? reason : `${REVIEWED_REPORT_PREFIX}${reason}`.slice(0, 1900);

const toUnreviewedReportReason = (reason: string) =>
  reason.startsWith(REVIEWED_REPORT_PREFIX) ? reason.slice(REVIEWED_REPORT_PREFIX.length) : reason;

const buildOpsRedirectUrl = (action: string, result: OpsActionResult, message: string) => {
  const params = new URLSearchParams({
    ops_action: action,
    ops_result: result,
    ops_message: sanitizeMessage(message)
  });

  return `/ops?${params.toString()}`;
};

const redirectWithOpsResult = (action: string, result: OpsActionResult, message: string): never => {
  redirect(buildOpsRedirectUrl(action, result, message));
};

const revalidateAfterModeration = (bathroomId?: string | null) => {
  revalidatePath("/ops");
  revalidatePath("/");
  if (bathroomId) {
    revalidatePath(`/restroom/${bathroomId}`);
  }
};

export async function loginOpsAction(formData: FormData) {
  const password = getStringValue(formData, "password");
  if (!verifyOpsDashboardPassword(password)) {
    redirect("/ops?auth=invalid");
  }

  const sessionSet = await setOpsSessionCookie();
  if (!sessionSet) {
    redirect("/ops?auth=unconfigured");
  }

  redirect("/ops");
}

export async function logoutOpsAction() {
  await clearOpsSessionCookie();
  redirect("/ops");
}

export async function moderateBathroomAction(formData: FormData) {
  const supabaseAdmin = await getModerationClientOrRedirect("moderate_bathroom");

  const bathroomId = getStringValue(formData, "bathroom_id");
  const nextStatus = getStringValue(formData, "status");
  if (!bathroomId || !allowedStatuses.has(nextStatus as ModerationStatus)) {
    redirectWithOpsResult("moderate_bathroom", "error", "Invalid restroom moderation payload.");
  }

  const { data, error } = await supabaseAdmin
    .from("bathrooms")
    .update({ status: nextStatus })
    .eq("id", bathroomId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirectWithOpsResult("moderate_bathroom", "error", error?.message ?? "Restroom moderation update failed.");
  }

  revalidateAfterModeration(bathroomId);
  redirectWithOpsResult("moderate_bathroom", "success", `Restroom moved to ${nextStatus}.`);
}

export async function moderatePhotoAction(formData: FormData) {
  const supabaseAdmin = await getModerationClientOrRedirect("moderate_photo");

  const photoId = getStringValue(formData, "photo_id");
  const bathroomId = getStringValue(formData, "bathroom_id");
  const nextStatus = getStringValue(formData, "status");
  if (!photoId || !allowedStatuses.has(nextStatus as ModerationStatus)) {
    redirectWithOpsResult("moderate_photo", "error", "Invalid photo moderation payload.");
  }

  const { data, error } = await supabaseAdmin
    .from("photos")
    .update({ status: nextStatus })
    .eq("id", photoId)
    .select("id, bathroom_id")
    .maybeSingle();

  if (error || !data) {
    redirectWithOpsResult("moderate_photo", "error", error?.message ?? "Photo moderation update failed.");
  }

  revalidateAfterModeration(bathroomId || data?.bathroom_id || null);
  redirectWithOpsResult("moderate_photo", "success", `Photo moved to ${nextStatus}.`);
}

export async function moderateReviewAction(formData: FormData) {
  const supabaseAdmin = await getModerationClientOrRedirect("moderate_review");

  const reviewId = getStringValue(formData, "review_id");
  const bathroomId = getStringValue(formData, "bathroom_id");
  const nextStatus = getStringValue(formData, "status");
  if (!reviewId || !allowedStatuses.has(nextStatus as ModerationStatus)) {
    redirectWithOpsResult("moderate_review", "error", "Invalid review moderation payload.");
  }

  const { data, error } = await supabaseAdmin
    .from("reviews")
    .update({ status: nextStatus })
    .eq("id", reviewId)
    .select("id, bathroom_id")
    .maybeSingle();

  if (error || !data) {
    redirectWithOpsResult("moderate_review", "error", error?.message ?? "Review moderation update failed.");
  }

  revalidateAfterModeration(bathroomId || data?.bathroom_id || null);
  redirectWithOpsResult("moderate_review", "success", `Review moved to ${nextStatus}.`);
}

export async function markReportReviewedAction(formData: FormData) {
  const supabaseAdmin = await getModerationClientOrRedirect("review_report");

  const reportId = getStringValue(formData, "report_id");
  const reason = getStringValue(formData, "reason");
  if (!reportId || !reason) {
    redirectWithOpsResult("review_report", "error", "Invalid report moderation payload.");
  }

  const nextReason = toReviewedReportReason(reason);

  const { data, error } = await supabaseAdmin
    .from("reports")
    .update({ reason: nextReason })
    .eq("id", reportId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirectWithOpsResult("review_report", "error", error?.message ?? "Could not mark report as reviewed.");
  }

  revalidateAfterModeration(null);
  redirectWithOpsResult("review_report", "success", "Report marked reviewed.");
}

export async function moderateDuplicateWarningAction(formData: FormData) {
  const supabaseAdmin = await getModerationClientOrRedirect("moderate_duplicate_warning");

  const reportId = getStringValue(formData, "report_id");
  const reason = getStringValue(formData, "reason");
  const bathroomId = getStringValue(formData, "bathroom_id");
  const decision = getStringValue(formData, "decision") as DuplicateWarningDecision;

  if (!reportId || !reason || !bathroomId || (decision !== "keep" && decision !== "reopen")) {
    redirectWithOpsResult("moderate_duplicate_warning", "error", "Invalid duplicate moderation payload.");
  }

  const nextReason = decision === "keep" ? toReviewedReportReason(reason) : toUnreviewedReportReason(reason);
  const successMessage =
    decision === "keep" ? "Duplicate warning marked as not a duplicate." : "Duplicate warning reopened.";

  const { data, error } = await supabaseAdmin
    .from("reports")
    .update({ reason: nextReason })
    .eq("id", reportId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirectWithOpsResult("moderate_duplicate_warning", "error", error?.message ?? "Could not update duplicate warning.");
  }

  revalidateAfterModeration(bathroomId);
  redirectWithOpsResult("moderate_duplicate_warning", "success", successMessage);
}

export async function removeDuplicateListingAction(formData: FormData) {
  const supabaseAdmin = await getModerationClientOrRedirect("remove_duplicate_listing");

  const reportId = getStringValue(formData, "report_id");
  const reason = getStringValue(formData, "reason");
  const bathroomId = getStringValue(formData, "bathroom_id");

  if (!reportId || !reason || !bathroomId) {
    redirectWithOpsResult("remove_duplicate_listing", "error", "Invalid duplicate removal payload.");
  }

  const bathroomUpdate = await supabaseAdmin
    .from("bathrooms")
    .update({ status: "removed" })
    .eq("id", bathroomId)
    .select("id")
    .maybeSingle();

  if (bathroomUpdate.error || !bathroomUpdate.data) {
    redirectWithOpsResult(
      "remove_duplicate_listing",
      "error",
      bathroomUpdate.error?.message ?? "Could not remove listing for duplicate warning."
    );
  }

  const reviewedReason = toReviewedReportReason(reason);
  const reportUpdate = await supabaseAdmin
    .from("reports")
    .update({ reason: reviewedReason })
    .eq("id", reportId)
    .select("id")
    .maybeSingle();

  revalidateAfterModeration(bathroomId);

  if (reportUpdate.error || !reportUpdate.data) {
    redirectWithOpsResult(
      "remove_duplicate_listing",
      "error",
      "Listing removed, but warning state could not be updated. Please retry."
    );
  }

  redirectWithOpsResult("remove_duplicate_listing", "success", "Listing removed and duplicate warning resolved.");
}
