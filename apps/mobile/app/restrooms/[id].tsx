import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import type { NearbyBathroom, Review, ReviewQuickTag } from "@poopin/domain";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { getCachedRestroom, getRestroom, getRestroomPhotoUrls, getRestroomReviews } from "../../src/lib/api";
import type { RestroomPhotoItem } from "../../src/lib/api";
import { mobileEnv } from "../../src/lib/env";
import { mobileTheme } from "../../src/ui/theme";

// ─── Helpers ────────────────────────────────────────────────────────────────

const getLocationLine = (r: NearbyBathroom) => [r.address, r.city, r.state].filter(Boolean).join(", ");

const getSourceLabel = (source: NearbyBathroom["source"]) => {
  switch (source) {
    case "openstreetmap":
      return "Community mapped";
    case "city_open_data":
      return "City open data";
    case "google_places":
      return "Google Places";
    case "la_controller":
      return "LA Controller";
    case "partner":
      return "Partner listing";
    case "user":
      return "User submitted";
    default:
      return "Other source";
  }
};

const getAccessLabel = (accessType: NearbyBathroom["access_type"]) => {
  switch (accessType) {
    case "customer_only":
      return "Customer only";
    case "code_required":
      return "Code required";
    case "staff_assisted":
      return "Staff assisted";
    default:
      return "Public";
  }
};

const buildFeatureTags = (r: NearbyBathroom) => {
  const tags = [getAccessLabel(r.access_type)];
  if (r.is_accessible) tags.push("Accessible");
  if (r.is_gender_neutral) tags.push("Gender neutral");
  if (r.has_baby_station) tags.push("Baby station");
  if (r.requires_purchase) tags.push("Requires purchase");
  return tags;
};

const QUICK_TAG_INFO: Record<ReviewQuickTag, { label: string; positive: boolean }> = {
  clean: { label: "Clean", positive: true },
  smelly: { label: "Smelly", positive: false },
  no_line: { label: "No wait", positive: true },
  crowded: { label: "Crowded", positive: false },
  no_toilet_paper: { label: "No paper", positive: false },
  locked: { label: "Often locked", positive: false }
};

const formatDate = (value: string) => {
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
  } catch {
    return value;
  }
};

const openNavigation = (lat: number, lng: number) => {
  const mapsUrl = Platform.OS === "ios" ? `maps://maps.apple.com/?daddr=${lat},${lng}&dirflg=d` : `geo:${lat},${lng}`;
  void Linking.openURL(mapsUrl).catch(() => {
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
  });
};

const openWebPage = (restroomId: string, hash?: string) => {
  const base = mobileEnv.apiBaseUrl.replace(/\/$/, "");
  void Linking.openURL(`${base}/restroom/${restroomId}${hash ?? ""}`);
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function RatingPill({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.ratingPill}>
      <Text style={styles.ratingPillLabel}>{label}</Text>
      <Text style={styles.ratingPillValue}>{value.toFixed(1)}</Text>
    </View>
  );
}

