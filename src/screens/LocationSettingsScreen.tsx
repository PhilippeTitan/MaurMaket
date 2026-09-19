import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Platform, TextInput, Animated, ScrollView, KeyboardAvoidingView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS, TOUCH } from '../theme';
import { store } from '../store';
import { useUser } from '../hooks';
import { updateProfile } from '../api';
import { useTranslation } from '@/localization';
import { useToast } from '../components/Toast';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BackButton from '../components/BackButton';
import AuthInput from '../components/AuthInput';
import PrimaryButton from '../components/PrimaryButton';
import SettingsLinkButton from '../components/SettingsLinkButton';
import NativeMap, { MAP_STYLE_LIGHT, type NativeMapRef } from '../components/NativeMap';
import { searchAreasHybrid, type HaitiArea } from '../data/haiti-areas';
import { getFastLocation } from '../fast-location';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'LocationSettings'>;
type Step = 'map' | 'confirm' | 'details';

const HEADER_TOP_PAD = 8;

export default function LocationSettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useUser();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<NativeMapRef>(null);

  /* ── Location state ── */
  const [selectedLat, setSelectedLat] = useState<number | null>(Number(user?.location_lat) || null);
  const [selectedLng, setSelectedLng] = useState<number | null>(Number(user?.location_lng) || null);
  const [address, setAddress] = useState(user?.location_address || '');
  const [city, setCity] = useState(user?.location_city || '');

  /* ── Step flow ── */
  const hasSavedLocation = Boolean(user?.location_address);
  const [step, setStep] = useState<Step>(hasSavedLocation ? 'confirm' : 'map');

  /* ── Search ── */
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<HaitiArea[]>([]);
  const [searching, setSearching] = useState(false);

  /* ── Delivery details ── */
  const [building, setBuilding] = useState('');
  const [apartment, setApartment] = useState('');
  const [landmark, setLandmark] = useState('');
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);

  /* ── Animation ── */
  const anim = useRef({
    opacity: new Animated.Value(0),
    translateY: new Animated.Value(20),
  }).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(anim.opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(anim.translateY, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  /* ── Reverse geocode ── */
  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=fr,en`,
        { headers: { 'User-Agent': 'MaurMaket/1.0' } },
      );
      const data = await res.json();
      const a = data.address || {};
      const street = [a.road, a.house_number].filter(Boolean).join(' ') || '';
      const neighbourhood = a.neighbourhood || a.suburb || a.city_district || '';
      const detectedCity = a.city || a.municipality || a.county || '';
      const addr = [street, neighbourhood].filter(Boolean).join(', ') || data.display_name?.split(',')[0] || '';
      setAddress(addr);
      setCity(detectedCity);
      return { addr, city: detectedCity };
    } catch {
      const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      setAddress(fallback);
      setCity('');
      return { addr: fallback, city: '' };
    }
  }, []);

  /* ── Map tap ── */
  const handleMapPress = useCallback((lat: number, lng: number) => {
    setSelectedLat(lat);
    setSelectedLng(lng);
    mapRef.current?.flyTo(lat, lng, 16);
    reverseGeocode(lat, lng);
    setStep('confirm');
  }, [reverseGeocode]);

  /* ── Find me ── */
  const handleFindMe = useCallback(async () => {
    if (Platform.OS === 'web') return;
    setDetecting(true);
    try {
      const { status } = await (await import('expo-location')).requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        toast.warning(t('settings.locationDeniedTitle'), t('settings.locationDeniedMessage'));
        setDetecting(false);
        return;
      }
      const pos = await getFastLocation();
      setSelectedLat(pos.lat);
      setSelectedLng(pos.lng);
      mapRef.current?.centerOn(pos.lat, pos.lng, 15);
      await reverseGeocode(pos.lat, pos.lng);
      setStep('confirm');
    } catch (err: any) {
      if (err?.code === 'E_LOCATION_SERVICES_DISABLED') {
        toast.error(t('settings.error'), t('locationSettings.gpsOff'));
      } else {
        toast.error(t('settings.error'), t('locationSettings.detectFailed'));
      }
    }
    setDetecting(false);
  }, [reverseGeocode, t, toast]);

  /* ── Search debounce ── */
  useEffect(() => {
    if (searchQuery.length < 1) { setSearchResults([]); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      const results = await searchAreasHybrid(searchQuery);
      setSearchResults(results);
      setSearching(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectArea = useCallback((area: HaitiArea) => {
    setSelectedLat(area.lat);
    setSelectedLng(area.lng);
    setAddress(area.name);
    setCity(area.city);
    const zoom = area.radius < 300 ? 16 : area.radius < 600 ? 15 : area.radius < 1200 ? 14 : 13;
    mapRef.current?.flyTo(area.lat, area.lng, zoom);
    setSearchFocused(false);
    setSearchQuery('');
    setSearchResults([]);
    setStep('confirm');
  }, []);

  /* ── Confirm location ── */
  const handleConfirmLocation = useCallback(() => {
    setStep('details');
  }, []);

  /* ── Change location ── */
  const handleChangeLocation = useCallback(() => {
    setSelectedLat(null);
    setSelectedLng(null);
    setAddress('');
    setCity('');
    setStep('map');
  }, []);

  /* ── Save ── */
  const handleSave = useCallback(async () => {
    if (!selectedLat || !selectedLng || !address) return;
    setSaving(true);
    try {
      const res = await updateProfile({
        locationAddress: address,
        locationCity: city,
        locationLat: String(selectedLat),
        locationLng: String(selectedLng),
      }) as { user: typeof user };
      if (res.user) await store.setUser(res.user, store.token);
      toast.success(t('settings.locationSaved'));
      navigation.goBack();
    } catch {
      toast.error(t('settings.locationSaveFailed'));
    }
    setSaving(false);
  }, [selectedLat, selectedLng, address, city, t, toast, navigation]);

  /* ── Handle back ── */
  const handleBack = useCallback(() => {
    if (step === 'details') {
      setStep('confirm');
    } else if (step === 'confirm') {
      if (!hasSavedLocation) {
        handleChangeLocation();
      } else {
        navigation.goBack();
      }
    } else {
      navigation.goBack();
    }
  }, [step, hasSavedLocation, navigation, handleChangeLocation]);

  /* ─── Web fallback ─── */
  if (Platform.OS === 'web') {
    return (
      <View style={styles.container} pointerEvents="box-none">
        <View style={[styles.header, { paddingTop: insets.top + HEADER_TOP_PAD, zIndex: 50 }]}>
          <View style={styles.headerSide}>
            <BackButton onPress={() => navigation.goBack()} size={24} />
          </View>
          <Text style={styles.headerTitle}>{t('settings.deliveryLocation')}</Text>
          <View style={styles.headerSide} />
        </View>
        <View style={styles.webFallback}>
          <MaterialCommunityIcons name="map-marker-outline" size={48} color={COLORS.text3} />
          <Text style={styles.webFallbackText}>{t('locationSettings.mapMobileOnly')}</Text>
        </View>
      </View>
    );
  }

  /* ─── Main render ─── */
  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Full-screen Map */}
      <NativeMap
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        showUserLocation
        selectedLat={selectedLat}
        selectedLng={selectedLng}
        selectedColor={COLORS.coral}
        onPress={handleMapPress}
      />

      {/* Floating header */}
      <Animated.View style={[styles.header, { paddingTop: insets.top + HEADER_TOP_PAD, zIndex: 50 }, { opacity: anim.opacity }]}>
        <View style={styles.headerSide}>
          <BackButton onPress={handleBack} size={24} />
        </View>
        <Text style={styles.headerTitle}>{t('settings.deliveryLocation')}</Text>
        <View style={styles.headerSide} />
      </Animated.View>

      {/* Floating "Find me" button */}
      {step !== 'details' && (
        <TouchableOpacity
          style={[styles.findMeBtn, { top: insets.top + 64, zIndex: 50 }]}
          onPress={handleFindMe}
          disabled={detecting}
          activeOpacity={0.7}
          accessibilityLabel={t('locationSettings.findMeA11y')}
          accessibilityRole="button"
        >
          {detecting ? (
            <ActivityIndicator size="small" color={COLORS.coral} />
          ) : (
            <MaterialCommunityIcons name="crosshairs-gps" size={20} color={COLORS.coral} />
          )}
        </TouchableOpacity>
      )}

      {/* Search bar (map step only) */}
      {step === 'map' && (
        <View style={[styles.searchContainer, { top: insets.top + 64, zIndex: 50 }]}>
          <View style={styles.searchBar}>
            <AuthInput
              icon="magnify"
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t('locationSettings.searchPlaceholder')}
              returnKeyType="search"
              rightIcon={searchQuery.length > 0 ? 'close-circle' : undefined}
              onRightPress={() => { setSearchQuery(''); setSearchResults([]); }}
              style={{ marginBottom: 0 }}
              accessibilityLabel={t('locationSettings.searchA11y')}
            />
          </View>

          {searchFocused && (searching || searchResults.length > 0) && (
            <View style={styles.searchResults}>
              {searching && searchResults.length === 0 && (
                <View style={styles.searchLoading}>
                  <ActivityIndicator size="small" color={COLORS.coral} />
                  <Text style={styles.searchLoadingText}>{t('locationSettings.searching')}</Text>
                </View>
              )}
              {searchResults.map((area) => (
                <TouchableOpacity
                  key={area.id}
                  style={styles.resultItem}
                  onPress={() => handleSelectArea(area)}
                  accessibilityLabel={`select ${area.name}`}
                  accessibilityRole="button"
                >
                  <MaterialCommunityIcons name="map-marker-outline" size={16} color={COLORS.coral} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resultName} numberOfLines={1}>{area.name}</Text>
                    <Text style={styles.resultCity} numberOfLines={1}>{area.city}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text2} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Bottom card */}
      <Animated.View
        style={[
          styles.bottomCard,
          { bottom: insets.bottom + SPACING.lg, zIndex: 50 },
          { opacity: anim.opacity, transform: [{ translateY: anim.translateY }] },
        ]}
      >
        {/* Step: MAP — prompt to tap */}
        {step === 'map' && (
          <>
            <View style={styles.cardIconWrap}>
              <MaterialCommunityIcons name="map-marker-plus" size={28} color={COLORS.coral} />
            </View>
            <Text style={styles.cardTitle}>{t('locationSettings.deliverWhere')}</Text>
            <Text style={styles.cardHint}>{t('locationSettings.tapMapHint')}</Text>
          </>
        )}

        {/* Step: CONFIRM — show address */}
        {step === 'confirm' && (
          <>
            <View style={styles.cardIconRow}>
              <View style={styles.cardIconSmall}>
                <MaterialCommunityIcons name="map-marker" size={18} color={COLORS.coral} />
              </View>
              <Text style={styles.cardLabel}>{t('locationSettings.selected')}</Text>
            </View>
            <Text style={styles.cardAddress} numberOfLines={2}>{address || t('locationSettings.notFound')}</Text>
            {city ? <Text style={styles.cardCity}>{city}</Text> : null}

            <PrimaryButton onPress={handleConfirmLocation} accessibilityLabel={t('locationSettings.confirmA11y')}>
              {t('locationSettings.confirm')}
            </PrimaryButton>
            <SettingsLinkButton onPress={handleChangeLocation} style={{ marginTop: SPACING.sm }}>
              {t('locationSettings.change')}
            </SettingsLinkButton>
          </>
        )}

        {/* Step: DETAILS — delivery form */}
        {step === 'details' && (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView style={styles.detailsScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.detailsTitle}>{t('locationSettings.deliveryDetails')}</Text>
              <Text style={styles.detailsSubtitle}>{t('locationSettings.detailsTitle')}</Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{t('locationSettings.buildingLabel')}</Text>
                <AuthInput
                  icon="home-modern"
                  value={building}
                  onChangeText={setBuilding}
                  placeholder={t('locationSettings.buildingPlaceholder')}
                  accessibilityLabel={t('locationSettings.buildingA11y')}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{t('locationSettings.aptLabel')}</Text>
                <AuthInput
                  icon="door-closed"
                  value={apartment}
                  onChangeText={setApartment}
                  placeholder={t('locationSettings.aptPlaceholder')}
                  accessibilityLabel={t('locationSettings.aptA11y')}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{t('locationSettings.landmarkLabel')}</Text>
                <AuthInput
                  icon="map-marker-outline"
                  value={landmark}
                  onChangeText={setLandmark}
                  placeholder={t('locationSettings.landmarkPlaceholder')}
                  accessibilityLabel={t('locationSettings.landmarkA11y')}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{t('locationSettings.instructionsLabel')}</Text>
                <AuthInput
                  icon="text-box-outline"
                  value={instructions}
                  onChangeText={setInstructions}
                  placeholder={t('locationSettings.instructionsPlaceholder')}
                  multiline
                  numberOfLines={3}
                  accessibilityLabel={t('locationSettings.instructionsA11y')}
                />
              </View>

              <PrimaryButton onPress={handleSave} disabled={saving} loading={saving} accessibilityLabel={t('locationSettings.saveA11y')}>
                {t('locationSettings.save')}
              </PrimaryButton>

              <SettingsLinkButton onPress={() => setStep('confirm')} style={{ marginTop: SPACING.sm }}>
                {t('common.back')}
              </SettingsLinkButton>

              <View style={{ height: SPACING.xl }} />
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </Animated.View>
    </View>
  );
}

/* ── Styles ──────────────────────────────────────────────── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  /* Header */
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md,
    zIndex: 20,
  },
  headerSide: { width: TOUCH.min, height: TOUCH.min, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    fontSize: FONT_SIZES.lg, fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text, textAlign: 'center',
    textShadowColor: '#000', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },

  /* Find me button */
  findMeBtn: {
    position: 'absolute', right: SPACING.lg,
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: COLORS.surface + 'EE',
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
    zIndex: 15,
  },

  /* Search */
  searchContainer: {
    position: 'absolute', left: SPACING.lg, right: SPACING.lg,
    zIndex: 15,
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface + 'EE', borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.pill, paddingHorizontal: SPACING.lg, height: 48,
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
  },
  searchInput: { flex: 1, color: COLORS.text, fontSize: FONT_SIZES.md, padding: 0 },
  searchResults: {
    marginTop: SPACING.sm, backgroundColor: COLORS.surface + 'EE',
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.card,
    maxHeight: 220, overflow: 'hidden',
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
  },
  searchLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: SPACING.lg },
  searchLoadingText: { fontSize: FONT_SIZES.sm, color: COLORS.text2 },
  resultItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: SPACING.lg, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  resultName: { fontSize: FONT_SIZES.md, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.text },
  resultCity: { fontSize: FONT_SIZES.sm, color: COLORS.text2, marginTop: 2 },

  /* Bottom card */
  bottomCard: {
    position: 'absolute', left: SPACING.lg, right: SPACING.lg,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.media, padding: SPACING.xl,
    elevation: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12,
    zIndex: 20,
  },

  /* Card — map step */
  cardIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.coral + '15', alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginBottom: SPACING.md,
  },
  cardTitle: {
    fontSize: FONT_SIZES.xl, fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text, textAlign: 'center', marginBottom: SPACING.xs,
  },
  cardHint: {
    fontSize: FONT_SIZES.md, color: COLORS.text2,
    textAlign: 'center', lineHeight: 20,
  },

  /* Card — confirm step */
  cardIconRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  cardIconSmall: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.coral + '15', alignItems: 'center', justifyContent: 'center',
  },
  cardLabel: { fontSize: FONT_SIZES.sm, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.text2, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardAddress: { fontSize: FONT_SIZES.lg, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.text, marginBottom: SPACING.xs, lineHeight: 22 },
  cardCity: { fontSize: FONT_SIZES.md, color: COLORS.text2, marginBottom: SPACING.xl },

  /* Card — details step */
  detailsScroll: { maxHeight: 320 },
  detailsTitle: {
    fontSize: FONT_SIZES.title, fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text, marginBottom: SPACING.xs,
  },
  detailsSubtitle: {
    fontSize: FONT_SIZES.md, color: COLORS.text2,
    marginBottom: SPACING.xl, lineHeight: 20,
  },

  /* Onboarding wizard button language */
  primaryBtn: {
    width: '100%', paddingVertical: 14, borderRadius: RADIUS.media,
    backgroundColor: COLORS.coral, alignItems: 'center', marginTop: SPACING.xl,
  },
  primaryBtnText: { color: COLORS.white, fontSize: FONT_SIZES.lg, fontWeight: FONT_WEIGHTS.bold },
  linkBtn: { paddingVertical: 10 },
  linkBtnText: { color: COLORS.text2, fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.medium, textAlign: 'center' },

  /* Form fields */
  fieldGroup: { gap: 6, marginBottom: SPACING.md },
  label: { fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.text },
  input: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.card, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: FONT_SIZES.md, color: COLORS.text,
  },
  textArea: { minHeight: 80, paddingTop: 12 },

  /* Web fallback */
  webFallback: {
    flex: 1, backgroundColor: COLORS.bg,
    alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
  },
  webFallbackText: { fontSize: FONT_SIZES.sm, color: COLORS.text3 },
});
