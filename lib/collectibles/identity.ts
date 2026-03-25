import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  buildCollectibleContributionScore,
  type CollectibleContributionCounts,
  getCurrentCollectibleCard,
  getUnlockedCollectibleCards
} from "@/lib/collectibles/cards";

export interface PublicCollectibleIdentity {
  profileId: string;
  displayName: string;
  activeCardKey: string | null;
  contributionScore: number;
  counts: CollectibleContributionCounts;
  activeCardTitle: string;
  activeCardRarity: string;
  activeCardResolvedKey: string;
}

interface ProfileIdentityRow {
  id: string;
  display_name: string | null;
  active_card_key: string | null;
}

interface LeaderboardStatsRow {
  profile_id: string;
  review_count: number | string | null;
  photo_count: number | string | null;
  restroom_add_count: number | string | null;
}

const emptyCounts: CollectibleContributionCounts = {
  reviewCount: 0,
  photoCount: 0,
  restroomAddCount: 0
};

const toSafeNumber = (value: number | string | null | undefined) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

export const getCollectibleIdentitiesByProfileIds = async (profileIds: string[]): Promise<Map<string, PublicCollectibleIdentity>> => {
  const normalizedIds = [...new Set(profileIds.map((id) => id.trim()).filter((id) => id.length > 0))];
  if (normalizedIds.length === 0) {
    return new Map();
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return new Map();
  }

  const [profileResponse, statsResponse] = await Promise.all([
    supabase.from("profiles").select("id, display_name, active_card_key").in("id", normalizedIds),
    supabase
      .from("leaderboard_profile_stats")
      .select("profile_id, review_count, photo_count, restroom_add_count")
      .in("profile_id", normalizedIds)
  ]);

  if (profileResponse.error) {
    throw new Error(profileResponse.error.message);
  }

  if (statsResponse.error) {
    throw new Error(statsResponse.error.message);
  }

  const countsByProfileId = new Map<string, CollectibleContributionCounts>();
  for (const row of (statsResponse.data ?? []) as LeaderboardStatsRow[]) {
    countsByProfileId.set(row.profile_id, {
      reviewCount: toSafeNumber(row.review_count),
      photoCount: toSafeNumber(row.photo_count),
      restroomAddCount: toSafeNumber(row.restroom_add_count)
    });
  }

  return new Map(
    ((profileResponse.data ?? []) as ProfileIdentityRow[]).map((row) => {
      const counts = countsByProfileId.get(row.id) ?? emptyCounts;
      const contributionScore = buildCollectibleContributionScore(counts);
      const currentCard = getCurrentCollectibleCard(contributionScore);
      const activeCard = getUnlockedCollectibleCards(contributionScore).find((card) => card.key === row.active_card_key) ?? currentCard;

      const identity: PublicCollectibleIdentity = {
        profileId: row.id,
        displayName: row.display_name?.trim() || "Poopin Pal",
        activeCardKey: row.active_card_key,
        contributionScore,
        counts,
        activeCardTitle: activeCard.title,
        activeCardRarity: activeCard.rarity,
        activeCardResolvedKey: activeCard.key
      };

      return [row.id, identity];
    })
  );
};
