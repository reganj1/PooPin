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
import { RESTROOM_ISSUE_REASON_PREFIX } from "@/lib/utils/communitySignals";
import { ModerationStatus } from "@/types";

const REVIEWED_REPORT_PREFIX = "reviewed:v1:";
const allowedStatuses = new Set<ModerationStatus>(["active", "pending", "flagged", "removed"]);
type OpsTab = "reports" | "history" | "restrooms" | "reviews" | "photos";
type OpsActionResult = "success" | "error";
type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

const actionTabByAction: Record<string, OpsTab> = {
  disable_reported_listing: "reports",
  restore_reported_listing: "reports",
  resolve_listing_reports: "reports",
  review_report: "reports",
  moderate_bathroom: "restrooms",
  moderate_photo: "photos",
  moderate_review: "reviews"
};

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

const isOpsTab = (value: string): value is OpsTab => ["reports", "history", "restrooms", "reviews", "photos"].includes(value);

const buildOpsRedirectUrl = (action: string, result: OpsActionResult, message: string, tabOverride?: OpsTab) => {
  const params = new URLSearchParams({
    tab: tabOverride ?? actionTabByAction[action] ?? "reports",
    ops_action: action,
    ops_result: result,
    ops_message: sanitizeMessage(message)
  });

  return `/ops?${params.toString()}`;
};

const redirectWithOpsResult = (action: string, result: OpsActionResult, message: string, tabOverride?: OpsTab): never => {
  redirect(buildOpsRedirectUrl(action, result, message, tabOverride));
};

const getReturnTab = (formData: FormData) => {
  const returnTab = getStringValue(formData, "return_tab");
  return isOpsTab(returnTab) ? returnTab : undefined;
};

const revalidateAfterModeration = (bathroomId?: string | null) => {
  revalidatePath("/ops");
  revalidatePath("/");
  revalidatePath("/leaderboard");
  revalidatePath("/profile");
  revalidatePath("/u/[id]", "page");
  if (bathroomId) {
    revalidatePath(`/restroom/${bathroomId}`);
  }
};

const countOpenListingReports = async (supabaseAdmin: SupabaseAdminClient, bathroomId: string) => {
  const { count, error } = await supabaseAdmin
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("bathroom_id", bathroomId)
    .like("reason", `${RESTROOM_ISSUE_REASON_PREFIX}%`);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
};

const markOpenListingReportsReviewed = async (supabaseAdmin: SupabaseAdminClient, bathroomId: string) => {
  const { data, error } = await supabaseAdmin
    .from("reports")
    .select("id, reason")
    .eq("bathroom_id", bathroomId)
    .like("reason", `${RESTROOM_ISSUE_REASON_PREFIX}%`);

  if (error) {
    throw new Error(error.message);
  }

  const openReports = (data ?? []) as Array<{ id: string; reason: string }>;
  if (openReports.length === 0) {
    return 0;
  }

  const updates = await Promise.all(
    openReports.map((report) =>
      supabaseAdmin
        .from("reports")
        .update({ reason: toReviewedReportReason(report.reason) })
        .eq("id", report.id)
        .select("id")
        .maybeSingle()
    )
  );
  const failedUpdate = updates.find((update) => update.error || !update.data);
  if (failedUpdate) {
    throw new Error(failedUpdate.error?.message ?? "Could not resolve all listing reports.");
  }

  return openReports.length;
};

