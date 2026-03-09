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

const blockedLanguagePatterns = [
  /\b(fuck|fucking|shit|shitty|bitch|asshole|bastard|motherfucker)\b/i,
  /\b(retard|retarded)\b/i,
  /\b(kill\s+yourself|go\s+die)\b/i
] as const;

const sanitizeTextInput = (value: string) =>
  value
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const hasBlockedLanguage = (value: string) => blockedLanguagePatterns.some((pattern) => pattern.test(value));

const stringField = (
  label: string,
  min: number,
  max: number,
  options?: {
    blockProfanity?: boolean;
    pattern?: RegExp;
    patternMessage?: string;
    transform?: (value: string) => string;
  }
) => {
  const baseSchema = z
    .string({
      required_error: `${label} is required`,
      invalid_type_error: `${label} is required`
    })
    .transform(sanitizeTextInput)
    .refine((value) => value.length >= min, {
      message: `${label} must be at least ${min} characters`
    })
    .refine((value) => value.length <= max, {
      message: `${label} must be at most ${max} characters`
    });

  const withPattern = options?.pattern
    ? baseSchema.refine((value) => options.pattern?.test(value) ?? true, {
        message: options.patternMessage ?? `${label} format is invalid`
      })
    : baseSchema;

  const withProfanityFilter =
    options?.blockProfanity === false
      ? withPattern
      : withPattern.refine((value) => !hasBlockedLanguage(value), {
          message: "Please remove abusive or profane language."
        });

  return options?.transform ? withProfanityFilter.transform(options.transform) : withProfanityFilter;
};

const booleanField = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "n"].includes(normalized)) {
      return false;
    }
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }

  return value;
}, z.boolean());

const latField = z.coerce
  .number({
    required_error: "Latitude is required",
    invalid_type_error: "Latitude must be a valid number"
  })
  .min(-90, "Latitude must be between -90 and 90")
  .max(90, "Latitude must be between -90 and 90");

const lngField = z.coerce
  .number({
    required_error: "Longitude is required",
    invalid_type_error: "Longitude must be a valid number"
  })
  .min(-180, "Longitude must be between -180 and 180")
  .max(180, "Longitude must be between -180 and 180");

export const bathroomCreateSchema = z.object({
  name: stringField("Name", 2, 120),
  place_type: z.enum(bathroomPlaceTypeOptions),
  address: stringField("Address", 3, 200),
  city: stringField("City", 2, 120, {
    blockProfanity: false
  }),
  state: stringField("State", 2, 30, {
    blockProfanity: false,
    pattern: /^[a-zA-Z.\s]{2,30}$/,
    patternMessage: "State must contain only letters",
    transform: (value) => value.toUpperCase()
  }),
  lat: latField,
  lng: lngField,
  access_type: z.enum(bathroomAccessTypeOptions),
  has_baby_station: booleanField,
  is_gender_neutral: booleanField,
  is_accessible: booleanField,
  requires_purchase: booleanField
});

export type BathroomCreateInput = z.infer<typeof bathroomCreateSchema>;
