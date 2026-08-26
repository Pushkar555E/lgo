import { useCallback, useState } from "react";
import * as Location from "expo-location";

interface CapturedLocation {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
}

interface UseLocationCaptureResult {
  captureLocation: () => Promise<CapturedLocation>;
  isCapturing: boolean;
  error: string | null;
}

export function useLocationCapture(): UseLocationCaptureResult {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const captureLocation = useCallback(async (): Promise<CapturedLocation> => {
    setIsCapturing(true);
    setError(null);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        throw new Error("Location permission denied. Enable it in Settings to tag reports.");
      }

      // High accuracy matters for hazard triage — a few hundred meters of
      // drift can put a landslide report on the wrong slope entirely.
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to capture GPS location";
      setError(message);
      throw err;
    } finally {
      setIsCapturing(false);
    }
  }, []);

  return { captureLocation, isCapturing, error };
}
