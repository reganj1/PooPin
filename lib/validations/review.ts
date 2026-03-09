import { z } from "zod";

export const reviewCreateSchema = z.object({
  bathroom_id: z.string().min(1),
  overall_rating: z.number().min(1).max(5),
  smell_rating: z.number().min(1).max(5),
  cleanliness_rating: z.number().min(1).max(5),
  wait_rating: z.number().min(1).max(5),
  privacy_rating: z.number().min(1).max(5),
  review_text: z.string().max(1500)
});

export type ReviewCreateInput = z.infer<typeof reviewCreateSchema>;
