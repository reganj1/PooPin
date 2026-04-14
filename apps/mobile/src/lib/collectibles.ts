/**
 * Collectible card definitions and helpers.
 * Adapted from lib/collectibles/cards.ts in the web app.
 * Pure TypeScript — no network calls, no Supabase.
 */

export type CollectibleCardRarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary" | "Mythic";

export interface CollectibleCard {
  tier: number;
  rarity: CollectibleCardRarity;
  key: string;
  title: string;
  flavorLine: string;
  threshold: number;
  mascot: string;
}

export const collectibleCards: readonly CollectibleCard[] = [
  {
    tier: 1,
    rarity: "Common",
    key: "porcelain-pal",
    title: "Porcelain Pal",
    flavorLine: "A cheerful little restroom buddy for your first brave contributions.",
    threshold: 0,
    mascot: "🚽"
  },
  {
    tier: 2,
    rarity: "Uncommon",
    key: "bubble-buddy",
    title: "Bubble Buddy",
    flavorLine: "Fresh, bright, and ready to celebrate a helpful streak of cleanup intel.",
    threshold: 5,
    mascot: "🫧"
  },
  {
    tier: 3,
    rarity: "Rare",
    key: "flush-friend",
    title: "Flush Friend",
    flavorLine: "A polished mascot for contributors who keep the map feeling alive and current.",
    threshold: 12,
    mascot: "💧"
  },
  {
    tier: 4,
    rarity: "Epic",
    key: "golden-stallion",
    title: "Golden Stallion",
    flavorLine: "A gleaming stall guardian for contributors who always show up with useful detail.",
    threshold: 25,
    mascot: "⭐"
  },
  {
    tier: 5,
    rarity: "Legendary",
    key: "royal-restroom",
    title: "Royal Restroom",
    flavorLine: "Velvet-rope energy for community MVPs who keep the best spots discoverable.",
    threshold: 50,
    mascot: "👑"
  },
  {
    tier: 6,
    rarity: "Mythic",
    key: "throne-guardian",
    title: "Throne Guardian",
    flavorLine: "A crown-tier protector of the cleanest intel in the kingdom.",
    threshold: 100,
    mascot: "🛡️"
  }
] as const;

// score = reviews×1 + photos×1 + restrooms×3  (mirrors COLLECTIBLE_CONTRIBUTION_WEIGHTS)
export const buildContributionScore = (counts: { reviewCount: number; photoCount: number; restroomAddCount: number }) =>
  counts.reviewCount + counts.photoCount + counts.restroomAddCount * 3;

export const getUnlockedCards = (score: number): CollectibleCard[] =>
  collectibleCards.filter((card) => score >= card.threshold) as CollectibleCard[];

export const getCurrentCard = (score: number): CollectibleCard =>
  [...getUnlockedCards(score)].pop() ?? (collectibleCards[0] as CollectibleCard);

export const getNextCard = (score: number): CollectibleCard | null =>
  (collectibleCards.find((card) => score < card.threshold) as CollectibleCard | undefined) ?? null;

export const getCardByKey = (key: string | null | undefined): CollectibleCard | null =>
  (collectibleCards.find((c) => c.key === key) as CollectibleCard | undefined) ?? null;

export const isCardUnlocked = (key: string, score: number): boolean => {
  const card = getCardByKey(key);
  return Boolean(card && score >= card.threshold);
};

/** Rarity → RN-compatible color tokens */
export const RARITY_COLORS: Record<CollectibleCardRarity, { bg: string; border: string; text: string }> = {
  Common:    { bg: "#f8fafc", border: "#e2e8f0", text: "#475569" },
  Uncommon:  { bg: "#f0f9ff", border: "#bae6fd", text: "#0369a1" },
  Rare:      { bg: "#f0fdf4", border: "#bbf7d0", text: "#166534" },
  Epic:      { bg: "#fffbeb", border: "#fde68a", text: "#92400e" },
  Legendary: { bg: "#fdf4ff", border: "#e9d5ff", text: "#7e22ce" },
  Mythic:    { bg: "#f5f3ff", border: "#ddd6fe", text: "#5b21b6" }
};
