"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from "react";

export interface Coordinate {
  lat: number;
  lng: number;
}

interface PersistedLocationTrackingState {
  lastKnownLocation: Coordinate | null;
}

interface LocationTrackingContextValue {
  currentLocation: Coordinate | null;
  lastKnownLocation: Coordinate | null;
  geoError: string | null;
  isLocating: boolean;
  isLocationTrackingEnabled: boolean;
  isFollowingUserLocation: boolean;
  isAwaitingLocationFix: boolean;
  locationCenterRequestKey: number;
  hasActiveUserLocation: boolean;
  requestLocationTracking: () => void;
  stopLocationTracking: () => void;
  setIsFollowingUserLocation: Dispatch<SetStateAction<boolean>>;
}

const LOCATION_TRACKING_STORAGE_KEY = "poopin:location-tracking:v1";

const LocationTrackingContext = createContext<LocationTrackingContextValue | null>(null);

const isValidCoordinate = (value: unknown): value is Coordinate =>
  Boolean(
    value &&
      typeof value === "object" &&
      Number.isFinite((value as Coordinate).lat) &&
      Number.isFinite((value as Coordinate).lng) &&
      (value as Coordinate).lat >= -90 &&
      (value as Coordinate).lat <= 90 &&
      (value as Coordinate).lng >= -180 &&
      (value as Coordinate).lng <= 180
  );

const isLocalhostHost = (hostname: string) => hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

const toGeoErrorMessage = (error: GeolocationPositionError) => {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Location permission denied. Showing default city-center results.";
    case error.POSITION_UNAVAILABLE:
      return "Location unavailable. Showing default city-center results.";
    case error.TIMEOUT:
      return "Location request timed out. Showing default city-center results.";
    default:
      return "Could not use your location. Showing default city-center results.";
  }
};

const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 12000,
  maximumAge: 15000
};

