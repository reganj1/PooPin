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
  coordinates: Coordinates | null;
  initialCenter: Coordinates;
  permissionStatus: PermissionStatus;
  locationCenterRequestKey: number;
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
  coordinates,
  initialCenter,
  permissionStatus,
  locationCenterRequestKey,
  onSelectRestroom
}: RestroomMapSurfaceProps) {
  const mapRef = useRef<MapView | null>(null);
  const lastMarkerPressAtRef = useRef(0);
  const mapKey = `${initialCenter.lat.toFixed(4)}:${initialCenter.lng.toFixed(4)}`;
  const initialRegion: Region = {
    latitude: initialCenter.lat,
    longitude: initialCenter.lng,
    ...INITIAL_DELTA
  };
  const validRestrooms = restrooms.filter((restroom) => isValidCoordinate(restroom.lat) && isValidCoordinate(restroom.lng));

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

  return (
    <View style={styles.container}>
      <MapView
        key={mapKey}
        initialRegion={initialRegion}
        onPress={handleMapPress}
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
