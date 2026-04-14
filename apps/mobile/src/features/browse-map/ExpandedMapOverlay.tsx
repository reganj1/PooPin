import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { NearbyBathroom } from "@poopin/domain";
import {
  Animated,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from "react-native";
import type { Region } from "react-native-maps";
import { mobileTheme } from "../../ui/theme";
import { MapResultsSheet } from "./MapResultsSheet";
import { RestroomMapSurface } from "./RestroomMapSurface";
import { SelectedRestroomPreviewCard } from "./SelectedRestroomPreviewCard";

interface Coordinates {
  lat: number;
  lng: number;
}

type PermissionStatus = "requesting" | "granted" | "denied" | "unavailable";
type MapSheetState = "collapsed" | "default" | "expanded";

interface ExpandedMapOverlayProps {
  canRecenter: boolean;
  coordinates: Coordinates | null;
  focusRequestKey: number;
  focusedRestroomId: string | null;
  initialCenter: Coordinates;
  locationCenterRequestKey: number;
  onClose: () => void;
  onPressDetails: (restroomId: string) => void;
  onPressUseLocation: () => void;
  onRegionSettled: (region: Region) => void;
  onSelectRestroom: (restroomId: string | null) => void;
  onSelectRestroomFromSheet: (restroomId: string) => void;
  onSheetStateChange: (nextState: MapSheetState) => void;
  permissionStatus: PermissionStatus;
  restoredRegion: Region | null;
  restrooms: NearbyBathroom[];
  selectedRestroom: NearbyBathroom | null;
  selectedRestroomId: string | null;
  selectedPopupVisible: boolean;
  sheetState: MapSheetState;
  statusContent: ReactNode;
  onPressSelectedPopup: () => void;
}

interface MobileSheetMetrics {
  height: number;
  minOffset: number;
  maxOffset: number;
  offsets: Record<MapSheetState, number>;
}

const MOBILE_SHEET_COLLAPSED_VISIBLE_PX = 54;
const MOBILE_SHEET_DEFAULT_VISIBLE_RATIO = 0.5;
const MOBILE_SHEET_EXPANDED_VISIBLE_RATIO = 0.84;
const MOBILE_SHEET_MAX_HEIGHT_RATIO = 0.86;
const MOBILE_SHEET_SWIPE_VELOCITY_THRESHOLD = 0.55;
const SEARCH_ROW_TOP_OFFSET = 6;
const SHEET_TOP_MIN_GAP = 20;
const EXPANDED_SHEET_EXTRA_GAP = 20;

const clampNumber = (value: number, min: number, max: number) => {
  const lowerBound = Math.min(min, max);
  const upperBound = Math.max(min, max);
  return Math.max(lowerBound, Math.min(upperBound, value));
};

const getMobileSheetMetrics = (viewportHeight: number, topReservedHeight: number): MobileSheetMetrics => {
  const clampedViewportHeight = Math.max(480, viewportHeight);
  const maxHeight = clampNumber(
    Math.round(clampedViewportHeight * MOBILE_SHEET_MAX_HEIGHT_RATIO),
    320,
    clampedViewportHeight - 56
  );

  const collapsedVisible = Math.min(MOBILE_SHEET_COLLAPSED_VISIBLE_PX, maxHeight);
  const minSheetTop = clampNumber(topReservedHeight + SHEET_TOP_MIN_GAP, 0, clampedViewportHeight - collapsedVisible);
  const minOffset = clampNumber(minSheetTop - (clampedViewportHeight - maxHeight), 0, maxHeight - collapsedVisible);
  const maxVisibleByTopClamp = clampNumber(
    maxHeight - minOffset,
    collapsedVisible + 120,
    maxHeight
  );
  const maxExpandedVisibleByTopClamp = clampNumber(
    maxHeight - (minOffset + EXPANDED_SHEET_EXTRA_GAP),
    collapsedVisible + 120,
    maxVisibleByTopClamp
  );
  const expandedMinVisible = Math.min(maxVisibleByTopClamp, Math.max(collapsedVisible + 120, 240));
  const expandedVisible = clampNumber(
    Math.round(clampedViewportHeight * MOBILE_SHEET_EXPANDED_VISIBLE_RATIO),
    expandedMinVisible,
    maxExpandedVisibleByTopClamp
  );
  const defaultMaxVisible = Math.max(collapsedVisible + 72, expandedVisible - 72);
  const defaultMinVisible = Math.min(defaultMaxVisible, Math.max(collapsedVisible + 72, 220));
  const defaultVisible = clampNumber(
    Math.round(clampedViewportHeight * MOBILE_SHEET_DEFAULT_VISIBLE_RATIO),
    defaultMinVisible,
    defaultMaxVisible
  );

  const expandedOffset = clampNumber(maxHeight - expandedVisible, minOffset, maxHeight - collapsedVisible);
  const defaultOffset = clampNumber(maxHeight - defaultVisible, expandedOffset, maxHeight - collapsedVisible);
  const collapsedOffset = Math.max(defaultOffset, maxHeight - collapsedVisible);

  return {
    height: maxHeight,
    minOffset,
    maxOffset: collapsedOffset,
    offsets: {
      collapsed: collapsedOffset,
      default: defaultOffset,
      expanded: expandedOffset
    }
  };
};

const getNearestSheetState = (offset: number, metrics: MobileSheetMetrics): MapSheetState => {
  const states = Object.entries(metrics.offsets) as Array<[MapSheetState, number]>;
  return states.reduce<MapSheetState>((closestState, [candidateState, candidateOffset]) => {
    const currentDelta = Math.abs(candidateOffset - offset);
    const closestDelta = Math.abs(metrics.offsets[closestState] - offset);
    return currentDelta < closestDelta ? candidateState : closestState;
  }, "default");
};

const resolveSheetSnapState = (endOffset: number, velocityY: number, metrics: MobileSheetMetrics): MapSheetState => {
  if (Math.abs(velocityY) >= MOBILE_SHEET_SWIPE_VELOCITY_THRESHOLD) {
    return velocityY < 0 ? "expanded" : "collapsed";
  }

  return getNearestSheetState(endOffset, metrics);
};

export function ExpandedMapOverlay({
  canRecenter,
  coordinates,
  focusRequestKey,
  focusedRestroomId,
  initialCenter,
  locationCenterRequestKey,
  onClose,
  onPressDetails,
  onPressUseLocation,
  onRegionSettled,
  onSelectRestroom,
  onSelectRestroomFromSheet,
  onSheetStateChange,
  permissionStatus,
  restoredRegion,
  restrooms,
  selectedRestroom,
  selectedRestroomId,
  selectedPopupVisible,
  sheetState,
  statusContent,
  onPressSelectedPopup
}: ExpandedMapOverlayProps) {
  const { height: viewportHeight } = useWindowDimensions();
  const [topReservedHeight, setTopReservedHeight] = useState(96);
  const topStackRef = useRef<View>(null);
  const sheetMetrics = useMemo(() => getMobileSheetMetrics(viewportHeight, topReservedHeight), [topReservedHeight, viewportHeight]);
  const sheetOffset = useRef(new Animated.Value(sheetMetrics.offsets[sheetState])).current;
  const currentOffsetRef = useRef(sheetMetrics.offsets[sheetState]);
  const dragStartOffsetRef = useRef(sheetMetrics.offsets[sheetState]);
  const didDragRef = useRef(false);
  const isMountedRef = useRef(false);

  useEffect(() => {
    const listenerId = sheetOffset.addListener(({ value }) => {
      currentOffsetRef.current = value;
    });

    return () => {
      sheetOffset.removeListener(listenerId);
    };
  }, [sheetOffset]);

  useEffect(() => {
    const nextOffset = sheetMetrics.offsets[sheetState];

    if (!isMountedRef.current) {
      isMountedRef.current = true;
      sheetOffset.setValue(nextOffset);
      currentOffsetRef.current = nextOffset;
      return;
    }

    Animated.spring(sheetOffset, {
      damping: 28,
      mass: 0.95,
      stiffness: 240,
      toValue: nextOffset,
      useNativeDriver: true
    }).start();
  }, [sheetMetrics, sheetOffset, sheetState]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 6,
        onPanResponderGrant: () => {
          didDragRef.current = false;
          sheetOffset.stopAnimation((value) => {
            dragStartOffsetRef.current = typeof value === "number" ? value : currentOffsetRef.current;
            currentOffsetRef.current = typeof value === "number" ? value : currentOffsetRef.current;
          });
        },
        onPanResponderMove: (_, gestureState) => {
          const nextOffset = clampNumber(
            dragStartOffsetRef.current + gestureState.dy,
            sheetMetrics.minOffset,
            sheetMetrics.maxOffset
          );

          if (Math.abs(gestureState.dy) > 4) {
            didDragRef.current = true;
          }

          sheetOffset.setValue(nextOffset);
        },
        onPanResponderRelease: (_, gestureState) => {
          const endOffset = clampNumber(
            dragStartOffsetRef.current + gestureState.dy,
            sheetMetrics.minOffset,
            sheetMetrics.maxOffset
          );

          if (!didDragRef.current) {
            Animated.spring(sheetOffset, {
              damping: 28,
              mass: 0.95,
              stiffness: 240,
              toValue: sheetMetrics.offsets[sheetState],
              useNativeDriver: true
            }).start();
            return;
          }

          const nextState = resolveSheetSnapState(endOffset, gestureState.vy, sheetMetrics);
          didDragRef.current = false;

          if (nextState !== sheetState) {
            onSheetStateChange(nextState);
            return;
          }

          Animated.spring(sheetOffset, {
            damping: 28,
            mass: 0.95,
            stiffness: 240,
            toValue: sheetMetrics.offsets[nextState],
            useNativeDriver: true
          }).start();
        },
        onPanResponderTerminate: () => {
          didDragRef.current = false;
          Animated.spring(sheetOffset, {
            damping: 28,
            mass: 0.95,
            stiffness: 240,
            toValue: sheetMetrics.offsets[sheetState],
            useNativeDriver: true
          }).start();
        }
      }),
    [onSheetStateChange, sheetMetrics, sheetOffset, sheetState]
  );

  const handleSheetHeaderPress = () => {
    if (sheetState === "collapsed") {
      onSheetStateChange("default");
      return;
    }

    if (sheetState === "expanded") {
      onSheetStateChange("default");
      return;
    }

    onSheetStateChange("collapsed");
  };

  const measureTopOverlayBottom = useCallback(() => {
    requestAnimationFrame(() => {
      topStackRef.current?.measureInWindow((_, y, __, height) => {
        const nextBottom = Math.round(y + height);
        if (nextBottom > 0) {
          setTopReservedHeight((current) => (current === nextBottom ? current : nextBottom));
        }
      });
    });
  }, []);

  useEffect(() => {
    measureTopOverlayBottom();
  }, [measureTopOverlayBottom, statusContent, viewportHeight]);

  const handleTopStackLayout = (_event: LayoutChangeEvent) => {
    measureTopOverlayBottom();
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.mapBackground}>
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
      </View>

      <SafeAreaView pointerEvents="box-none" style={styles.overlayLayer}>
        <View ref={topStackRef} onLayout={handleTopStackLayout} pointerEvents="box-none" style={styles.topStack}>
          <View style={styles.searchShell}>
            <Pressable
              accessibilityLabel="Back"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.backIconButton, pressed ? styles.buttonPressed : null]}
            >
              <Text style={styles.backIconText}>←</Text>
            </Pressable>

            <View style={styles.searchField}>
              <Text style={styles.searchPlaceholder}>Search the map</Text>

              {permissionStatus === "granted" && coordinates ? (
                <Text style={styles.searchMetaText}>Current area</Text>
              ) : (
                <View style={styles.searchBadge}>
                  <Text style={styles.searchBadgeText}>Soon</Text>
                </View>
              )}
            </View>
          </View>

          {statusContent ? <View style={styles.statusWrap}>{statusContent}</View> : null}
        </View>

        {selectedPopupVisible && sheetState === "collapsed" && selectedRestroom ? (
          <View pointerEvents="box-none" style={styles.selectedPopupOverlay}>
            <SelectedRestroomPreviewCard onPress={onPressSelectedPopup} restroom={selectedRestroom} variant="compact" />
          </View>
        ) : null}

        <View pointerEvents="box-none" style={styles.sheetLayer}>
          <MapResultsSheet
            canUseLocation={canRecenter}
            handlePanHandlers={panResponder.panHandlers}
            onPressDetails={onPressDetails}
            onPressUseLocation={onPressUseLocation}
            onSelectRestroom={onSelectRestroomFromSheet}
            onSheetHeaderPress={handleSheetHeaderPress}
            restrooms={restrooms}
            selectedRestroom={selectedRestroom}
            selectedRestroomId={selectedRestroomId}
            sheetHeight={sheetMetrics.height}
            sheetState={sheetState}
            sheetTranslateY={sheetOffset}
          />
        </View>
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
  mapBackground: {
    ...StyleSheet.absoluteFillObject
  },
  overlayLayer: {
    ...StyleSheet.absoluteFillObject
  },
  topStack: {
    left: 12,
    position: "absolute",
    right: 12,
    top: SEARCH_ROW_TOP_OFFSET,
    zIndex: 5
  },
  searchShell: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  backIconButton: {
    alignItems: "center",
    backgroundColor: "rgba(248,250,252,0.95)",
    borderColor: mobileTheme.colors.border,
    borderRadius: 16,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  backIconText: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 24
  },
  searchField: {
    alignItems: "center",
    backgroundColor: "rgba(248,250,252,0.95)",
    borderColor: mobileTheme.colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  searchPlaceholder: {
    color: mobileTheme.colors.textSecondary,
    flex: 1,
    fontSize: 13,
    fontWeight: "600"
  },
  searchMetaText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 10
  },
  searchBadge: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  searchBadgeText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 10,
    fontWeight: "700"
  },
  statusWrap: {
    marginTop: 6
  },
  selectedPopupOverlay: {
    bottom: MOBILE_SHEET_COLLAPSED_VISIBLE_PX + 14,
    left: 12,
    position: "absolute",
    right: 12,
    zIndex: 4
  },
  sheetLayer: {
    ...StyleSheet.absoluteFillObject
  },
  buttonPressed: {
    opacity: 0.88
  }
});
