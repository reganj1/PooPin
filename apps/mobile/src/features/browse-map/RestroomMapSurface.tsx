import { useCallback, useEffect, useRef, useState } from "react";
import type { NearbyBathroom } from "@poopin/domain";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, type MapPressEvent, type Region } from "react-native-maps";
import { mobileTheme } from "../../ui/theme";
import { reconcileMarkers, selectMapMarkerRestrooms } from "./reconcileMarkers";
import { StableRestroomMarker } from "./StableRestroomMarker";

const selectedMarkerImage = require("../../../assets/map-markers/restroom-marker-selected.png");

interface Coordinates {
  lat: number;
  lng: number;
}

type PermissionStatus = "requesting" | "granted" | "denied" | "unavailable";

interface RestroomMapSurfaceProps {
  restrooms: NearbyBathroom[];
  selectedRestroomId: string | null;
  focusedRestroomId: string | null;
  coordinates: Coordinates | null;
  initialCenter: Coordinates;
  restoredRegion: Region | null;
  permissionStatus: PermissionStatus;
  focusRequestKey: number;
  locationCenterRequestKey: number;
  searchRegion: Region | null;
  searchRegionRequestKey: number;
  onRegionSettled: (region: Region) => void;
  onSelectRestroom: (restroomId: string | null) => void;
}

const INITIAL_DELTA = {
  latitudeDelta: 0.12,
  longitudeDelta: 0.12
} as const;

const logMapDebug = (event: string, meta?: Record<string, unknown>) => {
  if (__DEV__) {
    console.log(`[mobile-map] ${event}`, meta ?? {});
  }
};

