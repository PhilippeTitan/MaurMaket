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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'LocationSettings'>;

export default function LocationSettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useUser();

  const [locAddress, setLocAddress] = useState(user?.location_address || '');
  const [locCity, setLocCity] = useState(user?.location_city || '');
  const [locSaving, setLocSaving] = useState(false);
  const [locDetecting, setLocDetecting] = useState(false);
  const [editing, setEditing] = useState(!user?.location_address);

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
      }) as { user: typeof user };
      if (res.user) await store.setUser(res.user, store.token);
      toast.success(t('settings.locationSaved'));
      setEditing(false);
    } catch {
      toast.error(t('settings.locationSaveFailed'));
    }
    setLocSaving(false);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('settings.deliveryLocation')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: anim.opacity, transform: [{ translateY: anim.translateY }] }}>

          {/* ── Map preview ── */}
          <View style={styles.mapPreview}>
            <View style={styles.mapGradient} />
            <MaterialCommunityIcons name="map-marker-outline" size={40} color={COLORS.coral} />
            {locAddress ? (
              <View style={styles.mapOverlay}>
                <Text style={styles.mapAddress} numberOfLines={2}>{locAddress}</Text>
                {locCity ? <Text style={styles.mapCity}>{locCity}</Text> : null}
              </View>
            ) : null}
          </View>

          {/* ── Auto-detect ── */}
          {Platform.OS !== 'web' && (
            <SettingsGroup style={{ marginTop: 0 }}>
              <SettingsRow
                icon="crosshairs-gps"
                iconColor={COLORS.blue}
                iconBg={COLORS.blueMuted}
                label={locDetecting ? t('settings.locationDetecting') : t('settings.autoDetect')}
                subtitle="Use your phone's GPS to find your location"
                rightElement={
                  locDetecting ? (
                    <ActivityIndicator size="small" color={COLORS.blue} />
                  ) : (
                    <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.blue} />
                  )
                }
                onPress={handleAutoDetect}
              />
            </SettingsGroup>
          )}

          {/* ── Address fields ── */}
          <SettingsGroup
            header="Delivery Address"
            accentColor={COLORS.green}
            description="Set your default delivery location"
          >
            {editing ? (
              <>
                <View style={styles.inputRow}>
                  <MaterialCommunityIcons name="map-marker-outline" size={18} color={COLORS.green} />
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
                  <MaterialCommunityIcons name="city-variant-outline" size={18} color={COLORS.green} />
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
                iconBg={COLORS.surface2}
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

  /* Map preview */
  mapPreview: {
    height: 150,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    borderRadius: RADIUS.card,
    overflow: 'hidden',
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  mapGradient: {
    ...StyleSheet.absoluteFill,
    backgroundColor: COLORS.surface2,
  },
  mapOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.bg + 'CC',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  mapAddress: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: FONT_WEIGHTS.medium,
  },
  mapCity: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.text2,
    marginTop: 2,
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
