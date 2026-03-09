import { z } from "zod";

export const bathroomPlaceTypeOptions = [
  "park",
  "restaurant",
  "cafe",
  "mall",
  "transit_station",
  "library",
  "gym",
  "office",
  "other"
] as const;

export const bathroomAccessTypeOptions = ["public", "customer_only", "code_required", "staff_assisted"] as const;

export const bathroomCreateSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  place_type: z.enum(bathroomPlaceTypeOptions),
  address: z.string().trim().min(3, "Address must be at least 3 characters").max(200),
  city: z.string().trim().min(2, "City is required").max(120),
  state: z.string().trim().min(2, "State is required").max(50),
  lat: z
    .number({ required_error: "Latitude is required", invalid_type_error: "Latitude must be a valid number" })
    .min(-90, "Latitude must be between -90 and 90")
    .max(90, "Latitude must be between -90 and 90"),
  lng: z
    .number({ required_error: "Longitude is required", invalid_type_error: "Longitude must be a valid number" })
    .min(-180, "Longitude must be between -180 and 180")
    .max(180, "Longitude must be between -180 and 180"),
  access_type: z.enum(bathroomAccessTypeOptions),
  has_baby_station: z.boolean(),
  is_gender_neutral: z.boolean(),
  is_accessible: z.boolean(),
  requires_purchase: z.boolean()
});

export type BathroomCreateInput = z.infer<typeof bathroomCreateSchema>;
