/**
 * Bundled card artwork assets.
 *
 * All require() calls MUST be static — Metro's module resolver analyses them
 * at build time. Dynamic require() with template literals does not work in
 * React Native / Metro.
 *
 * Keys match the `key` field on each CollectibleCard definition exactly and
 * correspond 1:1 with the filenames in public/cards/ on the web side.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const CARD_IMAGE_MAP: Record<string, number> = {
  "porcelain-pal": require("../../../assets/cards/porcelain-pal.png"),
  "bubble-buddy": require("../../../assets/cards/bubble-buddy.png"),
  "flush-friend": require("../../../assets/cards/flush-friend.png"),
  "golden-stallion": require("../../../assets/cards/golden-stallion.png"),
  "royal-restroom": require("../../../assets/cards/royal-restroom.png"),
  "throne-guardian": require("../../../assets/cards/throne-guardian.png")
};

/**
 * Returns the bundled PNG asset for a title card key, or `null` if the key
 * is unknown. Callers should render the card's emoji mascot as a fallback
 * when this returns null.
 */
export function getTitleCardImage(key: string): number | null {
  return CARD_IMAGE_MAP[key] ?? null;
}
