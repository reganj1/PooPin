import { z } from "zod";
import { ReviewQuickTag } from "@/types";
import { mapQuickTagsToDetailedRatings, normalizeReviewQuickTags, reviewQuickTagValues } from "@/lib/utils/reviewSignals";

const ratingFieldSchema = z
  .number({ required_error: "Rating is required", invalid_type_error: "Rating must be a number" })
  .min(1, "Rating must be between 1 and 5")
  .max(5, "Rating must be between 1 and 5");

const blockedLanguagePatterns = [
  /\b(fuck|fucking|shit|shitty|bitch|asshole|bastard|motherfucker)\b/i,
  /\b(retard|retarded)\b/i,
  /\b(kill\s+yourself|go\s+die)\b/i
] as const;

const lowValuePhrases = new Set(["good", "bad", "ok", "okay", "fine", "nice", "clean", "dirty", "n/a", "na", "none"]);
const MAX_QUICK_TAGS = 2;

const normalizeReviewText = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

const containsBlockedLanguage = (value: string) => blockedLanguagePatterns.some((pattern) => pattern.test(value));

const isLowValueReviewText = (value: string) => {
  const normalized = normalizeReviewText(value);
  if (normalized.length === 0) {
    return false;
  }

  if (lowValuePhrases.has(normalized)) {
    return true;
  }

  const compact = normalized.replace(/\s/g, "");
  if (compact.length > 0 && /^([a-z0-9])\1{4,}$/i.test(compact)) {
    return true;
  }

  return normalized.length < 8 || normalized.split(" ").length < 2;
};

const reviewTextSchema = z
  .string()
  .trim()
  .max(1500, "Review must be at most 1500 characters")
  .refine((value) => !containsBlockedLanguage(value), {
    message: "Please remove abusive or profane language."
  })
  .refine((value) => value.length === 0 || !isLowValueReviewText(value), {
    message: "Add a little more detail or leave notes blank."
  });

const quickTagSchema = z.enum(reviewQuickTagValues);

const quickTagsSchema = z
  .array(quickTagSchema)
  .max(MAX_QUICK_TAGS, `Pick up to ${MAX_QUICK_TAGS} tags`)
  .default([])
  .transform((value) => normalizeReviewQuickTags(value));

export const reviewCreateSchema = z.object({
  bathroom_id: z.string().min(1),
  overall_rating: ratingFieldSchema,
  smell_rating: ratingFieldSchema,
  cleanliness_rating: ratingFieldSchema,
  wait_rating: ratingFieldSchema,
  privacy_rating: ratingFieldSchema,
  review_text: reviewTextSchema,
  quick_tags: quickTagsSchema.optional().default([])
});

export type ReviewCreateInput = z.infer<typeof reviewCreateSchema>;

export const reviewFormSchema = z.object({
  overall_rating: z
    .number({ required_error: "Select an overall rating", invalid_type_error: "Select an overall rating" })
    .min(1, "Select an overall rating")
    .max(5, "Select an overall rating"),
  quick_tags: quickTagsSchema,
  review_text: reviewTextSchema
});

export type ReviewFormInput = z.infer<typeof reviewFormSchema>;

export const mapReviewFormToCreateInput = (bathroomId: string, input: ReviewFormInput): ReviewCreateInput => {
  const quickTags = normalizeReviewQuickTags(input.quick_tags).slice(0, MAX_QUICK_TAGS) as ReviewQuickTag[];
  const detailRatings = mapQuickTagsToDetailedRatings(quickTags, input.overall_rating);

  return {
    bathroom_id: bathroomId,
    overall_rating: input.overall_rating,
    smell_rating: detailRatings.smell_rating,
    cleanliness_rating: detailRatings.cleanliness_rating,
    wait_rating: detailRatings.wait_rating,
    privacy_rating: detailRatings.privacy_rating,
    review_text: input.review_text,
    quick_tags: quickTags
  };
};
