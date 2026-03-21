export type MapsPlatform = "ios" | "android" | "desktop";

export const getAppleMapsDirectionsUrl = (lat: number, lng: number) =>
  `http://maps.apple.com/?daddr=${encodeURIComponent(`${lat},${lng}`)}`;

export const getGoogleMapsDirectionsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`;

export const detectMapsPlatform = (): MapsPlatform => {
  if (typeof navigator === "undefined") {
    return "desktop";
  }

  const userAgent = navigator.userAgent ?? "";
  const platform = navigator.platform ?? "";
  const maxTouchPoints = navigator.maxTouchPoints ?? 0;
  const isAndroid = /Android/i.test(userAgent);
  const isIOS =
    /iPhone|iPad|iPod/i.test(userAgent) ||
    (platform === "MacIntel" && maxTouchPoints > 1);

  if (isIOS) {
    return "ios";
  }

  if (isAndroid) {
    return "android";
  }

  return "desktop";
};

export const getPreferredDirectionsUrl = (lat: number, lng: number, platform: MapsPlatform) => {
  if (platform === "ios") {
    return getAppleMapsDirectionsUrl(lat, lng);
  }

  return getGoogleMapsDirectionsUrl(lat, lng);
};
