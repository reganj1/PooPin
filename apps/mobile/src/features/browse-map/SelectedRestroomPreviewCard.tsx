import type { NearbyBathroom } from "@poopin/domain";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { mobileTheme } from "../../ui/theme";

interface SelectedRestroomPreviewCardProps {
  restroom: NearbyBathroom;
  onPress: () => void;
  variant?: "standalone" | "sheet" | "compact";
}

const toLocationLine = (restroom: NearbyBathroom) => [restroom.address, restroom.city, restroom.state].filter(Boolean).join(", ");

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

const formatRatingLabel = (restroom: NearbyBathroom) => {
  if (restroom.ratings.reviewCount <= 0 || restroom.ratings.overall <= 0) {
    return "No reviews yet";
  }

  return `${restroom.ratings.overall.toFixed(1)} overall • ${restroom.ratings.reviewCount} review${restroom.ratings.reviewCount === 1 ? "" : "s"}`;
};

export function SelectedRestroomPreviewCard({
  restroom,
  onPress,
  variant = "standalone"
}: SelectedRestroomPreviewCardProps) {
  const metadataChips = [getAccessLabel(restroom.access_type)];
  const isSheetVariant = variant === "sheet";
  const isCompactVariant = variant === "compact";

  if (restroom.is_accessible) {
    metadataChips.push("Accessible");
  }

  if (restroom.is_gender_neutral) {
    metadataChips.push("Gender neutral");
  }

  const visibleMetadataChips = isCompactVariant ? metadataChips.slice(0, 2) : metadataChips;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isSheetVariant ? styles.cardSheet : null,
        isCompactVariant ? styles.cardCompact : null,
        pressed ? styles.cardPressed : null
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.copyColumn}>
          <Text style={[styles.eyebrow, isCompactVariant ? styles.eyebrowCompact : null]}>Selected restroom</Text>
          <Text numberOfLines={1} style={[styles.title, isCompactVariant ? styles.titleCompact : null]}>
            {restroom.name}
          </Text>
          <Text numberOfLines={1} style={[styles.location, isCompactVariant ? styles.locationCompact : null]}>
            {toLocationLine(restroom)}
          </Text>
        </View>

        <View style={[styles.distanceBadge, isCompactVariant ? styles.distanceBadgeCompact : null]}>
          <Text style={[styles.distanceText, isCompactVariant ? styles.distanceTextCompact : null]}>
            {typeof restroom.distanceMiles === "number" ? `${restroom.distanceMiles.toFixed(1)} mi` : "Nearby"}
          </Text>
        </View>
      </View>

      <View style={[styles.metadataRow, isCompactVariant ? styles.metadataRowCompact : null]}>
        {visibleMetadataChips.map((chip) => (
          <View key={chip} style={[styles.metadataChip, isCompactVariant ? styles.metadataChipCompact : null]}>
            <Text style={[styles.metadataChipText, isCompactVariant ? styles.metadataChipTextCompact : null]}>{chip}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.rating, isCompactVariant ? styles.ratingCompact : null]}>{formatRatingLabel(restroom)}</Text>

      <View style={[styles.ctaRow, isCompactVariant ? styles.ctaRowCompact : null]}>
        <Text style={[styles.detailHint, isCompactVariant ? styles.detailHintCompact : null]}>View restroom details</Text>
        <Text style={[styles.ctaHint, isCompactVariant ? styles.ctaHintCompact : null]}>Public listing</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.borderSubtle,
    borderRadius: mobileTheme.radii.lg,
    borderWidth: 1,
    padding: 16,
    ...mobileTheme.shadows.hero
  },
  cardSheet: {
    borderRadius: mobileTheme.radii.md,
    padding: 14,
    shadowRadius: 18
  },
  cardCompact: {
    borderRadius: 18,
    padding: 12,
    shadowRadius: 14
  },
  cardPressed: {
    opacity: 0.94
  },
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  copyColumn: {
    flex: 1,
    paddingRight: 12
  },
  eyebrow: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.1,
    marginBottom: 6,
    textTransform: "uppercase"
  },
  eyebrowCompact: {
    fontSize: 10,
    letterSpacing: 0.9,
    marginBottom: 4
  },
  title: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 17,
    fontWeight: "700"
  },
  titleCompact: {
    fontSize: 15
  },
  location: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4
  },
  locationCompact: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 3
  },
  metadataRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12
  },
  metadataRowCompact: {
    gap: 6,
    marginTop: 10
  },
  metadataChip: {
    backgroundColor: mobileTheme.colors.surfaceBrandTint,
    borderColor: mobileTheme.colors.infoBorder,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  metadataChipCompact: {
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  metadataChipText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "600"
  },
  metadataChipTextCompact: {
    fontSize: 11
  },
  distanceBadge: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surfaceBrandTintStrong,
    borderColor: mobileTheme.colors.infoBorder,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  distanceBadgeCompact: {
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  distanceText: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 12,
    fontWeight: "700"
  },
  distanceTextCompact: {
    fontSize: 11
  },
  rating: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10
  },
  ratingCompact: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 8
  },
  ctaRow: {
    alignItems: "center",
    borderColor: mobileTheme.colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12
  },
  ctaRowCompact: {
    marginTop: 10,
    paddingTop: 10
  },
  detailHint: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 13,
    fontWeight: "700"
  },
  detailHintCompact: {
    fontSize: 12,
    fontWeight: "600"
  },
  ctaHint: {
    color: mobileTheme.colors.textFaint,
    fontSize: 12,
    fontWeight: "600"
  },
  ctaHintCompact: {
    fontSize: 11
  }
});
