import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator, Image, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, RADIUS, getDisplayName } from '../theme';
import { store } from '../store';
import ScreenHeader from '../components/ScreenHeader';
import { uploadImage, getImageUrl, updateSellerProfile, updateProfile } from '../api';
import { i18n, useTranslation, type Language } from '../i18n';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
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
}: {
  icon: string;
  iconColor?: string;
  label: string;
  value?: string;
  onPress?: () => void;
  chevron?: boolean;
  rightContent?: React.ReactNode;
}) => (
  <TouchableOpacity style={styles.row} onPress={onPress} disabled={!onPress} activeOpacity={onPress ? 0.6 : 1}>
    <MaterialCommunityIcons name={icon as any} size={18} color={iconColor || COLORS.text2} />
    <Text style={styles.rowLabel}>{label}</Text>
    <View style={styles.rowRight}>
      {rightContent || (
        <Text style={styles.rowValue} numberOfLines={1}>{value || ''}</Text>
      )}
      {chevron && onPress && (
        <MaterialCommunityIcons name="chevron-right" size={16} color={COLORS.text2} />
      )}
    </View>
  </TouchableOpacity>
);

export default function SettingsScreen({ navigation }: Props) {
  const { t, language } = useTranslation();

  const user = store.user;
  const isSeller = store.isSeller;
  const [loading, setLoading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [storeLogoUploading, setStoreLogoUploading] = useState(false);

  const avatarUrl = getImageUrl(user?.avatar_url);

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm(t('settings.logoutConfirm'))) {
        store.logout();
      }
      return;
    }
    Alert.alert(t('settings.logout'), t('settings.logoutConfirm'), [
      { text: t('settings.cancel'), style: 'cancel' },
      { text: t('settings.logout'), style: 'destructive', onPress: () => store.logout() },
    ]);
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
        Alert.alert(t('settings.error'), err instanceof Error ? err.message : t('settings.failed'));
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
      Alert.alert(t('settings.error'), err instanceof Error ? err.message : t('settings.failed'));
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
        Alert.alert(t('settings.error'), err instanceof Error ? err.message : t('settings.failed'));
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
      <TouchableOpacity style={styles.avatarSection} onPress={handlePickAvatar} disabled={avatarUploading}>
        <View style={styles.avatarWrap}>
          {avatarUploading ? (
            <ActivityIndicator color={COLORS.coral} />
          ) : avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarText}>
              {user?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
            </Text>
          )}
          <View style={styles.cameraBadge}>
            <MaterialCommunityIcons name="camera" size={12} color={COLORS.white} />
          </View>
        </View>
      </TouchableOpacity>

      {/* ── Account ── */}
      <SectionHeader title={t('settings.account')} />
      <View style={styles.card}>
        <SettingRow icon="account-outline" label={t('settings.fullName')} value={getDisplayName(user)} onPress={() => goEdit('name', t('settings.fullName'))} />
        <SettingRow icon="email-outline" label={t('settings.email')} value={user?.email} onPress={() => goEdit('email', t('settings.email'))} />
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
                  <MaterialCommunityIcons name="tag-outline" size={18} color={COLORS.text2} />
                  <Text style={styles.rowLabel}>{t('settings.useStoreIdentity')}</Text>
                  <View style={styles.rowRight}>
                    <TouchableOpacity
                      style={[styles.toggle, user?.use_store_identity && styles.toggleActive]}
                      onPress={() => handleToggleStoreIdentity(!user?.use_store_identity)}
                      disabled={loading}
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
            {user?.seller_tier !== 'business' && (
              <>
                <View style={styles.divider} />
                <SettingRow
                  icon={user?.id_verification_result === 'verified' ? 'shield-check' : 'shield-plus-outline'}
                  iconColor={user?.id_verification_result === 'verified' ? COLORS.green : COLORS.blue}
                  label={t('settings.verifyIdentity')}
                  value={user?.id_verification_result === 'verified' ? t('settings.verified') : user?.id_verification_result === 'pending' ? t('settings.pending') : t('settings.notVerified')}
                  onPress={() => navigation.navigate('Verification')}
                />
              </>
            )}
          </View>
        </>
      )}

      {/* ── Upgrade ── */}
      {isSeller && user?.seller_tier === 'casual' && (
        <>
          <SectionHeader title={t('settings.upgradeSeller')} />
          <View style={styles.card}>
            <SettingRow
              icon="shield-check-outline"
              iconColor={COLORS.green}
              label={t('settings.upgradeSeller')}
              value={t('settings.verifiedSeller')}
              onPress={() => { navigation.navigate('SellerOnboarding'); }}
            />
          </View>
        </>
      )}

      {isSeller && user?.seller_tier === 'verified' && (
        <>
          <SectionHeader title={t('settings.upgradeSeller')} />
          <View style={styles.card}>
            <SettingRow
              icon="storefront-outline"
              iconColor={COLORS.coral}
              label={t('settings.goBusiness')}
              value={t('settings.businessSeller')}
              onPress={() => { navigation.navigate('BusinessSubscription'); }}
            />
          </View>
        </>
      )}

      {isSeller && user?.seller_tier === 'business' && (
        <>
          <SectionHeader title={t('settings.subscription')} />
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
            >
              <Text style={[styles.langText, language === lang && styles.langTextActive]}>
                {lang === 'en' ? t('settings.english') : lang === 'ht' ? t('settings.haitian') : t('settings.french')}
              </Text>
              {language === lang && (
                <MaterialCommunityIcons name="check" size={16} color={COLORS.coral} />
              )}
            </TouchableOpacity>
            {idx < arr.length - 1 && <View style={styles.divider} />}
          </React.Fragment>
        ))}
      </View>

      {/* ── Logout ── */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
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
    width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.coral,
    alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  avatarImg: { width: 72, height: 72, borderRadius: 36 },
  avatarText: { fontSize: 24, color: COLORS.white, fontWeight: '700' },
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

  /* Logout */
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: SPACING.lg, marginTop: 24,
    padding: 12, borderRadius: RADIUS.row,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  logoutText: { color: COLORS.coral, fontWeight: '600', fontSize: 14 },
});