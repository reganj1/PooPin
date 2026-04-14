import { memo, useCallback } from "react";
import { Marker } from "react-native-maps";
import type { RenderedMarker } from "./reconcileMarkers";

const normalMarkerImage = require("../../../assets/map-markers/restroom-marker-normal.png");

interface StableRestroomMarkerProps {
  marker: RenderedMarker;
  onPressMarker: (restroomId: string) => void;
}

function StableRestroomMarkerComponent({ marker, onPressMarker }: StableRestroomMarkerProps) {
  const handlePress = useCallback(() => {
    onPressMarker(marker.id);
  }, [marker.id, onPressMarker]);

  return (
    <Marker
      anchor={{ x: 0.5, y: 0.5 }}
      coordinate={marker.coordinate}
      image={normalMarkerImage}
      identifier={marker.id}
      onPress={handlePress}
    />
  );
}

export const StableRestroomMarker = memo(
  StableRestroomMarkerComponent,
  (previousProps, nextProps) =>
    previousProps.marker === nextProps.marker &&
    previousProps.onPressMarker === nextProps.onPressMarker
);
