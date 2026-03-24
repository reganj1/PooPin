import { z } from "zod";

export const reviewCommentBodySchema = z
  .string()
  .trim()
  .min(2, "Write at least a couple words.")
  .max(320, "Comments must stay under 320 characters.");

export const reviewCommentCreateSchema = z.object({
  body: reviewCommentBodySchema
});

export type ReviewCommentCreateInput = z.infer<typeof reviewCommentCreateSchema>;
