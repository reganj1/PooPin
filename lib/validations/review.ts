import { z } from "zod";

const ratingFieldSchema = z
  .number({ required_error: "Rating is required", invalid_type_error: "Rating must be a number" })
  .min(1, "Rating must be between 1 and 5")
  .max(5, "Rating must be between 1 and 5");

export const reviewCreateSchema = z.object({
  bathroom_id: z.string().min(1),
  overall_rating: ratingFieldSchema,
  smell_rating: ratingFieldSchema,
  cleanliness_rating: ratingFieldSchema,
  wait_rating: ratingFieldSchema,
  privacy_rating: ratingFieldSchema,
  review_text: z.string().trim().max(1500, "Review must be at most 1500 characters")
});

export type ReviewCreateInput = z.infer<typeof reviewCreateSchema>;

export const reviewFormSchema = reviewCreateSchema.omit({ bathroom_id: true });

export type ReviewFormInput = z.infer<typeof reviewFormSchema>;
