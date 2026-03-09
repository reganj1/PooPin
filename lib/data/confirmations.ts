import { getSupabaseServerClient } from "@/lib/supabase/server";
import { CONFIRMATION_REASON_PREFIX, parseRestroomConfirmationBrowserId } from "@/lib/utils/communitySignals";

interface ReportReasonRow {
  reason: string;
}

export async function getBathroomConfirmationCountData(bathroomId: string): Promise<number> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return 0;
  }

  const { data, error } = await supabase
    .from("reports")
    .select("reason")
    .eq("bathroom_id", bathroomId)
    .like("reason", `${CONFIRMATION_REASON_PREFIX}%`)
    .limit(5000);

  if (error || !data) {
    console.warn("[Poopin] restroom confirmation query failed.", error?.message);
    return 0;
  }

  const browserIds = new Set<string>();
  for (const row of data as ReportReasonRow[]) {
    const browserId = parseRestroomConfirmationBrowserId(row.reason);
    if (!browserId) {
      continue;
    }
    browserIds.add(browserId);
  }

  return browserIds.size;
}

