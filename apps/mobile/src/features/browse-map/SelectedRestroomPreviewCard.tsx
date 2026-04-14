import type { NearbyBathroom } from "@poopin/domain";
import { Image, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { mobileTheme } from "../../ui/theme";

interface SelectedRestroomPreviewCardProps {
  restroom: NearbyBathroom;
  onPress: () => void;
  variant?: "standalone" | "sheet" | "compact";
}

const toLocationLine = (restroom: NearbyBathroom) => [restroom.city, restroom.state].filter(Boolean).join(", ");

const formatRatingLabel = (restroom: NearbyBathroom) => {
  if (restroom.ratings.reviewCount <= 0 || restroom.ratings.overall <= 0) {
    return "No reviews yet";
  }

  return `⭐ ${restroom.ratings.overall.toFixed(1)} · ${restroom.ratings.reviewCount} review${restroom.ratings.reviewCount === 1 ? "" : "s"}`;
};

const openNavigation = (lat: number, lng: number) => {
  const mapsUrl =
    Platform.OS === "ios" ? `maps://maps.apple.com/?daddr=${lat},${lng}&dirflg=d` : `geo:${lat},${lng}`;

  void Linking.openURL(mapsUrl).catch(() => {
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
  });
};

export function SelectedRestroomPreviewCard({ restroom, onPress, variant = "standalone" }: SelectedRestroomPreviewCardProps) {
  const isCompact = variant === "compact";
  const photoUri = restroom.previewPhotoUrl ?? null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, isCompact && styles.cardCompact, pressed && styles.cardPressed]}
    >
      {/* Header: photo + info + distance */}
      <View style={styles.headerRow}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={[styles.thumbnail, isCompact && styles.thumbnailCompact]} resizeMode="cover" />
        ) : (
          <View style={[styles.thumbnailPlaceholder, isCompact && styles.thumbnailCompact]}>
            <Text style={styles.thumbnailPlaceholderText}>WC</Text>
          </View>
        )}

        <View style={styles.infoColumn}>
          <Text numberOfLines={1} style={[styles.title, isCompact && styles.titleCompact]}>
            {restroom.name}
          </Text>
          <Text numberOfLines={1} style={[styles.location, isCompact && styles.locationCompact]}>
            {toLocationLine(restroom)}
          </Text>
          <Text style={[styles.rating, isCompact && styles.ratingCompact]}>{formatRatingLabel(restroom)}</Text>
        </View>

        <View style={[styles.distanceBadge, isCompact && styles.distanceBadgeCompact]}>
          <Text style={[styles.distanceText, isCompact && styles.distanceTextCompact]}>
            {typeof restroom.distanceMiles === "number" ? `${restroom.distanceMiles.toFixed(1)} mi` : "Nearby"}
          </Text>
        </View>
      </View>

      {/* Navigate button — nested Pressable so taps don't bubble to outer card */}
      <Pressable
        onPress={() => openNavigation(restroom.lat, restroom.lng)}
        style={({ pressed }) => [styles.navigateBtn, pressed && styles.navigateBtnPressed]}
      >
        <Text style={styles.navigateBtnText}>▶  Navigate</Text>
      </Pressable>
    </Pressable>
  );
}

const THUMBNAIL_SIZE = 68;
const THUMBNAIL_SIZE_COMPACT = 58;

const styles = StyleSheet.create({
  card: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.borderSubtle,
    borderRadius: mobileTheme.radii.lg,
    borderWidth: 1,
    padding: 14,
    gap: 12,
    ...mobileTheme.shadows.hero
  },
  cardCompact: {
    borderRadius: 18,
    padding: 12,
    gap: 10,
    shadowRadius: 14
  },
  cardPressed: {
    opacity: 0.94
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  thumbnail: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: 12,
    backgroundColor: mobileTheme.colors.surfaceMuted,
    flexShrink: 0
  },
  thumbnailCompact: {
    width: THUMBNAIL_SIZE_COMPACT,
    height: THUMBNAIL_SIZE_COMPACT,
    borderRadius: 10
  },
  thumbnailPlaceholder: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: 12,
    backgroundColor: mobileTheme.colors.surfaceBrandTint,
    borderColor: mobileTheme.colors.infoBorder,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0
  },
  thumbnailPlaceholderText: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5
  },
  infoColumn: {
    flex: 1,
    gap: 3
  },
  title: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 20
  },
  titleCompact: {
    fontSize: 15
  },
  location: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 17
  },
  locationCompact: {
    fontSize: 12
  },
  rating: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1
  },
  ratingCompact: {
    fontSize: 11
  },
  distanceBadge: {
    alignSelf: "flex-start",
    backgroundColor: mobileTheme.colors.surfaceBrandTintStrong,
    borderColor: mobileTheme.colors.infoBorder,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  distanceBadgeCompact: {
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  distanceText: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 12,
    fontWeight: "700"
  },
  distanceTextCompact: {
    fontSize: 11
  },
  navigateBtn: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.brandDeep,
    borderRadius: mobileTheme.radii.sm,
    justifyContent: "center",
    paddingVertical: 11
  },
  navigateBtnPressed: {
    opacity: 0.82
  },
  navigateBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.3
  }
});
