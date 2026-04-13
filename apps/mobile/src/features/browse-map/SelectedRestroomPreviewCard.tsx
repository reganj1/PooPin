import type { NearbyBathroom } from "@poopin/domain";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { mobileTheme } from "../../ui/theme";

interface SelectedRestroomPreviewCardProps {
  restroom: NearbyBathroom;
  onPress: () => void;
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

export function SelectedRestroomPreviewCard({ restroom, onPress }: SelectedRestroomPreviewCardProps) {
  const metadataChips = [getAccessLabel(restroom.access_type)];

  if (restroom.is_accessible) {
    metadataChips.push("Accessible");
  }

  if (restroom.is_gender_neutral) {
    metadataChips.push("Gender neutral");
  }

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}>
      <View style={styles.headerRow}>
        <View style={styles.copyColumn}>
          <Text style={styles.eyebrow}>Selected restroom</Text>
          <Text numberOfLines={1} style={styles.title}>
            {restroom.name}
          </Text>
          <Text numberOfLines={1} style={styles.location}>
            {toLocationLine(restroom)}
          </Text>
        </View>

        <View style={styles.distanceBadge}>
          <Text style={styles.distanceText}>
            {typeof restroom.distanceMiles === "number" ? `${restroom.distanceMiles.toFixed(1)} mi` : "Nearby"}
          </Text>
        </View>
      </View>

      <View style={styles.metadataRow}>
        {metadataChips.map((chip) => (
          <View key={chip} style={styles.metadataChip}>
            <Text style={styles.metadataChipText}>{chip}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.rating}>{formatRatingLabel(restroom)}</Text>

      <View style={styles.ctaRow}>
        <Text style={styles.detailHint}>View restroom details</Text>
        <Text style={styles.ctaHint}>Public listing</Text>
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
  title: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 17,
    fontWeight: "700"
  },
  location: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4
  },
  metadataRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12
  },
  metadataChip: {
    backgroundColor: mobileTheme.colors.surfaceBrandTint,
    borderColor: mobileTheme.colors.infoBorder,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  metadataChipText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "600"
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
  distanceText: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 12,
    fontWeight: "700"
  },
  rating: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10
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
  detailHint: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 13,
    fontWeight: "700"
  },
  ctaHint: {
    color: mobileTheme.colors.textFaint,
    fontSize: 12,
    fontWeight: "600"
  }
});
