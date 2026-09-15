import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Platform, TextInput, Animated,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../theme';
import { store } from '../store';
import { useUser } from '../hooks';
import ScreenHeader from '../components/ScreenHeader';
import SettingsGroup from '../components/SettingsGroup';
import SettingsRow from '../components/SettingsRow';
import { updateProfile } from '../api';
import { useTranslation } from '../i18n';
import { useToast } from '../components/Toast';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

/* Lazy-load MapLibre (native only) */
let Map: any = null;
let Camera: any = null;
let Marker: any = null;
if (Platform.OS !== 'web') {
  try { Map = require('@maplibre/maplibre-react-native').Map; } catch {}
  try { Camera = require('@maplibre/maplibre-react-native').Camera; } catch {}
  try { Marker = require('@maplibre/maplibre-react-native').Marker; } catch {}
}

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
const HAITI_CENTER: [number, number] = [-72.3074, 18.5944];

type Props = NativeStackScreenProps<RootStackParamList, 'LocationSettings'>;

export default function LocationSettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useUser();
  const insets = useSafeAreaInsets();

  const [locAddress, setLocAddress] = useState(user?.location_address || '');
  const [locCity, setLocCity] = useState(user?.location_city || '');
  const [locLat, setLocLat] = useState(Number(user?.location_lat) || 0);
  const [locLng, setLocLng] = useState(Number(user?.location_lng) || 0);
  const [locSaving, setLocSaving] = useState(false);
  const [locDetecting, setLocDetecting] = useState(false);
  const [editing, setEditing] = useState(!user?.location_address);
  const [hasLocation, setHasLocation] = useState(Boolean(locLat && locLng));

  const anim = useRef({
    opacity: new Animated.Value(0),
    translateY: new Animated.Value(16),
  }).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(anim.opacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(anim.translateY, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleAutoDetect = async () => {
    if (Platform.OS === 'web') return;
    setLocDetecting(true);
    try {
      const Location = await import('expo-location');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        toast.warning(t('settings.locationDeniedTitle'), t('settings.locationDeniedMessage'));
        setLocDetecting(false);
        return;
      }
      const { getFastLocation } = await import('../fast-location');
      const pos = await getFastLocation();
      const lat = pos.lat;
      const lng = pos.lng;
      setLocLat(lat);
      setLocLng(lng);
      setHasLocation(true);
      let address = '';
      let city = '';
      try {
        const nominatimRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=fr,en`,
          { headers: { 'User-Agent': 'MaurMaket/1.0' } }
        );
        const nominatim = await nominatimRes.json();
        const a = nominatim.address || {};
        const street = [a.road, a.house_number].filter(Boolean).join(' ') || '';
        const neighbourhood = a.neighbourhood || a.suburb || a.city_district || '';
        city = a.city || a.municipality || a.county || '';
        address = [street, neighbourhood].filter(Boolean).join(', ') || nominatim.display_name?.split(',')[0] || '';
      } catch {}
      setLocAddress(address);
      setLocCity(city);
      try {
        const res = await updateProfile({
          locationAddress: address,
          locationCity: city,
          locationLat: String(lat),
          locationLng: String(lng),
        }) as { user: typeof user };
        if (res.user) await store.setUser(res.user, store.token);
        toast.success(t('settings.locationSaved'), t('settings.locationEditHint'));
        setEditing(false);
      } catch {
        toast.error(t('settings.error'), t('settings.locationSaveFailed'));
      }
    } catch (err: any) {
      if (err?.code === 'E_LOCATION_SERVICES_DISABLED') {
        toast.error(t('settings.error'), 'GPS is turned off. Please enable Location Services in your phone settings.');
      } else {
        toast.error(t('settings.error'), 'Could not detect location. Make sure you are outdoors or near a window.');
      }
    }
    setLocDetecting(false);
  };

  const handleSave = async () => {
    setLocSaving(true);
    try {
      const res = await updateProfile({
        locationAddress: locAddress,
        locationCity: locCity,
        ...(locLat && locLng ? { locationLat: String(locLat), locationLng: String(locLng) } : {}),
      }) as { user: typeof user };
      if (res.user) await store.setUser(res.user, store.token);
      toast.success(t('settings.locationSaved'));
      setEditing(false);
    } catch {
      toast.error(t('settings.locationSaveFailed'));
    }
    setLocSaving(false);
  };

  const mapCenter: [number, number] = hasLocation ? [locLng, locLat] : HAITI_CENTER;

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('settings.deliveryLocation')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: anim.opacity, transform: [{ translateY: anim.translateY }] }}>

          {/* ── Map ── */}
          {Map ? (
            <View style={styles.mapContainer}>
              <Map
                style={styles.map}
                mapStyle={MAP_STYLE}
                logoEnabled={false}
                attributionEnabled={false}
              >
                <Camera
                  zoomLevel={hasLocation ? 15 : 6}
                  centerCoordinate={mapCenter}
                  animationMode="flyTo"
                  animationDuration={600}
                />
                {hasLocation && (
                  <Marker coordinate={[locLng, locLat]}>
                    <View style={styles.markerWrap}>
                      <View style={styles.markerDot} />
                      <View style={styles.markerRing} />
                    </View>
                  </Marker>
                )}
              </Map>
              {/* Address overlay */}
              {locAddress ? (
                <View style={styles.mapOverlay}>
                  <MaterialCommunityIcons name="map-marker" size={14} color={COLORS.coral} />
                  <Text style={styles.mapOverlayText} numberOfLines={1}>
                    {locAddress}{locCity ? `, ${locCity}` : ''}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
            /* Web fallback */
            <View style={styles.mapFallback}>
              <MaterialCommunityIcons name="map-outline" size={48} color={COLORS.text3} />
              <Text style={styles.mapFallbackText}>Map available on mobile</Text>
            </View>
          )}

          {/* ── Auto-detect ── */}
          {Platform.OS !== 'web' && (
            <SettingsGroup>
              <SettingsRow
                icon="crosshairs-gps"
                label={locDetecting ? t('settings.locationDetecting') : t('settings.autoDetect')}
                subtitle="Use your phone's GPS to find your location"
                rightElement={
                  locDetecting ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.text3} />
                  )
                }
                onPress={handleAutoDetect}
              />
            </SettingsGroup>
          )}

          {/* ── Address fields ── */}
          <SettingsGroup
            header="Delivery Address"
            description="Set your default delivery location"
          >
            {editing ? (
              <>
                <View style={styles.inputRow}>
                  <MaterialCommunityIcons name="map-marker-outline" size={18} color={COLORS.white} />
                  <TextInput
                    style={styles.input}
                    placeholder={t('settings.deliveryAddress')}
                    placeholderTextColor={COLORS.text3}
                    value={locAddress}
                    onChangeText={setLocAddress}
                  />
                </View>
                <View style={styles.divider} />
                <View style={styles.inputRow}>
                  <MaterialCommunityIcons name="city-variant-outline" size={18} color={COLORS.white} />
                  <TextInput
                    style={styles.input}
                    placeholder={t('settings.deliveryCity')}
                    placeholderTextColor={COLORS.text3}
                    value={locCity}
                    onChangeText={setLocCity}
                  />
                </View>
              </>
            ) : (
              <SettingsRow
                icon="pencil-outline"
                label="Edit manually"
                subtitle={locAddress ? `${locAddress}${locCity ? `, ${locCity}` : ''}` : 'Set your address'}
                chevron
                onPress={() => setEditing(true)}
              />
            )}
          </SettingsGroup>

          {/* ── Save button ── */}
          <TouchableOpacity
            style={[styles.saveButton, locSaving && { opacity: 0.5 }]}
            activeOpacity={0.7}
            onPress={handleSave}
            disabled={locSaving}
          >
            {locSaving ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <Text style={styles.saveButtonText}>Save location</Text>
            )}
          </TouchableOpacity>

        </Animated.View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

/* ── Styles ──────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingBottom: SPACING.page },

  /* Map */
  mapContainer: {
    height: 200,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    borderRadius: RADIUS.card,
    overflow: 'hidden',
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  markerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
  },
  markerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.coral,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  markerRing: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.coral + '20',
  },
  mapOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.bg + 'DD',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  mapOverlayText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    flex: 1,
  },
  mapFallback: {
    height: 200,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  mapFallbackText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text3,
  },

  /* Inputs */
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    minHeight: 52,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    paddingVertical: SPACING.md,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: SPACING.lg + 18 + SPACING.md,
  },

  saveButton: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
    backgroundColor: COLORS.coral,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  saveButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },

  bottomSpacer: {
    height: 60,
  },
});
