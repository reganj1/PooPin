import { SupabaseClient } from "@supabase/supabase-js";
import { Photo } from "@/types";
import { PhotoModerationState, toPhotoDbStatus } from "@/lib/validations/photo";
import { getSafeImageFileExtension } from "@/lib/utils/files";

export const SUPABASE_PHOTOS_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_PHOTOS_BUCKET ?? "restroom-photos";

type PhotoInsertRow = Pick<Photo, "id" | "bathroom_id" | "profile_id" | "storage_path" | "status"> & {
  user_id?: string | null;
};

export interface UploadBathroomPhotoInput {
  bathroomId: string;
  file: File;
  moderationState: Exclude<PhotoModerationState, "approved">;
  profileId?: string | null;
}

export interface UploadBathroomPhotoResult {
  photoId: string;
  storagePath: string;
  moderationState: Exclude<PhotoModerationState, "approved">;
}

const toStoragePath = (bathroomId: string, photoId: string, extension: string) => `${bathroomId}/${photoId}.${extension}`;

const toInsertPayload = (
  input: UploadBathroomPhotoInput,
  photoId: string,
  storagePath: string
): PhotoInsertRow => {
  return {
    id: photoId,
    bathroom_id: input.bathroomId,
    profile_id: input.profileId ?? null,
    user_id: input.profileId ?? null,
    storage_path: storagePath,
    status: toPhotoDbStatus(input.moderationState)
  };
};

export const uploadBathroomPhoto = async (
  supabaseClient: SupabaseClient,
  input: UploadBathroomPhotoInput
): Promise<UploadBathroomPhotoResult> => {
  const photoId = crypto.randomUUID();
  const extension = getSafeImageFileExtension(input.file);
  const storagePath = toStoragePath(input.bathroomId, photoId, extension);

  const { error: uploadError } = await supabaseClient.storage.from(SUPABASE_PHOTOS_BUCKET).upload(storagePath, input.file, {
    cacheControl: "3600",
    upsert: false,
    contentType: input.file.type
  });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const payload = toInsertPayload(input, photoId, storagePath);
  const { error: insertError } = await supabaseClient.from("photos").insert(payload);

  if (insertError) {
    await supabaseClient.storage.from(SUPABASE_PHOTOS_BUCKET).remove([storagePath]);
    throw new Error(insertError.message);
  }

  return {
    photoId,
    storagePath,
    moderationState: input.moderationState
  };
};

export const toUploadPhotoErrorMessage = (error: unknown): string => {
  const fallback = "Could not upload photo right now. Please try again.";

  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = error.message.toLowerCase();

  if (message.includes("row-level security") || message.includes("permission denied")) {
    return "Photo upload is currently unavailable. Check Supabase storage/table policies.";
  }

  if (message.includes("bucket") && message.includes("not found")) {
    return "Photo storage bucket is missing. Create the restroom-photos bucket in Supabase.";
  }

  if (message.includes("payload too large") || message.includes("size")) {
    return "Photo is too large. Please upload an image under 5MB.";
  }

  if (message.includes("failed to fetch") || message.includes("network")) {
    return "Network error while uploading photo. Check connection and retry.";
  }

  return error.message || fallback;
};
