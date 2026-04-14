import { useMemo, useState } from "react";
import type { NearbyBathroom } from "@poopin/domain";
import {
  Animated,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PanResponderInstance
} from "react-native";
import { mobileTheme } from "../../ui/theme";

type MapSheetState = "collapsed" | "default" | "expanded";
type SheetSortMode = "closest" | "recommended";

interface MapResultsSheetProps {
  canUseLocation: boolean;
  handlePanHandlers: PanResponderInstance["panHandlers"];
  onPressDetails: (restroomId: string) => void;
  onPressUseLocation: () => void;
  onSelectRestroom: (restroomId: string) => void;
  onSheetHeaderPress: () => void;
  restrooms: NearbyBathroom[];
  selectedRestroom: NearbyBathroom | null;
  selectedRestroomId: string | null;
  sheetHeight: number;
  sheetState: MapSheetState;
  sheetTranslateY: Animated.Value;
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
  canUseLocation,
  handlePanHandlers,
  onPressDetails,
  onPressUseLocation,
  onSelectRestroom,
  onSheetHeaderPress,
  restrooms,
  selectedRestroom,
  selectedRestroomId,
  sheetHeight,
  sheetState,
  sheetTranslateY
}: MapResultsSheetProps) {
  const [sortMode, setSortMode] = useState<SheetSortMode>("closest");
  const [showPublicOnly, setShowPublicOnly] = useState(false);
  const [showAccessibleOnly, setShowAccessibleOnly] = useState(false);
  const [showBabyStationOnly, setShowBabyStationOnly] = useState(false);

  const filteredRestrooms = useMemo(() => {
    const next = restrooms.filter((restroom) => {
      if (showPublicOnly && restroom.access_type !== "public") {
        return false;
      }

      if (showAccessibleOnly && !restroom.is_accessible) {
        return false;
      }

      if (showBabyStationOnly && !restroom.has_baby_station) {
        return false;
      }

      return true;
    });

    next.sort((left, right) => {
      if (sortMode === "recommended") {
        if (right.ratings.overall !== left.ratings.overall) {
          return right.ratings.overall - left.ratings.overall;
        }

        if (right.ratings.reviewCount !== left.ratings.reviewCount) {
          return right.ratings.reviewCount - left.ratings.reviewCount;
        }
      }

      return left.distanceMiles - right.distanceMiles;
    });

    return next;
  }, [restrooms, showAccessibleOnly, showBabyStationOnly, showPublicOnly, sortMode]);

  const hasResults = filteredRestrooms.length > 0;
  const resultsCountLabel = hasResults ? `${filteredRestrooms.length} visible` : "No visible results";
  const listSubtitle = hasResults ? `${filteredRestrooms.length} in this map area` : "No visible results in this map area";
  const hasActiveFilters = showPublicOnly || showAccessibleOnly || showBabyStationOnly;

  const handleResultPress = (restroomId: string) => {
    onSelectRestroom(restroomId);
    onPressDetails(restroomId);
  };

  return (
    <Animated.View
      pointerEvents="auto"
      style={[
        styles.overlay,
        {
          height: sheetHeight,
          transform: [{ translateY: sheetTranslateY }]
        }
      ]}
    >
      <View {...handlePanHandlers}>
        <Pressable onPress={onSheetHeaderPress} style={({ pressed }) => [styles.sheetHeader, pressed ? styles.cardPressed : null]}>
          <View style={styles.handle} />

          {sheetState === "collapsed" ? (
            <View style={styles.collapsedHeaderRow}>
              <View style={styles.collapsedCopy}>
                <Text style={styles.sheetTitle}>Nearby results</Text>
                <Text style={styles.sheetSubtitle}>{resultsCountLabel}</Text>
              </View>

              <View style={styles.collapsedActions}>
                <Pressable
                  disabled={!canUseLocation}
                  onPress={onPressUseLocation}
                  style={({ pressed }) => [
                    styles.locationActionPill,
                    !canUseLocation ? styles.locationActionPillDisabled : null,
                    pressed ? styles.cardPressed : null
                  ]}
                >
                  <Text style={[styles.locationActionText, !canUseLocation ? styles.locationActionTextDisabled : null]}>
                    Use my location
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.sheetHeaderRow}>
              <View style={styles.sheetHeaderCopy}>
                <Text style={styles.sheetTitle}>Nearby results</Text>
                <Text style={styles.sheetSubtitle}>{listSubtitle}</Text>
              </View>
              <Pressable
                disabled={!canUseLocation}
                onPress={onPressUseLocation}
                style={({ pressed }) => [
                  styles.locationActionPill,
                  !canUseLocation ? styles.locationActionPillDisabled : null,
                  pressed ? styles.cardPressed : null
                ]}
              >
                <Text style={[styles.locationActionText, !canUseLocation ? styles.locationActionTextDisabled : null]}>
                  Use my location
                </Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      </View>

      {sheetState === "collapsed" ? null : (
        <>
          <View style={styles.controlsStripWrap}>
            <View style={styles.sortControlGroup}>
              <Pressable
                onPress={() => setSortMode("closest")}
                style={({ pressed }) => [
                  styles.sortSegment,
                  sortMode === "closest" ? styles.sortSegmentSelected : null,
                  pressed ? styles.cardPressed : null
                ]}
              >
                <Text style={[styles.sortSegmentText, sortMode === "closest" ? styles.sortSegmentTextSelected : null]}>Closest</Text>
              </Pressable>

              <Pressable
                onPress={() => setSortMode("recommended")}
                style={({ pressed }) => [
                  styles.sortSegment,
                  sortMode === "recommended" ? styles.sortSegmentSelected : null,
                  pressed ? styles.cardPressed : null
                ]}
              >
                <Text style={[styles.sortSegmentText, sortMode === "recommended" ? styles.sortSegmentTextSelected : null]}>
                  Recommended
                </Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.filterChipRow} horizontal showsHorizontalScrollIndicator={false}>
              <Pressable
                onPress={() => setShowPublicOnly((current) => !current)}
                style={({ pressed }) => [
                  styles.filterChip,
                  showPublicOnly ? styles.filterChipSelected : null,
                  pressed ? styles.cardPressed : null
                ]}
              >
                <Text style={[styles.filterChipText, showPublicOnly ? styles.filterChipTextSelected : null]}>Public only</Text>
              </Pressable>

              <Pressable
                onPress={() => setShowAccessibleOnly((current) => !current)}
                style={({ pressed }) => [
                  styles.filterChip,
                  showAccessibleOnly ? styles.filterChipSelected : null,
                  pressed ? styles.cardPressed : null
                ]}
              >
                <Text style={[styles.filterChipText, showAccessibleOnly ? styles.filterChipTextSelected : null]}>Accessible</Text>
              </Pressable>

              <Pressable
                onPress={() => setShowBabyStationOnly((current) => !current)}
                style={({ pressed }) => [
                  styles.filterChip,
                  showBabyStationOnly ? styles.filterChipSelected : null,
                  pressed ? styles.cardPressed : null
                ]}
              >
                <Text style={[styles.filterChipText, showBabyStationOnly ? styles.filterChipTextSelected : null]}>Baby station</Text>
              </Pressable>
            </ScrollView>
          </View>

          {selectedRestroom ? (
            <View style={styles.selectedSummary}>
              <View style={styles.selectedSummaryCopy}>
                <Text style={styles.selectedSummaryEyebrow}>Selected on map</Text>
                <Text numberOfLines={1} style={styles.selectedSummaryTitle}>
                  {selectedRestroom.name}
                </Text>
              </View>
            </View>
          ) : null}

          {hasResults ? (
            <FlatList
              contentContainerStyle={styles.resultsListContent}
              data={filteredRestrooms}
              keyExtractor={(item) => item.id}
              style={styles.resultsList}
              renderItem={({ item }) => {
                const isSelected = item.id === selectedRestroomId;

                return (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => handleResultPress(item.id)}
                    style={({ pressed }) => [
                      styles.resultRow,
                      isSelected ? styles.resultRowSelected : null,
                      pressed ? styles.cardPressed : null
                    ]}
                  >
                    <View style={styles.resultMainPressable}>
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
                    </View>

                    <View style={styles.resultFooter}>
                      <Text style={styles.resultFooterLabel}>{isSelected ? "Selected on map" : "Visible on map"}</Text>
                      <Text style={styles.resultFooterAction}>Tap for details</Text>
                    </View>
                  </Pressable>
                );
              }}
            />
          ) : (
            <View style={styles.emptyStateWrap}>
              <View style={styles.emptyStateCard}>
                <Text style={styles.emptyStateTitle}>
                  {hasActiveFilters ? "No restrooms match these filters right now." : "No restrooms are visible in this area right now."}
                </Text>
                <Text style={styles.emptyStateCopy}>
                  {hasActiveFilters
                    ? "Try a different sort or clear a filter chip to see more options in this map area."
                    : "Pan the map or tap recenter to keep exploring nearby options."}
                </Text>
              </View>
            </View>
          )}
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.borderSubtle,
    borderTopLeftRadius: mobileTheme.radii.xl,
    borderTopRightRadius: mobileTheme.radii.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    bottom: 0,
    left: 0,
    overflow: "hidden",
    position: "absolute",
    right: 0,
    zIndex: 4,
    ...mobileTheme.shadows.hero
  },
  sheetHeader: {
    paddingBottom: 7,
    paddingHorizontal: 16,
    paddingTop: 6
  },
  handle: {
    alignSelf: "center",
    backgroundColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.pill,
    height: 4,
    marginBottom: 5,
    width: 40
  },
  collapsedHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 30
  },
  collapsedCopy: {
    flex: 1,
    paddingRight: 12
  },
  collapsedActions: {
    alignItems: "center",
    flexDirection: "row"
  },
  sheetHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  sheetHeaderCopy: {
    flex: 1,
    paddingRight: 12
  },
  sheetTitle: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "700"
  },
  sheetSubtitle: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    marginTop: 1
  },
  locationActionPill: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    minWidth: 104,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  locationActionPillDisabled: {
    backgroundColor: mobileTheme.colors.surfaceMuted
  },
  locationActionText: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 11,
    fontWeight: "700"
  },
  locationActionTextDisabled: {
    color: mobileTheme.colors.textFaint
  },
  selectedSummary: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surfaceBrandTint,
    borderColor: mobileTheme.colors.infoBorder,
    borderRadius: mobileTheme.radii.md,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 8,
    marginHorizontal: 14,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  selectedSummaryCopy: {
    flex: 1
  },
  selectedSummaryEyebrow: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.9,
    textTransform: "uppercase"
  },
  selectedSummaryTitle: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3
  },
  controlsStripWrap: {
    borderBottomColor: mobileTheme.colors.borderSubtle,
    borderBottomWidth: 1,
    gap: 10,
    paddingBottom: 10,
    paddingHorizontal: 14
  },
  sortControlGroup: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    padding: 4
  },
  sortSegment: {
    alignItems: "center",
    borderRadius: mobileTheme.radii.pill,
    flex: 1,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  sortSegmentSelected: {
    backgroundColor: mobileTheme.colors.brandDeep
  },
  sortSegmentText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "700"
  },
  sortSegmentTextSelected: {
    color: mobileTheme.colors.surface
  },
  filterChipRow: {
    alignItems: "center",
    gap: 8,
    paddingRight: 14
  },
  filterChip: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  filterChipSelected: {
    backgroundColor: mobileTheme.colors.surfaceBrandTint,
    borderColor: mobileTheme.colors.infoBorder
  },
  filterChipText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "700"
  },
  filterChipTextSelected: {
    color: mobileTheme.colors.brandStrong
  },
  resultsList: {
    flex: 1
  },
  resultsListContent: {
    paddingBottom: 18,
    paddingHorizontal: 14
  },
  emptyStateWrap: {
    flex: 1,
    justifyContent: "center",
    paddingBottom: 18,
    paddingHorizontal: 14
  },
  emptyStateCard: {
    backgroundColor: mobileTheme.colors.surfaceBrandTint,
    borderColor: mobileTheme.colors.infoBorder,
    borderRadius: mobileTheme.radii.md,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 18
  },
  emptyStateTitle: {
    color: mobileTheme.colors.brandDeep,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21
  },
  emptyStateCopy: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8
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
  resultFooterAction: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 12,
    fontWeight: "700"
  },
  cardPressed: {
    opacity: 0.9
  }
});
