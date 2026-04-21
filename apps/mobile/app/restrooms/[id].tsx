import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NearbyBathroom, Review, ReviewQuickTag } from "@poopin/domain";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getCachedRestroom,
  getRestroom,
  getRestroomPhotoUrls,
  getRestroomReviews,
  uploadRestroomPhoto
} from "../../src/lib/api";
import type { RestroomPhotoItem } from "../../src/lib/api";
import { mobileTheme } from "../../src/ui/theme";
import { useSession } from "../../src/providers/session-provider";
import { ReviewFormModal } from "../../src/features/restroom-detail/ReviewFormModal";
import { ReviewCard } from "../../src/features/restroom-detail/ReviewCard";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get("window").width;
const GRID_PADDING = mobileTheme.spacing.screenX;
const GRID_GAP = 10;
const THUMB_SIZE = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2;
const INLINE_PHOTO_LIMIT = 6;

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

const openNavigation = (lat: number, lng: number) => {
  const mapsUrl = Platform.OS === "ios" ? `maps://maps.apple.com/?daddr=${lat},${lng}&dirflg=d` : `geo:${lat},${lng}`;
  void Linking.openURL(mapsUrl).catch(() => {
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
  });
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

// ─── Photo gallery with lightbox ─────────────────────────────────────────────

function PhotoGallery({
  photos,
  isLoading,
  hiddenCount
}: {
  photos: RestroomPhotoItem[];
  isLoading: boolean;
  hiddenCount: number;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const showPrev = useCallback(
    () => setLightboxIndex((i) => (i === null ? null : (i - 1 + photos.length) % photos.length)),
    [photos.length]
  );
  const showNext = useCallback(
    () => setLightboxIndex((i) => (i === null ? null : (i + 1) % photos.length)),
    [photos.length]
  );

  const inlinePhotos = photos.slice(0, INLINE_PHOTO_LIMIT);
  const activePhoto = lightboxIndex !== null ? photos[lightboxIndex] ?? null : null;

  if (isLoading) {
    return <ActivityIndicator color={mobileTheme.colors.brandStrong} style={{ alignSelf: "flex-start", marginTop: 4 }} />;
  }

  if (photos.length === 0) {
    return <Text style={styles.emptyNote}>No approved photos yet. Uploads are reviewed before they appear.</Text>;
  }

  return (
    <>
      {/* Grid */}
      <View style={styles.photoGrid}>
        {inlinePhotos.map((photo, index) => {
          const isOverflowTile = hiddenCount > 0 && index === inlinePhotos.length - 1;
          return (
            <Pressable key={photo.id} onPress={() => setLightboxIndex(index)} style={styles.photoGridItem}>
              <Image source={{ uri: photo.thumbnailUrl }} style={styles.photoGridThumb} resizeMode="cover" />
              {isOverflowTile && (
                <View style={styles.overflowOverlay}>
                  <Text style={styles.overflowText}>+{hiddenCount} more</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Lightbox modal */}
      {activePhoto ? (
        <Modal visible animationType="fade" statusBarTranslucent onRequestClose={closeLightbox}>
          <View style={lightboxStyles.container}>
            {/* Close */}
            <Pressable style={lightboxStyles.closeBtn} onPress={closeLightbox} hitSlop={12}>
              <Text style={lightboxStyles.closeBtnText}>✕</Text>
            </Pressable>

            {/* Photo */}
            <Image source={{ uri: activePhoto.url }} style={lightboxStyles.image} resizeMode="contain" />

            {/* Prev/Next */}
            {photos.length > 1 && (
              <>
                <Pressable style={[lightboxStyles.navBtn, lightboxStyles.navLeft]} onPress={showPrev} hitSlop={8}>
                  <Text style={lightboxStyles.navBtnText}>‹</Text>
                </Pressable>
                <Pressable style={[lightboxStyles.navBtn, lightboxStyles.navRight]} onPress={showNext} hitSlop={8}>
                  <Text style={lightboxStyles.navBtnText}>›</Text>
                </Pressable>
              </>
            )}

            {/* Footer */}
            <View style={lightboxStyles.footer}>
              <Text style={lightboxStyles.footerDate}>{formatDate(activePhoto.createdAt)}</Text>
              <Text style={lightboxStyles.footerCount}>
                {(lightboxIndex ?? 0) + 1} / {photos.length}
              </Text>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function RestroomDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();
  const { user } = useSession();

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
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(true);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showReviewForm, setShowReviewForm] = useState(false);

  // Keep a stable ref to the current restroom for callbacks that shouldn't change identity.
  const restroomRef = useRef(restroom);
  useEffect(() => { restroomRef.current = restroom; }, [restroom]);

  useEffect(() => {
    let cancelled = false;

    const loadAll = async () => {
      if (!restroomId) {
        setErrorMessage("Missing restroom id.");
        setIsLoading(false);
        setIsLoadingReviews(false);
        setIsLoadingPhotos(false);
        return;
      }

      const cached = getCachedRestroom(restroomId);
      setRestroom(cached);
      setIsLoading(!cached);

      const [restroomResult, reviewsResult, photosResult] = await Promise.allSettled([
        getRestroom(restroomId),
        getRestroomReviews(restroomId, user?.id ?? null),
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

      if (reviewsResult.status === "fulfilled") setReviews(reviewsResult.value);
      setIsLoadingReviews(false);

      if (photosResult.status === "fulfilled") setPhotos(photosResult.value);
      setIsLoadingPhotos(false);
    };

    void loadAll();
    return () => { cancelled = true; };
  }, [restroomId]);

  const handleReviewSuccess = useCallback(() => {
    setShowReviewForm(false);
    // Refresh reviews after a short delay to let Supabase propagate
    setTimeout(() => {
      if (!restroomId) return;
      void getRestroomReviews(restroomId, user?.id ?? null).then((updated) => setReviews(updated)).catch(() => null);
    }, 600);
  }, [restroomId, user?.id]);

  const handleRequireSignIn = useCallback(() => {
    Alert.alert("Sign in required", "Please sign in to interact with reviews.", [
      { text: "Cancel" },
      { text: "Sign in", onPress: () => router.push("/sign-in") }
    ]);
  }, [router]);

  const handleAddPhoto = useCallback(async () => {
    if (!user) {
      Alert.alert("Sign in required", "Please sign in to upload a restroom photo.", [
        { text: "Cancel" },
        { text: "Sign in", onPress: () => router.push("/sign-in") }
      ]);
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Poopin needs access to your photo library to upload photos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    if (!asset.uri) return;

    setIsUploadingPhoto(true);
    try {
      await uploadRestroomPhoto({
        bathroomId: restroomId,
        imageUri: asset.uri,
        mimeType: asset.mimeType ?? undefined,
        profileId: user.id
      });

      Alert.alert("Photo submitted!", "Your photo has been submitted for review and will appear once approved.");
    } catch (error) {
      Alert.alert("Upload failed", error instanceof Error ? error.message : "Could not upload photo. Please try again.");
    } finally {
      setIsUploadingPhoto(false);
    }
  }, [user, restroomId, router]);

  const handleWriteReview = useCallback(() => {
    if (!user) {
      Alert.alert("Sign in required", "Please sign in to write a review.", [
        { text: "Cancel" },
        { text: "Sign in", onPress: () => router.push("/sign-in") }
      ]);
      return;
    }
    setShowReviewForm(true);
  }, [user, router]);

  const heroPhotoUri = photos[0]?.url ?? restroom?.previewPhotoUrl ?? null;
  const hasRatings = restroom && restroom.ratings.reviewCount > 0 && restroom.ratings.overall > 0;
  const qualitySignals = (restroom?.ratings.qualitySignals ?? []) as ReviewQuickTag[];
  const featureTags = restroom ? buildFeatureTags(restroom) : [];
  const hiddenPhotoCount = Math.max(0, photos.length - INLINE_PHOTO_LIMIT);

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <Stack.Screen options={{ title: restroom?.name ?? "Restroom detail", headerBackButtonDisplayMode: "minimal" }} />

      {/* Native review form modal */}
      {restroom && user ? (
        <ReviewFormModal
          visible={showReviewForm}
          bathroomId={restroom.id}
          restroomName={restroom.name}
          profileId={user.id}
          onClose={() => setShowReviewForm(false)}
          onSuccess={handleReviewSuccess}
        />
      ) : null}

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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

            {/* ── Identity card ── */}
            <View style={styles.mainCard}>
              <Text style={styles.eyebrow}>Restroom listing</Text>
              <Text style={styles.title}>{restroom.name}</Text>
              <Text style={styles.locationText}>{getLocationLine(restroom)}</Text>

              <View style={styles.metaPillRow}>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>{getSourceLabel(restroom.source)}</Text>
                </View>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>Added {formatDate(restroom.created_at)}</Text>
                </View>
              </View>

              {/* Navigate */}
              <Pressable
                onPress={() => openNavigation(restroom.lat, restroom.lng)}
                style={({ pressed }) => [styles.navigateBtn, pressed && styles.btnPressed]}
              >
                <Text style={styles.navigateBtnText}>▶  Navigate</Text>
              </Pressable>

              {/* Write a review */}
              <Pressable
                onPress={handleWriteReview}
                style={({ pressed }) => [styles.outlineBtn, pressed && styles.btnPressed]}
              >
                <Text style={styles.outlineBtnText}>✏  Write a review</Text>
              </Pressable>
            </View>

            {/* ── Ratings card ── */}
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

                {qualitySignals.length > 0 && (
                  <View style={styles.signalRow}>
                    {qualitySignals.map((tag) => {
                      const info = QUICK_TAG_INFO[tag];
                      if (!info) return null;
                      return (
                        <View key={tag} style={[styles.signalChip, info.positive ? styles.signalChipPositive : styles.signalChipNegative]}>
                          <Text style={styles.signalIcon}>{info.icon}</Text>
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

            {/* ── Amenities ── */}
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

            {/* ── Photos ── */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>
                  Photos{!isLoadingPhotos && photos.length > 0 ? ` (${photos.length})` : ""}
                </Text>
              </View>

              <PhotoGallery photos={photos} isLoading={isLoadingPhotos} hiddenCount={hiddenPhotoCount} />

              <Pressable
                onPress={() => void handleAddPhoto()}
                disabled={isUploadingPhoto}
                style={({ pressed }) => [styles.addPhotoBtn, pressed && styles.btnPressed]}
              >
                {isUploadingPhoto ? (
                  <ActivityIndicator size="small" color={mobileTheme.colors.textPrimary} />
                ) : (
                  <Text style={styles.addPhotoBtnText}>📷  Add a photo</Text>
                )}
              </Pressable>

              <Text style={styles.addPhotoHint}>
                {user ? "Photos are reviewed before appearing publicly." : "Sign in to upload a photo."}
              </Text>
            </View>

            {/* ── Reviews ── */}
            <View style={[styles.sectionCard, styles.sectionCardLast]}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>
                  {isLoadingReviews ? "Reviews" : `Recent reviews${reviews.length > 0 ? ` (${reviews.length})` : ""}`}
                </Text>
                <Pressable onPress={handleWriteReview} style={({ pressed }) => [styles.writeReviewLink, pressed && { opacity: 0.7 }]}>
                  <Text style={styles.writeReviewLinkText}>Write a review →</Text>
                </Pressable>
              </View>

              {isLoadingReviews ? (
                <ActivityIndicator color={mobileTheme.colors.brandStrong} style={{ alignSelf: "flex-start" }} />
              ) : reviews.length === 0 ? (
                <View style={styles.noReviewsCard}>
                  <Text style={styles.noReviewsTitle}>Be the first to review</Text>
                  <Text style={styles.noReviewsBody}>
                    Share your experience to help others find clean, accessible restrooms.
                  </Text>
                  <Pressable
                    onPress={handleWriteReview}
                    style={({ pressed }) => [styles.navigateBtn, { marginTop: 14 }, pressed && styles.btnPressed]}
                  >
                    <Text style={styles.navigateBtnText}>Write a review</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.reviewList}>
                  {reviews.map((review) => (
                    <ReviewCard
                      key={review.id}
                      review={review}
                      viewerProfileId={user?.id ?? null}
                      onRequireSignIn={handleRequireSignIn}
                      restroomName={restroom?.name ?? ""}
                      restroomCity={restroom?.city ?? ""}
                    />
                  ))}
                </View>
              )}
            </View>
          </>
        ) : null}
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
    paddingBottom: 52
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
    height: 230,
    backgroundColor: mobileTheme.colors.surfaceMuted
  },
  mainCard: {
    backgroundColor: mobileTheme.colors.surface,
    borderBottomColor: mobileTheme.colors.borderSubtle,
    borderBottomWidth: 1,
    paddingHorizontal: mobileTheme.spacing.screenX,
    paddingTop: 20,
    paddingBottom: 22,
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
    paddingTop: 20,
    paddingBottom: 22,
    gap: 14
  },
  sectionCardLast: {
    borderBottomColor: mobileTheme.colors.borderSubtle,
    borderBottomWidth: 1
  },
  sectionHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
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
    lineHeight: 18
  },
  signalRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  signalChip: {
    alignItems: "center",
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
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
  signalIcon: {
    fontSize: 13
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
  // Photo grid
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP
  },
  photoGridItem: {
    borderRadius: 12,
    height: THUMB_SIZE * 0.72,
    overflow: "hidden",
    width: THUMB_SIZE
  },
  photoGridThumb: {
    width: "100%",
    height: "100%",
    backgroundColor: mobileTheme.colors.surfaceMuted
  },
  overflowOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: "rgba(15,23,42,0.58)",
    justifyContent: "center"
  },
  overflowText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700"
  },
  emptyNote: {
    color: mobileTheme.colors.textFaint,
    fontSize: 14,
    fontStyle: "italic",
    lineHeight: 20
  },
  addPhotoBtn: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.sm,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 46,
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
    lineHeight: 17
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
  reviewList: {
    gap: 12
  },
});

const lightboxStyles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: "rgba(2,6,23,0.96)",
    flex: 1,
    justifyContent: "center"
  },
  closeBtn: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderColor: "rgba(255,255,255,0.25)",
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    position: "absolute",
    right: 16,
    top: 56,
    width: 44,
    zIndex: 10
  },
  closeBtnText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "600"
  },
  image: {
    height: "72%",
    width: "100%"
  },
  navBtn: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderColor: "rgba(255,255,255,0.25)",
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    position: "absolute",
    top: "50%",
    width: 44,
    zIndex: 10
  },
  navLeft: {
    left: 16
  },
  navRight: {
    right: 16
  },
  navBtnText: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "300",
    lineHeight: 32
  },
  footer: {
    bottom: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    position: "absolute",
    width: "100%"
  },
  footerDate: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13
  },
  footerCount: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13
  }
});
