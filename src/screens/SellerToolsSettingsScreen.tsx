import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Image, Animated, TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Icon } from '../components/icons/Icon';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS, TOUCH } from '../theme';
import { store } from '../store';
import { useUser } from '../hooks';
import ScreenHeader from '../components/ScreenHeader';
import { uploadImage, getImageUrl, updateSellerProfile, updateProfile } from '../api';
import { useTranslation } from '@/localization';
import { useToast } from '../components/Toast';
import PrimaryButton from '../components/PrimaryButton';
import SettingsLinkButton from '../components/SettingsLinkButton';
import SettingsToggle from '../components/SettingsToggle';
import { useFocusEffect } from '@react-navigation/native';
import { getSellerFulfillmentProposals, decideFulfillmentProposal, counterSellerFulfillment } from '../api';
import LocationPicker from '../components/LocationPicker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'SellerToolsSettings'>;

const toLocalDateTimeInput = (value?: string) => {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function SellerToolsSettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useUser();
  const isSeller = user?.role === 'seller';
  const [loading, setLoading] = useState(false);
  const [storeLogoUploading, setStoreLogoUploading] = useState(false);
  const [proposals, setProposals] = useState<any[]>([]);
  const [counterProposalId, setCounterProposalId] = useState<string | null>(null);
  const [counterLocation, setCounterLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [counterAt, setCounterAt] = useState('');

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

  const loadProposals = useCallback(async () => {
    if (!isSeller) return;
    try {
      const proposalResult = await getSellerFulfillmentProposals() as { proposals?: any[] };
      setProposals(proposalResult.proposals || []);
    } catch { /* proposals are optional */ }
  }, [isSeller]);
  useFocusEffect(useCallback(() => { loadProposals(); }, [loadProposals]));

  const decideProposal = async (proposal: any, decision: 'accept' | 'reject') => {
    setLoading(true);
    try {
      await decideFulfillmentProposal(proposal.checkout_id, user!.id, decision);
      setProposals(current => current.filter(item => item.id !== proposal.id));
    } catch (err: unknown) {
      toast.error(t('settings.error'), err instanceof Error ? err.message : t('settings.failed'));
    } finally { setLoading(false); }
  };

  const sendCounter = async (proposal: any) => {
    if (!counterLocation) { toast.error(t('meetupProposal.counterTitle'), t('meetupProposal.mapConfirm')); return; }
    const at = new Date(counterAt);
    if (!Number.isFinite(at.getTime()) || at.getTime() <= Date.now()) { toast.error(t('meetupProposal.dateLabel'), t('meetupProposal.futureTime')); return; }
    setLoading(true);
    try {
      await counterSellerFulfillment(proposal.checkout_id, user!.id, counterLocation, at.toISOString());
      setProposals(current => current.filter(item => item.id !== proposal.id));
      setCounterProposalId(null); setCounterLocation(null);
    } catch (err: unknown) { toast.error(t('settings.error'), err instanceof Error ? err.message : t('settings.failed')); }
    finally { setLoading(false); }
  };

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
      <View style={styles.container}>
        <ScreenHeader title={t('settings.seller')} onBack={() => navigation.goBack()} />
        <ScrollView contentContainerStyle={styles.scroll}>
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
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('settings.seller')} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: anim.opacity, transform: [{ translateY: anim.translateY }] }}>

      {/* ── Store Profile ── */}
      <Text style={styles.sectionHeader}>{t('sellerTools.storeProfile')}</Text>
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
                <SettingsToggle
                  value={!!user?.use_store_identity}
                  onValueChange={handleToggleStoreIdentity}
                  disabled={loading}
                  accessibilityLabel={t('settings.useStoreIdentity')}
                />
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

      {/* ── Listings ── */}
      <Text style={styles.sectionHeader}>{t('myListings.title')}</Text>
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('MyListings')}
          accessibilityRole="button"
          accessibilityLabel={t('myListings.title')}
        >
          <MaterialCommunityIcons name="format-list-bulleted-square" size={18} color={COLORS.blue} />
          <Text style={styles.rowLabel}>{t('myListings.title')}</Text>
          <Text style={styles.rowValue}>{t('myListings.rowSummary')}</Text>
          <Icon name="chevron-right" size={16} color={COLORS.text2} />
        </TouchableOpacity>
      </View>

      {/* ── Fulfillment policy ── */}
      <Text style={styles.sectionHeader}>{t('sellerTools.deliveryMeetup')}</Text>
      <View style={styles.card}>
        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('SellerFulfillmentSettings')} accessibilityRole="button" accessibilityLabel={t('sellerTools.deliveryMeetup')}>
          <MaterialCommunityIcons name="truck-delivery-outline" size={18} color={COLORS.blue} />
          <Text style={styles.rowLabel}>{t('fulfillmentSettings.manage')}</Text>
          <Text style={styles.rowValue}>{t('fulfillmentSettings.manageSummary')}</Text>
          <Icon name="chevron-right" size={16} color={COLORS.text2} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('NatCashAccess')} accessibilityRole="button" accessibilityLabel={t('natcashAccess.manage')}>
          <MaterialCommunityIcons name="cash-multiple" size={18} color={COLORS.purple} />
          <Text style={styles.rowLabel}>{t('natcashAccess.manage')}</Text>
          <Text style={styles.rowValue}>{t('natcashAccess.manageSummary')}</Text>
          <Icon name="chevron-right" size={16} color={COLORS.text2} />
        </TouchableOpacity>
      </View>

      {proposals.length > 0 && <>
        <Text style={styles.sectionHeader}>{t('sellerTools.awaitingApproval')}</Text>
        <View style={styles.card}>{proposals.map((proposal, index) => {
          const term = proposal.terms || {};
          return <View key={proposal.id} style={[styles.proposal, index < proposals.length - 1 && styles.reviewDivider]}>
            <Text style={styles.proposalTitle}>{t('sellerTools.requestsLine', { name: proposal.buyer_name || t('meetup.buyer'), type: term.method === 'meetup' ? t('sellerTools.meetupNoun') : t('sellerTools.deliveryNoun') })}</Text>
            <Text style={styles.settingHint}>{term.location?.address || t('sellerTools.locationSelected')} · {term.distanceMeters ? `${Math.round(term.distanceMeters / 1000 * 10) / 10} km` : t('sellerTools.locationVerified')}{term.method === 'delivery' ? ` · G ${term.deliveryFee || 0}` : term.meetupAt ? ` · ${new Date(term.meetupAt).toLocaleString()}` : ''}</Text>
            <View style={styles.proposalActions}><SettingsLinkButton danger small onPress={() => decideProposal(proposal, 'reject')} disabled={loading} style={styles.rejectFlex}>{t('sellerTools.decline')}</SettingsLinkButton><PrimaryButton small onPress={() => decideProposal(proposal, 'accept')} disabled={loading} style={styles.acceptFlex}>{t('sellerTools.acceptTerms')}</PrimaryButton></View>
            {term.method === 'meetup' && <TouchableOpacity style={styles.counterLink} onPress={() => { setCounterProposalId(counterProposalId === proposal.id ? null : proposal.id); setCounterAt(toLocalDateTimeInput(term.meetupAt)); setCounterLocation(null); }} accessibilityRole="button"><Text style={styles.counterLinkText}>{t('sellerTools.counterLink')}</Text></TouchableOpacity>}
            {counterProposalId === proposal.id && <View style={styles.counterBox}>
              <LocationPicker onLocationSelect={(lat, lng, address) => setCounterLocation({ lat, lng, address })} initialLat={term.location?.lat} initialLng={term.location?.lng} height={190}/>
              {counterLocation && <Text style={styles.settingHint}>{counterLocation.address}</Text>}
              <TextInput style={styles.counterInput} value={counterAt} onChangeText={setCounterAt} placeholder={t('meetupProposal.datePlaceholder')} placeholderTextColor={COLORS.text2} accessibilityLabel={t('meetupProposal.dateLabel')}/>
              <PrimaryButton small onPress={() => void sendCounter(proposal)} disabled={loading}>{t('meetupProposal.sendCounter')}</PrimaryButton>
            </View>}
          </View>;
        })}</View>
      </>}

      {/* ── Tier Progression ── */}
      <Text style={styles.sectionHeader}>{t('sellerTools.tier')}</Text>
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
              <PrimaryButton small onPress={() => navigation.navigate('Verification')}>
                {t('settings.tierUpgrade')}
              </PrimaryButton>
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
              <PrimaryButton small onPress={() => navigation.navigate('BusinessSubscription')}>
                {t('settings.tierUpgrade')}
              </PrimaryButton>
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
          <Text style={styles.sectionHeader}>{t('sellerTools.subscription')}</Text>
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
        </Animated.View>
      </ScrollView>
    </View>
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
    marginHorizontal: SPACING.lg, backgroundColor: 'transparent',
    borderWidth: 0, borderRadius: 0, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm, minHeight: 54,
  },
  rowLabel: { flex: 1, fontSize: 14, color: COLORS.text },
  settingHint: { fontSize: 11, color: COLORS.text2, lineHeight: 15 },
  proposal: { padding: 14, gap: 8 },
  proposalTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  proposalActions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  counterLink: { minHeight: 40, justifyContent: 'center' },
  counterLinkText: { color: COLORS.coral, fontWeight: '700', fontSize: 12 },
  counterBox: { gap: 8, marginTop: 4 },
  counterInput: { minHeight: 44, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.row, backgroundColor: COLORS.surface, color: COLORS.text, paddingHorizontal: 12 },
  rejectFlex: { flex: 1 },
  acceptFlex: { flex: 1 },
  reviewDivider: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowValue: { fontSize: 13, color: COLORS.text2, maxWidth: 140 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginLeft: SPACING.sm + 28 + SPACING.md },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm, minHeight: 54,
  },
  storeLogoThumb: { width: 28, height: 28, borderRadius: RADIUS.row },
  tierRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm, minHeight: 54,
  },
  tierDotWrap: { width: 20, alignItems: 'center' },
  tierDot: { width: 10, height: 10, borderRadius: 5 },
  tierLabel: { flex: 1, fontSize: 14, color: COLORS.text, fontWeight: '600' },
  tierGreyed: { color: COLORS.text2, fontWeight: '400' },
  tierStatus: { fontSize: 12, fontWeight: '700' },
});
