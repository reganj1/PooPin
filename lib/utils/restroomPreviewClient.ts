interface RestroomPreviewApiResponse {
  success?: boolean;
  photoUrl?: string | null;
}

interface PreviewCacheEntry {
  photoUrl: string | null;
  cachedAt: number;
}

const PREVIEW_CACHE_TTL_MS = 45 * 60_000;
const EMPTY_PREVIEW_CACHE_TTL_MS = 5 * 60_000;
const previewPhotoCache = new Map<string, PreviewCacheEntry>();
const previewPhotoRequests = new Map<string, Promise<string | null>>();
const warmedPreviewImageUrls = new Set<string>();

const isCacheEntryFresh = (entry: PreviewCacheEntry) => {
  const ttlMs = entry.photoUrl ? PREVIEW_CACHE_TTL_MS : EMPTY_PREVIEW_CACHE_TTL_MS;
  return Date.now() - entry.cachedAt <= ttlMs;
};

const setCachedPreviewPhoto = (restroomId: string, photoUrl: string | null) => {
  previewPhotoCache.set(restroomId, {
    photoUrl,
    cachedAt: Date.now()
  });
};

const warmPreviewImage = (photoUrl: string | null) => {
  if (!photoUrl || typeof window === "undefined" || warmedPreviewImageUrls.has(photoUrl)) {
    return;
  }

  warmedPreviewImageUrls.add(photoUrl);
  const image = new window.Image();
  image.decoding = "async";
  image.src = photoUrl;
};

export const getCachedRestroomPreviewPhoto = (restroomId: string): string | null | undefined => {
  const cachedEntry = previewPhotoCache.get(restroomId);
  if (!cachedEntry) {
    return undefined;
  }

  if (!isCacheEntryFresh(cachedEntry)) {
    previewPhotoCache.delete(restroomId);
    return undefined;
  }

  return cachedEntry.photoUrl;
};

export const fetchRestroomPreviewPhoto = async (restroomId: string): Promise<string | null> => {
  const cachedPhotoUrl = getCachedRestroomPreviewPhoto(restroomId);
  if (cachedPhotoUrl !== undefined) {
    return cachedPhotoUrl;
  }

  const existingRequest = previewPhotoRequests.get(restroomId);
  if (existingRequest) {
    return existingRequest;
  }

  const request = fetch(`/api/restrooms/${encodeURIComponent(restroomId)}/preview`, {
    method: "GET"
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error("Failed to fetch restroom preview photo.");
      }

      const payload = (await response.json()) as RestroomPreviewApiResponse;
      const resolvedPhotoUrl = payload.success ? payload.photoUrl ?? null : null;
      setCachedPreviewPhoto(restroomId, resolvedPhotoUrl);
      warmPreviewImage(resolvedPhotoUrl);
      return resolvedPhotoUrl;
    })
    .catch(() => {
      setCachedPreviewPhoto(restroomId, null);
      return null;
    })
    .finally(() => {
      previewPhotoRequests.delete(restroomId);
    });

  previewPhotoRequests.set(restroomId, request);
  return request;
};

export const prefetchRestroomPreviewPhotos = (restroomIds: string[], limit = 10) => {
  const uniqueIds = Array.from(new Set(restroomIds)).filter((id) => typeof id === "string" && id.length > 0).slice(0, limit);
  for (const restroomId of uniqueIds) {
    const cachedPhotoUrl = getCachedRestroomPreviewPhoto(restroomId);
    if (cachedPhotoUrl !== undefined) {
      warmPreviewImage(cachedPhotoUrl);
      continue;
    }

    void fetchRestroomPreviewPhoto(restroomId);
  }
};
