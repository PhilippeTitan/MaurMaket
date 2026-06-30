import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../theme';
import { getOrders, cancelOrder, completeOrder, getSellerOrders, updateOrderStatus } from '../api';
import { store } from '../store';
import { useTranslation } from '../i18n';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import type { Order } from '../types';
import ScreenHeader from '../components/ScreenHeader';
import EmptyState from '../components/EmptyState';

type Props = NativeStackScreenProps<RootStackParamList, 'Orders'>;

const STATUS_COLORS: Record<string, string> = {
  pending: COLORS.blue,
  paid: COLORS.green,
  processing: COLORS.blue,
  shipped: COLORS.blue,
  delivered: COLORS.green,
  completed: COLORS.green,
  cancelled: COLORS.coral,
};

const errorMessage = (err: unknown, fallback = 'Failed') => err instanceof Error ? err.message : fallback;

export default function OrdersScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'buying' | 'selling'>('buying');
  const [buyOrders, setBuyOrders] = useState<Order[]>([]);
  const [sellOrders, setSellOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const [buyRes, sellRes] = await Promise.all([
        getOrders() as Promise<{ buyerOrders: Order[] }>,
        store.isSeller ? getSellerOrders() as Promise<{ orders: Order[] }> : Promise.resolve({ orders: [] }),
      ]);
      setBuyOrders(buyRes.buyerOrders || []);
      setSellOrders(sellRes.orders || []);
    } catch (err: unknown) {
      Alert.alert(t('common.error'), errorMessage(err, 'Could not load orders.'));
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchOrders(); }, [fetchOrders]));

  useEffect(() => {
    const unsub = store.onChange(fetchOrders);
    return unsub;
  }, [fetchOrders]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  }, []);

  const orders = tab === 'buying' ? buyOrders : sellOrders;

  const getStatusColor = (s: string) => STATUS_COLORS[s] || COLORS.text2;

  const handleCancel = async (orderId: string) => {
    Alert.alert(t('orderDetail.cancelOrder'), t('orderDetail.cancelConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: 'Yes', style: 'destructive', onPress: async () => {
        try { await cancelOrder(orderId); fetchOrders(); } catch (err: unknown) { Alert.alert(t('common.error'), errorMessage(err)); }
      }},
    ]);
  };

  const handleComplete = async (orderId: string) => {
    try { await completeOrder(orderId); fetchOrders(); } catch (err: unknown) { Alert.alert(t('common.error'), errorMessage(err)); }
  };

  const handleStatusUpdate = async (orderId: string, status: string) => {
    try { await updateOrderStatus(orderId, status); fetchOrders(); } catch (err: unknown) { Alert.alert(t('common.error'), errorMessage(err)); }
  };

  const renderItem = ({ item }: { item: Order }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.orderId}>#{item.id.slice(0, 8)}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '1A' }]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>{item.status}</Text>
        </View>
      </View>
      <Text style={styles.amount}>Rs {Number(item.total_amount).toLocaleString()}</Text>
      <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString()}</Text>

      <View style={styles.actions}>
        {tab === 'buying' && item.status === 'pending' && (
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleCancel(item.id)}>
            <Text style={styles.actionBtnText}>{t('orderDetail.cancel')}</Text>
          </TouchableOpacity>
        )}
        {tab === 'buying' && item.status === 'delivered' && (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.green }]} onPress={() => handleComplete(item.id)}>
            <Text style={[styles.actionBtnText, { color: COLORS.white }]}>{t('orderDetail.completed')}</Text>
          </TouchableOpacity>
        )}
        {tab === 'selling' && item.status === 'paid' && (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.blue }]} onPress={() => handleStatusUpdate(item.id, 'processing')}>
            <Text style={[styles.actionBtnText, { color: COLORS.white }]}>{t('orderDetail.processing')}</Text>
          </TouchableOpacity>
        )}
        {tab === 'selling' && item.status === 'processing' && (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.blue }]} onPress={() => handleStatusUpdate(item.id, 'shipped')}>
            <Text style={[styles.actionBtnText, { color: COLORS.white }]}>{t('orderDetail.shipped')}</Text>
          </TouchableOpacity>
        )}
        {tab === 'selling' && item.status === 'shipped' && (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.green }]} onPress={() => handleStatusUpdate(item.id, 'delivered')}>
            <Text style={[styles.actionBtnText, { color: COLORS.white }]}>{t('orderDetail.delivered')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.detailBtn} onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}>
          <Text style={styles.detailBtnText}>{t('orderDetail.title')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('orders.title')} onBack={() => navigation.goBack()} variant="branded" bordered={false} />

      {store.isSeller && (
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, tab === 'buying' && styles.tabActive]}
            onPress={() => setTab('buying')}
          >
            <Text style={[styles.tabText, tab === 'buying' && styles.tabTextActive]}>{t('orders.buying')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'selling' && styles.tabActive]}
            onPress={() => setTab('selling')}
          >
            <Text style={[styles.tabText, tab === 'selling' && styles.tabTextActive]}>{t('orders.selling')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.coral} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={orders}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.coral} />}
          ListEmptyComponent={
            <EmptyState
              icon="package-variant"
              title={t('orders.noOrders')}
              hint={tab === 'buying' ? t('orders.whenBuyersOrder') : t('orders.noSellingOrders')}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  tabRow: {
    flexDirection: 'row', marginHorizontal: SPACING.lg, marginBottom: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.card, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
  },
  tab: { flex: 1, padding: 10, alignItems: 'center' },
  tabActive: { backgroundColor: COLORS.coral },
  tabText: { color: COLORS.text2, fontSize: 14, fontWeight: '500' },
  tabTextActive: { color: COLORS.white },
  list: { padding: SPACING.lg, paddingBottom: 100 },
  card: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.media, padding: 14, marginBottom: 8,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  orderId: { fontSize: 12, color: COLORS.text2, fontFamily: 'monospace' },
  statusBadge: { borderRadius: RADIUS.row, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 12, fontWeight: '600' },
  amount: { fontFamily: 'Syne', fontSize: 16, fontWeight: '700', color: COLORS.coral },
  date: { fontSize: 11, color: COLORS.text2, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.row,
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border,
  },
  actionBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  detailBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.row,
    borderWidth: 1, borderColor: COLORS.blue,
  },
  detailBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.blue },
});