function ReviewCard({ review }: { review: Review }) {
  const tags = (review.quick_tags ?? []) as ReviewQuickTag[];
  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <View style={styles.reviewHeaderLeft}>
          <Text style={styles.reviewAuthor}>{review.author_display_name ?? "Anonymous"}</Text>
          <Text style={styles.reviewDate}>Visited {formatDate(review.visit_time)}</Text>
        </View>
        <View style={styles.reviewRatingBadge}>
          <Text style={styles.reviewRatingText}>Overall {review.overall_rating.toFixed(1)}</Text>
        </View>
      </View>

      {tags.length > 0 && (
        <View style={styles.tagRow}>
          {tags.map((tag) => {
            const info = QUICK_TAG_INFO[tag];
            if (!info) return null;
            return (
              <View key={tag} style={[styles.signalChip, info.positive ? styles.signalChipPositive : styles.signalChipNegative]}>
                <Text style={[styles.signalChipText, info.positive ? styles.signalChipTextPositive : styles.signalChipTextNegative]}>
                  {info.label}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {review.review_text ? (
        <Text style={styles.reviewText}>{review.review_text}</Text>
      ) : (
        <Text style={styles.reviewTextEmpty}>No additional notes shared.</Text>
      )}
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function RestroomDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();

  const restroomId = useMemo(() => {
    const resolved = Array.isArray(params.id) ? params.id[0] : params.id;
    return typeof resolved === "string" ? resolved : "";
  }, [params.id]);

  const initialCachedRestroom = restroomId ? getCachedRestroom(restroomId) : null;
  const [restroom, setRestroom] = useState<NearbyBathroom | null>(initialCachedRestroom);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [photos, setPhotos] = useState<RestroomPhotoItem[]>([]);
  const [isLoading, setIsLoading] = useState(!initialCachedRestroom);
  const [isLoadingReviews, setIsLoadingReviews] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadAll = async () => {
      if (!restroomId) {
        setErrorMessage("Missing restroom id.");
        setIsLoading(false);
        setIsLoadingReviews(false);
        return;
      }

      const cached = getCachedRestroom(restroomId);
      setRestroom(cached);
      setIsLoading(!cached);

      const [restroomResult, reviewsResult, photosResult] = await Promise.allSettled([
        getRestroom(restroomId),
        getRestroomReviews(restroomId),
        getRestroomPhotoUrls(restroomId)
      ]);

      if (cancelled) return;

      if (restroomResult.status === "fulfilled") {
        setRestroom(restroomResult.value.restroom);
        setErrorMessage(null);
      } else if (!cached) {
        const err = restroomResult.reason;
        setErrorMessage(err instanceof Error ? err.message : "Could not load this restroom right now.");
      }
      setIsLoading(false);

      if (reviewsResult.status === "fulfilled") {
        setReviews(reviewsResult.value);
      }
      setIsLoadingReviews(false);

      if (photosResult.status === "fulfilled") {
        setPhotos(photosResult.value);
      }
    };

    void loadAll();
    return () => {
      cancelled = true;
    };
  }, [restroomId]);

  const heroPhotoUri = photos[0]?.url ?? restroom?.previewPhotoUrl ?? null;
  const hasRatings = restroom && restroom.ratings.reviewCount > 0 && restroom.ratings.overall > 0;
  const qualitySignals = (restroom?.ratings.qualitySignals ?? []) as ReviewQuickTag[];
  const featureTags = restroom ? buildFeatureTags(restroom) : [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: restroom?.name ?? "Restroom detail" }} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Back link */}
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backLink, pressed && { opacity: 0.7 }]}>
          <Text style={styles.backLinkText}>← Back</Text>
        </Pressable>

        {isLoading && !restroom ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={mobileTheme.colors.brandStrong} />
            <Text style={styles.stateText}>Loading restroom details…</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.errorStateCard}>
            <Text style={styles.errorTitle}>Unable to load restroom</Text>
            <Text style={styles.errorStateText}>{errorMessage}</Text>
          </View>
        ) : restroom ? (
          <>
            {/* Hero photo */}
            {heroPhotoUri ? (
              <Image source={{ uri: heroPhotoUri }} style={styles.heroPhoto} resizeMode="cover" />
            ) : null}

            {/* Main content card */}
            <View style={styles.mainCard}>
              {/* Eyebrow + name + location */}
              <Text style={styles.eyebrow}>Restroom listing</Text>
              <Text style={styles.title}>{restroom.name}</Text>
              <Text style={styles.locationText}>{getLocationLine(restroom)}</Text>

              {/* Meta pills */}
              <View style={styles.metaPillRow}>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>{getSourceLabel(restroom.source)}</Text>
                </View>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>Added {formatDate(restroom.created_at)}</Text>
                </View>
              </View>

              {/* Navigate button */}
              <Pressable
                onPress={() => openNavigation(restroom.lat, restroom.lng)}
                style={({ pressed }) => [styles.navigateBtn, pressed && styles.btnPressed]}
              >
                <Text style={styles.navigateBtnText}>▶  Navigate</Text>
              </Pressable>

              {/* Write a review button */}
              <Pressable
                onPress={() => openWebPage(restroom.id, "?intent=review#add-review")}
                style={({ pressed }) => [styles.outlineBtn, pressed && styles.btnPressed]}
              >
                <Text style={styles.outlineBtnText}>✏  Write a review</Text>
              </Pressable>
            </View>

            {/* Ratings card */}
            {hasRatings ? (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Ratings</Text>
                <View style={styles.ratingPillRow}>
                  <RatingPill label="Overall" value={restroom.ratings.overall} />
                  {restroom.ratings.smell > 0 && <RatingPill label="Smell" value={restroom.ratings.smell} />}
                  {restroom.ratings.cleanliness > 0 && <RatingPill label="Cleanliness" value={restroom.ratings.cleanliness} />}
                </View>
                <Text style={styles.reviewCountNote}>
                  Based on {restroom.ratings.reviewCount} review{restroom.ratings.reviewCount === 1 ? "" : "s"}
                </Text>

                {/* Quality signals */}
                {qualitySignals.length > 0 && (
                  <View style={styles.signalRow}>
                    {qualitySignals.map((tag) => {
                      const info = QUICK_TAG_INFO[tag];
                      if (!info) return null;
                      return (
                        <View key={tag} style={[styles.signalChip, info.positive ? styles.signalChipPositive : styles.signalChipNegative]}>
                          <Text style={[styles.signalChipText, info.positive ? styles.signalChipTextPositive : styles.signalChipTextNegative]}>
                            {info.label}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            ) : null}

            {/* Feature tags */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Access &amp; amenities</Text>
              <View style={styles.tagWrap}>
                {featureTags.map((tag) => (
                  <View key={tag} style={styles.featureTag}>
                    <Text style={styles.featureTagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Photos section */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Photos</Text>

              {photos.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
                  {photos.map((photo) => (
                    <Image key={photo.id} source={{ uri: photo.url }} style={styles.photoItem} resizeMode="cover" />
                  ))}
                </ScrollView>
              ) : (
                <Text style={styles.emptyNote}>No approved photos yet.</Text>
              )}

              <Pressable
                onPress={() => openWebPage(restroom.id, "?intent=photo#photos")}
                style={({ pressed }) => [styles.addPhotoBtn, pressed && styles.btnPressed]}
              >
                <Text style={styles.addPhotoBtnText}>📷  Add a photo</Text>
              </Pressable>
              <Text style={styles.addPhotoHint}>Sign in on the web to upload. Photos are reviewed before appearing publicly.</Text>
            </View>

            {/* Reviews section */}
            <View style={[styles.sectionCard, styles.sectionCardLast]}>
              <View style={styles.reviewsHeader}>
                <Text style={styles.sectionTitle}>
                  {isLoadingReviews ? "Reviews" : `Recent reviews${reviews.length > 0 ? ` (${reviews.length})` : ""}`}
                </Text>
                <Pressable
                  onPress={() => openWebPage(restroom.id, "?intent=review#add-review")}
                  style={({ pressed }) => [styles.writeReviewLink, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.writeReviewLinkText}>Write a review →</Text>
                </Pressable>
              </View>

              {isLoadingReviews ? (
                <ActivityIndicator color={mobileTheme.colors.brandStrong} style={{ marginTop: 8 }} />
              ) : reviews.length === 0 ? (
                <View style={styles.noReviewsCard}>
                  <Text style={styles.noReviewsTitle}>Be the first to review</Text>
                  <Text style={styles.noReviewsBody}>Share your experience to help others find clean, accessible restrooms.</Text>
                  <Pressable
                    onPress={() => openWebPage(restroom.id, "?intent=review#add-review")}
                    style={({ pressed }) => [styles.navigateBtn, { marginTop: 12 }, pressed && styles.btnPressed]}
                  >
                    <Text style={styles.navigateBtnText}>Write a review</Text>
                  </Pressable>
                </View>
              ) : (
                reviews.map((review) => <ReviewCard key={review.id} review={review} />)
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: mobileTheme.colors.pageBackground
  },
  scrollContent: {
    paddingBottom: 48
  },
  backLink: {
    paddingHorizontal: mobileTheme.spacing.screenX,
    paddingTop: 14,
    paddingBottom: 6
  },
  backLinkText: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 14,
    fontWeight: "600"
  },
  stateCard: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.borderSubtle,
    borderRadius: mobileTheme.radii.lg,
    borderWidth: 1,
    gap: 12,
    margin: mobileTheme.spacing.screenX,
    padding: 28,
    ...mobileTheme.shadows.card
  },
  stateText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center"
  },
  errorStateCard: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.errorTint,
    borderColor: mobileTheme.colors.errorBorder,
    borderRadius: mobileTheme.radii.lg,
    borderWidth: 1,
    gap: 12,
    margin: mobileTheme.spacing.screenX,
    padding: 24,
    ...mobileTheme.shadows.card
  },
  errorTitle: {
    color: mobileTheme.colors.errorText,
    fontSize: 17,
    fontWeight: "700"
  },
  errorStateText: {
    color: mobileTheme.colors.errorText,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center"
  },
  heroPhoto: {
    width: "100%",
    height: 220,
    backgroundColor: mobileTheme.colors.surfaceMuted
  },
  mainCard: {
    backgroundColor: mobileTheme.colors.surface,
    borderBottomColor: mobileTheme.colors.borderSubtle,
    borderBottomWidth: 1,
    paddingHorizontal: mobileTheme.spacing.screenX,
    paddingVertical: 20,
    gap: 14
  },
  eyebrow: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  title: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 26,
    fontWeight: "700",
    lineHeight: 32,
    marginTop: -2
  },
  locationText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: -4
  },
  metaPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  pill: {
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  pillText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "600"
  },
  navigateBtn: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.brandDeep,
    borderRadius: mobileTheme.radii.sm,
    justifyContent: "center",
    paddingVertical: 14
  },
  navigateBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.3
  },
  outlineBtn: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.sm,
    borderWidth: 1.5,
    justifyContent: "center",
    paddingVertical: 13
  },
  outlineBtnText: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "600"
  },
  btnPressed: {
    opacity: 0.8
  },
  sectionCard: {
    backgroundColor: mobileTheme.colors.surface,
    borderTopColor: mobileTheme.colors.borderSubtle,
    borderTopWidth: 1,
    paddingHorizontal: mobileTheme.spacing.screenX,
    paddingVertical: 20,
    gap: 14
  },
  sectionCardLast: {
    borderBottomColor: mobileTheme.colors.borderSubtle,
    borderBottomWidth: 1
  },
  sectionTitle: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 17,
    fontWeight: "700"
  },
  ratingPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  ratingPill: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surfaceBrandTint,
    borderColor: mobileTheme.colors.infoBorder,
    borderRadius: mobileTheme.radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  ratingPillLabel: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 13,
    fontWeight: "600"
  },
  ratingPillValue: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 17,
    fontWeight: "700"
  },
  reviewCountNote: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: -4
  },
  signalRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  signalChip: {
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  signalChipPositive: {
    backgroundColor: "#f0fdf4",
    borderColor: "#86efac"
  },
  signalChipNegative: {
    backgroundColor: "#fef9ec",
    borderColor: "#fcd34d"
  },
  signalChipText: {
    fontSize: 13,
    fontWeight: "600"
  },
  signalChipTextPositive: {
    color: "#15803d"
  },
  signalChipTextNegative: {
    color: "#92400e"
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  featureTag: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  featureTagText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 13,
    fontWeight: "600"
  },
  photoScroll: {
    marginHorizontal: -mobileTheme.spacing.screenX,
    paddingHorizontal: mobileTheme.spacing.screenX
  },
  photoItem: {
    width: 160,
    height: 120,
    borderRadius: 12,
    marginRight: 10,
    backgroundColor: mobileTheme.colors.surfaceMuted
  },
  emptyNote: {
    color: mobileTheme.colors.textFaint,
    fontSize: 14,
    fontStyle: "italic"
  },
  addPhotoBtn: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.sm,
    borderWidth: 1,
    justifyContent: "center",
    paddingVertical: 12
  },
  addPhotoBtnText: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "600"
  },
  addPhotoHint: {
    color: mobileTheme.colors.textFaint,
    fontSize: 12,
    lineHeight: 17,
    marginTop: -4
  },
  reviewsHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  writeReviewLink: {
    paddingVertical: 4
  },
  writeReviewLinkText: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 13,
    fontWeight: "600"
  },
  noReviewsCard: {
    backgroundColor: mobileTheme.colors.pageBackground,
    borderColor: mobileTheme.colors.borderSubtle,
    borderRadius: mobileTheme.radii.md,
    borderWidth: 1,
    padding: 18
  },
  noReviewsTitle: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 6
  },
  noReviewsBody: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19
  },
  reviewCard: {
    backgroundColor: mobileTheme.colors.pageBackground,
    borderColor: mobileTheme.colors.borderSubtle,
    borderRadius: mobileTheme.radii.md,
    borderWidth: 1,
    gap: 10,
    padding: 16
  },
  reviewHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8
  },
  reviewHeaderLeft: {
    flex: 1,
    gap: 2
  },
  reviewAuthor: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "700"
  },
  reviewDate: {
    color: mobileTheme.colors.textFaint,
    fontSize: 12
  },
  reviewRatingBadge: {
    backgroundColor: mobileTheme.colors.surfaceBrandTint,
    borderColor: mobileTheme.colors.infoBorder,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  reviewRatingText: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 12,
    fontWeight: "700"
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  reviewText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    fontStyle: "italic"
  },
  reviewTextEmpty: {
    color: mobileTheme.colors.textFaint,
    fontSize: 13,
    fontStyle: "italic"
  }
});