export function RestroomMapSurface({
  restrooms,
  selectedRestroomId,
  focusedRestroomId,
  coordinates,
  initialCenter,
  restoredRegion,
  permissionStatus,
  focusRequestKey,
  locationCenterRequestKey,
  searchRegion,
  searchRegionRequestKey,
  onRegionSettled,
  onSelectRestroom
}: RestroomMapSurfaceProps) {
  const mapRef = useRef<MapView | null>(null);
  const onSelectRestroomRef = useRef(onSelectRestroom);
  const selectedRestroomIdRef = useRef(selectedRestroomId);
  const currentRegionRef = useRef<Region>(restoredRegion ?? {
    latitude: initialCenter.lat,
    longitude: initialCenter.lng,
    ...INITIAL_DELTA
  });
  const lastMarkerPressAtRef = useRef(0);
  const hasHandledInitialRegionChangeRef = useRef(false);
  const ignoreNextRegionChangeRef = useRef(false);
  const lastAutoCenteredOriginKeyRef = useRef(`${initialCenter.lat.toFixed(4)}:${initialCenter.lng.toFixed(4)}`);
  // Capture mount-time prop values so the locationCenterRequestKey effect can
  // detect whether it fired because the key changed vs. because the component
  // just mounted with an already-non-zero key (inherited from a previous map
  // instance).  When the key is inherited and restoredRegion positions the map
  // correctly we must NOT fire animateToRegion — doing so cancels any in-flight
  // user-pan debounce 700 ms later and drops the user's first pan silently.
  const mountLocationCenterRequestKeyRef = useRef(locationCenterRequestKey);
  const mountRestoredRegionRef = useRef(restoredRegion);
  const initialRegion: Region =
    restoredRegion ?? {
      latitude: initialCenter.lat,
      longitude: initialCenter.lng,
      ...INITIAL_DELTA
    };
  const [renderedMarkers, setRenderedMarkers] = useState(() =>
    reconcileMarkers([], selectMapMarkerRestrooms([], restrooms, { pinnedRestroomId: focusedRestroomId ?? selectedRestroomId }))
  );
  const initialCenterKey = `${initialCenter.lat.toFixed(4)}:${initialCenter.lng.toFixed(4)}`;

  useEffect(() => {
    onSelectRestroomRef.current = onSelectRestroom;
  }, [onSelectRestroom]);

  useEffect(() => {
    selectedRestroomIdRef.current = selectedRestroomId;
  }, [selectedRestroomId]);

  // Reconcile markers only when restrooms data or focused pin changes.
  // selectedRestroomId is intentionally read from a ref so that tapping a
  // visible marker never triggers a reconciliation pass (the tapped marker is
  // already rendered — no native child reorder needed).
  useEffect(() => {
    setRenderedMarkers((currentMarkers) => {
      const markerRestrooms = selectMapMarkerRestrooms(currentMarkers, restrooms, {
        pinnedRestroomId: focusedRestroomId ?? selectedRestroomIdRef.current
      });

      return reconcileMarkers(currentMarkers, markerRestrooms);
    });
  }, [focusedRestroomId, restrooms]);

  const handleMapPress = useCallback((event: MapPressEvent) => {
    if (Date.now() - lastMarkerPressAtRef.current < 250) {
      return;
    }

    onSelectRestroomRef.current(null);
  }, []);

  const handleMarkerPress = useCallback((restroomId: string) => {
    logMapDebug("marker tap", { restroomId });
    lastMarkerPressAtRef.current = Date.now();
    onSelectRestroomRef.current(restroomId);
  }, []);

  // Stable handler for the selected indicator — reads the current selection from
  // a ref so the callback identity never changes and the indicator never remounts.
  const handleIndicatorPress = useCallback(() => {
    const restroomId = selectedRestroomIdRef.current;
    if (!restroomId) {
      return;
    }

    logMapDebug("indicator tap", { restroomId });
    lastMarkerPressAtRef.current = Date.now();
    onSelectRestroomRef.current(restroomId);
  }, []);

  const handleRegionChangeComplete = (region: Region) => {
    currentRegionRef.current = region;

    if (!hasHandledInitialRegionChangeRef.current) {
      hasHandledInitialRegionChangeRef.current = true;
      return;
    }

    if (ignoreNextRegionChangeRef.current) {
      ignoreNextRegionChangeRef.current = false;
      return;
    }

    onRegionSettled(region);
  };

  useEffect(() => {
    if (locationCenterRequestKey === 0 || permissionStatus !== "granted" || !coordinates) {
      return;
    }

    // Skip the spurious mount-time fire.  When this component mounts with
    // locationCenterRequestKey already > 0 (inherited from the compact map's
    // initial GPS centering) AND restoredRegion already positions the map
    // correctly, there is no need to call animateToRegion.  Doing so would
    // produce an onRegionChangeComplete 700 ms later that could cancel a
    // user-initiated pan debounce and silently discard the user's first fetch.
    // We only animate when the key genuinely increments after mount (e.g. the
    // user pressed Recenter).
    if (
      locationCenterRequestKey === mountLocationCenterRequestKeyRef.current &&
      mountRestoredRegionRef.current !== null
    ) {
      logMapDebug("location center skipped on mount", {
        locationCenterRequestKey,
        reason: "inherited key with restoredRegion — map already positioned"
      });
      return;
    }

    mapRef.current?.animateToRegion(
      {
        latitude: coordinates.lat,
        longitude: coordinates.lng,
        ...INITIAL_DELTA
      },
      700
    );
  }, [coordinates, locationCenterRequestKey, permissionStatus]);

  useEffect(() => {
    if (!searchRegion || searchRegionRequestKey === 0) {
      return;
    }

    hasHandledInitialRegionChangeRef.current = true;
    currentRegionRef.current = searchRegion;
    mapRef.current?.animateToRegion(searchRegion, 700);
  }, [searchRegion, searchRegionRequestKey]);

  useEffect(() => {
    const matchesLiveCoordinates =
      permissionStatus === "granted" &&
      coordinates !== null &&
      initialCenterKey === `${coordinates.lat.toFixed(4)}:${coordinates.lng.toFixed(4)}`;

    if (matchesLiveCoordinates || restoredRegion || lastAutoCenteredOriginKeyRef.current === initialCenterKey) {
      return;
    }

    lastAutoCenteredOriginKeyRef.current = initialCenterKey;
    ignoreNextRegionChangeRef.current = true;
    mapRef.current?.animateToRegion(
      {
        latitude: initialCenter.lat,
        longitude: initialCenter.lng,
        ...INITIAL_DELTA
      },
      700
    );
  }, [coordinates, initialCenter, initialCenterKey, permissionStatus, restoredRegion]);

  useEffect(() => {
    if (!focusedRestroomId || focusRequestKey === 0) {
      return;
    }

    const marker = renderedMarkers.find((candidate) => candidate.id === focusedRestroomId);
    if (!marker) {
      return;
    }

    const nextRegion: Region = {
      latitude: marker.coordinate.latitude - currentRegionRef.current.latitudeDelta * 0.18,
      longitude: marker.coordinate.longitude,
      latitudeDelta: currentRegionRef.current.latitudeDelta,
      longitudeDelta: currentRegionRef.current.longitudeDelta
    };

    logMapDebug("focus animation start", {
      restroomId: focusedRestroomId,
      latitude: nextRegion.latitude,
      longitude: nextRegion.longitude
    });
    currentRegionRef.current = nextRegion;
    ignoreNextRegionChangeRef.current = true;
    mapRef.current?.animateToRegion(nextRegion, 500);

    const timeout = setTimeout(() => {
      logMapDebug("focus animation end", { restroomId: focusedRestroomId });
    }, 520);

    return () => {
      clearTimeout(timeout);
    };
  }, [focusRequestKey, focusedRestroomId, renderedMarkers]);

  return (
    <View style={styles.container}>
      <MapView
        initialRegion={initialRegion}
        onPress={handleMapPress}
        onRegionChangeComplete={handleRegionChangeComplete}
        ref={mapRef}
        showsUserLocation={permissionStatus === "granted"}
        style={styles.map}
      >
        {renderedMarkers.map((marker) => (
          <StableRestroomMarker
            key={marker.id}
            marker={marker}
            onPressMarker={handleMarkerPress}
          />
        ))}
        {/* Selected indicator — always rendered LAST so it sits above all base
            markers in native z-order. Uses a separate blue image; the base marker
            underneath is untouched. The stable key means React only updates the
            coordinate prop when selection moves, never inserts/removes mid-list. */}
        {selectedRestroomId ? (() => {
          const indicatorMarker = renderedMarkers.find(m => m.id === selectedRestroomId);
          if (!indicatorMarker) {
            return null;
          }

          return (
            <Marker
              anchor={{ x: 0.5, y: 0.5 }}
              coordinate={indicatorMarker.coordinate}
              identifier="__selected_indicator__"
              image={selectedMarkerImage}
              key="__selected_indicator__"
              onPress={handleIndicatorPress}
              tracksViewChanges={false}
            />
          );
        })() : null}
      </MapView>

      {!coordinates ? <View pointerEvents="none" style={styles.mapTint} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: mobileTheme.colors.surface,
    flex: 1
  },
  map: {
    flex: 1
  },
  mapTint: {
    backgroundColor: "rgba(244, 249, 255, 0.14)",
    ...StyleSheet.absoluteFillObject
  }
});
