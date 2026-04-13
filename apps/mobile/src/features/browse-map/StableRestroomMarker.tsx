import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Marker } from "react-native-maps";
import type { RenderedMarker } from "./reconcileMarkers";
import { WCMarkerBubble } from "./WCMarkerBubble";

interface StableRestroomMarkerProps {
  marker: RenderedMarker;
  onPressMarker: (restroomId: string) => void;
}

function StableRestroomMarkerComponent({ marker, onPressMarker }: StableRestroomMarkerProps) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const clearRefreshTimers = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearRefreshTimers();

    animationFrameRef.current = requestAnimationFrame(() => {
      refreshTimeoutRef.current = setTimeout(() => {
        setTracksViewChanges(false);
        refreshTimeoutRef.current = null;
        animationFrameRef.current = null;
      }, 100);
    });

    return () => {
      clearRefreshTimers();
    };
  }, [clearRefreshTimers]);

  const handlePress = useCallback(() => {
    onPressMarker(marker.id);
  }, [marker.id, onPressMarker]);

  return (
    <Marker
      anchor={{ x: 0.5, y: 0.5 }}
      coordinate={marker.coordinate}
      identifier={marker.id}
      onPress={handlePress}
      tracksViewChanges={tracksViewChanges}
      zIndex={1}
    >
      <WCMarkerBubble />
    </Marker>
  );
}

export const StableRestroomMarker = memo(
  StableRestroomMarkerComponent,
  (previousProps, nextProps) =>
    previousProps.marker === nextProps.marker &&
    previousProps.onPressMarker === nextProps.onPressMarker
);
