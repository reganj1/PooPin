import type { NearbyBathroom } from "@poopin/domain";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { mobileTheme } from "../../ui/theme";
import { SelectedRestroomPreviewCard } from "./SelectedRestroomPreviewCard";

type MapSheetState = "collapsed" | "expanded";

interface MapResultsSheetProps {
  sheetState: MapSheetState;
  selectedRestroom: NearbyBathroom | null;
  restrooms: NearbyBathroom[];
  selectedRestroomId: string | null;
  onToggleSheet: () => void;
  onExpand: () => void;
  onCollapse: () => void;
  onSelectRestroom: (restroomId: string) => void;
  onPressDetails: (restroomId: string) => void;
}

const toLocationLine = (restroom: NearbyBathroom) => [restroom.address, restroom.city, restroom.state].filter(Boolean).join(", ");

const formatRatingLabel = (restroom: NearbyBathroom) => {
  if (restroom.ratings.reviewCount <= 0 || restroom.ratings.overall <= 0) {
    return "No reviews yet";
  }

  return `${restroom.ratings.overall.toFixed(1)} overall • ${restroom.ratings.reviewCount} review${restroom.ratings.reviewCount === 1 ? "" : "s"}`;
};

const formatDistanceLabel = (restroom: NearbyBathroom) =>
  typeof restroom.distanceMiles === "number" ? `${restroom.distanceMiles.toFixed(1)} mi` : "Nearby";