export function LocationTrackingProvider({ children }: { children: React.ReactNode }) {
  const [currentLocation, setCurrentLocation] = useState<Coordinate | null>(null);
  const [lastKnownLocation, setLastKnownLocation] = useState<Coordinate | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isLocationTrackingEnabled, setIsLocationTrackingEnabled] = useState(false);
  const [isFollowingUserLocation, setIsFollowingUserLocation] = useState(false);
  const [isAwaitingLocationFix, setIsAwaitingLocationFix] = useState(false);
  const [locationCenterRequestKey, setLocationCenterRequestKey] = useState(0);
  const locationWatchIdRef = useRef<number | null>(null);
  const pendingLocationCenterOnResolveRef = useRef(false);
  const hasHydratedRef = useRef(false);

  const hasResolvedUserLocation = currentLocation !== null;
  const hasActiveUserLocation = isLocationTrackingEnabled && !isAwaitingLocationFix && hasResolvedUserLocation;

  const stopLocationWatch = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }

    if (locationWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(locationWatchIdRef.current);
      locationWatchIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || hasHydratedRef.current) {
      return;
    }

    hasHydratedRef.current = true;

    try {
      const rawState = window.sessionStorage.getItem(LOCATION_TRACKING_STORAGE_KEY);
      if (!rawState) {
        return;
      }

      const parsed = JSON.parse(rawState) as Partial<PersistedLocationTrackingState>;
      const restoredLastKnownLocation = parsed.lastKnownLocation ?? null;
      if (isValidCoordinate(restoredLastKnownLocation)) {
        setLastKnownLocation(restoredLastKnownLocation);
        setCurrentLocation(restoredLastKnownLocation);
      }
    } catch {
      window.sessionStorage.removeItem(LOCATION_TRACKING_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const payload: PersistedLocationTrackingState = {
      lastKnownLocation
    };

    window.sessionStorage.setItem(LOCATION_TRACKING_STORAGE_KEY, JSON.stringify(payload));
  }, [lastKnownLocation]);

  useEffect(() => {
    return () => {
      stopLocationWatch();
    };
  }, [stopLocationWatch]);

  const handleResolvedPosition = useCallback((position: GeolocationPosition) => {
    const nextLocation = {
      lat: position.coords.latitude,
      lng: position.coords.longitude
    };

    setCurrentLocation(nextLocation);
    setLastKnownLocation(nextLocation);
    setGeoError(null);
    setIsLocating(false);
    setIsAwaitingLocationFix(false);
    setIsLocationTrackingEnabled(true);

    if (pendingLocationCenterOnResolveRef.current) {
      pendingLocationCenterOnResolveRef.current = false;
      setLocationCenterRequestKey((current) => current + 1);
    }
  }, []);

  const handleGeolocationError = useCallback(
    (error: GeolocationPositionError) => {
      setGeoError(toGeoErrorMessage(error));
      setIsLocating(false);
      setIsAwaitingLocationFix(false);
      pendingLocationCenterOnResolveRef.current = false;

      if (error.code === error.PERMISSION_DENIED) {
        stopLocationWatch();
        setCurrentLocation(null);
        setIsLocationTrackingEnabled(false);
        setIsFollowingUserLocation(false);
      }
    },
    [stopLocationWatch]
  );

  const requestLocationTracking = useCallback(() => {
    setGeoError(null);

    if (typeof window !== "undefined" && !window.isSecureContext && !isLocalhostHost(window.location.hostname)) {
      setGeoError("Location needs HTTPS on mobile. Open Poopin over HTTPS (or localhost) to use Locate.");
      setIsLocating(false);
      setIsAwaitingLocationFix(false);
      pendingLocationCenterOnResolveRef.current = false;
      stopLocationWatch();
      setIsLocationTrackingEnabled(false);
      setIsFollowingUserLocation(false);
      return;
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Geolocation is not available in this browser. Showing default city-center results.");
      setCurrentLocation(null);
      setIsAwaitingLocationFix(false);
      pendingLocationCenterOnResolveRef.current = false;
      setIsLocationTrackingEnabled(false);
      setIsFollowingUserLocation(false);
      return;
    }

    setIsFollowingUserLocation(true);
    setIsLocationTrackingEnabled(true);

    if (locationWatchIdRef.current !== null && currentLocation) {
      pendingLocationCenterOnResolveRef.current = false;
      setIsAwaitingLocationFix(false);
      setLocationCenterRequestKey((current) => current + 1);
      return;
    }

    pendingLocationCenterOnResolveRef.current = true;
    setIsAwaitingLocationFix(true);
    setIsLocating(true);

    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          handleResolvedPosition(position);

          if (locationWatchIdRef.current !== null) {
            return;
          }

          try {
            const watchId = navigator.geolocation.watchPosition(
              handleResolvedPosition,
              handleGeolocationError,
              GEOLOCATION_OPTIONS
            );
            locationWatchIdRef.current = watchId;
          } catch {
            setGeoError("Could not enable live location updates. Showing map results without user distance.");
            setIsLocating(false);
            setIsAwaitingLocationFix(false);
            pendingLocationCenterOnResolveRef.current = false;
            setIsLocationTrackingEnabled(false);
            setIsFollowingUserLocation(false);
            setCurrentLocation(null);
          }
        },
        handleGeolocationError,
        GEOLOCATION_OPTIONS
      );
    } catch {
      setGeoError("Could not enable live location updates. Showing map results without user distance.");
      setIsLocating(false);
      setIsAwaitingLocationFix(false);
      pendingLocationCenterOnResolveRef.current = false;
      stopLocationWatch();
      setIsLocationTrackingEnabled(false);
      setIsFollowingUserLocation(false);
    }
  }, [currentLocation, handleGeolocationError, handleResolvedPosition, stopLocationWatch]);

  const stopLocationTracking = useCallback(() => {
    stopLocationWatch();
    setIsLocating(false);
    setIsAwaitingLocationFix(false);
    pendingLocationCenterOnResolveRef.current = false;
    setIsLocationTrackingEnabled(false);
    setIsFollowingUserLocation(false);
    setCurrentLocation(null);
    setGeoError(null);
  }, [stopLocationWatch]);

  const value = useMemo<LocationTrackingContextValue>(
    () => ({
      currentLocation,
      lastKnownLocation,
      geoError,
      isLocating,
      isLocationTrackingEnabled,
      isFollowingUserLocation,
      isAwaitingLocationFix,
      locationCenterRequestKey,
      hasActiveUserLocation,
      requestLocationTracking,
      stopLocationTracking,
      setIsFollowingUserLocation
    }),
    [
      currentLocation,
      geoError,
      hasActiveUserLocation,
      isAwaitingLocationFix,
      isFollowingUserLocation,
      isLocating,
      isLocationTrackingEnabled,
      lastKnownLocation,
      locationCenterRequestKey,
      requestLocationTracking,
      stopLocationTracking
    ]
  );

  return <LocationTrackingContext.Provider value={value}>{children}</LocationTrackingContext.Provider>;
}

export function useLocationTracking() {
  const context = useContext(LocationTrackingContext);

  if (!context) {
    throw new Error("useLocationTracking must be used within a LocationTrackingProvider.");
  }

  return context;
}
