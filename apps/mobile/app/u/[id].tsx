import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReviewQuickTag } from "@poopin/domain";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { PublicProfileReview, PublicReviewerProfile } from "../../src/lib/api";
import { getPublicProfileReviews } from "../../src/lib/api";
import { getCardByTitle, getCardImageUrl, getRarityColors } from "../../src/lib/cardCatalog";
import { mobileTheme } from "../../src/ui/theme";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const QUICK_TAG_INFO: Record<ReviewQuickTag, { label: string; icon: string; positive: boolean }> = {
  clean: { label: "Clean", icon: "✨", positive: true },
  smelly: { label: "Smelly", icon: "🤢", positive: false },
  no_line: { label: "No line", icon: "🚫", positive: true },
  crowded: { label: "Crowded", icon: "🚻", positive: false },
  no_toilet_paper: { label: "No toilet paper", icon: "🧻", positive: false },
  locked: { label: "Locked", icon: "🔒", positive: false }
};

const formatDate = (value: string) => {
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
  } catch {
    return value;
  }
};

// ─── Review row (profile page) ────────────────────────────────────────────────

function ReviewRow({ review, onPress }: { review: PublicProfileReview; onPress: () => void }) {
  const tags = (review.quick_tags ?? []) as ReviewQuickTag[];
  const location = [review.restroomName, review.restroomCity].filter(Boolean).join(" · ");

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.reviewRow, pressed && { opacity: 0.75 }]}
      accessibilityRole="button"
      accessibilityLabel={`View ${review.restroomName ?? "restroom"} review`}
    >
      <View style={styles.reviewRowHeader}>
        <View style={styles.reviewRowMeta}>
          {location ? (
            <Text style={styles.reviewRowLocation} numberOfLines={1}>{location}</Text>
          ) : null}
          <Text style={styles.reviewRowDate}>{formatDate(review.visit_time)}</Text>
        </View>
        <View style={styles.ratingPill}>
          <Text style={styles.ratingPillText}>{review.overall_rating.toFixed(1)} ★</Text>
        </View>
      </View>

      {tags.length > 0 && (
        <View style={styles.tagRow}>
          {tags.slice(0, 3).map((tag) => {
            const info = QUICK_TAG_INFO[tag];
            if (!info) return null;
            return (
              <View
                key={tag}
                style={[styles.chip, info.positive ? styles.chipPositive : styles.chipNegative]}
              >
                <Text style={styles.chipIcon}>{info.icon}</Text>
                <Text style={[styles.chipText, info.positive ? styles.chipTextPositive : styles.chipTextNegative]}>
                  {info.label}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {review.review_text ? (
        <Text style={styles.reviewRowBody} numberOfLines={3}>
          "{review.review_text}"
        </Text>
      ) : null}
    </Pressable>
  );
}

// ─── Collectible card art panel ───────────────────────────────────────────────

function CardArtPanel({
  profile
}: {
  profile: PublicReviewerProfile;
}) {
  const card = getCardByTitle(profile.collectibleTitle);
  const rarity = profile.collectibleRarity ?? card?.rarity ?? null;
  const rarityColors = getRarityColors(rarity);
  const imageUrl = card ? getCardImageUrl(card.key) : null;
  const [imageError, setImageError] = useState(false);

  return (
    <View style={[styles.cardArtPanel, { borderColor: rarityColors.border }]}>
      {/* Gradient backdrop from rarity glow color */}
      <View
        style={[
          styles.cardArtBackdrop,
          { backgroundColor: rarityColors.glow }
        ]}
      />

      {/* Top badges row */}
      <View style={styles.cardBadgeRow}>
        {rarity ? (
          <View style={[styles.rarityBadge, { backgroundColor: rarityColors.bg, borderColor: rarityColors.border }]}>
            <Text style={[styles.rarityBadgeText, { color: rarityColors.text }]}>
              {rarity.toUpperCase()}
            </Text>
          </View>
        ) : null}
        <View style={styles.cardBadgeRight}>
          {card ? (
            <Text style={styles.tierLabel}>Tier {card.tier}</Text>
          ) : null}
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>Active</Text>
          </View>
        </View>
      </View>

      {/* Card image */}
      <View style={styles.cardImageWrap}>
        {imageUrl && !imageError ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.cardImage}
            resizeMode="contain"
            onError={() => setImageError(true)}
          />
        ) : (
          <Text style={styles.cardMascotFallback}>
            {card?.mascot ?? "🚽"}
          </Text>
        )}
      </View>

      {/* Card footer */}
      <View style={styles.cardFooter}>
        <View style={styles.cardFooterLeft}>
          <Text style={styles.cardTitle}>
            {profile.collectibleTitle ?? "Porcelain Pal"}
            {card ? <Text style={styles.cardSparkle}> {card.sparkle}</Text> : null}
          </Text>
          {card ? (
            <Text style={styles.cardFlavorLine} numberOfLines={2}>{card.flavorLine}</Text>
          ) : null}
        </View>
        {card ? (
          <View style={styles.cardMascotBubble}>
            <Text style={styles.cardMascotBubbleText}>{card.mascot}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PublicReviewerScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();

  const profileId = useMemo(() => {
    const resolved = Array.isArray(params.id) ? params.id[0] : params.id;
    return typeof resolved === "string" ? resolved : "";
  }, [params.id]);

  const [profile, setProfile] = useState<PublicReviewerProfile | null>(null);
  const [reviews, setReviews] = useState<PublicProfileReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const displayName =
    (profile?.displayName?.trim() ? profile.displayName.trim() : null) ?? "Contributor";
  const screenTitle = profile ? displayName : "Profile";

  const card = getCardByTitle(profile?.collectibleTitle);
  const rarity = profile?.collectibleRarity ?? card?.rarity ?? null;
  const rarityColors = getRarityColors(rarity);

  const loadData = useCallback(async () => {
    if (!profileId) {
      setErrorMessage("Invalid profile.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const result = await getPublicProfileReviews(profileId);
      setProfile(result.profile);
      setReviews(result.reviews);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not load this profile right now.");
    } finally {
      setIsLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: screenTitle,
          headerBackButtonDisplayMode: "minimal"
        }}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={mobileTheme.colors.brandStrong} />
            <Text style={styles.stateText}>Loading profile…</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.stateCard}>
            <Text style={styles.errorText}>{errorMessage}</Text>
            <Pressable onPress={loadData} style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.7 }]}>
              <Text style={styles.retryBtnText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* ── Hero section ── */}
            <View style={styles.hero}>
              <Text style={styles.heroEyebrow}>Contributor profile</Text>

              {/* Avatar + name */}
              <View style={styles.heroIdentity}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarInitial}>
                    {displayName.charAt(0).toUpperCase() || "?"}
                  </Text>
                </View>
                <View style={styles.heroNameBlock}>
                  <Text style={styles.displayName}>{displayName}</Text>
                  {profile?.collectibleTitle ? (
                    <View
                      style={[
                        styles.titlePill,
                        { backgroundColor: rarityColors.bg, borderColor: rarityColors.border }
                      ]}
                    >
                      {card ? <Text style={styles.titlePillMascot}>{card.mascot}</Text> : null}
                      <Text style={[styles.titlePillText, { color: rarityColors.text }]}>
                        {profile.collectibleTitle}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* Stats row */}
              {profile?.stats ? (
                <View style={styles.statsRow}>
                  <View style={styles.statCell}>
                    <Text style={styles.statValue}>{profile.stats.totalPoints}</Text>
                    <Text style={styles.statLabel}>Points</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statCell}>
                    <Text style={styles.statValue}>{profile.stats.reviewCount}</Text>
                    <Text style={styles.statLabel}>Reviews</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statCell}>
                    <Text style={styles.statValue}>{profile.stats.photoCount}</Text>
                    <Text style={styles.statLabel}>Photos</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statCell}>
                    <Text style={styles.statValue}>{profile.stats.restroomAddCount}</Text>
                    <Text style={styles.statLabel}>Restrooms</Text>
                  </View>
                </View>
              ) : null}
            </View>

            {/* ── Active collectible card art ── */}
            {profile?.collectibleTitle || profile?.collectibleRarity ? (
              <View style={styles.cardArtSection}>
                <CardArtPanel profile={profile} />
              </View>
            ) : null}

            {/* ── Recent reviews ── */}
            {reviews.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No reviews yet.</Text>
              </View>
            ) : (
              <View style={styles.reviewsSection}>
                <View style={styles.reviewsSectionHeader}>
                  <Text style={styles.sectionEyebrow}>Recent reviews</Text>
                  <Text style={styles.sectionTitle}>Latest restroom notes</Text>
                </View>
                <View style={styles.reviewList}>
                  {reviews.map((r) => (
                    <ReviewRow
                      key={r.id}
                      review={r}
                      onPress={() => router.push(`/restrooms/${r.bathroom_id}`)}
                    />
                  ))}
                </View>
                <Text style={styles.reviewsFooter}>
                  {reviews.length === 20 ? "Showing 20 most recent reviews" : `${reviews.length} ${reviews.length === 1 ? "review" : "reviews"} total`}
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: mobileTheme.colors.pageBackground
  },
  scrollContent: {
    paddingBottom: 60
  },

  // ── Loading / error states
  stateCard: {
    alignItems: "center",
    gap: 12,
    margin: mobileTheme.spacing.screenX,
    padding: 40
  },
  stateText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 15,
    textAlign: "center"
  },
  errorText: {
    color: mobileTheme.colors.errorText,
    fontSize: 15,
    textAlign: "center"
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10
  },
  retryBtnText: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 14,
    fontWeight: "600"
  },

  // ── Hero
  hero: {
    backgroundColor: mobileTheme.colors.surface,
    borderBottomColor: mobileTheme.colors.borderSubtle,
    borderBottomWidth: 1,
    gap: 16,
    paddingBottom: 24,
    paddingHorizontal: mobileTheme.spacing.screenX,
    paddingTop: 20
  },
  heroEyebrow: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase"
  },
  heroIdentity: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14
  },
  avatarCircle: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.brandDeep,
    borderRadius: 30,
    height: 60,
    justifyContent: "center",
    width: 60
  },
  avatarInitial: {
    color: "#ffffff",
    fontSize: 26,
    fontWeight: "700"
  },
  heroNameBlock: {
    flex: 1,
    gap: 6
  },
  displayName: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5
  },
  titlePill: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1.5,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  titlePillMascot: {
    fontSize: 13
  },
  titlePillText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.1
  },

  // ── Stats row
  statsRow: {
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderColor: mobileTheme.colors.borderSubtle,
    borderRadius: mobileTheme.radii.md,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden"
  },
  statCell: {
    alignItems: "center",
    flex: 1,
    gap: 2,
    paddingVertical: 12
  },
  statDivider: {
    backgroundColor: mobileTheme.colors.borderSubtle,
    width: 1
  },
  statValue: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.5
  },
  statLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5
  },

  // ── Collectible card art section
  cardArtSection: {
    paddingHorizontal: mobileTheme.spacing.screenX,
    paddingTop: 20
  },
  cardArtPanel: {
    borderRadius: mobileTheme.radii.lg,
    borderWidth: 1.5,
    overflow: "hidden",
    ...mobileTheme.shadows.card
  },
  cardArtBackdrop: {
    ...StyleSheet.absoluteFillObject
  },
  cardBadgeRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 14
  },
  rarityBadge: {
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  rarityBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2
  },
  cardBadgeRight: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  tierLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1
  },
  activeBadge: {
    backgroundColor: "rgba(15,23,42,0.85)",
    borderRadius: mobileTheme.radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  activeBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1
  },
  cardImageWrap: {
    alignItems: "center",
    aspectRatio: 1.1,
    justifyContent: "center",
    marginHorizontal: 24,
    marginBottom: 8
  },
  cardImage: {
    height: "100%",
    width: "100%"
  },
  cardMascotFallback: {
    fontSize: 72,
    textAlign: "center"
  },
  cardFooter: {
    alignItems: "flex-start",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderTopColor: "rgba(15,23,42,0.06)",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    padding: 16
  },
  cardFooterLeft: {
    flex: 1,
    gap: 4
  },
  cardTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3
  },
  cardSparkle: {
    color: "#94a3b8",
    fontSize: 14
  },
  cardFlavorLine: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 18
  },
  cardMascotBubble: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    elevation: 1,
    height: 44,
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    width: 44
  },
  cardMascotBubbleText: {
    fontSize: 22
  },

  // ── Reviews section
  reviewsSection: {
    gap: 14,
    paddingHorizontal: mobileTheme.spacing.screenX,
    paddingTop: 24
  },
  reviewsSectionHeader: {
    gap: 2
  },
  sectionEyebrow: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  sectionTitle: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3
  },
  reviewList: {
    gap: 10
  },
  reviewRow: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.borderSubtle,
    borderRadius: mobileTheme.radii.md,
    borderWidth: 1,
    gap: 8,
    padding: 14
  },
  reviewRowHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  reviewRowMeta: {
    flex: 1,
    gap: 2
  },
  reviewRowLocation: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "600"
  },
  reviewRowDate: {
    color: mobileTheme.colors.textFaint,
    fontSize: 12
  },
  ratingPill: {
    backgroundColor: mobileTheme.colors.surfaceBrandTint,
    borderColor: mobileTheme.colors.infoBorder,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  ratingPillText: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 12,
    fontWeight: "700"
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  chip: {
    alignItems: "center",
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4
  },
  chipPositive: {
    backgroundColor: "#f0fdf4",
    borderColor: "#86efac"
  },
  chipNegative: {
    backgroundColor: "#fef9ec",
    borderColor: "#fcd34d"
  },
  chipIcon: {
    fontSize: 11
  },
  chipText: {
    fontSize: 11,
    fontWeight: "600"
  },
  chipTextPositive: {
    color: "#15803d"
  },
  chipTextNegative: {
    color: "#92400e"
  },
  reviewRowBody: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 13,
    fontStyle: "italic",
    lineHeight: 19
  },
  reviewsFooter: {
    color: mobileTheme.colors.textFaint,
    fontSize: 12,
    textAlign: "center"
  },

  emptyCard: {
    alignItems: "center",
    margin: mobileTheme.spacing.screenX,
    padding: 40
  },
  emptyText: {
    color: mobileTheme.colors.textFaint,
    fontSize: 15
  }
});
