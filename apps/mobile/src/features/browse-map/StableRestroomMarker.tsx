import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Marker } from "react-native-maps";
import type { RenderedMarker } from "./reconcileMarkers";
import { WCMarkerBubble } from "./WCMarkerBubble";

interface StableRestroomMarkerProps {
  isSelected: boolean;
  marker: RenderedMarker;
  onPressMarker: (restroomId: string) => void;
}

function StableRestroomMarkerComponent({ isSelected, marker, onPressMarker }: StableRestroomMarkerProps) {
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
    setTracksViewChanges(true);

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
  }, [clearRefreshTimers, isSelected]);

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
      zIndex={isSelected ? 2 : 1}
    >
      <WCMarkerBubble isSelected={isSelected} />
    </Marker>
  );
}

export const StableRestroomMarker = memo(
  StableRestroomMarkerComponent,
  (previousProps, nextProps) =>
    previousProps.isSelected === nextProps.isSelected &&
    previousProps.marker === nextProps.marker &&
    previousProps.onPressMarker === nextProps.onPressMarker
);
