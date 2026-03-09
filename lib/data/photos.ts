import { getSupabaseServerClient } from "@/lib/supabase/server";
import { SUPABASE_PHOTOS_BUCKET } from "@/lib/supabase/photos";
import { Photo } from "@/types";

interface PhotoRow {
  id: string;
  storage_path: string;
  created_at: string;
  status: string;
}

export interface ApprovedBathroomPhoto {
  id: string;
  url: string;
  createdAt: string;
}

const ACTIVE_STATUS: Photo["status"] = "active";
const allowedPhotoStatuses = new Set<Photo["status"]>(["active", "pending", "flagged", "removed"]);

const isPhotoStatus = (value: string): value is Photo["status"] => allowedPhotoStatuses.has(value as Photo["status"]);

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

  const approvedRows = (photoRows as PhotoRow[]).filter((row) => isPhotoStatus(row.status) && row.status === ACTIVE_STATUS);
  if (approvedRows.length === 0) {
    return [];
  }

  const paths = approvedRows.map((row) => row.storage_path);
  const { data: signedUrls, error: signedUrlError } = await supabase.storage
    .from(SUPABASE_PHOTOS_BUCKET)
    .createSignedUrls(paths, 60 * 60);

  if (signedUrlError || !signedUrls) {
    console.warn("[Poopin] Signed photo URL generation failed; attempting public URLs.", signedUrlError?.message);

    return approvedRows
      .map((row) => {
        const publicUrl = supabase.storage.from(SUPABASE_PHOTOS_BUCKET).getPublicUrl(row.storage_path).data.publicUrl;
        if (!publicUrl) {
          return null;
        }

        return {
          id: row.id,
          url: publicUrl,
          createdAt: row.created_at
        };
      })
      .filter((row): row is ApprovedBathroomPhoto => row !== null);
  }

  const signedUrlByPath = new Map<string, string>();
  for (const item of signedUrls) {
    if (item.error || !item.path || !item.signedUrl) {
      continue;
    }

    signedUrlByPath.set(item.path, item.signedUrl);
  }

  return approvedRows
    .map((row) => {
      const url = signedUrlByPath.get(row.storage_path);
      if (!url) {
        return null;
      }

      return {
        id: row.id,
        url,
        createdAt: row.created_at
      };
    })
    .filter((row): row is ApprovedBathroomPhoto => row !== null);
}
