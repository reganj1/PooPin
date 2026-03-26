import { getSupabaseServerClient } from "@/lib/supabase/server";
import { SUPABASE_PHOTOS_BUCKET } from "@/lib/supabase/photos";
import { isNonEmptyPath } from "@/lib/utils/files";
import { Photo } from "@/types";

interface PhotoRow {
  bathroom_id?: string;
  id: string;
  storage_path: string;
  created_at: string;
  status: string;
}

export interface ApprovedBathroomPhoto {
  id: string;
  url: string;
  thumbnailUrl: string;
  createdAt: string;
}

const ACTIVE_STATUS: Photo["status"] = "active";
const allowedPhotoStatuses = new Set<Photo["status"]>(["active", "pending", "flagged", "removed"]);
const PREVIEW_PHOTO_TRANSFORM = {
  width: 280,
  height: 168,
  resize: "cover",
  quality: 52
} as const;
const DETAIL_THUMBNAIL_TRANSFORM = {
  width: 720,
  height: 540,
  resize: "cover",
  quality: 68
} as const;

const isPhotoStatus = (value: string): value is Photo["status"] => allowedPhotoStatuses.has(value as Photo["status"]);

const PHOTO_URL_EXPIRATION_SECONDS = 60 * 60;
const PREVIEW_URL_CACHE_TTL_MS = Math.max(PHOTO_URL_EXPIRATION_SECONDS * 1000 - 60_000, 60_000);
const PREVIEW_QUERY_BATHROOM_ID_BATCH_SIZE = 100;
const previewUrlCacheByStoragePath = new Map<string, { url: string | null; cachedAt: number }>();
const previewUrlRequestsByStoragePath = new Map<string, Promise<string | null>>();

const chunkItems = <T,>(items: T[], batchSize: number) => {
  if (items.length === 0) {
    return [] as T[][];
  }

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    chunks.push(items.slice(index, index + batchSize));
  }

  return chunks;
};

const getCachedPreviewUrlForStoragePath = (storagePath: string): string | null | undefined => {
  const cachedEntry = previewUrlCacheByStoragePath.get(storagePath);
  if (!cachedEntry) {
    return undefined;
  }

  if (Date.now() - cachedEntry.cachedAt > PREVIEW_URL_CACHE_TTL_MS) {
    previewUrlCacheByStoragePath.delete(storagePath);
    return undefined;
  }

  return cachedEntry.url;
};

const setCachedPreviewUrlForStoragePath = (storagePath: string, url: string | null) => {
  previewUrlCacheByStoragePath.set(storagePath, {
    url,
    cachedAt: Date.now()
  });
};

const createPhotoUrl = async (
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  storagePath: string,
  transform?: {
    width: number;
    height: number;
    resize: "cover";
    quality: number;
  }
) => {
  if (transform) {
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(SUPABASE_PHOTOS_BUCKET)
      .createSignedUrl(storagePath, PHOTO_URL_EXPIRATION_SECONDS, {
        transform
      });

    if (!signedUrlError && signedUrlData?.signedUrl) {
      return signedUrlData.signedUrl;
    }

    const publicUrl = supabase.storage
      .from(SUPABASE_PHOTOS_BUCKET)
      .getPublicUrl(storagePath, {
        transform
      }).data.publicUrl;
    return publicUrl || null;
  }

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from(SUPABASE_PHOTOS_BUCKET)
    .createSignedUrl(storagePath, PHOTO_URL_EXPIRATION_SECONDS);

  if (!signedUrlError && signedUrlData?.signedUrl) {
    return signedUrlData.signedUrl;
  }

  const publicUrl = supabase.storage.from(SUPABASE_PHOTOS_BUCKET).getPublicUrl(storagePath).data.publicUrl;
  return publicUrl || null;
};

const resolvePreviewPhotoUrlForStoragePath = async (
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  storagePath: string
) => {
  const cachedUrl = getCachedPreviewUrlForStoragePath(storagePath);
  if (cachedUrl !== undefined) {
    return cachedUrl;
  }

  const inFlightRequest = previewUrlRequestsByStoragePath.get(storagePath);
  if (inFlightRequest) {
    return inFlightRequest;
  }

  const request = createPhotoUrl(supabase, storagePath, PREVIEW_PHOTO_TRANSFORM)
    .then((url) => {
      setCachedPreviewUrlForStoragePath(storagePath, url);
      return url;
    })
    .finally(() => {
      previewUrlRequestsByStoragePath.delete(storagePath);
    });

  previewUrlRequestsByStoragePath.set(storagePath, request);
  return request;
};

