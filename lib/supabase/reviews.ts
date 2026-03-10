import { SupabaseClient } from "@supabase/supabase-js";
import { Review } from "@/types";
import { ReviewCreateInput } from "@/lib/validations/review";

type ReviewInsertRow = Pick<
  Review,
  | "id"
  | "bathroom_id"
  | "user_id"
  | "overall_rating"
  | "smell_rating"
  | "cleanliness_rating"
  | "wait_rating"
  | "privacy_rating"
  | "review_text"
  | "quick_tags"
  | "visit_time"
  | "status"
>;

export interface InsertReviewResult {
  reviewId: string;
}

const toInsertPayload = (input: ReviewCreateInput, reviewId: string): ReviewInsertRow => {
  return {
    id: reviewId,
    bathroom_id: input.bathroom_id,
    user_id: null,
    overall_rating: input.overall_rating,
    smell_rating: input.smell_rating,
    cleanliness_rating: input.cleanliness_rating,
    wait_rating: input.wait_rating,
    privacy_rating: input.privacy_rating,
    review_text: input.review_text,
    quick_tags: input.quick_tags ?? [],
    visit_time: new Date().toISOString(),
    status: "active"
  };
};

export const insertReview = async (
  supabaseClient: SupabaseClient,
  input: ReviewCreateInput
): Promise<InsertReviewResult> => {
  const reviewId = crypto.randomUUID();
  const payload = toInsertPayload(input, reviewId);

  const { error } = await supabaseClient.from("reviews").insert(payload);

  if (error) {
    throw new Error(error.message);
  }

  return { reviewId };
};

export const toAddReviewErrorMessage = (error: unknown): string => {
  const fallback = "Could not submit review right now. Please try again.";

  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = error.message.toLowerCase();

  if (message.includes("row-level security") || message.includes("permission denied")) {
    return "Supabase rejected the review insert. Check RLS/policies for anon insert on reviews.";
  }

  if (message.includes("failed to fetch") || message.includes("network")) {
    return "Could not reach Supabase. Check your URL/key and network, then retry.";
  }

  if (message.includes("foreign key")) {
    return "Could not attach review to this restroom. Verify restroom_id and database constraints.";
  }

  if (message.includes("quick_tags") && message.includes("column")) {
    return "Review tags are not available yet. Run the latest Supabase migrations and retry.";
  }

  return error.message || fallback;
};
