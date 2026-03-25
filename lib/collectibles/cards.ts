export type CollectibleCardRarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary" | "Mythic";

export interface CollectibleCardDefinition {
  tier: number;
  rarity: CollectibleCardRarity;
  key: string;
  title: string;
  flavorLine: string;
  threshold: number;
  imageSrc: string;
  mascot: string;
  sparkle: string;
  theme: {
    shell: string;
    badge: string;
    accent: string;
    glow: string;
    orb: string;
    border: string;
  };
}

export interface CollectibleContributionCounts {
  reviewCount: number;
  photoCount: number;
  restroomAddCount: number;
}

export const COLLECTIBLE_CONTRIBUTION_WEIGHTS = {
  review: 1,
  photo: 1,
  restroom: 3
} as const;

export const collectibleCards: readonly CollectibleCardDefinition[] = [
  {
    tier: 1,
    rarity: "Common",
    key: "porcelain-pal",
    title: "Porcelain Pal",
    flavorLine: "A cheerful little restroom buddy for your first brave contributions.",
    threshold: 0,
    imageSrc: "/cards/porcelain-pal.png",
    mascot: "🚽",
    sparkle: "✦",
    theme: {
      shell: "from-slate-100 via-white to-slate-50",
      badge: "border-slate-200 bg-white/80 text-slate-700",
      accent: "bg-slate-900 text-white",
      glow: "bg-slate-200/60",
      orb: "from-slate-200 via-white to-slate-100",
      border: "border-slate-200/80"
    }
  },
  {
    tier: 2,
    rarity: "Uncommon",
    key: "bubble-buddy",
    title: "Bubble Buddy",
    flavorLine: "Fresh, bright, and ready to celebrate a helpful streak of cleanup intel.",
    threshold: 5,
    imageSrc: "/cards/bubble-buddy.png",
    mascot: "🫧",
    sparkle: "✧",
    theme: {
      shell: "from-sky-100 via-cyan-50 to-white",
      badge: "border-sky-200 bg-white/75 text-sky-700",
      accent: "bg-sky-600 text-white",
      glow: "bg-sky-300/55",
      orb: "from-sky-200 via-cyan-100 to-white",
      border: "border-sky-200/80"
    }
  },
  {
    tier: 3,
    rarity: "Rare",
    key: "flush-friend",
    title: "Flush Friend",
    flavorLine: "A polished mascot for contributors who keep the map feeling alive and current.",
    threshold: 12,
    imageSrc: "/cards/flush-friend.png",
    mascot: "💧",
    sparkle: "✦",
    theme: {
      shell: "from-teal-100 via-emerald-50 to-white",
      badge: "border-emerald-200 bg-white/75 text-emerald-700",
      accent: "bg-emerald-600 text-white",
      glow: "bg-emerald-300/55",
      orb: "from-emerald-200 via-teal-100 to-white",
      border: "border-emerald-200/80"
    }
  },
  {
    tier: 4,
    rarity: "Epic",
    key: "golden-stallion",
    title: "Golden Stallion",
    flavorLine: "A gleaming stall guardian for contributors who always show up with useful detail.",
    threshold: 25,
    imageSrc: "/cards/golden-stallion.png",
    mascot: "⭐",
    sparkle: "✷",
    theme: {
      shell: "from-amber-100 via-yellow-50 to-white",
      badge: "border-amber-200 bg-white/80 text-amber-700",
      accent: "bg-amber-500 text-slate-950",
      glow: "bg-amber-300/60",
      orb: "from-amber-200 via-yellow-100 to-white",
      border: "border-amber-200/85"
    }
  },
  {
    tier: 5,
    rarity: "Legendary",
    key: "royal-restroom",
    title: "Royal Restroom",
    flavorLine: "Velvet-rope energy for community MVPs who keep the best spots discoverable.",
    threshold: 50,
    imageSrc: "/cards/royal-restroom.png",
    mascot: "👑",
    sparkle: "✦",
    theme: {
      shell: "from-fuchsia-100 via-rose-50 to-white",
      badge: "border-fuchsia-200 bg-white/80 text-fuchsia-700",
      accent: "bg-fuchsia-600 text-white",
      glow: "bg-fuchsia-300/55",
      orb: "from-fuchsia-200 via-rose-100 to-white",
      border: "border-fuchsia-200/85"
    }
  },
  {
    tier: 6,
    rarity: "Mythic",
    key: "throne-guardian",
    title: "Throne Guardian",
    flavorLine: "A crown-tier protector of the cleanest intel in the kingdom.",
    threshold: 100,
    imageSrc: "/cards/throne-guardian.png",
    mascot: "🛡️",
    sparkle: "✺",
    theme: {
      shell: "from-indigo-100 via-violet-50 to-white",
      badge: "border-violet-200 bg-white/80 text-violet-700",
      accent: "bg-violet-700 text-white",
      glow: "bg-violet-300/55",
      orb: "from-violet-200 via-indigo-100 to-white",
      border: "border-violet-200/85"
    }
  }
] as const;

const collectibleCardMap = new Map<string, CollectibleCardDefinition>(collectibleCards.map((card) => [card.key, card]));

export const buildCollectibleContributionScore = (counts: CollectibleContributionCounts) =>
  counts.reviewCount * COLLECTIBLE_CONTRIBUTION_WEIGHTS.review +
  counts.photoCount * COLLECTIBLE_CONTRIBUTION_WEIGHTS.photo +
  counts.restroomAddCount * COLLECTIBLE_CONTRIBUTION_WEIGHTS.restroom;

export const getCollectibleCardByKey = (cardKey: string | null | undefined) => {
  if (!cardKey) {
    return null;
  }

  return collectibleCardMap.get(cardKey) ?? null;
};

export const getUnlockedCollectibleCards = (contributionScore: number) =>
  collectibleCards.filter((card) => contributionScore >= card.threshold);

export const getCurrentCollectibleCard = (contributionScore: number) =>
  [...getUnlockedCollectibleCards(contributionScore)].pop() ?? collectibleCards[0];

export const getNextCollectibleCard = (contributionScore: number) =>
  collectibleCards.find((card) => contributionScore < card.threshold) ?? null;

export const isCollectibleCardUnlocked = (cardKey: string, contributionScore: number) => {
  const card = getCollectibleCardByKey(cardKey);
  return Boolean(card && contributionScore >= card.threshold);
};
