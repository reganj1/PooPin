import { useEffect, useState } from "react";
import * as Location from "expo-location";

interface Coordinates {
  lat: number;
  lng: number;
}

type PermissionStatus = "requesting" | "granted" | "denied" | "unavailable";

interface CurrentLocationState {
  coordinates: Coordinates | null;
  permissionStatus: PermissionStatus;
  errorMessage: string | null;
}

export const useCurrentLocation = (): CurrentLocationState => {
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>("requesting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadLocation = async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (cancelled) {
          return;
        }

        if (permission.status !== "granted") {
          setPermissionStatus("denied");
          setErrorMessage("Location access is off, so Poopin is showing a default nearby area for now.");
          return;
        }

        const currentPosition = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced
        });

        if (cancelled) {
          return;
        }

        setCoordinates({
          lat: currentPosition.coords.latitude,
          lng: currentPosition.coords.longitude
        });
        setPermissionStatus("granted");
        setErrorMessage(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setPermissionStatus("unavailable");
        setErrorMessage(error instanceof Error ? error.message : "Location is currently unavailable.");
      }
    };

    void loadLocation();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    coordinates,
    permissionStatus,
    errorMessage
  };
};
