import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Image, Platform, TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Icon } from '../components/icons/Icon';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, RADIUS, getDisplayName } from '../theme';
import { store } from '../store';
import ScreenHeader from '../components/ScreenHeader';
import { uploadImage, getImageUrl, updateSellerProfile, updateProfile } from '../api';
import { i18n, useTranslation, type Language } from '../i18n';
import { useToast } from '../components/Toast';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const SectionHeader = ({ title }: { title: string }) => (
  <Text style={styles.sectionHeader}>{title}</Text>
);

const SettingRow = ({
  icon,
  iconColor,
  label,
  value,
  onPress,
  chevron = true,
  rightContent,
  rowAccessibilityLabel,
}: {
  icon: string;
  iconColor?: string;
  label: string;
  value?: string;
  onPress?: () => void;
  chevron?: boolean;
  rightContent?: React.ReactNode;
  rowAccessibilityLabel?: string;
}) => (
  <TouchableOpacity style={styles.row} onPress={onPress} disabled={!onPress} activeOpacity={onPress ? 0.6 : 1} accessibilityRole="button" accessibilityLabel={rowAccessibilityLabel || label.toLowerCase()}>
    <MaterialCommunityIcons name={icon as any} size={18} color={iconColor || COLORS.text2} />
    <Text style={styles.rowLabel}>{label}</Text>
    <View style={styles.rowRight}>
      {rightContent || (
        <Text style={styles.rowValue} numberOfLines={1}>{value || ''}</Text>
      )}
      {chevron && onPress && (
        <Icon name="chevron-right" size={16} color={COLORS.text2} />
      )}
    </View>
  </TouchableOpacity>
);

