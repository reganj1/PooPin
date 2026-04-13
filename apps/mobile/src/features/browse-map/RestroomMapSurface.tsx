import type { NearbyBathroom } from "@poopin/domain";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, type MapPressEvent, type Region } from "react-native-maps";
import { mobileTheme } from "../../ui/theme";

interface Coordinates {
  lat: number;
  lng: number;
}

interface RestroomMapSurfaceProps {
  restrooms: NearbyBathroom[];
  selectedRestroomId: string | null;
  coordinates: Coordinates | null;
  initialCenter: Coordinates;
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
  onSelectRestroom
}: RestroomMapSurfaceProps) {
  const mapKey = `${initialCenter.lat.toFixed(4)}:${initialCenter.lng.toFixed(4)}`;
  const initialRegion: Region = {
    latitude: initialCenter.lat,
    longitude: initialCenter.lng,
    ...INITIAL_DELTA
  };
  const validRestrooms = restrooms.filter((restroom) => isValidCoordinate(restroom.lat) && isValidCoordinate(restroom.lng));

  const handleMapPress = (event: MapPressEvent) => {
    if (event.nativeEvent.action === "marker-press") {
      return;
    }

    onSelectRestroom(null);
  };

  return (
    <View style={styles.container}>
      <MapView key={mapKey} initialRegion={initialRegion} onPress={handleMapPress} style={styles.map} showsUserLocation={false}>
        {validRestrooms.map((restroom) => (
          <Marker
            key={restroom.id}
            coordinate={{
              latitude: restroom.lat,
              longitude: restroom.lng
            }}
            description={toLocationLine(restroom)}
            onSelect={() => onSelectRestroom(restroom.id)}
            pinColor={restroom.id === selectedRestroomId ? mobileTheme.colors.brandDeep : mobileTheme.colors.brand}
            title={restroom.name}
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
