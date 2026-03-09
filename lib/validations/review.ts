import { z } from "zod";

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

export const reviewCreateSchema = z.object({
  bathroom_id: z.string().min(1),
  overall_rating: ratingFieldSchema,
  smell_rating: ratingFieldSchema,
  cleanliness_rating: ratingFieldSchema,
  wait_rating: ratingFieldSchema,
  privacy_rating: ratingFieldSchema,
  review_text: reviewTextSchema
});

export type ReviewCreateInput = z.infer<typeof reviewCreateSchema>;

export const reviewDetailChoiceSchema = z.enum(["high", "medium", "low"]);

export type ReviewDetailChoice = z.infer<typeof reviewDetailChoiceSchema>;

export const reviewFormSchema = z.object({
  overall_rating: z
    .number({ required_error: "Select an overall rating", invalid_type_error: "Select an overall rating" })
    .min(1, "Select an overall rating")
    .max(5, "Select an overall rating"),
  smell_choice: reviewDetailChoiceSchema.optional(),
  cleanliness_choice: reviewDetailChoiceSchema.optional(),
  wait_choice: reviewDetailChoiceSchema.optional(),
  privacy_choice: reviewDetailChoiceSchema.optional(),
  review_text: reviewTextSchema
});

export type ReviewFormInput = z.infer<typeof reviewFormSchema>;

const detailChoiceToRating: Record<ReviewDetailChoice, number> = {
  high: 5,
  medium: 3,
  low: 1
};

const toRatingFromChoice = (choice: ReviewDetailChoice | undefined, fallbackRating: number) =>
  choice ? detailChoiceToRating[choice] : fallbackRating;

export const mapReviewFormToCreateInput = (bathroomId: string, input: ReviewFormInput): ReviewCreateInput => {
  return {
    bathroom_id: bathroomId,
    overall_rating: input.overall_rating,
    smell_rating: toRatingFromChoice(input.smell_choice, input.overall_rating),
    cleanliness_rating: toRatingFromChoice(input.cleanliness_choice, input.overall_rating),
    wait_rating: toRatingFromChoice(input.wait_choice, input.overall_rating),
    privacy_rating: toRatingFromChoice(input.privacy_choice, input.overall_rating),
    review_text: input.review_text
  };
};
