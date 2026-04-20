import type { BoundsRestroomsQuery } from "@poopin/api-client";
import type { Region } from "react-native-maps";

type MapBounds = Pick<BoundsRestroomsQuery, "minLat" | "maxLat" | "minLng" | "maxLng">;
type RegionChangeMetrics = {
  meaningful: boolean;
  latitudeShift: number;
  longitudeShift: number;
  minimumLatitudeShift: number;
  minimumLongitudeShift: number;
  latitudeDeltaChangeRatio: number;
  longitudeDeltaChangeRatio: number;
  minimumDeltaChangeRatio: number;
};

// At 12 % of the visible span a ~90 px swipe is needed at default zoom — too
// large for real mobile use.  3 % reduces that to ~25 px, which catches every
// deliberate pan while still filtering sub-pixel GPS jitter.
const MIN_CENTER_SHIFT_RATIO = 0.03;
const MIN_CENTER_SHIFT_DEGREES = 0.001; // hard floor ~111 m — filters GPS noise
const MAX_CENTER_SHIFT_DEGREES = 0.04; // ~4.4 km cap — prevents threshold from growing unboundedly when zoomed out
const MIN_DELTA_CHANGE_RATIO = 0.08;

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

export const getRegionChangeMetrics = (previousRegion: Region | null, nextRegion: Region): RegionChangeMetrics => {
  if (!previousRegion) {
    return {
      meaningful: true,
      latitudeShift: 0,
      longitudeShift: 0,
      minimumLatitudeShift: 0,
      minimumLongitudeShift: 0,
      latitudeDeltaChangeRatio: 0,
      longitudeDeltaChangeRatio: 0,
      minimumDeltaChangeRatio: MIN_DELTA_CHANGE_RATIO
    };
  }

  const latitudeShift = Math.abs(nextRegion.latitude - previousRegion.latitude);
  const longitudeShift = Math.abs(nextRegion.longitude - previousRegion.longitude);
  const minimumLatitudeShift = Math.max(
    Math.min(Math.min(previousRegion.latitudeDelta, nextRegion.latitudeDelta) * MIN_CENTER_SHIFT_RATIO, MAX_CENTER_SHIFT_DEGREES),
    MIN_CENTER_SHIFT_DEGREES
  );
  const minimumLongitudeShift = Math.max(
    Math.min(Math.min(previousRegion.longitudeDelta, nextRegion.longitudeDelta) * MIN_CENTER_SHIFT_RATIO, MAX_CENTER_SHIFT_DEGREES),
    MIN_CENTER_SHIFT_DEGREES
  );
  const latitudeDeltaChangeRatio =
    Math.abs(nextRegion.latitudeDelta - previousRegion.latitudeDelta) /
    Math.max(previousRegion.latitudeDelta, nextRegion.latitudeDelta, Number.EPSILON);
  const longitudeDeltaChangeRatio =
    Math.abs(nextRegion.longitudeDelta - previousRegion.longitudeDelta) /
    Math.max(previousRegion.longitudeDelta, nextRegion.longitudeDelta, Number.EPSILON);

  return {
    meaningful:
      latitudeShift >= minimumLatitudeShift ||
      longitudeShift >= minimumLongitudeShift ||
      latitudeDeltaChangeRatio >= MIN_DELTA_CHANGE_RATIO ||
      longitudeDeltaChangeRatio >= MIN_DELTA_CHANGE_RATIO,
    latitudeShift,
    longitudeShift,
    minimumLatitudeShift,
    minimumLongitudeShift,
    latitudeDeltaChangeRatio,
    longitudeDeltaChangeRatio,
    minimumDeltaChangeRatio: MIN_DELTA_CHANGE_RATIO
  };
};
