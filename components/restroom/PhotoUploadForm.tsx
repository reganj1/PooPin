"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { captureAnalyticsEvent } from "@/lib/analytics/posthog";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { uploadBathroomPhoto, toUploadPhotoErrorMessage } from "@/lib/supabase/photos";
import {
  moderatePhotoForUpload,
  photoUploadAcceptAttribute,
  photoUploadMaxBytes,
  validatePhotoFileBasics
} from "@/lib/validations/photo";

interface PhotoUploadFormProps {
  bathroomId: string;
}

const SESSION_UPLOAD_LIMIT_PER_RESTROOM = 3;
const getSessionLimitKey = (bathroomId: string) => `poopin:photo-uploads:${bathroomId}`;

const readSessionUploadCount = (bathroomId: string) => {
  if (typeof window === "undefined") {
    return 0;
  }

  const storedCount = window.sessionStorage.getItem(getSessionLimitKey(bathroomId));
  const parsedCount = storedCount ? Number.parseInt(storedCount, 10) : 0;
  return Number.isFinite(parsedCount) ? parsedCount : 0;
};

const incrementSessionUploadCount = (bathroomId: string) => {
  if (typeof window === "undefined") {
    return;
  }

  const nextCount = readSessionUploadCount(bathroomId) + 1;
  window.sessionStorage.setItem(getSessionLimitKey(bathroomId), nextCount.toString());
};

const getImageDimensions = (file: File): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight
      });
      URL.revokeObjectURL(objectUrl);
    };

    image.onerror = () => {
      reject(new Error("Could not read image dimensions."));
      URL.revokeObjectURL(objectUrl);
    };

    image.src = objectUrl;
  });

export function PhotoUploadForm({ bathroomId }: PhotoUploadFormProps) {
  const router = useRouter();
  const supabaseClient = useMemo(() => getSupabaseBrowserClient(), []);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSubmitError(null);
    setSubmitSuccess(null);

    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setSelectedFile(null);
      return;
    }

    const validationMessage = validatePhotoFileBasics(file);
    if (validationMessage) {
      setSelectedFile(null);
      setSubmitError(validationMessage);
      return;
    }

    setSelectedFile(file);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!supabaseClient) {
      setSubmitError("Photo upload is unavailable until Supabase is configured.");
      return;
    }

    if (!selectedFile) {
      setSubmitError("Select a photo to upload.");
      return;
    }

    if (readSessionUploadCount(bathroomId) >= SESSION_UPLOAD_LIMIT_PER_RESTROOM) {
      setSubmitError("Upload limit reached for this session. Try again later.");
      return;
    }

    setIsSubmitting(true);

    try {
      const dimensions = await getImageDimensions(selectedFile);
      const moderation = moderatePhotoForUpload({
        fileName: selectedFile.name,
        mimeType: selectedFile.type,
        sizeBytes: selectedFile.size,
        width: dimensions.width,
        height: dimensions.height
      });

      if (moderation.state === "rejected") {
        setSubmitError(moderation.message);
        return;
      }

      const result = await uploadBathroomPhoto(supabaseClient, {
        bathroomId,
        file: selectedFile,
        moderationState: "pending"
      });

      console.groupCollapsed("[Poopin] restroom photo upload payload (supabase)");
      console.log("bathroomId:", bathroomId);
      console.log("file:", {
        name: selectedFile.name,
        type: selectedFile.type,
        size: selectedFile.size,
        dimensions
      });
      console.log("moderation:", moderation);
      console.log("insert result:", result);
      console.groupEnd();

      captureAnalyticsEvent("photo_uploaded", {
        bathroom_id: bathroomId,
        moderation_state: "pending"
      });

      incrementSessionUploadCount(bathroomId);
      setSubmitSuccess("Photo uploaded and submitted for review. It will appear after approval.");
      setSelectedFile(null);
      router.refresh();
    } catch (error) {
      setSubmitError(toUploadPhotoErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto"
        >
          Upload photo
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
          <p className="text-xs font-medium text-slate-600">Photos are reviewed before appearing publicly.</p>

          <div className="mt-2.5 space-y-2">
            <input
              type="file"
              accept={photoUploadAcceptAttribute}
              onChange={handleFileChange}
              className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-50"
            />
            <p className="text-[11px] text-slate-500">JPG, PNG, or WEBP. Up to {(photoUploadMaxBytes / (1024 * 1024)).toFixed(0)}MB.</p>
          </div>

          {submitError ? <p className="mt-2 text-xs font-medium text-rose-600">{submitError}</p> : null}
          {submitSuccess ? <p className="mt-2 text-xs font-medium text-emerald-700">{submitSuccess}</p> : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Uploading..." : "Submit photo"}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setSubmitError(null);
                setSubmitSuccess(null);
                setSelectedFile(null);
              }}
              className="inline-flex items-center rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
