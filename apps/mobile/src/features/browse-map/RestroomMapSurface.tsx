import { useEffect, useRef } from "react";
import type { NearbyBathroom } from "@poopin/domain";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, type MapPressEvent, type Region } from "react-native-maps";
import { mobileTheme } from "../../ui/theme";

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
  onRegionSettled: (region: Region) => void;
  onSelectRestroom: (restroomId: string | null) => void;
}

const INITIAL_DELTA = {
  latitudeDelta: 0.12,
  longitudeDelta: 0.12
} as const;

const isValidCoordinate = (value: number) => Number.isFinite(value);

const toLocationLine = (restroom: NearbyBathroom) => [restroom.address, restroom.city, restroom.state].filter(Boolean).join(", ");

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
  onRegionSettled,
  onSelectRestroom
}: RestroomMapSurfaceProps) {
  const mapRef = useRef<MapView | null>(null);
  const currentRegionRef = useRef<Region>(restoredRegion ?? {
    latitude: initialCenter.lat,
    longitude: initialCenter.lng,
    ...INITIAL_DELTA
  });
  const lastMarkerPressAtRef = useRef(0);
  const hasHandledInitialRegionChangeRef = useRef(false);
  const ignoreNextRegionChangeRef = useRef(false);
  const lastAutoCenteredOriginKeyRef = useRef(`${initialCenter.lat.toFixed(4)}:${initialCenter.lng.toFixed(4)}`);
  const initialRegion: Region =
    restoredRegion ?? {
      latitude: initialCenter.lat,
      longitude: initialCenter.lng,
      ...INITIAL_DELTA
    };
  const validRestrooms = restrooms.filter((restroom) => isValidCoordinate(restroom.lat) && isValidCoordinate(restroom.lng));
  const initialCenterKey = `${initialCenter.lat.toFixed(4)}:${initialCenter.lng.toFixed(4)}`;

  const handleMapPress = (event: MapPressEvent) => {
    if (Date.now() - lastMarkerPressAtRef.current < 250) {
      return;
    }

    onSelectRestroom(null);
  };

  const handleMarkerPress = (restroomId: string) => {
    lastMarkerPressAtRef.current = Date.now();
    onSelectRestroom(restroomId);
  };

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
    if (restoredRegion || lastAutoCenteredOriginKeyRef.current === initialCenterKey) {
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
  }, [initialCenter, initialCenterKey, restoredRegion]);

  useEffect(() => {
    if (!focusedRestroomId || focusRequestKey === 0) {
      return;
    }

    const restroom = restrooms.find((candidate) => candidate.id === focusedRestroomId);
    if (!restroom || !isValidCoordinate(restroom.lat) || !isValidCoordinate(restroom.lng)) {
      return;
    }

    const nextRegion: Region = {
      latitude: restroom.lat - currentRegionRef.current.latitudeDelta * 0.18,
      longitude: restroom.lng,
      latitudeDelta: currentRegionRef.current.latitudeDelta,
      longitudeDelta: currentRegionRef.current.longitudeDelta
    };

    currentRegionRef.current = nextRegion;
    ignoreNextRegionChangeRef.current = true;
    mapRef.current?.animateToRegion(nextRegion, 500);
  }, [focusRequestKey, focusedRestroomId, restrooms]);

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
        {validRestrooms.map((restroom) => (
          <Marker
            key={restroom.id}
            coordinate={{
              latitude: restroom.lat,
              longitude: restroom.lng
            }}
            description={toLocationLine(restroom)}
            identifier={restroom.id}
            onPress={() => handleMarkerPress(restroom.id)}
            pinColor={restroom.id === selectedRestroomId ? mobileTheme.colors.brandDeep : mobileTheme.colors.brand}
            title={restroom.name}
            zIndex={restroom.id === selectedRestroomId ? 2 : 1}
          />
        ))}
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
