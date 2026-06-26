import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert, TextInput,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING } from '../theme';
import { getSellerBalance, getSellerPayouts, requestPayout } from '../api';
import { store } from '../store';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Payout {
  id: string;
  amount: number;
  status: string;
  receiver_phone: string;
  created_at: string;
}

export default function PaymentsScreen() {
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
    } catch { Alert.alert('Error', 'Could not load balance.'); }
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
      Alert.alert('Minimum', 'Minimum withdrawal is Rs 50.');
      return;
    }
    if (amt > balance) {
      Alert.alert('Info', 'Insufficient balance.');
      return;
    }
    setRequesting(true);
    try {
      await requestPayout(amt);
      Alert.alert('Success!', 'Withdrawal request submitted!');
      setAmount('');
      await fetchData();
    } catch (e: any) {
      Alert.alert('Erreur', e.message);
    } finally {
      setRequesting(false);
    }
  };

  if (!isSeller) {
    return (
      <View style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => nav.goBack()}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.text2} />
          </TouchableOpacity>
          <Text style={styles.title}>Payments & Payouts</Text>
        </View>
        <View style={styles.empty}>
          <MaterialCommunityIcons name="cash" size={40} color={COLORS.text2} />
          <Text style={styles.emptyText}>You are not a seller yet</Text>
        </View>
      </View>
    );
  }

  if (store.user?.seller_tier === 'casual') {
    return (
      <View style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => nav.goBack()}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.text2} />
          </TouchableOpacity>
          <Text style={styles.title}>Payments & Payouts</Text>
        </View>
        <View style={styles.empty}>
          <MaterialCommunityIcons name="lock-outline" size={40} color={COLORS.text2} />
          <Text style={styles.emptyText}>Payouts require Verified status</Text>
          <Text style={styles.emptyHint}>Upgrade to a Verified seller account to request MonCash payouts.</Text>
          <TouchableOpacity
            style={styles.upgradeBtn}
            onPress={() => { nav.goBack(); nav.navigate('SellerOnboarding'); }}
          >
            <Text style={styles.upgradeBtnText}>Upgrade to Verified</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => nav.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.text2} />
        </TouchableOpacity>
        <Text style={styles.title}>Payments & Payouts</Text>
      </View>
      <FlatList
        data={payouts}
        keyExtractor={item => item.id}
        ListHeaderComponent={
          <>
            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>Available Balance</Text>
              <Text style={styles.balanceValue}>Rs {balance.toLocaleString()}</Text>
              <View style={styles.balanceStats}>
                <View style={styles.balanceStat}>
                  <Text style={styles.balanceStatNum}>Rs {totalEarned.toLocaleString()}</Text>
                  <Text style={styles.balanceStatLabel}>Total Earned</Text>
                </View>
                <View style={styles.balanceStat}>
                  <Text style={styles.balanceStatNum}>Rs {totalPaidOut.toLocaleString()}</Text>
                  <Text style={styles.balanceStatLabel}>Total Paid Out</Text>
                </View>
              </View>
            </View>
            <View style={styles.requestSection}>
              <TextInput
                style={styles.input}
                placeholder="Amount (min Rs 50)"
                placeholderTextColor={COLORS.text2}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
              />
              <TouchableOpacity
                style={[styles.requestBtn, requesting && { opacity: 0.6 }]}
                onPress={handleRequestPayout}
                disabled={requesting}
              >
                <Text style={styles.requestBtnText}>{requesting ? 'Loading...' : 'Request Payout'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.sectionTitle}>Payout History</Text>
          </>
        }
        renderItem={({ item }) => (
          <View style={styles.payoutRow}>
            <View>
              <Text style={styles.payoutAmount}>Rs {item.amount.toLocaleString()}</Text>
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
          !refreshing ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No payouts yet</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { fontSize: 16, color: COLORS.text, fontWeight: '700' },
  balanceCard: { margin: SPACING.md, padding: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  balanceLabel: { fontSize: 12, color: COLORS.text2 },
  balanceValue: { fontSize: 28, color: COLORS.coral, fontWeight: '800', marginVertical: 4 },
  balanceStats: { flexDirection: 'row', gap: 20, marginTop: 8 },
  balanceStat: {},
  balanceStatNum: { fontSize: 13, color: COLORS.text, fontWeight: '700' },
  balanceStatLabel: { fontSize: 10, color: COLORS.text2 },
  requestSection: { paddingHorizontal: SPACING.md, flexDirection: 'row', gap: 8 },
  input: { flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 10, color: COLORS.text, fontSize: 13 },
  requestBtn: { backgroundColor: COLORS.coral, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  requestBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 13 },
  sectionTitle: { fontSize: 12, color: COLORS.text2, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: SPACING.md, marginTop: SPACING.md, marginBottom: 8 },
  payoutRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  payoutAmount: { fontSize: 14, color: COLORS.text, fontWeight: '700' },
  payoutDate: { fontSize: 10, color: COLORS.text2, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, backgroundColor: COLORS.surface2 },
  statusCompleted: { backgroundColor: 'rgba(0,229,160,0.15)' },
  statusText: { fontSize: 10, color: COLORS.text2, fontWeight: '600', textTransform: 'capitalize' },
  statusTextCompleted: { color: COLORS.green },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyText: { fontSize: 14, color: COLORS.text2 },
  emptyHint: { fontSize: 12, color: COLORS.text2, opacity: 0.7, textAlign: 'center', paddingHorizontal: 40 },
  upgradeBtn: {
    marginTop: 8, paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: COLORS.green, borderRadius: 12,
  },
  upgradeBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.white },
});
