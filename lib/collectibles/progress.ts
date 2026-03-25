import { createSupabaseServerAuthClient } from "@/lib/auth/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  buildCollectibleContributionScore,
  type CollectibleCardDefinition,
  type CollectibleContributionCounts,
  getCurrentCollectibleCard,
  getNextCollectibleCard,
  getUnlockedCollectibleCards
} from "@/lib/collectibles/cards";

export interface CollectibleProgressSummary {
  counts: CollectibleContributionCounts;
  contributionScore: number;
  activeCard: CollectibleCardDefinition;
  activeCardKey: string;
  currentTierCard: CollectibleCardDefinition;
  nextCard: CollectibleCardDefinition | null;
  unlockedCards: CollectibleCardDefinition[];
  remainingToNext: number;
  progressPercent: number;
}

const emptyCounts: CollectibleContributionCounts = {
  reviewCount: 0,
  photoCount: 0,
  restroomAddCount: 0
};

const toSafeCount = (value: number | null) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

const loadDirectContributionCounts = async (profileId: string): Promise<CollectibleContributionCounts | null> => {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return null;
  }

  const [reviewResponse, photoResponse, restroomResponse] = await Promise.all([
    supabase.from("reviews").select("id", { count: "exact", head: true }).eq("profile_id", profileId).eq("status", "active"),
    supabase.from("photos").select("id", { count: "exact", head: true }).eq("profile_id", profileId).in("status", ["active", "pending"]),
    supabase
      .from("bathrooms")
      .select("id", { count: "exact", head: true })
      .eq("created_by_profile_id", profileId)
      .eq("source", "user")
      .in("status", ["active", "pending"])
  ]);

  if (reviewResponse.error || photoResponse.error || restroomResponse.error) {
    console.warn("[Poopin] Could not load direct collectible contribution counts.", {
      reviewError: reviewResponse.error?.message,
      photoError: photoResponse.error?.message,
      restroomError: restroomResponse.error?.message
    });
    return null;
  }

  return {
    reviewCount: toSafeCount(reviewResponse.count),
    photoCount: toSafeCount(photoResponse.count),
    restroomAddCount: toSafeCount(restroomResponse.count)
  };
};

const loadContributionCountsFromPointEvents = async (profileId: string): Promise<CollectibleContributionCounts> => {
  const supabase = (await createSupabaseServerAuthClient()) ?? getSupabaseAdminClient();
  if (!supabase) {
    return emptyCounts;
  }

  const { data, error } = await supabase
    .from("point_events")
    .select("event_type")
    .eq("profile_id", profileId)
    .eq("status", "awarded");

  if (error) {
    console.warn("[Poopin] Could not load collectible progress from point events.", error.message);
    return emptyCounts;
  }

  return ((data ?? []) as Array<{ event_type?: string | null }>).reduce<CollectibleContributionCounts>(
    (counts, row) => {
      switch (row.event_type) {
        case "review_created":
          counts.reviewCount += 1;
          break;
        case "photo_uploaded":
          counts.photoCount += 1;
          break;
        case "restroom_added":
          counts.restroomAddCount += 1;
          break;
        default:
          break;
      }

      return counts;
    },
    { ...emptyCounts }
  );
};

export const getProfileCollectibleProgress = async (
  profileId: string,
  preferredActiveCardKey?: string | null
): Promise<CollectibleProgressSummary> => {
  const normalizedProfileId = profileId.trim();
  if (!normalizedProfileId) {
    const currentTierCard = getCurrentCollectibleCard(0);
    return {
      counts: emptyCounts,
      contributionScore: 0,
      activeCard: currentTierCard,
      activeCardKey: currentTierCard.key,
      currentTierCard,
      nextCard: getNextCollectibleCard(0),
      unlockedCards: getUnlockedCollectibleCards(0),
      remainingToNext: getNextCollectibleCard(0)?.threshold ?? 0,
      progressPercent: 0
    };
  }

  const counts = (await loadDirectContributionCounts(normalizedProfileId)) ?? (await loadContributionCountsFromPointEvents(normalizedProfileId));
  const contributionScore = buildCollectibleContributionScore(counts);
  const unlockedCards = getUnlockedCollectibleCards(contributionScore);
  const currentTierCard = getCurrentCollectibleCard(contributionScore);
  const activeCard = unlockedCards.find((card) => card.key === preferredActiveCardKey) ?? currentTierCard;
  const nextCard = getNextCollectibleCard(contributionScore);
  const currentThreshold = currentTierCard.threshold;
  const nextThreshold = nextCard?.threshold ?? currentThreshold;
  const thresholdSpan = Math.max(1, nextThreshold - currentThreshold);
  const progressIntoTier = nextCard ? Math.max(0, contributionScore - currentThreshold) : thresholdSpan;
  const progressPercent = nextCard ? Math.min(100, Math.round((progressIntoTier / thresholdSpan) * 100)) : 100;

  return {
    counts,
    contributionScore,
    activeCard,
    activeCardKey: activeCard.key,
    currentTierCard,
    nextCard,
    unlockedCards,
    remainingToNext: nextCard ? Math.max(0, nextCard.threshold - contributionScore) : 0,
    progressPercent
  };
};
