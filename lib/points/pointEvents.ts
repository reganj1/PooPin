import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerAuthClient } from "@/lib/auth/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type PointEventType = "review_created" | "photo_uploaded" | "restroom_added";
export type PointEntityType = "review" | "photo" | "restroom";
export type PointEventStatus = "awarded" | "reversed";

export interface PointEventSummary {
  id: string;
  profileId: string;
  eventType: PointEventType;
  entityType: PointEntityType;
  entityId: string;
  pointsDelta: number;
  status: PointEventStatus;
  createdAt: string;
}

export interface ProfilePointsSummary {
  totalPoints: number;
  recentEvents: PointEventSummary[];
}

export interface LeaderboardEntry {
  rank: number;
  profileId: string;
  displayName: string;
  totalPoints: number;
  reviewCount: number;
  photoCount: number;
  restroomAddCount: number;
  contributionCount: number;
  lastContributionAt: string | null;
}

export interface LeaderboardSnapshot {
  entries: LeaderboardEntry[];
  currentViewerEntry: LeaderboardEntry | null;
  totalContributors: number;
}

interface PointEventRow {
  id: string;
  profile_id: string;
  event_type: PointEventType;
  entity_type: PointEntityType;
  entity_id: string;
  points_delta: number;
  status: PointEventStatus;
  created_at: string;
}

interface LeaderboardStatsRow {
  rank: number | string;
  profile_id: string;
  display_name: string | null;
  total_points: number | string | null;
  review_count: number | string | null;
  photo_count: number | string | null;
  restroom_add_count: number | string | null;
  contribution_count: number | string | null;
  last_contribution_at: string | null;
}

interface AwardPointsInput {
  profileId: string;
  eventType: PointEventType;
  entityType: PointEntityType;
  entityId: string;
}

export interface AwardPointsResult {
  awarded: boolean;
  pointEventId: string | null;
  pointsDelta: number;
}

export const POINT_VALUES = {
  review: 5,
  photo: 7,
  restroom: 10
} as const;

const pointValuesByEventType: Record<PointEventType, number> = {
  review_created: POINT_VALUES.review,
  photo_uploaded: POINT_VALUES.photo,
  restroom_added: POINT_VALUES.restroom
};

const toNumber = (value: number | string | null | undefined) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

const isDuplicatePointEventError = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const message =
    "message" in error && typeof error.message === "string"
      ? error.message.toLowerCase()
      : error instanceof Error
        ? error.message.toLowerCase()
        : "";
  const code = "code" in error && typeof error.code === "string" ? error.code : "";

  return code === "23505" || message.includes("duplicate") || message.includes("unique");
};

const toPointEventSummary = (row: PointEventRow): PointEventSummary => ({
  id: row.id,
  profileId: row.profile_id,
  eventType: row.event_type,
  entityType: row.entity_type,
  entityId: row.entity_id,
  pointsDelta: row.points_delta,
  status: row.status,
  createdAt: row.created_at
});

const filterPointEventsForActiveListingContributions = async (supabase: SupabaseClient, rows: PointEventRow[]) => {
  const reviewEventIds = [
    ...new Set(
      rows
        .filter((row) => row.event_type === "review_created" && typeof row.entity_id === "string")
        .map((row) => row.entity_id)
    )
  ];

  if (reviewEventIds.length === 0) {
    return rows;
  }

  const { data, error } = await supabase
    .from("reviews")
    .select("id, bathrooms!inner(id)")
    .in("id", reviewEventIds)
    .eq("status", "active")
    .eq("bathrooms.status", "active");

  if (error) {
    console.warn("[Poopin] Could not filter review point events by active listings.", error.message);
    return rows.filter((row) => row.event_type !== "review_created");
  }

  const activeReviewIds = new Set(((data ?? []) as Array<{ id?: string | null }>).map((row) => row.id).filter((id): id is string => Boolean(id)));

  return rows.filter((row) => row.event_type !== "review_created" || activeReviewIds.has(row.entity_id));
};

const toLeaderboardEntry = (row: LeaderboardStatsRow): LeaderboardEntry => {
  const reviewCount = toNumber(row.review_count);
  const photoCount = toNumber(row.photo_count);
  const restroomAddCount = toNumber(row.restroom_add_count);

  return {
    rank: toNumber(row.rank),
    profileId: row.profile_id,
    displayName: row.display_name?.trim() || "Poopin Pal",
    totalPoints: toNumber(row.total_points),
    reviewCount,
    photoCount,
    restroomAddCount,
    contributionCount: toNumber(row.contribution_count) || reviewCount + photoCount + restroomAddCount,
    lastContributionAt: row.last_contribution_at
  };
};

const getProfilePointsReadClient = async () => {
  const authClient = await createSupabaseServerAuthClient();
  if (authClient) {
    return authClient;
  }

  return getSupabaseAdminClient();
};

export const buildPointEventIdempotencyKey = (eventType: PointEventType, entityId: string) => `${eventType}:${entityId}`;

export const formatPointEventLabel = (eventType: PointEventType) => {
  switch (eventType) {
    case "review_created":
      return "Review posted";
    case "photo_uploaded":
      return "Photo uploaded";
    case "restroom_added":
      return "Restroom added";
    default:
      return "Contribution";
  }
};

