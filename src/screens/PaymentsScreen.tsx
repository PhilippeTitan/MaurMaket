import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert, TextInput, Linking,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING, RADIUS, formatPrice } from '../theme';
import { useTranslation } from '@/localization';
import { getSellerBalance, getSellerPayouts, getSellerDebts, createSellerDebtPayment, checkSellerDebtPayment, requestPayout } from '../api';
import { store } from '../store';
import type { RootStackParamList } from '../navigation';
import ScreenHeader from '../components/ScreenHeader';
import EmptyState from '../components/EmptyState';
import { network } from '../network';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Payout {
  id: string;
  amount: number;
  fee_amount?: number;
  total_debit?: number;
  status: string;
  settlement_confirmed?: boolean;
  error_message?: string;
  receiver_phone: string;
  created_at: string;
}

interface ActiveDebtPayment {
  id: string;
  debt_amount: number;
  charge_amount: number;
  collection_fee_amount: number;
  status: string;
}

const PAYMENTS_CACHE_TTL = 30_000;
let _paymentsCache: { data: any; timestamp: number } | null = null;

export default function PaymentsScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const isSeller = store.isSeller;
  const [balance, setBalance] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [totalPaidOut, setTotalPaidOut] = useState(0);
  const [outstandingDebt, setOutstandingDebt] = useState(0);
  const [activeDebtPayment, setActiveDebtPayment] = useState<ActiveDebtPayment | null>(null);
  const [payingDebt, setPayingDebt] = useState(false);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [amount, setAmount] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [loading, setLoading] = useState(true);
  const amountValue = parseFloat(amount);
  const previewFee = Number.isFinite(amountValue) ? Math.round(amountValue * 0.05 * 100) / 100 : 0;
  const previewTotalDebit = Number.isFinite(amountValue) ? Math.round((amountValue + previewFee) * 100) / 100 : 0;

  const fetchData = useCallback(async (force = false) => {
    if (!isSeller) return;
    if (!force && _paymentsCache && Date.now() - _paymentsCache.timestamp < PAYMENTS_CACHE_TTL) {
      const d = _paymentsCache.data;
      setBalance(d.balance);
      setTotalEarned(d.totalEarned);
      setTotalPaidOut(d.totalPaidOut);
      setPayouts(d.payouts);
      setOutstandingDebt(d.outstandingDebt || 0);
      setActiveDebtPayment(d.activeDebtPayment || null);
      setLoading(false);
      return;
    }
    try {
      const [balRes, payRes, debtRes] = await Promise.all([
        getSellerBalance() as Promise<{ balance: number; total_earned: number; total_paid_out: number }>,
        getSellerPayouts() as Promise<{ payouts: Payout[] }>,
        getSellerDebts() as Promise<{ total: number; activePayment?: ActiveDebtPayment | null }>,
      ]);
      const balance = balRes.balance || 0;
      const totalEarned = balRes.total_earned || 0;
      const totalPaidOut = balRes.total_paid_out || 0;
      const payouts = payRes.payouts || [];
      const outstandingDebt = debtRes.total || 0;
      const activeDebtPayment = debtRes.activePayment || null;
      setBalance(balance);
      setTotalEarned(totalEarned);
      setTotalPaidOut(totalPaidOut);
      setPayouts(payouts);
      setOutstandingDebt(outstandingDebt);
      setActiveDebtPayment(activeDebtPayment);
      _paymentsCache = { timestamp: Date.now(), data: { balance, totalEarned, totalPaidOut, payouts, outstandingDebt, activeDebtPayment } };
    } catch { Alert.alert(t('common.error'), t('payments.loadFailed')); }
    setLoading(false);
  }, [isSeller]);

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData(true);
    setRefreshing(false);
  }, []);

  const handleRequestPayout = async () => {
    if (network.isOffline) {
      Alert.alert(t('network.offline'), 'Payout requests require an internet connection.');
      return;
    }
    const amt = parseFloat(amount);
    if (!amt || amt < 100) {
      Alert.alert(t('payments.minimum'), t('payments.minWithdrawal'));
      return;
    }
    if (!Number.isInteger(amt)) {
      Alert.alert(t('common.error'), t('payments.wholeGourdesOnly'));
      return;
    }
    const amountWithFee = Math.round(amt * 1.05 * 100) / 100;
    if (amountWithFee > balance) {
      Alert.alert(t('common.error'), t('payments.insufficient'));
      return;
    }
    setRequesting(true);
    try {
      await requestPayout(amt);
      Alert.alert(t('payments.success'), t('payments.requestSubmitted'));
      setAmount('');
      _paymentsCache = null; // Force refresh to show new processing payout
      await fetchData(true);
    } catch (e: any) {
      // Handle specific MCC error codes
      const msg = e?.message || '';
      if (msg.includes('payout_in_progress') || e?.error === 'payout_in_progress') {
        Alert.alert(t('payments.minimum'), t('payments.payoutInProgress'));
      } else {
        Alert.alert(t('common.error'), msg || t('payments.loadFailed'));
      }
    } finally {
      setRequesting(false);
    }
  };

  const handlePayDebt = async () => {
    if (network.isOffline) {
      Alert.alert(t('network.offline'), t('payments.debtPaymentOnlineOnly'));
      return;
    }
    setPayingDebt(true);
    try {
      const result = await createSellerDebtPayment() as { paymentId: string; paymentUrl?: string; status: string; chargeAmount?: number };
      setActiveDebtPayment({ id: result.paymentId, debt_amount: outstandingDebt, charge_amount: result.chargeAmount || 0, collection_fee_amount: (result.chargeAmount || 0) - outstandingDebt, status: result.status });
      _paymentsCache = null;
      if (result.paymentUrl) await Linking.openURL(result.paymentUrl);
      else Alert.alert(t('payments.debtPaymentPending'), t('payments.debtPaymentCheckStatus'));
      await fetchData(true);
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('payments.debtPaymentFailed'));
      await fetchData(true);
    } finally {
      setPayingDebt(false);
    }
  };

  const handleCheckDebtPayment = async () => {
    if (!activeDebtPayment) return;
    try {
      const result = await checkSellerDebtPayment(activeDebtPayment.id) as unknown as ActiveDebtPayment;
      if (result.status === 'completed') {
        Alert.alert(t('payments.debtPaymentConfirmed'), t('payments.debtPaymentConfirmedBody'));
        _paymentsCache = null;
        setActiveDebtPayment(null);
        await fetchData(true);
      } else if (result.status === 'failed') {
        Alert.alert(t('payments.debtPaymentFailed'), t('payments.debtPaymentRetryHint'));
        _paymentsCache = null;
        await fetchData(true);
      } else {
        setActiveDebtPayment(result);
        Alert.alert(t('payments.debtPaymentPending'), t('payments.debtPaymentCheckStatus'));
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('payments.debtPaymentCheckStatus'));
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'completed': return { bg: 'rgba(0,229,160,0.15)', color: COLORS.green, label: t('payments.statusCompleted') };
      case 'processing': return { bg: 'rgba(255,193,7,0.15)', color: '#FFC107', label: t('payments.statusProcessing') };
      case 'failed': return { bg: 'rgba(255,77,106,0.15)', color: COLORS.coral, label: t('payments.statusFailed') };
      default: return { bg: COLORS.surface2, color: COLORS.text2, label: status };
    }
  };

  if (!isSeller) {
    return (
      <View style={styles.container}>
        <ScreenHeader title={t('payments.title')} onBack={() => nav.goBack()} />
        <EmptyState icon="cash" title={t('payments.notSeller')} />
      </View>
    );
  }

  if (store.user?.seller_tier === 'casual') {
    return (
      <View style={styles.container}>
        <ScreenHeader title={t('payments.title')} onBack={() => nav.goBack()} />
        <FlatList
          data={[] as { id: string }[]}
          keyExtractor={item => item.id}
          renderItem={() => null}
          contentContainerStyle={{ padding: SPACING.md, flexGrow: 1 }}
          ListHeaderComponent={
            <>
              <EmptyState
                icon="lock-outline"
                title={t('payments.payoutsRequireVerified')}
                hint={t('payments.upgradeHint')}
                actionLabel={t('addListing.upgradeToVerified')}
                onAction={() => { nav.navigate('SellerOnboarding'); }}
                actionColor={COLORS.green}
              />
              {outstandingDebt > 0 ? (
                <View style={styles.debtCard}>
                  <Text style={styles.debtTitle}>{t('payments.outstandingDebt')}: {formatPrice(outstandingDebt)} G</Text>
                  <Text style={styles.debtHint}>{t('payments.debtOffsetHint')}</Text>
                  {activeDebtPayment ? (
                    <>
                      <Text style={styles.debtHint}>{t('payments.debtPaymentCharge')}: {formatPrice(activeDebtPayment.charge_amount)} G ({t('payments.collectionFee')}: {formatPrice(activeDebtPayment.collection_fee_amount)} G)</Text>
                      <TouchableOpacity style={styles.debtAction} onPress={handleCheckDebtPayment} accessibilityRole="button" accessibilityLabel={t('payments.checkDebtPayment')}>
                        <Text style={styles.debtActionText}>{t('payments.checkDebtPayment')}</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity style={styles.debtAction} onPress={handlePayDebt} disabled={payingDebt} accessibilityRole="button" accessibilityLabel={t('payments.payDebt')}>
                      <Text style={styles.debtActionText}>{payingDebt ? t('payments.loading') : t('payments.payDebt')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : null}
            </>
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('payments.title')} onBack={() => nav.goBack()} />
      <FlatList
        data={payouts}
        keyExtractor={item => item.id}
        ListHeaderComponent={
          <>
            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>{t('payments.availableBalance')}</Text>
              <Text style={styles.balanceValue}>{formatPrice(balance)} G</Text>
              <View style={styles.balanceStats}>
                <View style={styles.balanceStat}>
                  <Text style={styles.balanceStatNum}>{formatPrice(totalEarned)} G</Text>
                  <Text style={styles.balanceStatLabel}>{t('payments.totalEarned')}</Text>
                </View>
                <View style={styles.balanceStat}>
                  <Text style={styles.balanceStatNum}>{formatPrice(totalPaidOut)} G</Text>
                  <Text style={styles.balanceStatLabel}>{t('payments.totalPaidOut')}</Text>
                </View>
              </View>
            </View>
            {outstandingDebt > 0 ? (
              <View style={styles.debtCard}>
                <Text style={styles.debtTitle}>{t('payments.outstandingDebt')}: {formatPrice(outstandingDebt)} G</Text>
                <Text style={styles.debtHint}>{t('payments.debtOffsetHint')}</Text>
                {activeDebtPayment ? (
                  <>
                    <Text style={styles.debtHint}>{t('payments.debtPaymentCharge')}: {formatPrice(activeDebtPayment.charge_amount)} G ({t('payments.collectionFee')}: {formatPrice(activeDebtPayment.collection_fee_amount)} G)</Text>
                    <TouchableOpacity style={styles.debtAction} onPress={handleCheckDebtPayment} accessibilityRole="button" accessibilityLabel={t('payments.checkDebtPayment')}>
                      <Text style={styles.debtActionText}>{t('payments.checkDebtPayment')}</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity style={styles.debtAction} onPress={handlePayDebt} disabled={payingDebt} accessibilityRole="button" accessibilityLabel={t('payments.payDebt')}>
                    <Text style={styles.debtActionText}>{payingDebt ? t('payments.loading') : t('payments.payDebt')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}
            <View style={styles.requestSection}>
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  placeholder={t('payments.amount')}
                  placeholderTextColor={COLORS.text2}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                  accessibilityLabel="payout amount"
                 
                />
                <Text style={styles.minHint}>{t('payments.minPayoutHint')}</Text>
                {Number.isFinite(amountValue) && amountValue > 0 ? (
                  <View style={styles.feePreview}>
                    <Text style={styles.feePreviewText}>{t('payments.youReceive')}: {formatPrice(amountValue)} G</Text>
                    <Text style={styles.feePreviewText}>{t('payments.withdrawalFee')}: {formatPrice(previewFee)} G</Text>
                    <Text style={[styles.feePreviewText, styles.feePreviewTotal]}>{t('payments.totalDebit')}: {formatPrice(previewTotalDebit)} G</Text>
                  </View>
                ) : null}
              </View>
              <TouchableOpacity
                style={[styles.requestBtn, requesting && { opacity: 0.6 }]}
                onPress={handleRequestPayout}
                disabled={requesting}
                accessibilityLabel="request payout"
                accessibilityRole="button"
              >
                <Text style={styles.requestBtnText}>{requesting ? t('payments.loading') : t('payments.requestPayout')}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.sectionTitle}>{t('payments.payoutHistory')}</Text>
          </>
        }
        renderItem={({ item }) => {
          const s = getStatusStyle(item.status);
          return (
            <View style={styles.payoutRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.payoutAmount}>{formatPrice(item.amount)} G</Text>
                {Number(item.fee_amount) > 0 ? <Text style={styles.payoutDate}>{t('payments.withdrawalFee')}: {formatPrice(Number(item.fee_amount))} G</Text> : null}
                <Text style={styles.payoutDate}>{new Date(item.created_at).toLocaleDateString('fr-HT')}</Text>
                {item.status === 'failed' && item.error_message ? (
                  <Text style={styles.errorMsg} numberOfLines={2}>{item.error_message}</Text>
                ) : null}
                {item.status === 'completed' && item.settlement_confirmed === false ? (
                  <Text style={styles.errorMsg}>{t('payments.legacySettlementReview')}</Text>
                ) : null}
              </View>
              <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
                <Text style={[styles.statusText, { color: s.color }]}>
                  {s.label}
                </Text>
              </View>
            </View>
          );
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.coral} />}
        ListEmptyComponent={
          !refreshing ? <EmptyState icon="cash-multiple" title={t('payments.noPayouts')} /> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  balanceCard: { margin: SPACING.md, padding: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.card, borderWidth: 1, borderColor: COLORS.border },
  debtCard: { marginHorizontal: SPACING.md, marginBottom: SPACING.md, padding: SPACING.md, backgroundColor: 'rgba(255,193,7,0.08)', borderRadius: RADIUS.card, borderWidth: 1, borderColor: 'rgba(255,193,7,0.3)' },
  debtTitle: { fontSize: 13, color: '#FFC107', fontWeight: '700' },
  debtHint: { fontSize: 11, color: COLORS.text2, marginTop: 4 },
  debtAction: { alignSelf: 'flex-start', marginTop: SPACING.sm, minHeight: 44, justifyContent: 'center', paddingHorizontal: SPACING.md, borderRadius: RADIUS.row, backgroundColor: COLORS.coral },
  debtActionText: { color: COLORS.white, fontSize: 12, fontWeight: '700' },
  balanceLabel: { fontSize: 12, color: COLORS.text2 },
  balanceValue: { fontSize: 28, color: COLORS.coral, fontWeight: '800', marginVertical: 4 },
  balanceStats: { flexDirection: 'row', gap: 20, marginTop: 8 },
  balanceStat: {},
  balanceStatNum: { fontSize: 13, color: COLORS.text, fontWeight: '700' },
  balanceStatLabel: { fontSize: 10, color: COLORS.text2 },
  requestSection: { paddingHorizontal: SPACING.md, flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  inputWrap: { flex: 1 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.row, padding: 10, color: COLORS.text, fontSize: 13 },
  minHint: { fontSize: 10, color: COLORS.text2, marginTop: 3, marginLeft: 4 },
  requestBtn: { backgroundColor: COLORS.coral, borderRadius: RADIUS.row, paddingHorizontal: 16, height: 40, justifyContent: 'center' },
  requestBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 13 },
  sectionTitle: { fontSize: 12, color: COLORS.text2, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: SPACING.md, marginTop: SPACING.md, marginBottom: 8 },
  payoutRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  payoutAmount: { fontSize: 14, color: COLORS.text, fontWeight: '700' },
  payoutDate: { fontSize: 10, color: COLORS.text2, marginTop: 2 },
  feePreview: { marginTop: SPACING.sm, gap: 4 },
  feePreviewText: { fontSize: 12, color: COLORS.text2 },
  feePreviewTotal: { color: COLORS.text, fontWeight: '700' },
  errorMsg: { fontSize: 10, color: COLORS.coral, marginTop: 3, fontStyle: 'italic' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.card },
  statusText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
});