export async function getApprovedBathroomPhotosData(bathroomId: string): Promise<ApprovedBathroomPhoto[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return [];
  }

  const { data: photoRows, error } = await supabase
    .from("photos")
    .select("id, storage_path, created_at, status")
    .eq("bathroom_id", bathroomId)
    .eq("status", ACTIVE_STATUS)
    .order("created_at", { ascending: false })
    .limit(24);

  if (error || !photoRows) {
    console.warn("[Poopin] Supabase approved photos query failed.", error?.message);
    return [];
  }

  const approvedRows = (photoRows as PhotoRow[]).filter(
    (row) => isPhotoStatus(row.status) && row.status === ACTIVE_STATUS && isNonEmptyPath(row.storage_path)
  );
  if (approvedRows.length === 0) {
    return [];
  }

  const paths = approvedRows.map((row) => row.storage_path);
  const { data: signedUrls, error: signedUrlError } = await supabase.storage
    .from(SUPABASE_PHOTOS_BUCKET)
    .createSignedUrls(paths, PHOTO_URL_EXPIRATION_SECONDS);

  if (signedUrlError || !signedUrls) {
    console.warn("[Poopin] Signed photo URL generation failed; falling back to per-photo URLs.", signedUrlError?.message);
  }

  const signedUrlByPath = new Map<string, string>();
  if (signedUrls) {
    for (const item of signedUrls) {
      if (item.error || !item.path || !item.signedUrl) {
        continue;
      }

      signedUrlByPath.set(item.path, item.signedUrl);
    }
  }

  const hydratedRows = await Promise.all(
    approvedRows.map(async (row) => {
      const url = signedUrlByPath.get(row.storage_path) ?? (await createPhotoUrl(supabase, row.storage_path));
      const thumbnailUrl = await createPhotoUrl(supabase, row.storage_path, DETAIL_THUMBNAIL_TRANSFORM);
      if (!url || !thumbnailUrl) {
        return null;
      }

      return {
        id: row.id,
        url,
        thumbnailUrl,
        createdAt: row.created_at
      };
    })
  );

  return hydratedRows.filter((row): row is ApprovedBathroomPhoto => row !== null);
}

export async function getApprovedBathroomPreviewPhotoData(bathroomId: string): Promise<string | null> {
  try {
    const previewPhotoUrls = await getApprovedBathroomPreviewPhotoUrlsData([bathroomId]);
    return previewPhotoUrls.get(bathroomId) ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.warn("[Poopin] Supabase preview photo query failed.", message);
    return null;
  }
}

export async function getApprovedBathroomPreviewPhotoUrlsData(
  bathroomIds: string[],
  supabaseOverride?: NonNullable<ReturnType<typeof getSupabaseServerClient>>
): Promise<Map<string, string | null>> {
  const uniqueBathroomIds = [...new Set(bathroomIds.filter((bathroomId) => typeof bathroomId === "string" && bathroomId.length > 0))];
  if (uniqueBathroomIds.length === 0) {
    return new Map<string, string | null>();
  }

  const supabase = supabaseOverride ?? getSupabaseServerClient();
  if (!supabase) {
    return new Map<string, string | null>();
  }

  const latestStoragePathByBathroomId = new Map<string, string>();
  const bathroomIdChunks = chunkItems(uniqueBathroomIds, PREVIEW_QUERY_BATHROOM_ID_BATCH_SIZE);

  for (const bathroomIdChunk of bathroomIdChunks) {
    const { data: photoRows, error } = await supabase
      .from("photos")
      .select("bathroom_id, storage_path, created_at, status")
      .in("bathroom_id", bathroomIdChunk)
      .eq("status", ACTIVE_STATUS)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    for (const row of (photoRows ?? []) as PhotoRow[]) {
      const bathroomId = typeof row.bathroom_id === "string" ? row.bathroom_id : null;
      if (!bathroomId || latestStoragePathByBathroomId.has(bathroomId)) {
        continue;
      }

      if (!isPhotoStatus(row.status) || row.status !== ACTIVE_STATUS || !isNonEmptyPath(row.storage_path)) {
        continue;
      }

      latestStoragePathByBathroomId.set(bathroomId, row.storage_path);
    }
  }

  if (latestStoragePathByBathroomId.size === 0) {
    return new Map<string, string | null>();
  }

  const uniqueStoragePaths = [...new Set(latestStoragePathByBathroomId.values())];
  const previewPhotoUrlByStoragePath = new Map<string, string | null>();
  await Promise.all(
    uniqueStoragePaths.map(async (storagePath) => {
      const url = await resolvePreviewPhotoUrlForStoragePath(supabase, storagePath);
      previewPhotoUrlByStoragePath.set(storagePath, url);
    })
  );

  const previewPhotoUrlByBathroomId = new Map<string, string | null>();
  for (const [bathroomId, storagePath] of latestStoragePathByBathroomId.entries()) {
    previewPhotoUrlByBathroomId.set(bathroomId, previewPhotoUrlByStoragePath.get(storagePath) ?? null);
  }

  return previewPhotoUrlByBathroomId;
}
