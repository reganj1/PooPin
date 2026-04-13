import type { ReactNode } from "react";
import type { NearbyBathroom } from "@poopin/domain";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import type { Region } from "react-native-maps";
import { mobileTheme } from "../../ui/theme";
import { MapResultsSheet } from "./MapResultsSheet";
import { RestroomMapSurface } from "./RestroomMapSurface";

interface Coordinates {
  lat: number;
  lng: number;
}

type PermissionStatus = "requesting" | "granted" | "denied" | "unavailable";
type MapSheetState = "collapsed" | "expanded";

interface ExpandedMapOverlayProps {
  canRecenter: boolean;
  coordinates: Coordinates | null;
  focusRequestKey: number;
  focusedRestroomId: string | null;
  initialCenter: Coordinates;
  locationCenterRequestKey: number;
  onCollapseSheet: () => void;
  onClose: () => void;
  onExpandSheet: () => void;
  onPressDetails: (restroomId: string) => void;
  onPressUseLocation: () => void;
  onRegionSettled: (region: Region) => void;
  onSelectRestroom: (restroomId: string | null) => void;
  onSelectRestroomFromSheet: (restroomId: string) => void;
  onToggleSheet: () => void;
  permissionStatus: PermissionStatus;
  restoredRegion: Region | null;
  restrooms: NearbyBathroom[];
  selectedRestroom: NearbyBathroom | null;
  selectedRestroomId: string | null;
  sheetState: MapSheetState;
  statusContent: ReactNode;
}

