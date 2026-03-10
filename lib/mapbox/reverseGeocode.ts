import { MAPBOX_ACCESS_TOKEN, isMapboxConfigured } from "@/lib/mapbox/config";

interface MapboxContext {
  id?: string;
  text?: string;
  short_code?: string;
}

interface MapboxFeature {
  place_type?: string[];
  text?: string;
  address?: string;
  place_name?: string;
  context?: MapboxContext[];
}

interface MapboxReverseGeocodeResponse {
  features?: MapboxFeature[];
}

export interface ReverseGeocodeResult {
  address: string;
  city: string;
  state: string;
}

const MAPBOX_GEOCODING_BASE_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places";

const getFeatureByPlaceType = (features: MapboxFeature[], placeType: string) =>
  features.find((feature) => feature.place_type?.includes(placeType));

const getContextValue = (feature: MapboxFeature | undefined, contextPrefix: string) =>
  feature?.context?.find((entry) => entry.id?.startsWith(`${contextPrefix}.`));

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

const firstSegment = (value: string | undefined) => {
  if (!value) {
    return "";
  }

  return value.split(",")[0]?.trim() ?? "";
};

const getAddressLine = (features: MapboxFeature[]) => {
  const addressFeature = getFeatureByPlaceType(features, "address");
  if (addressFeature) {
    const streetNumber = addressFeature.address?.trim();
    const streetName = addressFeature.text?.trim();
    if (streetNumber && streetName) {
      return `${streetNumber} ${streetName}`;
    }

    const primaryAddressSegment = firstSegment(addressFeature.place_name);
    if (primaryAddressSegment) {
      return primaryAddressSegment;
    }
  }

  const poiFeature = getFeatureByPlaceType(features, "poi");
  if (poiFeature?.text?.trim()) {
    return poiFeature.text.trim();
  }

  const streetFeature = getFeatureByPlaceType(features, "street");
  if (streetFeature?.text?.trim()) {
    return streetFeature.text.trim();
  }

  const neighborhoodFeature = getFeatureByPlaceType(features, "neighborhood");
  if (neighborhoodFeature?.text?.trim()) {
    return neighborhoodFeature.text.trim();
  }

  const placeFeature = getFeatureByPlaceType(features, "place");
  if (placeFeature?.text?.trim()) {
    return placeFeature.text.trim();
  }

  return "";
};

export const reverseGeocodeCoordinates = async (
  coordinates: { lat: number; lng: number },
  signal?: AbortSignal
): Promise<ReverseGeocodeResult | null> => {
  if (!isMapboxConfigured) {
    return null;
  }

  const endpoint = `${MAPBOX_GEOCODING_BASE_URL}/${coordinates.lng},${coordinates.lat}.json`;
  const query = new URLSearchParams({
    access_token: MAPBOX_ACCESS_TOKEN,
    language: "en",
    limit: "8",
    types: "address,poi,street,neighborhood,locality,place,district,region"
  });

  const response = await fetch(`${endpoint}?${query.toString()}`, { signal });
  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as MapboxReverseGeocodeResponse;
  const features = json.features ?? [];
  if (features.length === 0) {
    return null;
  }

  const address = getAddressLine(features);

  const contextSource =
    getFeatureByPlaceType(features, "address") ??
    getFeatureByPlaceType(features, "poi") ??
    getFeatureByPlaceType(features, "street") ??
    features[0];

  const city =
    getContextValue(contextSource, "place")?.text?.trim() ??
    getContextValue(contextSource, "locality")?.text?.trim() ??
    getContextValue(contextSource, "district")?.text?.trim() ??
    getFeatureByPlaceType(features, "place")?.text?.trim() ??
    "";

  const regionContext = getContextValue(contextSource, "region");
  const state = toStateCode(regionContext?.short_code) || regionContext?.text?.trim() || "";

  if (!address && !city && !state) {
    return null;
  }

  return {
    address: address || city,
    city,
    state
  };
};
