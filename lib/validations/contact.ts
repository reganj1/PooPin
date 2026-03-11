import { z } from "zod";

export const contactTopicOptions = [
  "general_feedback",
  "incorrect_restroom_info",
  "photo_or_content_issue",
  "business_or_partnership",
  "press_or_media",
  "other"
] as const;

const blockedLanguagePatterns = [
  /\b(fuck|fucking|shit|shitty|bitch|asshole|bastard|motherfucker)\b/i,
  /\b(retard|retarded)\b/i,
  /\b(kill\s+yourself|go\s+die)\b/i
] as const;

const sanitizeText = (value: string) =>
  value
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const hasBlockedLanguage = (value: string) => blockedLanguagePatterns.some((pattern) => pattern.test(value));

const requiredTextField = (label: string, min: number, max: number) =>
  z
    .string({
      required_error: `${label} is required`,
      invalid_type_error: `${label} is required`
    })
    .transform(sanitizeText)
    .refine((value) => value.length >= min, {
      message: `${label} must be at least ${min} characters`
    })
    .refine((value) => value.length <= max, {
      message: `${label} must be at most ${max} characters`
    })
    .refine((value) => !hasBlockedLanguage(value), {
      message: "Please remove abusive or profane language."
    });

const optionalTextField = (label: string, max: number) =>
  z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return undefined;
      }

      const sanitized = sanitizeText(value);
      return sanitized.length > 0 ? sanitized : undefined;
    },
    z
      .string()
      .max(max, `${label} must be at most ${max} characters`)
      .refine((value) => !hasBlockedLanguage(value), {
        message: "Please remove abusive or profane language."
      })
      .optional()
  );

export const contactSubmissionSchema = z.object({
  name: requiredTextField("Name", 2, 80),
  email: z.preprocess(
    (value) => (typeof value === "string" ? sanitizeText(value).toLowerCase() : value),
    z
      .string({
        required_error: "Email is required",
        invalid_type_error: "Email is required"
      })
      .email("Enter a valid email address")
      .max(254, "Email must be at most 254 characters")
  ),
  topic: z.enum(contactTopicOptions, {
    required_error: "Please select a topic",
    invalid_type_error: "Please select a topic"
  }),
  message: requiredTextField("Message", 10, 2000).refine((value) => /[a-z0-9]/i.test(value), {
    message: "Please share a short message."
  }),
  restroomReference: optionalTextField("Restroom link or listing ID", 200),
  cityLocation: optionalTextField("City or location", 120)
});

export type ContactSubmissionInput = z.infer<typeof contactSubmissionSchema>;
