import { NativeModules, Platform } from 'react-native';

const { FastLocation } = NativeModules;

export interface FastLocationResult {
  lat: number;
  lng: number;
  accuracy: number;
  fromCache: boolean;
}

/**
 * Get a single high-accuracy GPS fix as fast as possible.
 * Uses last-known location first (instant), then requests a fresh fix.
 * Returns in <1s if cache is fresh, up to 10s otherwise.
 * Falls back to expo-location on iOS/web.
 */
export async function getFastLocation(): Promise<FastLocationResult> {
  // iOS/web — use expo-location (no native module)
  if (Platform.OS !== 'android' || !FastLocation) {
    const Location = await import('expo-location');
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? 0,
      fromCache: false,
    };
  }

  // Android — use native FusedLocationProviderClient (much faster)
  return FastLocation.getCurrentLocation() as Promise<FastLocationResult>;
}

/**
 * Cancel any pending native location request.
 */
export function cancelLocationRequest(): void {
  if (Platform.OS === 'android' && FastLocation?.cancelRequest) {
    FastLocation.cancelRequest();
  }
}
