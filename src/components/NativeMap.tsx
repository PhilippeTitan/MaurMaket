import React, { forwardRef, useImperativeHandle, useRef, useCallback, useEffect, useState, type ReactElement } from 'react';
import { View, StyleSheet, Platform, type ViewStyle } from 'react-native';
import { Map, Camera, Marker, UserLocation, OfflineManager } from '@maplibre/maplibre-react-native';
import type { MapRef, CameraRef } from '@maplibre/maplibre-react-native';

/* ─── Map tile styles ─── */
export const MAP_STYLE_LIGHT = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
export const MAP_STYLE_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

/* ─── Haiti center ─── */
export const HAITI_CENTER: [number, number] = [-72.3074, 18.5944];

export interface NativeMapMarker {
  id: string;
  lat: number;
  lng: number;
  color?: string;
  children?: ReactElement;
  onPress?: () => void;
}

export interface NativeMapProps {
  style?: ViewStyle;
  mapStyle?: string;
  center?: [number, number];
  zoom?: number;
  showUserLocation?: boolean;
  markers?: NativeMapMarker[];
  selectedLat?: number | null;
  selectedLng?: number | null;
  selectedColor?: string;
  radiusLat?: number | null;
  radiusLng?: number | null;
  radiusMeters?: number | null;
  radiusColor?: string;
  onMapReady?: () => void;
  onRegionChange?: (lat: number, lng: number) => void;
  onPress?: (lat: number, lng: number) => void;
}

export interface NativeMapRef {
  centerOn: (lat: number, lng: number, zoom?: number) => void;
  flyTo: (lat: number, lng: number, zoom?: number) => void;
}

const NativeMap = forwardRef<NativeMapRef, NativeMapProps>(({
  style,
  mapStyle = MAP_STYLE_LIGHT,
  center = HAITI_CENTER,
  zoom = 13,
  showUserLocation = true,
  markers = [],
  selectedLat = null,
  selectedLng = null,
  selectedColor = '#FF4D6A',
  radiusLat = null,
  radiusLng = null,
  radiusMeters = null,
  radiusColor = '#00C2FF',
  onMapReady,
  onPress,
}, ref) => {
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const [ready, setReady] = useState(false);

  useImperativeHandle(ref, () => ({
    centerOn: (lat: number, lng: number, z?: number) => {
      cameraRef.current?.easeTo({ center: [lng, lat], zoom: z ?? zoom, duration: 800 });
    },
    flyTo: (lat: number, lng: number, z?: number) => {
      cameraRef.current?.easeTo({ center: [lng, lat], zoom: z ?? zoom, duration: 1200 });
    },
  }), [zoom]);

  const handleDidFinishLoadingMap = useCallback(() => {
    setReady(true);
    onMapReady?.();
  }, [onMapReady]);

  const handlePress = useCallback((e: any) => {
    if (!onPress) return;
    const coords = e.geometry?.coordinates;
    if (coords && coords.length >= 2) {
      onPress(coords[1], coords[0]); // [lng, lat] → (lat, lng)
    }
  }, [onPress]);

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.webFallback, style]}>
        {/* Web fallback — static placeholder */}
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <Map
        ref={mapRef}
        mapStyle={mapStyle}
        logo={false}
        attribution={false}
        compass={false}
        scaleBar={false}
        style={styles.map}
        onDidFinishLoadingMap={handleDidFinishLoadingMap}
        onPress={onPress ? handlePress : undefined}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{ center, zoom }}
        />

        {showUserLocation && <UserLocation animated />}

        {/* Custom markers */}
        {markers.map(m => (
          <Marker
            key={m.id}
            id={m.id}
            lngLat={[m.lng, m.lat] as [number, number]}
            anchor="bottom"
            onPress={m.onPress}
          >
            {m.children ?? (
              <View style={[styles.defaultMarker, { backgroundColor: m.color || selectedColor }]}>
                <View style={styles.defaultMarkerInner} />
              </View>
            )}
          </Marker>
        ))}

        {/* Selected location marker (for picker mode) */}
        {selectedLat != null && selectedLng != null && !markers.length && (
          <Marker
            id="selected"
            lngLat={[selectedLng, selectedLat] as [number, number]}
            anchor="bottom"
          >
            <View style={[styles.defaultMarker, { backgroundColor: selectedColor }]}>
              <View style={styles.defaultMarkerInner} />
            </View>
          </Marker>
        )}

        {/* Radius circle (via marker + estimated circle overlay) */}
        {/* MapLibre GL doesn't have a native Circle component — use ShapeSource + FillLayer for precise circles */}
        {/* For now, we skip the visual circle — it will be added when fulfillment settings need it */}
      </Map>
    </View>
  );
});

NativeMap.displayName = 'NativeMap';

export default NativeMap;

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  map: { flex: 1 },
  webFallback: {
    flex: 1,
    backgroundColor: '#0D1117',
    justifyContent: 'center',
    alignItems: 'center',
  },
  defaultMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  defaultMarkerInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
});
