import { z } from "zod";

export const bathroomCreateSchema = z.object({
  name: z.string().min(2).max(120),
  place_type: z.enum([
    "park",
    "restaurant",
    "cafe",
    "mall",
    "transit_station",
    "library",
    "gym",
    "office",
    "other"
  ]),
  address: z.string().min(3).max(200),
  city: z.string().min(2).max(120),
  state: z.string().min(2).max(50),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  access_type: z.enum(["public", "customer_only", "code_required", "staff_assisted"]),
  has_baby_station: z.boolean(),
  is_gender_neutral: z.boolean(),
  is_accessible: z.boolean(),
  requires_purchase: z.boolean()
});

export type BathroomCreateInput = z.infer<typeof bathroomCreateSchema>;
