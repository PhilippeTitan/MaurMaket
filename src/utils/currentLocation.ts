import { getFastLocation } from '../fast-location';

export const LOCATION_PERMISSION_DENIED = 'LOCATION_PERMISSION_DENIED';

export interface DetectedLocation {
  lat: number;
  lng: number;
  address: string;
  city: string;
}

export async function reverseGeocodeAddress(
  lat: number,
  lng: number,
): Promise<{ address: string; city: string }> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=fr,en`,
      { headers: { 'User-Agent': 'MaurMaket/1.0' } },
    );
    const data = await res.json();
    const a = data.address || {};
    const street = [a.road, a.house_number].filter(Boolean).join(' ') || '';
    const neighbourhood = a.neighbourhood || a.suburb || a.city_district || '';
    const city = a.city || a.municipality || a.county || '';
    const address =
      [street, neighbourhood].filter(Boolean).join(', ') ||
      data.display_name?.split(',')[0] ||
      '';
    return { address: address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`, city };
  } catch {
    return { address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, city: '' };
  }
}

/**
 * One-tap "use my current location": request permission, grab a GPS fix,
 * and reverse-geocode it into a street address + city.
 * Throws an error with `code === LOCATION_PERMISSION_DENIED` when the user
 * refuses the permission; GPS-off errors surface expo-location's
 * `E_LOCATION_SERVICES_DISABLED` code.
 */
export async function detectCurrentLocation(): Promise<DetectedLocation> {
  const Location = await import('expo-location');
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    const err = new Error('Location permission denied') as Error & { code: string };
    err.code = LOCATION_PERMISSION_DENIED;
    throw err;
  }
  const pos = await getFastLocation();
  const { address, city } = await reverseGeocodeAddress(pos.lat, pos.lng);
  return { lat: pos.lat, lng: pos.lng, address, city };
}
