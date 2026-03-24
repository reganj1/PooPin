type RuntimeFileLike = {
  name?: unknown;
  type?: unknown;
};

const imageExtensionByMimeType: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

const supportedImageExtensions = new Set(["jpg", "jpeg", "png", "webp"]);

export const getRuntimeFileName = (file: RuntimeFileLike | null | undefined) => {
  // Mobile Safari can surface upload blobs without a stable runtime `name`, so
  // filename parsing has to tolerate missing values and fall back safely.
  if (!file || typeof file.name !== "string") {
    return null;
  }

  const normalized = file.name.trim();
  return normalized.length > 0 ? normalized : null;
};

export const getSafeImageFileExtension = (file: RuntimeFileLike | null | undefined) => {
  const mimeType = typeof file?.type === "string" ? file.type : "";
  const mimeExtension = imageExtensionByMimeType[mimeType];
  if (mimeExtension) {
    return mimeExtension;
  }

  const fileName = getRuntimeFileName(file);
  const rawExtension = fileName?.includes(".") ? fileName.split(".").pop()?.toLowerCase() ?? "" : "";
  if (supportedImageExtensions.has(rawExtension)) {
    return rawExtension === "jpeg" ? "jpg" : rawExtension;
  }

  return "jpg";
};

export const getSafeImageUploadFileName = (file: RuntimeFileLike | null | undefined) => {
  return getRuntimeFileName(file) ?? `upload.${getSafeImageFileExtension(file)}`;
};

export const isNonEmptyPath = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
