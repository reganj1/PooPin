import { z } from "zod";
import { Photo } from "@/types";

export const photoUploadAcceptedMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const photoUploadAcceptAttribute = photoUploadAcceptedMimeTypes.join(",");
export const photoUploadMaxBytes = 5 * 1024 * 1024;
export const photoUploadMinWidth = 320;
export const photoUploadMinHeight = 240;
export const photoUploadMaxAspectRatio = 4;

export type PhotoModerationState = "pending" | "approved" | "rejected";

const rejectedFilenamePattern =
  /\b(nsfw|porn|xxx|nude|gore|violence|weapon|drug|meme|selfie|screenshot|receipt|invoice)\b/i;

const moderationInputSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive()
});

export interface PhotoModerationDecision {
  state: PhotoModerationState;
  message: string;
}

const moderationStateToStatusMap: Record<PhotoModerationState, Photo["status"]> = {
  pending: "pending",
  approved: "active",
  rejected: "removed"
};

const statusToModerationStateMap: Record<Photo["status"], PhotoModerationState> = {
  pending: "pending",
  active: "approved",
  flagged: "rejected",
  removed: "rejected"
};

export const toPhotoDbStatus = (state: PhotoModerationState): Photo["status"] => moderationStateToStatusMap[state];

export const toPhotoModerationState = (status: Photo["status"]): PhotoModerationState => statusToModerationStateMap[status];

const validatePhotoBasicAttributes = (mimeType: string, sizeBytes: number): string | null => {
  if (!photoUploadAcceptedMimeTypes.includes(mimeType as (typeof photoUploadAcceptedMimeTypes)[number])) {
    return "Use a JPG, PNG, or WEBP image.";
  }

  if (sizeBytes > photoUploadMaxBytes) {
    return "Photo must be 5MB or smaller.";
  }

  return null;
};

export const validatePhotoFileBasics = (file: File): string | null => {
  return validatePhotoBasicAttributes(file.type, file.size);
};

export const moderatePhotoForUpload = (rawInput: unknown): PhotoModerationDecision => {
  const parsed = moderationInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      state: "rejected",
      message: "Could not validate this image."
    };
  }

  const input = parsed.data;
  const basicValidationMessage = validatePhotoBasicAttributes(input.mimeType, input.sizeBytes);

  if (basicValidationMessage) {
    return {
      state: "rejected",
      message: basicValidationMessage
    };
  }

  if (input.width < photoUploadMinWidth || input.height < photoUploadMinHeight) {
    return {
      state: "rejected",
      message: "Photo resolution is too low. Please upload a clearer image."
    };
  }

  const aspectRatio = input.width / input.height;
  if (aspectRatio > photoUploadMaxAspectRatio || aspectRatio < 1 / photoUploadMaxAspectRatio) {
    return {
      state: "rejected",
      message: "Photo framing looks off-topic. Please upload a standard restroom photo."
    };
  }

  if (rejectedFilenamePattern.test(input.fileName.toLowerCase())) {
    return {
      state: "rejected",
      message: "This upload was blocked by safety checks."
    };
  }

  return {
    state: "pending",
    message: "Upload received and sent for review."
  };
};
