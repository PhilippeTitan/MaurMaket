import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Image,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Icon } from '../components/icons/Icon';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, RADIUS } from '../theme';
import { store } from '../store';
import { useUser } from '../hooks';
import ScreenHeader from '../components/ScreenHeader';
import { uploadImage, getImageUrl, updateSellerProfile, updateProfile } from '../api';
import { useTranslation } from '../i18n';
import { useToast } from '../components/Toast';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'SellerToolsSettings'>;

export default function SellerToolsSettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useUser();
  const isSeller = user?.role === 'seller';
  const [loading, setLoading] = useState(false);
  const [storeLogoUploading, setStoreLogoUploading] = useState(false);

  const goEdit = (field: 'storeName', title: string) => {
    navigation.navigate('SettingsEdit', { field, title });
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

  if (!isSeller) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
        <ScreenHeader title={t('settings.seller')} onBack={() => navigation.goBack()} />
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('SellerOnboarding')}
          >
            <MaterialCommunityIcons name="store-plus-outline" size={18} color={COLORS.green} />
            <Text style={styles.rowLabel}>{t('me.becomeSeller')}</Text>
            <Icon name="chevron-right" size={16} color={COLORS.text2} />
          </TouchableOpacity>
        </View>
        <View style={{ height: 60 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <ScreenHeader title={t('settings.seller')} onBack={() => navigation.goBack()} />

      {/* ── Store Profile ── */}
      <Text style={styles.sectionHeader}>Store Profile</Text>
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('Storefront', { sellerId: user!.id })}
        >
          <MaterialCommunityIcons name="storefront-outline" size={18} color={COLORS.blue} />
          <Text style={styles.rowLabel}>
            {user?.seller_tier === 'business' && user?.use_store_identity ? t('storefront.store') : t('settings.profile')}
          </Text>
          <Icon name="chevron-right" size={16} color={COLORS.text2} />
        </TouchableOpacity>
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
                >
                  <View style={[styles.toggleKnob, user?.use_store_identity && styles.toggleKnobActive]} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.row} onPress={() => goEdit('storeName', t('settings.storeName'))}>
              <Icon name="edit" size={18} color={COLORS.text2} />
              <Text style={styles.rowLabel}>{t('settings.storeName')}</Text>
              <View style={styles.rowRight}>
                <Text style={styles.rowValue} numberOfLines={1}>{user?.store_name || t('settings.storeName')}</Text>
                <Icon name="chevron-right" size={16} color={COLORS.text2} />
              </View>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.row} onPress={handlePickStoreLogo} disabled={storeLogoUploading}>
              <MaterialCommunityIcons name="image-outline" size={18} color={COLORS.text2} />
              <Text style={styles.rowLabel}>{t('settings.changeLogo')}</Text>
              <View style={styles.rowRight}>
                {storeLogoUploading ? (
                  <ActivityIndicator size="small" color={COLORS.coral} />
                ) : user?.store_logo_url ? (
                  <Image source={{ uri: getImageUrl(user.store_logo_url) || '' }} style={styles.storeLogoThumb} />
                ) : (
                  <MaterialCommunityIcons name="plus-circle-outline" size={20} color={COLORS.coral} />
                )}
              </View>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ── Tier Progression ── */}
      <Text style={styles.sectionHeader}>Tier</Text>
      <View style={styles.card}>
        {user?.seller_tier === 'casual' && (
          <>
            <View style={styles.tierRow}>
              <View style={styles.tierDotWrap}><Icon name="verified" size={18} color={COLORS.green} /></View>
              <Text style={styles.tierLabel}>{t('settings.casualSeller')}</Text>
              <Text style={[styles.tierStatus, { color: COLORS.green }]}>{t('settings.tierActive')}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.tierRow}>
              <View style={styles.tierDotWrap}><View style={[styles.tierDot, { backgroundColor: COLORS.surface2 }]} /></View>
              <Text style={[styles.tierLabel, styles.tierGreyed]}>{t('settings.verifiedSeller')}</Text>
              <TouchableOpacity style={styles.tierUpgradeBtn} onPress={() => navigation.navigate('Verification')}>
                <Text style={styles.tierUpgradeBtnText}>{t('settings.tierUpgrade')}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.divider} />
            <View style={styles.tierRow}>
              <View style={styles.tierDotWrap}><View style={[styles.tierDot, { backgroundColor: COLORS.surface2 }]} /></View>
              <Text style={[styles.tierLabel, styles.tierGreyed]}>{t('settings.businessSeller')}</Text>
              <Icon name="locked" size={14} color={COLORS.surface2} />
            </View>
          </>
        )}
        {user?.seller_tier === 'verified' && (
          <>
            <View style={styles.tierRow}>
              <View style={styles.tierDotWrap}><Icon name="verified" size={18} color={COLORS.green} /></View>
              <Text style={styles.tierLabel}>{t('settings.verifiedSeller')}</Text>
              <Text style={[styles.tierStatus, { color: COLORS.green }]}>{t('settings.tierActive')}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.tierRow}>
              <View style={styles.tierDotWrap}><View style={[styles.tierDot, { backgroundColor: COLORS.surface2 }]} /></View>
              <Text style={[styles.tierLabel, styles.tierGreyed]}>{t('settings.businessSeller')}</Text>
              <TouchableOpacity style={styles.tierUpgradeBtn} onPress={() => navigation.navigate('BusinessSubscription')}>
                <Text style={styles.tierUpgradeBtnText}>{t('settings.tierUpgrade')}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
        {user?.seller_tier === 'business' && (
          <View style={styles.tierRow}>
            <View style={styles.tierDotWrap}><Icon name="verified" size={18} color={COLORS.green} /></View>
            <Text style={styles.tierLabel}>{t('settings.businessSeller')}</Text>
            <Text style={[styles.tierStatus, { color: COLORS.green }]}>{t('settings.tierActive')}</Text>
          </View>
        )}
      </View>

      {/* ── Subscription (business) ── */}
      {user?.seller_tier === 'business' && (
        <>
          <Text style={styles.sectionHeader}>Subscription</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('BusinessSubscription')}>
              <MaterialCommunityIcons name="calendar-clock-outline" size={18} color={COLORS.green} />
              <Text style={styles.rowLabel}>{t('settings.businessSubscription')}</Text>
              <Icon name="chevron-right" size={16} color={COLORS.text2} />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('PromoManagement')}>
              <MaterialCommunityIcons name="tag-outline" size={18} color={COLORS.coral} />
              <Text style={styles.rowLabel}>{t('me.promotions')}</Text>
              <Icon name="chevron-right" size={16} color={COLORS.text2} />
            </TouchableOpacity>
          </View>
        </>
      )}

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingBottom: 20 },
  sectionHeader: {
    fontSize: 11, fontWeight: '700', color: COLORS.text2,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginHorizontal: SPACING.lg, marginTop: 20, marginBottom: 6,
  },
  card: {
    marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.card, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  rowLabel: { flex: 1, fontSize: 14, color: COLORS.text },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowValue: { fontSize: 13, color: COLORS.text2, maxWidth: 140 },
  divider: { height: 1, backgroundColor: COLORS.border, marginHorizontal: 14 },
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
  storeLogoThumb: { width: 28, height: 28, borderRadius: RADIUS.row },
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
});
