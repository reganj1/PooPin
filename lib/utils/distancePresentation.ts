export type DistanceReferenceKind = "user" | "map" | "place";

interface FormatDistanceLabelOptions {
  referenceKind?: DistanceReferenceKind | null;
  referenceLabel?: string | null;
  compact?: boolean;
}

const FALLBACK_PLACE_LABEL = "selected area";

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const toPlaceReferenceLabel = (value: string | null | undefined, compact: boolean) => {
  const normalized = normalizeWhitespace(value ?? "");
  if (!normalized) {
    return FALLBACK_PLACE_LABEL;
  }

  const firstSegment = normalized.split(",")[0]?.trim() ?? normalized;
  const maxLength = compact ? 22 : 40;
  if (firstSegment.length <= maxLength) {
    return firstSegment;
  }

  return FALLBACK_PLACE_LABEL;
};

export const formatDistanceLabel = (
  value: number,
  { referenceKind = "user", referenceLabel = null, compact = false }: FormatDistanceLabelOptions = {}
) => {
  if (!Number.isFinite(value) || value < 0) {
    return "";
  }

  const approximateDistance = `~${value.toFixed(1)} mi`;
  const placeLabel = referenceKind === "place" ? toPlaceReferenceLabel(referenceLabel, compact) : null;

  if (value < 0.1) {
    switch (referenceKind) {
      case "map":
        return compact ? "Near center" : "Very close to map center";
      case "place":
        return placeLabel ? `Near ${placeLabel}` : "Very close";
      default:
        return "Very close";
    }
  }

  switch (referenceKind) {
    case "map":
      return compact ? `${approximateDistance} from center` : `${approximateDistance} from map center`;
    case "place":
      return placeLabel ? `${approximateDistance} from ${placeLabel}` : `${approximateDistance} from ${FALLBACK_PLACE_LABEL}`;
    default:
      return `${approximateDistance} away`;
  }
};
