import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert, TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING, RADIUS, formatPrice } from '../theme';
import { useTranslation } from '../i18n';
import { getSellerBalance, getSellerPayouts, requestPayout } from '../api';
import { store } from '../store';
import type { RootStackParamList } from '../navigation';
import ScreenHeader from '../components/ScreenHeader';
import EmptyState from '../components/EmptyState';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Payout {
  id: string;
  amount: number;
  status: string;
  receiver_phone: string;
  created_at: string;
}

export default function PaymentsScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const isSeller = store.isSeller;
  const [balance, setBalance] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [totalPaidOut, setTotalPaidOut] = useState(0);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [amount, setAmount] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!isSeller) return;
    try {
      const [balRes, payRes] = await Promise.all([
        getSellerBalance() as Promise<{ balance: number; total_earned: number; total_paid_out: number }>,
        getSellerPayouts() as Promise<{ payouts: Payout[] }>,
      ]);
      setBalance(balRes.balance || 0);
      setTotalEarned(balRes.total_earned || 0);
      setTotalPaidOut(balRes.total_paid_out || 0);
      setPayouts(payRes.payouts || []);
    } catch { Alert.alert(t('common.error'), t('payments.loadFailed')); }
    setLoading(false);
  }, [isSeller]);

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, []);

  const handleRequestPayout = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt < 50) {
      Alert.alert(t('payments.minimum'), t('payments.minWithdrawal'));
      return;
    }
    if (amt > balance) {
      Alert.alert(t('common.error'), t('payments.insufficient'));
      return;
    }
    setRequesting(true);
    try {
      await requestPayout(amt);
      Alert.alert(t('payments.success'), t('payments.requestSubmitted'));
      setAmount('');
      await fetchData();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setRequesting(false);
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
        <EmptyState
          icon="lock-outline"
          title={t('payments.payoutsRequireVerified')}
          hint={t('payments.upgradeHint')}
          actionLabel={t('addListing.upgradeToVerified')}
          onAction={() => { nav.navigate('SellerOnboarding'); }}
          actionColor={COLORS.green}
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
              <Text style={styles.balanceValue}>Rs {formatPrice(balance)}</Text>
              <View style={styles.balanceStats}>
                <View style={styles.balanceStat}>
                  <Text style={styles.balanceStatNum}>Rs {formatPrice(totalEarned)}</Text>
                  <Text style={styles.balanceStatLabel}>{t('payments.totalEarned')}</Text>
                </View>
                <View style={styles.balanceStat}>
                  <Text style={styles.balanceStatNum}>Rs {formatPrice(totalPaidOut)}</Text>
                  <Text style={styles.balanceStatLabel}>{t('payments.totalPaidOut')}</Text>
                </View>
              </View>
            </View>
            <View style={styles.requestSection}>
              <TextInput
                style={styles.input}
                placeholder={t('payments.amount')}
                placeholderTextColor={COLORS.text2}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                accessibilityLabel="payout amount"
                accessibilityRole="text"
              />
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
        renderItem={({ item }) => (
          <View style={styles.payoutRow}>
            <View>
              <Text style={styles.payoutAmount}>Rs {formatPrice(item.amount)}</Text>
              <Text style={styles.payoutDate}>{new Date(item.created_at).toLocaleDateString('fr-HT')}</Text>
            </View>
            <View style={[styles.statusBadge, item.status === 'completed' && styles.statusCompleted]}>
              <Text style={[styles.statusText, item.status === 'completed' && styles.statusTextCompleted]}>
                {item.status}
              </Text>
            </View>
          </View>
        )}
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
  balanceLabel: { fontSize: 12, color: COLORS.text2 },
  balanceValue: { fontSize: 28, color: COLORS.coral, fontWeight: '800', marginVertical: 4 },
  balanceStats: { flexDirection: 'row', gap: 20, marginTop: 8 },
  balanceStat: {},
  balanceStatNum: { fontSize: 13, color: COLORS.text, fontWeight: '700' },
  balanceStatLabel: { fontSize: 10, color: COLORS.text2 },
  requestSection: { paddingHorizontal: SPACING.md, flexDirection: 'row', gap: 8 },
  input: { flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.row, padding: 10, color: COLORS.text, fontSize: 13 },
  requestBtn: { backgroundColor: COLORS.coral, borderRadius: RADIUS.row, paddingHorizontal: 16, justifyContent: 'center' },
  requestBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 13 },
  sectionTitle: { fontSize: 12, color: COLORS.text2, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: SPACING.md, marginTop: SPACING.md, marginBottom: 8 },
  payoutRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  payoutAmount: { fontSize: 14, color: COLORS.text, fontWeight: '700' },
  payoutDate: { fontSize: 10, color: COLORS.text2, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.card, backgroundColor: COLORS.surface2 },
  statusCompleted: { backgroundColor: 'rgba(0,229,160,0.15)' },
  statusText: { fontSize: 10, color: COLORS.text2, fontWeight: '600', textTransform: 'capitalize' },
  statusTextCompleted: { color: COLORS.green },
});