export function MapResultsSheet({
  sheetState,
  selectedRestroom,
  restrooms,
  selectedRestroomId,
  onToggleSheet,
  onExpand,
  onCollapse,
  onSelectRestroom,
  onPressDetails
}: MapResultsSheetProps) {
  if (sheetState === "collapsed") {
    if (!selectedRestroom) {
      return (
        <View pointerEvents="box-none" style={styles.overlay}>
          <Pressable onPress={onToggleSheet} style={({ pressed }) => [styles.collapsedSummary, pressed ? styles.cardPressed : null]}>
            <View style={styles.handle} />
            <View style={styles.collapsedSummaryRow}>
              <View>
                <Text style={styles.sheetTitle}>Nearby results</Text>
                <Text style={styles.sheetSubtitle}>{restrooms.length} in current map area</Text>
              </View>
              <View style={styles.headerActionPill}>
                <Text style={styles.headerActionText}>Show</Text>
              </View>
            </View>
          </Pressable>
        </View>
      );
    }

    return (
      <View pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.collapsedSelectionCard}>
          <Pressable onPress={onToggleSheet} style={({ pressed }) => [styles.sheetHeader, pressed ? styles.cardPressed : null]}>
            <View style={styles.handle} />
            <View style={styles.sheetHeaderRow}>
              <View>
                <Text style={styles.sheetTitle}>Nearby results</Text>
                <Text style={styles.sheetSubtitle}>{restrooms.length} in current map area</Text>
              </View>
              <View style={styles.headerActionPill}>
                <Text style={styles.headerActionText}>Show</Text>
              </View>
            </View>
          </Pressable>

          <SelectedRestroomPreviewCard onPress={() => onPressDetails(selectedRestroom.id)} restroom={selectedRestroom} variant="sheet" />
        </View>
      </View>
    );
  }

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <View style={styles.expandedSheet}>
        <Pressable onPress={onToggleSheet} style={({ pressed }) => [styles.sheetHeader, pressed ? styles.cardPressed : null]}>
          <View style={styles.handle} />
          <View style={styles.sheetHeaderRow}>
            <View>
              <Text style={styles.sheetTitle}>Nearby results</Text>
              <Text style={styles.sheetSubtitle}>{restrooms.length} in current map area</Text>
            </View>
            <View style={styles.headerActionPill}>
              <Text style={styles.headerActionText}>Hide</Text>
            </View>
          </View>
        </Pressable>

        {selectedRestroom ? (
          <View style={styles.selectedSummary}>
            <Text style={styles.selectedSummaryEyebrow}>Selected on map</Text>
            <Text numberOfLines={1} style={styles.selectedSummaryTitle}>
              {selectedRestroom.name}
            </Text>
          </View>
        ) : null}

        <FlatList
          contentContainerStyle={styles.resultsListContent}
          data={restrooms}
          keyExtractor={(item) => item.id}
          style={styles.resultsList}
          renderItem={({ item }) => {
            const isSelected = item.id === selectedRestroomId;

            return (
              <View style={[styles.resultRow, isSelected ? styles.resultRowSelected : null]}>
                <Pressable onPress={() => onSelectRestroom(item.id)} style={({ pressed }) => [styles.resultMainPressable, pressed ? styles.cardPressed : null]}>
                  <View style={styles.resultHeader}>
                    <Text numberOfLines={1} style={styles.resultTitle}>
                      {item.name}
                    </Text>
                    <View style={styles.distanceBadge}>
                      <Text style={styles.distanceText}>{formatDistanceLabel(item)}</Text>
                    </View>
                  </View>
                  <Text numberOfLines={1} style={styles.resultLocation}>
                    {toLocationLine(item)}
                  </Text>
                  <Text style={styles.resultRating}>{formatRatingLabel(item)}</Text>
                </Pressable>

                <View style={styles.resultFooter}>
                  <Text style={styles.resultFooterLabel}>{isSelected ? "Selected" : "Visible on map"}</Text>
                  <Pressable onPress={() => onPressDetails(item.id)} style={({ pressed }) => [styles.detailsButton, pressed ? styles.cardPressed : null]}>
                    <Text style={styles.detailsButtonText}>Details</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end"
  },
  collapsedSummary: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.borderSubtle,
    borderTopLeftRadius: mobileTheme.radii.xl,
    borderTopRightRadius: mobileTheme.radii.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    minHeight: 78,
    paddingBottom: 12,
    paddingHorizontal: 18,
    paddingTop: 10,
    ...mobileTheme.shadows.hero
  },
  collapsedSelectionCard: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.borderSubtle,
    borderTopLeftRadius: mobileTheme.radii.xl,
    borderTopRightRadius: mobileTheme.radii.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    maxHeight: 230,
    paddingBottom: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
    ...mobileTheme.shadows.hero
  },
  expandedSheet: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.borderSubtle,
    borderTopLeftRadius: mobileTheme.radii.xl,
    borderTopRightRadius: mobileTheme.radii.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    height: "56%",
    minHeight: 300,
    overflow: "hidden",
    ...mobileTheme.shadows.hero
  },
  handle: {
    alignSelf: "center",
    backgroundColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.pill,
    height: 5,
    marginBottom: 10,
    width: 42
  },
  sheetHeader: {
    paddingBottom: 12,
    paddingHorizontal: 18,
    paddingTop: 10
  },
  sheetHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  collapsedSummaryRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  sheetTitle: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "700"
  },
  sheetSubtitle: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    marginTop: 3
  },
  headerActionPill: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    minWidth: 62,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  headerActionText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "700"
  },
  selectedSummary: {
    backgroundColor: mobileTheme.colors.surfaceBrandTint,
    borderColor: mobileTheme.colors.infoBorder,
    borderRadius: mobileTheme.radii.md,
    borderWidth: 1,
    marginBottom: 10,
    marginHorizontal: 14,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  selectedSummaryEyebrow: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase"
  },
  selectedSummaryTitle: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 5
  },
  resultsList: {
    flex: 1
  },
  resultsListContent: {
    paddingBottom: 18,
    paddingHorizontal: 14
  },
  resultRow: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.borderSubtle,
    borderRadius: mobileTheme.radii.md,
    borderWidth: 1,
    marginBottom: 10,
    overflow: "hidden"
  },
  resultRowSelected: {
    backgroundColor: mobileTheme.colors.surfaceBrandTint,
    borderColor: mobileTheme.colors.infoBorder
  },
  resultMainPressable: {
    paddingHorizontal: 14,
    paddingTop: 14
  },
  resultHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  resultTitle: {
    color: mobileTheme.colors.textPrimary,
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    paddingRight: 12
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
  resultLocation: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6
  },
  resultRating: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
    marginTop: 6
  },
  resultFooter: {
    alignItems: "center",
    borderColor: mobileTheme.colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  resultFooterLabel: {
    color: mobileTheme.colors.textFaint,
    fontSize: 12,
    fontWeight: "600"
  },
  detailsButton: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.brandDeep,
    borderRadius: mobileTheme.radii.pill,
    justifyContent: "center",
    minWidth: 76,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  detailsButtonText: {
    color: mobileTheme.colors.surface,
    fontSize: 12,
    fontWeight: "700"
  },
  cardPressed: {
    opacity: 0.9
  }
});
