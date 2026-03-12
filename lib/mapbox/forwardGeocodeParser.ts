import { MapboxContext, MapboxFeature, ReverseGeocodeResolution } from "@/lib/mapbox/reverseGeocodeParser";

export interface MapboxForwardFeature extends MapboxFeature {
  center?: number[];
  context?: MapboxContext[];
}

export interface ForwardGeocodeResult {
  lat: number;
  lng: number;
  address: string;
  city: string;
  state: string;
  resolution: ReverseGeocodeResolution;
}

export interface ParsedForwardGeocode {
  result: ForwardGeocodeResult | null;
  featureTypes: string[];
}

const firstSegment = (value: string | undefined) => {
  if (!value) {
    return "";
  }
  return value.split(",")[0]?.trim() ?? "";
};

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const toStateCode = (value: string | undefined) => {
  if (!value) {
    return "";
  }

  const normalized = value.trim();
  if (!normalized) {
    return "";
  }

  if (normalized.includes("-")) {
    const [, regionCode] = normalized.split("-");
    return regionCode?.toUpperCase() ?? "";
  }

  return normalized.slice(0, 30);
};

const getContextValue = (contexts: MapboxContext[], contextPrefix: string) =>
  contexts.find((entry) => entry.id?.startsWith(`${contextPrefix}.`));

const hasPlaceType = (feature: MapboxForwardFeature, placeType: string) => feature.place_type?.includes(placeType) ?? false;

const toCoordinates = (center: number[] | undefined): { lat: number; lng: number } | null => {
  if (!Array.isArray(center) || center.length < 2) {
    return null;
  }

  const [lng, lat] = center;
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }

  return {
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6))
  };
};

const toAddressAndResolution = (
  feature: MapboxForwardFeature,
  city: string,
  state: string
): { address: string; resolution: ReverseGeocodeResolution } => {
  if (hasPlaceType(feature, "address")) {
    const numberedStreet = normalizeWhitespace(`${feature.address ?? ""} ${feature.text ?? ""}`);
    const addressLine = numberedStreet || firstSegment(feature.place_name) || feature.text?.trim() || "";
    if (addressLine) {
      return {
        address: addressLine,
        resolution: "exact_address"
      };
    }
  }

  if (hasPlaceType(feature, "street")) {
    const streetLine = feature.text?.trim() || firstSegment(feature.place_name);
    if (streetLine) {
      return {
        address: streetLine,
        resolution: "street"
      };
    }
  }

  if (hasPlaceType(feature, "poi")) {
    const poiLine = feature.text?.trim() || firstSegment(feature.place_name);
    if (poiLine) {
      return {
        address: poiLine,
        resolution: "landmark"
      };
    }
  }

  if (hasPlaceType(feature, "neighborhood") || hasPlaceType(feature, "locality") || hasPlaceType(feature, "place")) {
    const locationLine = feature.text?.trim() || firstSegment(feature.place_name);
    if (locationLine) {
      return {
        address: locationLine,
        resolution: "neighborhood"
      };
    }
  }

  const cityState = [city, state].filter(Boolean).join(", ");
  if (cityState) {
    return {
      address: cityState,
      resolution: "city_state"
    };
  }

  const firstFeatureLine = firstSegment(feature.place_name) || feature.text?.trim() || "";
  return {
    address: firstFeatureLine,
    resolution: "city_state"
  };
};

export const parseMapboxForwardGeocode = (features: MapboxForwardFeature[]): ParsedForwardGeocode => {
  const featureTypes = features.flatMap((feature) => feature.place_type ?? []).filter(Boolean);
  const primaryFeature = features.find((feature) => toCoordinates(feature.center) !== null);
  if (!primaryFeature) {
    return {
      result: null,
      featureTypes
    };
  }

  const coordinates = toCoordinates(primaryFeature.center);
  if (!coordinates) {
    return {
      result: null,
      featureTypes
    };
  }

  const allContexts = features.flatMap((feature) => feature.context ?? []);
  const city =
    getContextValue(allContexts, "place")?.text?.trim() ??
    getContextValue(allContexts, "locality")?.text?.trim() ??
    getContextValue(allContexts, "district")?.text?.trim() ??
    (hasPlaceType(primaryFeature, "place") ? primaryFeature.text?.trim() : "") ??
    (hasPlaceType(primaryFeature, "locality") ? primaryFeature.text?.trim() : "") ??
    "";

  const regionContext = getContextValue(allContexts, "region");
  const state = toStateCode(regionContext?.short_code) || regionContext?.text?.trim() || "";

  const { address, resolution } = toAddressAndResolution(primaryFeature, city, state);

  return {
    result: {
      lat: coordinates.lat,
      lng: coordinates.lng,
      address,
      city,
      state,
      resolution
    },
    featureTypes
  };
};

