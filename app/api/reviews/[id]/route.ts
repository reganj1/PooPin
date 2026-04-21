import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedProfile } from "@/lib/auth/server";
import { REVIEW_FRESH_DELETE_WINDOW_MINUTES, getFreshReviewDeleteCutoffIso } from "@/lib/reviews/policy";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

interface ReviewRouteContext {
  params: Promise<{
    id: string;
  }>;
}

interface SoftDeletedReviewRow {
  review_id: string;
  bathroom_id: string;
  profile_id: string;
  created_at: string;
}

const getDeleteErrorResponse = (error: { code?: string; message?: string }) => {
  const message = (error.message ?? "").toLowerCase();

  if (error.code === "P0002" || message.includes("review_not_found")) {
    return NextResponse.json({ error: "Review not found." }, { status: 404 });
  }

  if (error.code === "42501" || message.includes("review_not_owned")) {
    return NextResponse.json({ error: "You can only delete your own reviews." }, { status: 403 });
  }

  if (message.includes("review_delete_window_expired")) {
    return NextResponse.json(
      { error: `Fresh reviews can only be deleted for ${REVIEW_FRESH_DELETE_WINDOW_MINUTES} minutes after posting.` },
      { status: 409 }
    );
  }

  if (message.includes("review_not_active")) {
    return NextResponse.json({ error: "This review can no longer be deleted." }, { status: 409 });
  }

  return NextResponse.json({ error: "Could not delete this review right now." }, { status: 500 });
};

export async function DELETE(_request: NextRequest, context: ReviewRouteContext) {
  const authContext = await getAuthenticatedProfile();
  if (!authContext) {
    return NextResponse.json({ error: "Sign in to delete reviews." }, { status: 401 });
  }

  if (!authContext.profile) {
    return NextResponse.json({ error: "Could not load your account right now." }, { status: 503 });
  }

  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Review deletion is temporarily unavailable." }, { status: 503 });
  }

  const { id: reviewId } = await context.params;
  if (!reviewId.trim()) {
    return NextResponse.json({ error: "Review not found." }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin.rpc("soft_delete_fresh_review", {
    p_review_id: reviewId,
    p_profile_id: authContext.profile.id,
    p_delete_after: getFreshReviewDeleteCutoffIso()
  });

  if (error) {
    return getDeleteErrorResponse(error);
  }

  const deletedReview = Array.isArray(data) ? (data[0] as SoftDeletedReviewRow | undefined) : (data as SoftDeletedReviewRow | null);
  if (!deletedReview) {
    return NextResponse.json({ error: "Review not found." }, { status: 404 });
  }

  revalidatePath("/");
  revalidatePath(`/restroom/${deletedReview.bathroom_id}`);
  revalidatePath("/leaderboard");
  revalidatePath("/profile");
  revalidatePath(`/u/${deletedReview.profile_id}`);

  return NextResponse.json({
    success: true,
    reviewId: deletedReview.review_id,
    bathroomId: deletedReview.bathroom_id
  });
}