export const awardPointsForContribution = async (
  supabaseClient: SupabaseClient,
  input: AwardPointsInput
): Promise<AwardPointsResult> => {
  const pointsDelta = pointValuesByEventType[input.eventType];
  const { data, error } = await supabaseClient
    .from("point_events")
    .insert({
      profile_id: input.profileId,
      event_type: input.eventType,
      entity_type: input.entityType,
      entity_id: input.entityId,
      points_delta: pointsDelta,
      status: "awarded",
      idempotency_key: buildPointEventIdempotencyKey(input.eventType, input.entityId)
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (isDuplicatePointEventError(error)) {
      return {
        awarded: false,
        pointEventId: null,
        pointsDelta
      };
    }

    throw new Error(error.message);
  }

  return {
    awarded: true,
    pointEventId: (data as { id?: string } | null)?.id ?? null,
    pointsDelta
  };
};

export const getProfilePointsSummary = async (profileId: string, recentLimit = 5): Promise<ProfilePointsSummary> => {
  const normalizedProfileId = profileId.trim();
  if (!normalizedProfileId) {
    return {
      totalPoints: 0,
      recentEvents: []
    };
  }

  const supabase = await getProfilePointsReadClient();
  if (!supabase) {
    return {
      totalPoints: 0,
      recentEvents: []
    };
  }

  const adminClient = getSupabaseAdminClient();

  const [leaderboardSummaryResponse, totalsResponse, recentResponse] = await Promise.all([
    adminClient
      ? adminClient
          .from("leaderboard_profile_stats")
          .select("total_points")
          .eq("profile_id", normalizedProfileId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("point_events")
      .select("id, profile_id, event_type, entity_type, entity_id, points_delta, status, created_at")
      .eq("profile_id", normalizedProfileId)
      .eq("status", "awarded"),
    supabase
      .from("point_events")
      .select("id, profile_id, event_type, entity_type, entity_id, points_delta, status, created_at")
      .eq("profile_id", normalizedProfileId)
      .eq("status", "awarded")
      .order("created_at", { ascending: false })
      .limit(recentLimit)
  ]);

  if (totalsResponse.error) {
    console.warn("[Poopin] Could not load profile point totals.", totalsResponse.error.message);
  }

  if (recentResponse.error) {
    console.warn("[Poopin] Could not load recent point events.", recentResponse.error.message);
  }

  const leaderboardTotal = toNumber((leaderboardSummaryResponse.data as { total_points?: number | string | null } | null)?.total_points);
  const hasLeaderboardSummary = Boolean(leaderboardSummaryResponse.data);
  const totalPointEvents = await filterPointEventsForActiveListingContributions(supabase, (totalsResponse.data ?? []) as PointEventRow[]);
  const recentPointEvents = await filterPointEventsForActiveListingContributions(supabase, (recentResponse.data ?? []) as PointEventRow[]);
  const eventTotal = totalPointEvents.reduce(
    (sum, row) => sum + toNumber(row.points_delta),
    0
  );

  return {
    totalPoints: hasLeaderboardSummary ? leaderboardTotal : eventTotal,
    recentEvents: recentPointEvents.map(toPointEventSummary)
  };
};

export const getLeaderboardEntries = async (limit = 50): Promise<LeaderboardEntry[]> => {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Leaderboard requires SUPABASE_SERVICE_ROLE_KEY on the server.");
  }

  const { data, error } = await supabase
    .from("leaderboard_profile_stats")
    .select(
      "rank, profile_id, display_name, total_points, review_count, photo_count, restroom_add_count, contribution_count, last_contribution_at"
    )
    .order("rank", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as LeaderboardStatsRow[]).map(toLeaderboardEntry);
};

export const getLeaderboardSnapshot = async (currentProfileId?: string | null, limit = 50): Promise<LeaderboardSnapshot> => {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Leaderboard requires SUPABASE_SERVICE_ROLE_KEY on the server.");
  }

  const normalizedProfileId = currentProfileId?.trim() || null;

  const selectFields =
    "rank, profile_id, display_name, total_points, review_count, photo_count, restroom_add_count, contribution_count, last_contribution_at";

  const [entriesResponse, totalCountResponse, currentViewerResponse] = await Promise.all([
    supabase.from("leaderboard_profile_stats").select(selectFields).order("rank", { ascending: true }).limit(limit),
    supabase.from("leaderboard_profile_stats").select("profile_id", { count: "exact", head: true }),
    normalizedProfileId
      ? supabase.from("leaderboard_profile_stats").select(selectFields).eq("profile_id", normalizedProfileId).maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);

  if (entriesResponse.error) {
    throw new Error(entriesResponse.error.message);
  }

  if (totalCountResponse.error) {
    throw new Error(totalCountResponse.error.message);
  }

  if (currentViewerResponse.error) {
    throw new Error(currentViewerResponse.error.message);
  }

  return {
    entries: ((entriesResponse.data ?? []) as LeaderboardStatsRow[]).map(toLeaderboardEntry),
    currentViewerEntry: currentViewerResponse.data ? toLeaderboardEntry(currentViewerResponse.data as LeaderboardStatsRow) : null,
    totalContributors: totalCountResponse.count ?? 0
  };
};
