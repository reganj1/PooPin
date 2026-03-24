import { getUserProfilesByIds } from "@/lib/auth/userProfiles";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { Review, ReviewComment } from "@/types";

interface ReviewLikeRow {
  review_id: string;
  profile_id: string | null;
}

interface ReviewCommentRow {
  id: string;
  review_id: string;
  profile_id: string | null;
  body: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

const ACTIVE_STATUS = "active";
const allowedCommentStatuses = new Set<ReviewComment["status"]>(["active", "pending", "flagged", "removed"]);

const withDefaultEngagement = (reviews: Review[]): Review[] =>
  reviews.map((review) => ({
    ...review,
    like_count: review.like_count ?? 0,
    viewer_has_liked: review.viewer_has_liked ?? false,
    comment_count: review.comment_count ?? 0,
    featured_comment: review.featured_comment ?? null,
    comments: review.comments ?? []
  }));

const toReviewComment = (row: ReviewCommentRow): ReviewComment | null => {
  if (!allowedCommentStatuses.has(row.status as ReviewComment["status"])) {
    return null;
  }

  if ((row.body ?? "").trim().length === 0) {
    return null;
  }

  return {
    id: row.id,
    review_id: row.review_id,
    profile_id: row.profile_id,
    author_display_name: null,
    body: row.body?.trim() ?? "",
    created_at: row.created_at,
    updated_at: row.updated_at,
    status: row.status as ReviewComment["status"]
  };
};

const attachCommentAuthors = async (comments: ReviewComment[]): Promise<ReviewComment[]> => {
  const profileIds = comments
    .map((comment) => comment.profile_id)
    .filter((profileId): profileId is string => typeof profileId === "string" && profileId.trim().length > 0);

  if (profileIds.length === 0) {
    return comments;
  }

  try {
    const profilesById = await getUserProfilesByIds(profileIds);
    return comments.map((comment) => ({
      ...comment,
      author_display_name: comment.profile_id ? profilesById.get(comment.profile_id)?.display_name ?? null : null
    }));
  } catch (error) {
    console.warn("[Poopin] Could not load review comment author profiles.", error);
    return comments;
  }
};

export const attachReviewEngagement = async (reviews: Review[], viewerProfileId?: string | null): Promise<Review[]> => {
  if (reviews.length === 0) {
    return reviews;
  }

  const reviewIds = [...new Set(reviews.map((review) => review.id))];
  if (reviewIds.length === 0) {
    return withDefaultEngagement(reviews);
  }

  const supabase = getSupabaseAdminClient() ?? getSupabaseServerClient();
  if (!supabase) {
    return withDefaultEngagement(reviews);
  }

  try {
    const [likeResult, commentResult] = await Promise.all([
      supabase.from("review_likes").select("review_id, profile_id").in("review_id", reviewIds),
      supabase
        .from("review_comments")
        .select("id, review_id, profile_id, body, status, created_at, updated_at")
        .in("review_id", reviewIds)
        .eq("status", ACTIVE_STATUS)
        .order("created_at", { ascending: true })
    ]);

    if (likeResult.error || commentResult.error) {
      console.warn("[Poopin] Could not load review engagement.", {
        likeError: likeResult.error?.message,
        commentError: commentResult.error?.message
      });
      return withDefaultEngagement(reviews);
    }

    const likeCountByReviewId = new Map<string, number>();
    const viewerLikedReviewIds = new Set<string>();

    for (const row of (likeResult.data ?? []) as ReviewLikeRow[]) {
      likeCountByReviewId.set(row.review_id, (likeCountByReviewId.get(row.review_id) ?? 0) + 1);
      if (viewerProfileId && row.profile_id === viewerProfileId) {
        viewerLikedReviewIds.add(row.review_id);
      }
    }

    const comments = ((commentResult.data ?? []) as ReviewCommentRow[]).map(toReviewComment).filter((comment): comment is ReviewComment => comment !== null);
    const commentsWithAuthors = await attachCommentAuthors(comments);
    const commentsByReviewId = new Map<string, ReviewComment[]>();

    for (const comment of commentsWithAuthors) {
      const existing = commentsByReviewId.get(comment.review_id);
      if (existing) {
        existing.push(comment);
      } else {
        commentsByReviewId.set(comment.review_id, [comment]);
      }
    }

    return reviews.map((review) => {
      const reviewComments = commentsByReviewId.get(review.id) ?? [];
      return {
        ...review,
        like_count: likeCountByReviewId.get(review.id) ?? 0,
        viewer_has_liked: viewerLikedReviewIds.has(review.id),
        comment_count: reviewComments.length,
        featured_comment: reviewComments[0] ?? null,
        comments: reviewComments
      };
    });
  } catch (error) {
    console.warn("[Poopin] Could not attach review engagement data.", error);
    return withDefaultEngagement(reviews);
  }
};
