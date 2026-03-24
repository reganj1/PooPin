import { SupabaseClient } from "@supabase/supabase-js";
import { ReviewComment } from "@/types";
import { ReviewCommentCreateInput } from "@/lib/validations/reviewEngagement";

type ReviewLikeInsertRow = {
  review_id: string;
  profile_id: string;
};

type ReviewCommentInsertRow = {
  id: string;
  review_id: string;
  profile_id: string;
  body: string;
  status: ReviewComment["status"];
};

export const likeReview = async (supabaseClient: SupabaseClient, reviewId: string, profileId: string) => {
  const payload: ReviewLikeInsertRow = {
    review_id: reviewId,
    profile_id: profileId
  };

  const { error } = await supabaseClient.from("review_likes").insert(payload);
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("duplicate") || message.includes("unique")) {
      return;
    }

    throw new Error(error.message);
  }
};

export const unlikeReview = async (supabaseClient: SupabaseClient, reviewId: string, profileId: string) => {
  const { error } = await supabaseClient.from("review_likes").delete().eq("review_id", reviewId).eq("profile_id", profileId);
  if (error) {
    throw new Error(error.message);
  }
};

export const insertReviewComment = async (
  supabaseClient: SupabaseClient,
  reviewId: string,
  profileId: string,
  input: ReviewCommentCreateInput
): Promise<ReviewComment> => {
  const commentId = crypto.randomUUID();
  const payload: ReviewCommentInsertRow = {
    id: commentId,
    review_id: reviewId,
    profile_id: profileId,
    body: input.body.trim(),
    status: "active"
  };

  const { data, error } = await supabaseClient
    .from("review_comments")
    .insert(payload)
    .select("id, review_id, profile_id, body, created_at, updated_at, status")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Could not load the comment after saving.");
  }

  return {
    id: data.id,
    review_id: data.review_id,
    profile_id: data.profile_id,
    author_display_name: null,
    body: data.body,
    created_at: data.created_at,
    updated_at: data.updated_at,
    status: data.status
  };
};
