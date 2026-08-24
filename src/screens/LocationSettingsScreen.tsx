import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Platform, TextInput,
} from 'react-native';
import { Icon } from '../components/icons/Icon';
import { COLORS, SPACING, RADIUS } from '../theme';
import { store } from '../store';
import { useUser } from '../hooks';
import ScreenHeader from '../components/ScreenHeader';
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
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        mayShowUserSettingsDialog: true,
      });
      const { latitude: lat, longitude: lng } = pos.coords;
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
        // Address = street + neighbourhood. City = actual city name.
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
      <ScrollView contentContainerStyle={styles.scroll}>

      {/* ── Map preview ── */}
      <View style={styles.mapPreview}>
        <View style={styles.mapGradient} />
        <Icon name="location-pin" size={30} color={COLORS.coral} />
      </View>

      {/* ── Delivery address card ── */}
      <Text style={styles.sectionHeader}>Delivery address</Text>
      <View style={styles.addressCard}>
        <Text style={styles.addressText}>{locAddress || t('settings.deliveryAddress')}</Text>
        {locCity ? <Text style={styles.cityText}>{locCity}</Text> : null}
      </View>

      {/* ── Auto-detect ── */}
      {Platform.OS !== 'web' && (
        <TouchableOpacity style={styles.autoDetectBtn} onPress={handleAutoDetect} disabled={locDetecting}>
          {locDetecting ? (
            <ActivityIndicator size={14} color={COLORS.blue} />
          ) : (
            <Icon name="my-location" size={16} color={COLORS.blue} />
          )}
          <Text style={styles.autoDetectText}>
            {locDetecting ? t('settings.locationDetecting') : t('settings.autoDetect')}
          </Text>
        </TouchableOpacity>
      )}

      {/* ── Edit manually ── */}
      {editing ? (
        <View style={styles.editSection}>
          <TextInput
            style={styles.input}
            placeholder={t('settings.deliveryAddress')}
            placeholderTextColor={COLORS.text2}
            value={locAddress}
            onChangeText={setLocAddress}
          />
          <TextInput
            style={styles.input}
            placeholder={t('settings.deliveryCity')}
            placeholderTextColor={COLORS.text2}
            value={locCity}
            onChangeText={setLocCity}
          />
        </View>
      ) : (
        <TouchableOpacity style={styles.editRow} onPress={() => setEditing(true)}>
          <Icon name="edit" size={17} color={COLORS.text2} />
          <Text style={styles.editRowLabel}>Edit manually</Text>
          <Icon name="chevron-right" size={16} color={COLORS.text2} />
        </TouchableOpacity>
      )}

      {/* ── Save button ── */}
      <View style={styles.saveWrap}>
        <TouchableOpacity
          style={[styles.saveBtn, locSaving && { opacity: 0.5 }]}
          onPress={handleSave}
          disabled={locSaving}
        >
          {locSaving ? (
            <ActivityIndicator size={16} color={COLORS.white} />
          ) : (
            <Text style={styles.saveBtnText}>Save location</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingBottom: 20 },

  /* Map preview */
  mapPreview: {
    height: 150, margin: 14, borderRadius: 14, overflow: 'hidden',
    backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  mapGradient: {
    ...StyleSheet.absoluteFill,
    backgroundColor: COLORS.surface2,
  },

  /* Section header */
  sectionHeader: {
    fontSize: 10, fontWeight: '700', color: COLORS.text2,
    textTransform: 'uppercase', letterSpacing: 0.4,
    marginHorizontal: 14, marginTop: 12, marginBottom: 4,
  },

  /* Address card */
  addressCard: {
    marginHorizontal: 14, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
    padding: 12,
  },
  addressText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  cityText: { fontSize: 12, color: COLORS.text2, marginTop: 2 },

  /* Auto-detect */
  autoDetectBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 14, marginTop: 10,
    padding: 11, paddingLeft: 14,
    borderWidth: 1, borderColor: COLORS.blue + '40', borderRadius: 12,
  },
  autoDetectText: { fontSize: 13, color: COLORS.blue, fontWeight: '600' },

  /* Edit manually */
  editRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 12, marginTop: 8,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  editRowLabel: { flex: 1, fontSize: 14, color: COLORS.text },

  /* Edit inputs */
  editSection: {
    marginHorizontal: 14, marginTop: 8,
  },
  input: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.row, padding: 12, color: COLORS.text, fontSize: 13,
    marginBottom: 8,
  },

  /* Save */
  saveWrap: {
    padding: 16, marginTop: 8,
  },
  saveBtn: {
    backgroundColor: COLORS.coral, borderRadius: 12,
    padding: 13, alignItems: 'center',
  },
  saveBtnText: { color: COLORS.white, fontSize: 14, fontWeight: '700' },
});
