import type { BoundsRestroomsQuery } from "@poopin/api-client";
import type { Region } from "react-native-maps";

type MapBounds = Pick<BoundsRestroomsQuery, "minLat" | "maxLat" | "minLng" | "maxLng">;

export const regionToBounds = (region: Region): MapBounds => {
  const latitudeOffset = region.latitudeDelta / 2;
  const longitudeOffset = region.longitudeDelta / 2;

  return {
    minLat: region.latitude - latitudeOffset,
    maxLat: region.latitude + latitudeOffset,
    minLng: region.longitude - longitudeOffset,
    maxLng: region.longitude + longitudeOffset
  };
};

export const toBoundsKey = (bounds: MapBounds) =>
  `${bounds.minLat.toFixed(4)}:${bounds.maxLat.toFixed(4)}:${bounds.minLng.toFixed(4)}:${bounds.maxLng.toFixed(4)}`;
