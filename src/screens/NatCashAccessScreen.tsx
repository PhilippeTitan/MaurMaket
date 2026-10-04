import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { COLORS, SPACING, RADIUS } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import PrimaryButton from '../components/PrimaryButton';
import SettingsLinkButton from '../components/SettingsLinkButton';
import { useTranslation } from '@/localization';
import { useToast } from '../components/Toast';
import { createNatCashAccessPayment, getNatCashAccess, pauseNatCashAccess, reactivateNatCashAccess, updateSellerProfile } from '../api';
import { store } from '../store';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'NatCashAccess'>;
type AccessState = { source: string | null; status: string; entitled: boolean; paymentMethodEnabled?: boolean; phoneConfigured?: boolean; expiresAt?: string | null; inGracePeriod?: boolean };
type AccessResponse = { access: AccessState; pendingPayment: { reference_id: string; status?: string } | null };

export default function NatCashAccessScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [access, setAccess] = useState<AccessState | null>(null);
  const [pendingPayment, setPendingPayment] = useState<AccessResponse['pendingPayment']>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await getNatCashAccess() as AccessResponse;
      setAccess(result.access);
      setPendingPayment(result.pendingPayment);
    } catch (error) {
      toast.error(t('common.error'), error instanceof Error ? error.message : t('settings.failed'));
    } finally { setLoading(false); }
  }, [t, toast]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const buy = async () => {
    setBusy(true);
    try {
      const result = await createNatCashAccessPayment() as { paymentUrl: string };
      setPendingPayment({ reference_id: 'awaiting-confirmation', status: 'pending' });
      await Linking.openURL(result.paymentUrl);
    } catch (error) {
      toast.error(t('common.error'), error instanceof Error ? error.message : t('settings.failed'));
      await refresh();
    } finally { setBusy(false); }
  };

  const changeStatus = async (action: 'pause' | 'reactivate') => {
    setBusy(true);
    try {
      if (action === 'pause') await pauseNatCashAccess(); else await reactivateNatCashAccess();
      await refresh();
    } catch (error) {
      toast.error(t('common.error'), error instanceof Error ? error.message : t('settings.failed'));
    } finally { setBusy(false); }
  };

  const setAcceptingNatCash = async (enabled: boolean) => {
    if (!access?.entitled || !access.phoneConfigured) return;
    setBusy(true);
    try {
      const methods = new Set(store.user?.accepted_payment_methods || ['moncash']);
      if (enabled) methods.add('natcash'); else methods.delete('natcash');
      const result = await updateSellerProfile({ acceptedPaymentMethods: [...methods] }) as { user?: any };
      if (result.user) {
        await store.setUser(result.user, store.token);
        setAccess(current => current ? { ...current, paymentMethodEnabled: (result.user.accepted_payment_methods || []).includes('natcash') } : current);
      }
    } catch (error) {
      toast.error(t('common.error'), error instanceof Error ? error.message : t('settings.failed'));
    } finally { setBusy(false); }
  };

  const business = access?.source === 'business' && access.entitled;
  const paused = access?.status === 'paused';
  const active = !!access?.entitled && !business;
  const expiry = access?.expiresAt ? new Date(access.expiresAt).toLocaleDateString() : '';

  return <View style={styles.container}>
    <ScreenHeader title={t('natcashAccess.title')} onBack={() => navigation.goBack()} />
    {loading ? <View style={styles.loader}><ActivityIndicator color={COLORS.coral} /></View> : <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.headingRow}>
          <View style={styles.icon}><MaterialCommunityIcons name="cash-multiple" size={22} color={COLORS.purple} /></View>
          <View style={styles.headingText}>
            <Text style={styles.title}>{business ? t('natcashAccess.businessIncluded') : paused ? t('natcashAccess.paused') : active ? t('natcashAccess.active') : t('natcashAccess.notActive')}</Text>
            {expiry ? <Text style={styles.meta}>{t('natcashAccess.expires', { date: expiry })}</Text> : null}
          </View>
          <View style={[styles.dot, { backgroundColor: business || active ? COLORS.green : paused ? COLORS.yellow : COLORS.text3 }]} />
        </View>
        <View style={styles.rule} />
        <Text style={styles.body}>{t('natcashAccess.summary')}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <View style={styles.headingText}>
            <Text style={styles.sectionTitle}>{t('natcashAccess.acceptOrders')}</Text>
            <Text style={styles.body}>{!access?.entitled ? t('natcashAccess.enableAfterPayment') : !access.phoneConfigured ? t('natcashAccess.addPhoneFirst') : t('natcashAccess.acceptOrdersHint')}</Text>
          </View>
          {access?.entitled && !access.phoneConfigured ? <SettingsLinkButton onPress={() => navigation.navigate('SettingsEdit', { field: 'natcash_phone', title: t('natcashAccess.phoneTitle') })}>{t('natcashAccess.addPhone')}</SettingsLinkButton> : <Switch value={!!access?.paymentMethodEnabled} onValueChange={setAcceptingNatCash} disabled={!access?.entitled || busy} trackColor={{ false: COLORS.borderLight, true: COLORS.green }} thumbColor={COLORS.white} accessibilityLabel={t('natcashAccess.acceptOrders')} />}
        </View>
      </View>

      {!business && <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('natcashAccess.plan')}</Text>
        <View style={styles.priceRow}><Text style={styles.price}>500 HTG</Text><Text style={styles.meta}>{t('natcashAccess.perMonth')}</Text></View>
        <Text style={styles.body}>{t('natcashAccess.terms')}</Text>
        {active && access?.inGracePeriod ? <Text style={styles.notice}>{t('natcashAccess.grace')}</Text> : null}
        {pendingPayment ? <Text style={styles.notice}>{pendingPayment.status === 'reconciliation_required' ? t('natcashAccess.paymentReconciliation') : t('natcashAccess.paymentPending')}</Text> : <PrimaryButton onPress={buy} disabled={busy} style={styles.action}>{busy ? t('common.loading') : t('natcashAccess.pay')}</PrimaryButton>}
        {active && <SettingsLinkButton onPress={() => changeStatus('pause')} disabled={busy} style={styles.secondary}>{t('natcashAccess.pause')}</SettingsLinkButton>}
        {paused && <PrimaryButton onPress={() => changeStatus('reactivate')} disabled={busy} style={styles.action}>{t('natcashAccess.reactivate')}</PrimaryButton>}
      </View>}

      <Text style={styles.footnote}>{t('natcashAccess.disclosure')}</Text>
    </ScrollView>}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xl },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.card, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg, gap: SPACING.md },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  headingText: { flex: 1, gap: 4 },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.purpleMuted },
  dot: { width: 9, height: 9, borderRadius: 5 },
  title: { color: COLORS.text, fontSize: 17, fontWeight: '700' },
  sectionTitle: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  meta: { color: COLORS.text2, fontSize: 13 },
  body: { color: COLORS.text2, fontSize: 14, lineHeight: 21 },
  rule: { height: 1, backgroundColor: COLORS.border },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: SPACING.sm },
  price: { color: COLORS.text, fontSize: 24, fontWeight: '800' },
  action: { minHeight: 48 },
  secondary: { minHeight: 44 },
  notice: { color: COLORS.yellow, fontSize: 13, lineHeight: 19 },
  footnote: { color: COLORS.text3, fontSize: 12, lineHeight: 18, paddingHorizontal: 4 },
});