const resolveOpenListingReportsForBathroom = async (supabaseAdmin: SupabaseAdminClient, bathroomId: string) => {
  const resolvedCount = await markOpenListingReportsReviewed(supabaseAdmin, bathroomId);
  const remainingCount = await countOpenListingReports(supabaseAdmin, bathroomId);

  return {
    resolvedCount,
    remainingCount
  };
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

export async function resolveListingReportsForBathroomAction(formData: FormData) {
  const supabaseAdmin = await getModerationClientOrRedirect("resolve_listing_reports");

  const bathroomId = getStringValue(formData, "bathroom_id");
  if (!bathroomId) {
    redirectWithOpsResult("resolve_listing_reports", "error", "Invalid listing report payload.");
  }

  let resolvedCount = 0;
  let remainingCount = 0;

  try {
    const result = await resolveOpenListingReportsForBathroom(supabaseAdmin, bathroomId);
    resolvedCount = result.resolvedCount;
    remainingCount = result.remainingCount;
  } catch {
    let verifiedRemainingCount: number | null = null;
    try {
      verifiedRemainingCount = await countOpenListingReports(supabaseAdmin, bathroomId);
    } catch {
      verifiedRemainingCount = null;
    }

    revalidateAfterModeration(bathroomId);

    if (verifiedRemainingCount === 0) {
      redirectWithOpsResult("resolve_listing_reports", "success", "Listing reports resolved.");
    }

    redirectWithOpsResult(
      "resolve_listing_reports",
      "error",
      verifiedRemainingCount === null
        ? "Could not verify listing report resolution. Refresh and check the case."
        : `${verifiedRemainingCount} listing report${verifiedRemainingCount === 1 ? "" : "s"} remain unresolved.`
    );
  }

  revalidateAfterModeration(bathroomId);
  if (remainingCount > 0) {
    redirectWithOpsResult(
      "resolve_listing_reports",
      "error",
      `${remainingCount} listing report${remainingCount === 1 ? "" : "s"} remain unresolved.`
    );
  }

  redirectWithOpsResult(
    "resolve_listing_reports",
    "success",
    resolvedCount > 0 ? `${resolvedCount} listing report${resolvedCount === 1 ? "" : "s"} resolved.` : "No open listing reports found."
  );
}

export async function disableReportedListingAction(formData: FormData) {
  const supabaseAdmin = await getModerationClientOrRedirect("disable_reported_listing");

  const bathroomId = getStringValue(formData, "bathroom_id");
  const returnTab = getReturnTab(formData);
  if (!bathroomId) {
    redirectWithOpsResult("disable_reported_listing", "error", "Invalid listing disable payload.", returnTab);
  }

  const bathroomUpdate = await supabaseAdmin
    .from("bathrooms")
    .update({ status: "removed" })
    .eq("id", bathroomId)
    .select("id")
    .maybeSingle();

  if (bathroomUpdate.error || !bathroomUpdate.data) {
    redirectWithOpsResult(
      "disable_reported_listing",
      "error",
      bathroomUpdate.error?.message ?? "Could not disable listing.",
      returnTab
    );
  }

  let resolvedCount = 0;
  let remainingCount = 0;

  try {
    const result = await resolveOpenListingReportsForBathroom(supabaseAdmin, bathroomId);
    resolvedCount = result.resolvedCount;
    remainingCount = result.remainingCount;
  } catch {
    let verifiedRemainingCount: number | null = null;
    try {
      verifiedRemainingCount = await countOpenListingReports(supabaseAdmin, bathroomId);
    } catch {
      verifiedRemainingCount = null;
    }

    revalidateAfterModeration(bathroomId);

    if (verifiedRemainingCount === 0) {
      redirectWithOpsResult("disable_reported_listing", "success", "Listing disabled and reports resolved.", returnTab);
    }

    redirectWithOpsResult(
      "disable_reported_listing",
      "error",
      verifiedRemainingCount === null
        ? "Listing disabled, but report resolution could not be verified. Refresh and check the case."
        : `Listing disabled, but ${verifiedRemainingCount} report${verifiedRemainingCount === 1 ? "" : "s"} remain unresolved.`,
      returnTab
    );
  }

  revalidateAfterModeration(bathroomId);
  if (remainingCount > 0) {
    redirectWithOpsResult(
      "disable_reported_listing",
      "error",
      `Listing disabled, but ${remainingCount} report${remainingCount === 1 ? "" : "s"} remain unresolved.`,
      returnTab
    );
  }

  redirectWithOpsResult(
    "disable_reported_listing",
    "success",
    resolvedCount > 0
      ? `Listing disabled and ${resolvedCount} report${resolvedCount === 1 ? "" : "s"} resolved.`
      : "Listing disabled.",
    returnTab
  );
}

export async function restoreReportedListingAction(formData: FormData) {
  const supabaseAdmin = await getModerationClientOrRedirect("restore_reported_listing");

  const bathroomId = getStringValue(formData, "bathroom_id");
  const returnTab = getReturnTab(formData);
  if (!bathroomId) {
    redirectWithOpsResult("restore_reported_listing", "error", "Invalid listing restore payload.", returnTab);
  }

  const { data, error } = await supabaseAdmin
    .from("bathrooms")
    .update({ status: "active" })
    .eq("id", bathroomId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirectWithOpsResult("restore_reported_listing", "error", error?.message ?? "Could not restore listing.", returnTab);
  }

  revalidateAfterModeration(bathroomId);
  redirectWithOpsResult("restore_reported_listing", "success", "Listing restored.", returnTab);
}
