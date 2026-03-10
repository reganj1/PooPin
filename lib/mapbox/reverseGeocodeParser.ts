export type ReverseGeocodeResolution = "exact_address" | "street" | "landmark" | "neighborhood" | "city_state";

export interface MapboxContext {
  id?: string;
  text?: string;
  short_code?: string;
}

export interface MapboxFeature {
  place_type?: string[];
  text?: string;
  address?: string;
  place_name?: string;
  context?: MapboxContext[];
}

export interface ReverseGeocodeResult {
  address: string;
  city: string;
  state: string;
  resolution: ReverseGeocodeResolution;
}

export interface ParsedReverseGeocode {
  result: ReverseGeocodeResult | null;
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

const getFeatureByPlaceType = (features: MapboxFeature[], placeType: string) =>
  features.find((feature) => feature.place_type?.includes(placeType));

const getContextValue = (contexts: MapboxContext[], contextPrefix: string) =>
  contexts.find((entry) => entry.id?.startsWith(`${contextPrefix}.`));

const toAddressAndResolution = (features: MapboxFeature[], city: string, state: string) => {
  const addressFeature = getFeatureByPlaceType(features, "address");
  const streetFeature = getFeatureByPlaceType(features, "street");
  const poiFeature = getFeatureByPlaceType(features, "poi");
  const neighborhoodFeature = getFeatureByPlaceType(features, "neighborhood");
  const localityFeature = getFeatureByPlaceType(features, "locality");
  const placeFeature = getFeatureByPlaceType(features, "place");

  if (addressFeature) {
    const numberedStreet = normalizeWhitespace(`${addressFeature.address ?? ""} ${addressFeature.text ?? ""}`);
    const addressLine = numberedStreet || firstSegment(addressFeature.place_name) || addressFeature.text?.trim() || "";
    if (addressLine) {
      return {
        address: addressLine,
        resolution: "exact_address" as const
      };
    }
  }

  const streetLine = streetFeature?.text?.trim() || firstSegment(streetFeature?.place_name);
  if (streetLine) {
    return {
      address: streetLine,
      resolution: "street" as const
    };
  }

  const poiLine = poiFeature?.text?.trim() || firstSegment(poiFeature?.place_name);
  if (poiLine) {
    return {
      address: poiLine,
      resolution: "landmark" as const
    };
  }

  const neighborhoodLine =
    neighborhoodFeature?.text?.trim() ||
    localityFeature?.text?.trim() ||
    placeFeature?.text?.trim() ||
    firstSegment(neighborhoodFeature?.place_name) ||
    firstSegment(localityFeature?.place_name) ||
    firstSegment(placeFeature?.place_name);
  if (neighborhoodLine) {
    return {
      address: neighborhoodLine,
      resolution: "neighborhood" as const
    };
  }

  const cityState = [city, state].filter(Boolean).join(", ");
  if (cityState) {
    return {
      address: cityState,
      resolution: "city_state" as const
    };
  }

  const firstFeatureLine = firstSegment(features[0]?.place_name) || features[0]?.text?.trim() || "";
  if (firstFeatureLine) {
    return {
      address: firstFeatureLine,
      resolution: "city_state" as const
    };
  }

  return {
    address: "",
    resolution: "city_state" as const
  };
};

export const parseMapboxReverseGeocode = (features: MapboxFeature[]): ParsedReverseGeocode => {
  const featureTypes = features.flatMap((feature) => feature.place_type ?? []).filter(Boolean);
  if (features.length === 0) {
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
    getFeatureByPlaceType(features, "place")?.text?.trim() ??
    getFeatureByPlaceType(features, "locality")?.text?.trim() ??
    "";

  const regionContext = getContextValue(allContexts, "region");
  const state = toStateCode(regionContext?.short_code) || regionContext?.text?.trim() || "";

  const { address, resolution } = toAddressAndResolution(features, city, state);
  if (!address && !city && !state) {
    return {
      result: null,
      featureTypes
    };
  }

  return {
    result: {
      address,
      city,
      state,
      resolution
    },
    featureTypes
  };
};