export function ExpandedMapOverlay({
  canRecenter,
  coordinates,
  focusRequestKey,
  focusedRestroomId,
  initialCenter,
  locationCenterRequestKey,
  onCollapseSheet,
  onClose,
  onExpandSheet,
  onPressDetails,
  onPressUseLocation,
  onRegionSettled,
  onSelectRestroom,
  onSelectRestroomFromSheet,
  onToggleSheet,
  permissionStatus,
  restoredRegion,
  restrooms,
  selectedRestroom,
  selectedRestroomId,
  sheetState,
  statusContent
}: ExpandedMapOverlayProps) {
  const recenterPositionStyle = sheetState === "expanded" ? styles.mapControlFloatingExpanded : styles.mapControlFloatingCollapsed;

  return (
    <View style={styles.overlay}>
      <RestroomMapSurface
        coordinates={coordinates}
        focusRequestKey={focusRequestKey}
        focusedRestroomId={focusedRestroomId}
        initialCenter={initialCenter}
        locationCenterRequestKey={locationCenterRequestKey}
        onRegionSettled={onRegionSettled}
        restoredRegion={restoredRegion}
        onSelectRestroom={onSelectRestroom}
        permissionStatus={permissionStatus}
        restrooms={restrooms}
        selectedRestroomId={selectedRestroomId}
      />

      <SafeAreaView pointerEvents="box-none" style={styles.safeArea}>
        <View pointerEvents="box-none" style={styles.topStack}>
          <View style={styles.chromeCard}>
            <View style={styles.topRow}>
              <Text style={styles.title}>Restroom map</Text>

              <View style={styles.actionRow}>
                <Pressable
                  disabled={!canRecenter}
                  onPress={onPressUseLocation}
                  style={({ pressed }) => [
                    styles.secondaryAction,
                    !canRecenter ? styles.secondaryActionDisabled : null,
                    pressed ? styles.buttonPressed : null
                  ]}
                >
                  <Text style={[styles.secondaryActionText, !canRecenter ? styles.secondaryActionTextDisabled : null]}>
                    Use my location
                  </Text>
                </Pressable>

                <Pressable onPress={onClose} style={({ pressed }) => [styles.doneAction, pressed ? styles.buttonPressed : null]}>
                  <Text style={styles.doneActionText}>Done</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.searchShell}>
              <View style={styles.searchCopy}>
                <Text style={styles.searchLabel}>Map browse</Text>
                <Text style={styles.searchPlaceholder}>Search this area</Text>
              </View>
              <View style={styles.searchBadge}>
                <Text style={styles.searchBadgeText}>Coming soon</Text>
              </View>
            </View>
          </View>

          {statusContent ? <View style={styles.statusWrap}>{statusContent}</View> : null}
        </View>

        <View pointerEvents="box-none" style={styles.mapControlFloatWrap}>
          <View style={[styles.mapControlFloating, recenterPositionStyle]}>
            <Pressable
              disabled={!canRecenter}
              onPress={onPressUseLocation}
              style={({ pressed }) => [
                styles.controlButton,
                !canRecenter ? styles.controlButtonDisabled : null,
                pressed ? styles.buttonPressed : null
              ]}
            >
              <Text style={[styles.controlButtonText, !canRecenter ? styles.controlButtonTextDisabled : null]}>Recenter</Text>
            </Pressable>
          </View>
        </View>

        <MapResultsSheet
          onCollapse={onCollapseSheet}
          onExpand={onExpandSheet}
          onPressDetails={onPressDetails}
          onSelectRestroom={onSelectRestroomFromSheet}
          onToggleSheet={onToggleSheet}
          restrooms={restrooms}
          selectedRestroom={selectedRestroom}
          selectedRestroomId={selectedRestroomId}
          sheetState={sheetState}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: mobileTheme.colors.pageBackground,
    zIndex: 20
  },
  safeArea: {
    flex: 1
  },
  topStack: {
    left: 12,
    position: "absolute",
    right: 12,
    top: 6,
    zIndex: 5
  },
  chromeCard: {
    backgroundColor: "rgba(255,255,255,0.88)",
    borderColor: "rgba(255,255,255,0.78)",
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...mobileTheme.shadows.card
  },
  topRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  title: {
    color: mobileTheme.colors.textPrimary,
    flex: 1,
    fontSize: 14,
    fontWeight: "700"
  },
  actionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginLeft: 10
  },
  secondaryAction: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderColor: mobileTheme.colors.borderSubtle,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    minWidth: 102,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  secondaryActionDisabled: {
    backgroundColor: mobileTheme.colors.surfaceMuted
  },
  secondaryActionText: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 11,
    fontWeight: "700"
  },
  secondaryActionTextDisabled: {
    color: mobileTheme.colors.textFaint
  },
  doneAction: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.brandDeep,
    borderRadius: mobileTheme.radii.pill,
    justifyContent: "center",
    minWidth: 62,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  doneActionText: {
    color: mobileTheme.colors.surface,
    fontSize: 11,
    fontWeight: "700"
  },
  searchShell: {
    alignItems: "center",
    backgroundColor: "rgba(248,250,252,0.95)",
    borderColor: mobileTheme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  searchCopy: {
    flex: 1,
    paddingRight: 12
  },
  searchLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.9,
    textTransform: "uppercase"
  },
  searchPlaceholder: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 2
  },
  searchBadge: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  searchBadgeText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 10,
    fontWeight: "700"
  },
  statusWrap: {
    marginTop: 8
  },
  mapControlFloatWrap: {
    ...StyleSheet.absoluteFillObject
  },
  mapControlFloating: {
    position: "absolute",
    right: 12
  },
  mapControlFloatingCollapsed: {
    bottom: 92
  },
  mapControlFloatingExpanded: {
    bottom: "58%"
  },
  controlButton: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.borderSubtle,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    minWidth: 88,
    paddingHorizontal: 13,
    paddingVertical: 9,
    ...mobileTheme.shadows.card
  },
  controlButtonDisabled: {
    backgroundColor: mobileTheme.colors.surfaceMuted
  },
  controlButtonText: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 12,
    fontWeight: "700"
  },
  controlButtonTextDisabled: {
    color: mobileTheme.colors.textFaint
  },
  buttonPressed: {
    opacity: 0.88
  }
});
