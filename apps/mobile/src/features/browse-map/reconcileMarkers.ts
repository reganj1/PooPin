import type { NearbyBathroom } from "@poopin/domain";

export interface RenderedMarker {
  id: string;
  coordinate: {
    latitude: number;
    longitude: number;
  };
  title: string;
  description: string;
}

const isValidCoordinate = (value: number) => Number.isFinite(value);
const DEFAULT_MAP_MARKER_CAP = 120;

const toLocationLine = (restroom: NearbyBathroom) => [restroom.address, restroom.city, restroom.state].filter(Boolean).join(", ");

const toRenderedMarker = (restroom: NearbyBathroom): RenderedMarker => ({
  id: restroom.id,
  coordinate: {
    latitude: restroom.lat,
    longitude: restroom.lng
  },
  description: toLocationLine(restroom),
  title: restroom.name
});

const markersMatch = (left: RenderedMarker, right: RenderedMarker) =>
  left.id === right.id &&
  left.title === right.title &&
  left.description === right.description &&
  left.coordinate.latitude === right.coordinate.latitude &&
  left.coordinate.longitude === right.coordinate.longitude;

export const reconcileMarkers = (previousMarkers: RenderedMarker[], restrooms: NearbyBathroom[]) => {
  const nextMarkersById = new Map<string, RenderedMarker>();
  const nextMarkerIdsInOrder: string[] = [];

  for (const restroom of restrooms) {
    if (!isValidCoordinate(restroom.lat) || !isValidCoordinate(restroom.lng) || nextMarkersById.has(restroom.id)) {
      continue;
    }

    const marker = toRenderedMarker(restroom);
    nextMarkersById.set(marker.id, marker);
    nextMarkerIdsInOrder.push(marker.id);
  }

  const reconciledMarkers: RenderedMarker[] = [];
  const preservedExistingIds = new Set<string>();
  let changed = previousMarkers.length !== nextMarkersById.size;

  for (const previousMarker of previousMarkers) {
    const nextMarker = nextMarkersById.get(previousMarker.id);
    if (!nextMarker) {
      changed = true;
      continue;
    }

    preservedExistingIds.add(previousMarker.id);
    if (markersMatch(previousMarker, nextMarker)) {
      reconciledMarkers.push(previousMarker);
      continue;
    }

    changed = true;
    reconciledMarkers.push(nextMarker);
  }

  for (const markerId of nextMarkerIdsInOrder) {
    if (preservedExistingIds.has(markerId)) {
      continue;
    }

    const nextMarker = nextMarkersById.get(markerId);
    if (!nextMarker) {
      continue;
    }

    changed = true;
    reconciledMarkers.push(nextMarker);
  }

  if (!changed && reconciledMarkers.length === previousMarkers.length) {
    return previousMarkers;
  }

  return reconciledMarkers;
};

export const selectMapMarkerRestrooms = (
  previousMarkers: RenderedMarker[],
  restrooms: NearbyBathroom[],
  options?: {
    cap?: number;
    pinnedRestroomId?: string | null;
  }
) => {
  const cap = options?.cap ?? DEFAULT_MAP_MARKER_CAP;
  const pinnedRestroomId = options?.pinnedRestroomId ?? null;
  const validRestrooms: NearbyBathroom[] = [];
  const validRestroomsById = new Map<string, NearbyBathroom>();
  const validRestroomIdsInOrder: string[] = [];

  for (const restroom of restrooms) {
    if (!isValidCoordinate(restroom.lat) || !isValidCoordinate(restroom.lng) || validRestroomsById.has(restroom.id)) {
      continue;
    }

    validRestrooms.push(restroom);
    validRestroomsById.set(restroom.id, restroom);
    validRestroomIdsInOrder.push(restroom.id);
  }

  if (validRestrooms.length <= cap) {
    return validRestrooms;
  }

  const nextMarkerIds: string[] = [];
  const nextMarkerIdSet = new Set<string>();
  const preservedMarkerIdSet = new Set<string>();

  for (const previousMarker of previousMarkers) {
    if (!validRestroomsById.has(previousMarker.id) || nextMarkerIdSet.has(previousMarker.id) || nextMarkerIds.length >= cap) {
      continue;
    }

    nextMarkerIds.push(previousMarker.id);
    nextMarkerIdSet.add(previousMarker.id);
    preservedMarkerIdSet.add(previousMarker.id);
  }

  for (const restroomId of validRestroomIdsInOrder) {
    if (nextMarkerIds.length >= cap) {
      break;
    }

    if (nextMarkerIdSet.has(restroomId)) {
      continue;
    }

    nextMarkerIds.push(restroomId);
    nextMarkerIdSet.add(restroomId);
  }

  if (pinnedRestroomId && validRestroomsById.has(pinnedRestroomId) && !nextMarkerIdSet.has(pinnedRestroomId)) {
    let evictionIndex = -1;

    for (let index = nextMarkerIds.length - 1; index >= 0; index -= 1) {
      const markerId = nextMarkerIds[index];
      if (!preservedMarkerIdSet.has(markerId)) {
        evictionIndex = index;
        break;
      }
    }

    if (evictionIndex === -1) {
      for (let index = nextMarkerIds.length - 1; index >= 0; index -= 1) {
        const markerId = nextMarkerIds[index];
        if (markerId !== pinnedRestroomId) {
          evictionIndex = index;
          break;
        }
      }
    }

    if (evictionIndex !== -1) {
      nextMarkerIdSet.delete(nextMarkerIds[evictionIndex]);
      nextMarkerIds[evictionIndex] = pinnedRestroomId;
      nextMarkerIdSet.add(pinnedRestroomId);
    }
  }

  return nextMarkerIds
    .map((restroomId) => validRestroomsById.get(restroomId))
    .filter((restroom): restroom is NearbyBathroom => Boolean(restroom));
};
