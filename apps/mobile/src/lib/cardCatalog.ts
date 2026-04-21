/**
 * Mobile-side static mirror of the collectible card catalog.
 * Mirrors lib/collectibles/cards.ts (read for reference only — web not modified).
 * Image URLs point to the same static public files served by the web app.
 */
import { mobileEnv } from "./env";

export type CollectibleRarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary" | "Mythic";

export interface MobileCardEntry {
  key: string;
  title: string;
  rarity: CollectibleRarity;
  tier: number;
  mascot: string;
  sparkle: string;
  flavorLine: string;
}

export const MOBILE_CARD_CATALOG: readonly MobileCardEntry[] = [
  {
    key: "porcelain-pal",
    title: "Porcelain Pal",
    rarity: "Common",
    tier: 1,
    mascot: "🚽",
    sparkle: "✦",
    flavorLine: "A cheerful little restroom buddy for your first brave contributions."
  },
  {
    key: "bubble-buddy",
    title: "Bubble Buddy",
    rarity: "Uncommon",
    tier: 2,
    mascot: "🫧",
    sparkle: "✧",
    flavorLine: "Fresh, bright, and ready to celebrate a helpful streak of cleanup intel."
  },
  {
    key: "flush-friend",
    title: "Flush Friend",
    rarity: "Rare",
    tier: 3,
    mascot: "💧",
    sparkle: "✦",
    flavorLine: "A polished mascot for contributors who keep the map feeling alive and current."
  },
  {
    key: "golden-stallion",
    title: "Golden Stallion",
    rarity: "Epic",
    tier: 4,
    mascot: "⭐",
    sparkle: "✷",
    flavorLine: "A gleaming stall guardian for contributors who always show up with useful detail."
  },
  {
    key: "royal-restroom",
    title: "Royal Restroom",
    rarity: "Legendary",
    tier: 5,
    mascot: "👑",
    sparkle: "✦",
    flavorLine: "Velvet-rope energy for community MVPs who keep the best spots discoverable."
  },
  {
    key: "throne-guardian",
    title: "Throne Guardian",
    rarity: "Mythic",
    tier: 6,
    mascot: "🛡️",
    sparkle: "✺",
    flavorLine: "A crown-tier protector of the cleanest intel in the kingdom."
  }
] as const;

const cardByTitle = new Map<string, MobileCardEntry>(
  MOBILE_CARD_CATALOG.map((c) => [c.title.toLowerCase(), c as MobileCardEntry])
);

export const getCardByTitle = (title: string | null | undefined): MobileCardEntry | null =>
  (title ? cardByTitle.get(title.toLowerCase()) : null) ?? null;

export const getCardImageUrl = (cardKey: string): string => {
  try {
    return new URL(`/cards/${cardKey}.png`, mobileEnv.apiBaseUrl).toString();
  } catch {
    return "";
  }
};

// ─── Rarity color system ──────────────────────────────────────────────────────
// Mirrors web CollectibleTitlePill rarityToneClassNames / CollectibleCard theme

export interface RarityColors {
  /** Pill / surface background */
  bg: string;
  /** Pill / card border */
  border: string;
  /** Primary text color */
  text: string;
  /** Subtle glow / backdrop tint used in card art area */
  glow: string;
  /** Slightly deeper shade for gradient backdrop tops */
  glowDeep: string;
}

export const RARITY_COLORS: Record<string, RarityColors> = {
  Common:    { bg: "#f8fafc", border: "#e2e8f0", text: "#475569", glow: "#e2e8f0", glowDeep: "#cbd5e1" },
  Uncommon:  { bg: "#f0f9ff", border: "#bae6fd", text: "#0369a1", glow: "#e0f2fe", glowDeep: "#7dd3fc" },
  Rare:      { bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d", glow: "#dcfce7", glowDeep: "#86efac" },
  Epic:      { bg: "#fffbeb", border: "#fde68a", text: "#b45309", glow: "#fef3c7", glowDeep: "#fcd34d" },
  Legendary: { bg: "#fdf4ff", border: "#f0abfc", text: "#a21caf", glow: "#fae8ff", glowDeep: "#e879f9" },
  Mythic:    { bg: "#f5f3ff", border: "#ddd6fe", text: "#6d28d9", glow: "#ede9fe", glowDeep: "#a78bfa" }
};

export const getRarityColors = (rarity: string | null | undefined): RarityColors =>
  (rarity ? RARITY_COLORS[rarity] : null) ?? RARITY_COLORS.Common;