export default function SettingsScreen({ navigation }: Props) {
  const { t, language } = useTranslation();
  const toast = useToast();

  const [user, setUser] = useState(store.user);
  const isSeller = user?.role === 'seller';
  const [loading, setLoading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [storeLogoUploading, setStoreLogoUploading] = useState(false);

  const avatarUrl = getImageUrl(user?.avatar_url);

  useEffect(() => {
    const unsub = store.onChange(() => setUser(store.user));
    return unsub;
  }, []);

  useFocusEffect(useCallback(() => {
    store.refreshUser();
  }, []));

  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [locAddress, setLocAddress] = useState(user?.location_address || '');
  const [locCity, setLocCity] = useState(user?.location_city || '');
  const [locSaving, setLocSaving] = useState(false);
  const [locDetecting, setLocDetecting] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    (async () => {
      try {
        const { status } = await (await import('expo-location')).getForegroundPermissionsAsync();
        setLocationStatus(status);
      } catch {}
    })();
  }, []);

  const handleRequestLocation = async () => {
    if (Platform.OS === 'web') return;
    try {
      const Location = await import('expo-location');
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationStatus(status);
      if (status !== 'granted') {
        toast.warning(
          t('settings.locationDeniedTitle'),
          t('settings.locationDeniedMessage')
        );
      }
    } catch {}
  };

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
        const area = a.neighbourhood || a.suburb || a.city_district || a.village || a.town || '';
        city = a.city || a.municipality || a.county || '';
        address = street || area || nominatim.display_name?.split(',')[0] || '';
        city = area || city || '';
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

  const handleSaveLocation = async () => {
    setLocSaving(true);
    try {
      const res = await updateProfile({
        locationAddress: locAddress,
        locationCity: locCity,
      }) as { user: typeof user };
      if (res.user) await store.setUser(res.user, store.token);
      toast.success(t('settings.locationSaved'));
    } catch {
      toast.error(t('settings.locationSaveFailed'));
    }
    setLocSaving(false);
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm(t('settings.logoutConfirm'))) {
        store.logout();
      }
      return;
    }
    toast.show({
      kind: 'warning',
      title: t('settings.logout'),
      message: t('settings.logoutConfirm'),
      actionLabel: t('settings.logout'),
      onAction: () => store.logout(),
    });
  };

  const handlePickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setAvatarUploading(true);
      try {
        const uploadRes = await uploadImage(result.assets[0].uri);
        const res = await updateProfile({ avatarUrl: uploadRes.url }) as { user: typeof user };
        if (res.user) await store.setUser(res.user, store.token);
      } catch (err: unknown) {
        toast.error(t('settings.error'), err instanceof Error ? err.message : t('settings.failed'));
      }
      setAvatarUploading(false);
    }
  };

  const handleToggleStoreIdentity = async (value: boolean) => {
    setLoading(true);
    try {
      const res = await updateSellerProfile({ useStoreIdentity: value }) as { user: typeof user };
      if (res.user) await store.setUser(res.user, store.token);
    } catch (err: unknown) {
      toast.error(t('settings.error'), err instanceof Error ? err.message : t('settings.failed'));
    }
    setLoading(false);
  };

  const handlePickStoreLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setStoreLogoUploading(true);
      try {
        const uploadRes = await uploadImage(result.assets[0].uri);
        const res = await updateSellerProfile({ storeLogoUrl: uploadRes.url }) as { user: typeof user };
        if (res.user) await store.setUser(res.user, store.token);
      } catch (err: unknown) {
        toast.error(t('settings.error'), err instanceof Error ? err.message : t('settings.failed'));
      }
      setStoreLogoUploading(false);
    }
  };

  const goEdit = (field: 'name' | 'email' | 'phone' | 'bio' | 'password' | 'storeName', title: string) => {
    navigation.navigate('SettingsEdit', { field, title });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <ScreenHeader title={t('settings.title')} onBack={() => navigation.goBack()} />

      {/* ── Avatar ── */}
      <TouchableOpacity style={styles.avatarSection} onPress={handlePickAvatar} disabled={avatarUploading} accessibilityRole="button" accessibilityLabel="change avatar">
        <View style={styles.avatarWrap}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImg} accessibilityLabel="profile avatar" />
          ) : (
            <Text style={styles.avatarText}>
              {user?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
            </Text>
          )}
          {avatarUploading && (
            <View style={styles.avatarLoadingOverlay}>
              <ActivityIndicator color={COLORS.white} size="small" />
            </View>
          )}
          <View style={styles.cameraBadge}>
            <Icon name="camera" size={12} color={COLORS.white} />
          </View>
        </View>
      </TouchableOpacity>

      {/* ── Account ── */}
      <SectionHeader title={t('settings.account')} />
      <View style={styles.card}>
        <SettingRow icon="account-outline" label={t('settings.fullName')} value={getDisplayName(user)} onPress={() => goEdit('name', t('settings.fullName'))} />
        <SettingRow icon="email-outline" label={t('settings.email')} value={user?.email} onPress={() => goEdit('email', t('settings.email'))} />
        {user?.email_verified ? (
          <View style={styles.verifyRow}>
                    <Icon name="verified" size={18} color={COLORS.green} />
                    <Text style={styles.verifyLabel}>{t('settings.emailVerified')}</Text>
            <Text style={[styles.verifyBadge, { color: COLORS.green }]}>{t('settings.verified')}</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.verifyRow} onPress={() => navigation.navigate('EmailVerification')} accessibilityRole="button" accessibilityLabel="verify email">
            <MaterialCommunityIcons name="shield-alert-outline" size={18} color={COLORS.coral} />
            <Text style={styles.verifyLabel}>{t('settings.emailVerified')}</Text>
            <Text style={[styles.verifyBadge, { color: COLORS.coral }]}>{t('settings.verifyEmail')}</Text>
          </TouchableOpacity>
        )}
        <SettingRow icon="phone-outline" label={t('settings.phone')} value={user?.phone ? `+509 ${user.phone}` : ''} onPress={() => goEdit('phone', t('settings.phone'))} />
        <SettingRow icon="text-short" label={t('settings.bio')} value={user?.bio || t('settings.bio')} onPress={() => goEdit('bio', t('settings.bio'))} />
        <SettingRow icon="lock-outline" label={t('settings.changePassword')} value="••••••••" onPress={() => goEdit('password', t('settings.changePassword'))} />
      </View>

      {/* ── Seller section ── */}
      {!isSeller && (
        <>
          <SectionHeader title={t('settings.seller')} />
          <View style={styles.card}>
            <SettingRow
              icon="store-plus-outline"
              iconColor={COLORS.green}
              label={t('me.becomeSeller')}
              onPress={() => { navigation.navigate('SellerOnboarding'); }}
            />
          </View>
        </>
      )}

      {isSeller && (
        <>
          <SectionHeader title={t('settings.seller')} />
          <View style={styles.card}>
            <SettingRow
              icon="storefront-outline"
              iconColor={COLORS.blue}
              label={user?.seller_tier === 'business' && user?.use_store_identity ? t('storefront.store') : t('settings.profile')}
              value={t('settings.profile')}
              onPress={() => navigation.navigate('Storefront', { sellerId: user!.id })}
            />
            {user?.seller_tier === 'business' && (
              <>
                <View style={styles.divider} />
                <View style={styles.toggleRow}>
                  <Icon name="sale-tag" size={18} color={COLORS.text2} />
                  <Text style={styles.rowLabel}>{t('settings.useStoreIdentity')}</Text>
                  <View style={styles.rowRight}>
                    <TouchableOpacity
                      style={[styles.toggle, user?.use_store_identity && styles.toggleActive]}
                      onPress={() => handleToggleStoreIdentity(!user?.use_store_identity)}
                      disabled={loading}
                      accessibilityRole="button"
                      accessibilityLabel="use store identity"
                      accessibilityState={{ checked: user?.use_store_identity }}
                    >
                      <View style={[styles.toggleKnob, user?.use_store_identity && styles.toggleKnobActive]} />
                    </TouchableOpacity>
                  </View>
                </View>
                <SettingRow icon="pencil-outline" label={t('settings.storeName')} value={user?.store_name || t('settings.storeName')} onPress={() => goEdit('storeName', t('settings.storeName'))} />
                <SettingRow
                  icon="image-outline"
                  label={t('settings.changeLogo')}
                  value={user?.store_logo_url ? t('settings.changeLogo') : t('settings.addLogo')}
                  onPress={handlePickStoreLogo}
                  chevron={false}
                  rowAccessibilityLabel="change store logo"
                  rightContent={storeLogoUploading ? (
                    <ActivityIndicator size="small" color={COLORS.coral} />
                  ) : user?.store_logo_url ? (
                    <Image source={{ uri: getImageUrl(user.store_logo_url) || '' }} style={styles.storeLogoThumb} />
                  ) : (
                    <MaterialCommunityIcons name="plus-circle-outline" size={20} color={COLORS.coral} />
                  )}
                />
              </>
            )}
          </View>

          {/* ── Tier Progression ── */}
          <View style={styles.card}>
            {user?.seller_tier === 'casual' && (
              <>
                <View style={styles.tierRow}>
                  <View style={styles.tierDotWrap}>
          <Icon name="verified" size={18} color={COLORS.green} />
          </View>
          <Text style={styles.tierLabel}>{t('settings.casualSeller')}</Text>
                  <Text style={[styles.tierStatus, { color: COLORS.green }]}>{t('settings.tierActive')}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.tierRow}>
                  <View style={styles.tierDotWrap}>
                    <View style={[styles.tierDot, { backgroundColor: COLORS.surface2 }]} />
                  </View>
                  <Text style={[styles.tierLabel, styles.tierGreyed]}>{t('settings.verifiedSeller')}</Text>
                  <TouchableOpacity
                    style={styles.tierUpgradeBtn}
                    onPress={() => navigation.navigate('Verification')}
                    accessibilityRole="button"
                    accessibilityLabel="upgrade to verified"
                  >
                    <Text style={styles.tierUpgradeBtnText}>{t('settings.tierUpgrade')}</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.divider} />
                <View style={styles.tierRow}>
                  <View style={styles.tierDotWrap}>
                    <View style={[styles.tierDot, { backgroundColor: COLORS.surface2 }]} />
                  </View>
                  <Text style={[styles.tierLabel, styles.tierGreyed]}>{t('settings.businessSeller')}</Text>
                  <Icon name="locked" size={14} color={COLORS.surface2} />
                </View>
              </>
            )}
            {user?.seller_tier === 'verified' && (
              <>
                <View style={styles.tierRow}>
                  <View style={styles.tierDotWrap}>
                    <Icon name="verified" size={18} color={COLORS.green} />
                  </View>
                  <Text style={styles.tierLabel}>{t('settings.verifiedSeller')}</Text>
                  <Text style={[styles.tierStatus, { color: COLORS.green }]}>{t('settings.tierActive')}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.tierRow}>
                  <View style={styles.tierDotWrap}>
                    <View style={[styles.tierDot, { backgroundColor: COLORS.surface2 }]} />
                  </View>
                  <Text style={[styles.tierLabel, styles.tierGreyed]}>{t('settings.businessSeller')}</Text>
                  <TouchableOpacity
                    style={styles.tierUpgradeBtn}
                    onPress={() => navigation.navigate('BusinessSubscription')}
                    accessibilityRole="button"
                    accessibilityLabel="upgrade to business"
                  >
                    <Text style={styles.tierUpgradeBtnText}>{t('settings.tierUpgrade')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            {user?.seller_tier === 'business' && (
              <>
                <View style={styles.tierRow}>
                  <View style={styles.tierDotWrap}>
                    <Icon name="verified" size={18} color={COLORS.green} />
                  </View>
                  <Text style={styles.tierLabel}>{t('settings.businessSeller')}</Text>
                  <Text style={[styles.tierStatus, { color: COLORS.green }]}>{t('settings.tierActive')}</Text>
                </View>
              </>
            )}
          </View>

          {/* ── Subscription (business) ── */}
          {isSeller && user?.seller_tier === 'business' && (
            <View style={styles.card}>
              <SettingRow
                icon="calendar-clock-outline"
                iconColor={COLORS.green}
                label={t('settings.businessSubscription')}
                onPress={() => { navigation.navigate('BusinessSubscription'); }}
              />
              <View style={styles.divider} />
              <SettingRow
                icon="tag-outline"
                iconColor={COLORS.coral}
                label={t('me.promotions')}
                onPress={() => { navigation.navigate('PromoManagement'); }}
              />
            </View>
          )}
        </>
      )}

      {/* ── Preferences ── */}
      <SectionHeader title={t('settings.language')} />
      <View style={[styles.card, { overflow: 'visible' }]}>
        {(['en', 'ht', 'fr'] as Language[]).map((lang, idx, arr) => (
          <React.Fragment key={lang}>
            <TouchableOpacity
              style={styles.langRow}
              onPress={async () => { await i18n.setLanguage(lang); }}
              accessibilityRole="button"
              accessibilityLabel={lang === 'en' ? 'english' : lang === 'ht' ? 'haitian creole' : 'french'}
              accessibilityState={{ selected: language === lang }}
            >
              <Text style={[styles.langText, language === lang && styles.langTextActive]}>
                {lang === 'en' ? t('settings.english') : lang === 'ht' ? t('settings.haitian') : t('settings.french')}
              </Text>
              {language === lang && (
                <Icon name="check" size={16} color={COLORS.coral} />
              )}
            </TouchableOpacity>
            {idx < arr.length - 1 && <View style={styles.divider} />}
          </React.Fragment>
        ))}
      </View>

      {/* ── Delivery Location ── */}
      <SectionHeader title={t('settings.deliveryLocation')} />
      <View style={styles.card}>
        <TextInput
          style={styles.locInput}
          placeholder={t('settings.deliveryAddress')}
          placeholderTextColor={COLORS.text2}
          value={locAddress}
          onChangeText={setLocAddress}
         
          accessibilityLabel="delivery address"
        />
        <TextInput
          style={styles.locInput}
          placeholder={t('settings.deliveryCity')}
          placeholderTextColor={COLORS.text2}
          value={locCity}
          onChangeText={setLocCity}
         
          accessibilityLabel="delivery city"
        />
        {Platform.OS !== 'web' && (
          <TouchableOpacity style={styles.autoDetectBtn} onPress={handleAutoDetect} disabled={locDetecting} accessibilityRole="button" accessibilityLabel="auto detect location">
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
        <TouchableOpacity
          style={[styles.saveLocBtn, locSaving && { opacity: 0.5 }]}
          onPress={handleSaveLocation}
          disabled={locSaving}
          accessibilityRole="button"
          accessibilityLabel="save location"
        >
          {locSaving ? (
            <ActivityIndicator size={14} color={COLORS.white} />
          ) : (
            <Text style={styles.saveLocText}>{t('common.save')}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Nearby Map ── */}
      {Platform.OS !== 'web' && (
        <>
          <SectionHeader title={t('settings.locationMap')} />
          <View style={styles.card}>
            <SettingRow
              icon="crosshairs-gps"
              iconColor={locationStatus === 'granted' ? COLORS.green : COLORS.coral}
              label={t('settings.locationMap')}
              value={locationStatus === 'granted' ? t('settings.locationGranted') : t('settings.locationNotGranted')}
              onPress={locationStatus !== 'granted' ? handleRequestLocation : undefined}
              chevron={locationStatus !== 'granted'}
              rightContent={
                locationStatus === 'granted' ? (
                  <Icon name="verified" size={18} color={COLORS.green} />
                ) : undefined
              }
            />
          </View>
        </>
      )}

      {/* ── Logout ── */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} accessibilityRole="button" accessibilityLabel="logout">
        <MaterialCommunityIcons name="logout" size={16} color={COLORS.coral} />
        <Text style={styles.logoutText}>{t('settings.logout')}</Text>
      </TouchableOpacity>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingBottom: 20 },


  /* Avatar */
  avatarSection: { alignItems: 'center', paddingVertical: 12 },
  avatarWrap: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(128,128,128,0.25)',
    alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden',
  },
  avatarImg: { width: 72, height: 72, borderRadius: 36 },
  avatarText: { fontSize: 24, color: COLORS.text2, fontWeight: '700' },
  avatarLoadingOverlay: {
    ...StyleSheet.absoluteFill,
    borderRadius: 36,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: COLORS.surface2, borderWidth: 2, borderColor: COLORS.bg,
    alignItems: 'center', justifyContent: 'center',
  },

  /* Sections */
  sectionHeader: {
    fontSize: 11, fontWeight: '700', color: COLORS.text2,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginHorizontal: SPACING.lg, marginTop: 20, marginBottom: 6,
  },
  card: {
    marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.card, overflow: 'hidden',
  },

  /* Rows */
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  rowLabel: { flex: 1, fontSize: 14, color: COLORS.text },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowValue: { fontSize: 13, color: COLORS.text2, maxWidth: 140 },

  divider: { height: 1, backgroundColor: COLORS.border, marginHorizontal: 14 },

  /* Toggle */
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  toggle: {
    width: 44, height: 26, borderRadius: RADIUS.card, padding: 2,
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border,
    justifyContent: 'center',
  },
  toggleActive: { backgroundColor: COLORS.green + '40', borderColor: COLORS.green },
  toggleKnob: { width: 20, height: 20, borderRadius: RADIUS.row, backgroundColor: COLORS.text2 },
  toggleKnobActive: { backgroundColor: COLORS.green, alignSelf: 'flex-end' },

  /* Store logo thumb */
  storeLogoThumb: { width: 28, height: 28, borderRadius: RADIUS.row },

  /* Status */
  statusRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  statusLabel: { flex: 1, fontSize: 14, color: COLORS.text },
  statusValue: { fontSize: 13, fontWeight: '600' },
  idUploadRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 13,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  idUploadText: { fontSize: 14, color: COLORS.blue, fontWeight: '600' },

  /* Language */
  langRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 13,
  },
  langText: { fontSize: 14, color: COLORS.text, fontWeight: '600' },
  langTextActive: { color: COLORS.coral },

  /* Email verification */
  verifyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  verifyLabel: { flex: 1, fontSize: 14, color: COLORS.text, fontWeight: '500' },
  verifyBadge: { fontSize: 12, fontWeight: '700' },

  /* Logout */
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: SPACING.lg, marginTop: 24,
    padding: 12, borderRadius: RADIUS.row,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  logoutText: { color: COLORS.coral, fontWeight: '600', fontSize: 14 },

  /* Tier progression */
  tierRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  tierDotWrap: { width: 20, alignItems: 'center' },
  tierDot: { width: 10, height: 10, borderRadius: 5 },
  tierLabel: { flex: 1, fontSize: 14, color: COLORS.text, fontWeight: '600' },
  tierGreyed: { color: COLORS.text2, fontWeight: '400' },
  tierStatus: { fontSize: 12, fontWeight: '700' },
  tierUpgradeBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: RADIUS.row, backgroundColor: COLORS.blue,
  },
  tierUpgradeBtnText: { color: COLORS.white, fontSize: 12, fontWeight: '700' },

  /* Location */
  locInput: {
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.row, padding: 12, color: COLORS.text, fontSize: 13,
    marginBottom: 8,
  },
  autoDetectBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10,
  },
  autoDetectText: { fontSize: 13, color: COLORS.blue, fontWeight: '600' },
  saveLocBtn: {
    backgroundColor: COLORS.coral, borderRadius: RADIUS.row,
    padding: 12, alignItems: 'center', marginTop: 4,
  },
  saveLocText: { color: COLORS.white, fontSize: 13, fontWeight: '700' },
});