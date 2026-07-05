import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Linking,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, formatPrice } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import { getOrder, getOrderTimeline, cancelOrder, completeOrder, retryPayment, reorder, createReview, createDispute, updateOrderStatus } from '../api';
import { store } from '../store';
import { useTranslation } from '../i18n';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import type { Order, OrderEvent } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderDetail'>;

const STATUS_COLORS: Record<string, string> = {
  pending: COLORS.yellow,
  paid: COLORS.blue,
  processing: COLORS.blue,
  shipped: COLORS.blue,
  delivered: COLORS.green,
  completed: COLORS.green,
  cancelled: COLORS.coral,
};

const errorMessage = (err: unknown, fallback = 'Failed') => err instanceof Error ? err.message : fallback;

export default function OrderDetailScreen({ route, navigation }: Props) {
  const { t } = useTranslation();

  const { orderId } = route.params;
  const [order, setOrder] = useState<Order | null>(null);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [disputeModalVisible, setDisputeModalVisible] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeDescription, setDisputeDescription] = useState('');
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      const [orderRes, timelineRes] = await Promise.all([
        getOrder(orderId) as Promise<{ order: Order }>,
        getOrderTimeline(orderId) as Promise<{ events: OrderEvent[] }>,
      ]);
      setOrder(orderRes.order);
      setEvents(timelineRes.events || []);
    } catch (err: unknown) {
      Alert.alert(t('common.error'), errorMessage(err, 'Order not found'));
      navigation.goBack();
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [orderId]);

  const handleCancel = () => {
    Alert.alert(t('orderDetail.cancelOrder'), t('orderDetail.cancelConfirm'), [
      { text: t('orderDetail.cancel'), style: 'cancel' },
      { text: 'Yes', style: 'destructive', onPress: async () => {
        try { await cancelOrder(orderId); fetchData(); }
        catch (err: unknown) { Alert.alert(t('common.error'), errorMessage(err)); }
      }},
    ]);
  };

  const handleComplete = async () => {
    setActionLoading(true);
    try { await completeOrder(orderId); fetchData(); }
    catch (err: unknown) { Alert.alert(t('common.error'), errorMessage(err)); }
    setActionLoading(false);
  };

  const handleRetryPayment = async () => {
    setActionLoading(true);
    try {
      const res = await retryPayment(orderId) as { paymentUrl: string };
      if (res.paymentUrl) await Linking.openURL(res.paymentUrl);
    } catch (err: unknown) {
      Alert.alert(t('common.error'), errorMessage(err, 'Could not open payment'));
    }
    setActionLoading(false);
  };

  const handleReorder = async () => {
    setActionLoading(true);
    try {
      await reorder(orderId);
      Alert.alert('Added', 'Items added to your cart.', [
        { text: 'View Cart', onPress: () => navigation.navigate('Cart') },
        { text: 'Continue Shopping', style: 'cancel' },
      ]);
    } catch (err: unknown) {
      Alert.alert(t('common.error'), errorMessage(err, 'Could not reorder'));
    }
    setActionLoading(false);
  };

  const handleSubmitReview = async () => {
    if (reviewRating === 0) {
      Alert.alert(t('orderDetail.rating'), 'Please select a star rating.');
      return;
    }
    setReviewSubmitting(true);
    try {
      await createReview(orderId, reviewRating, reviewComment.trim());
      setReviewModalVisible(false);
      setReviewRating(0);
      setReviewComment('');
      Alert.alert('Thanks!', t('orderDetail.reviewSubmitted'));
      fetchData();
    } catch (err: unknown) {
      Alert.alert(t('common.error'), errorMessage(err, 'Could not submit review'));
    }
    setReviewSubmitting(false);
  };

  const handleSubmitDispute = async () => {
    if (!disputeReason) {
      Alert.alert(t('orderDetail.disputeReason'), 'Please select a reason for the dispute.');
      return;
    }
    setDisputeSubmitting(true);
    try {
      await createDispute({
        orderId,
        reason: disputeReason,
        description: disputeDescription.trim(),
      });
      setDisputeModalVisible(false);
      setDisputeReason('');
      setDisputeDescription('');
      Alert.alert('Report submitted', 'We will review your case and get back to you.');
      fetchData();
    } catch (err: unknown) {
      Alert.alert(t('common.error'), errorMessage(err, 'Could not submit report'));
    }
    setDisputeSubmitting(false);
  };

  const handleAdvanceStatus = async (nextStatus: string) => {
    setActionLoading(true);
    try {
      await updateOrderStatus(orderId, nextStatus);
      fetchData();
    } catch (err: unknown) {
      Alert.alert(t('common.error'), errorMessage(err, 'Could not update status'));
    }
    setActionLoading(false);
  };

  if (loading || !order) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.coral} /></View>;
  }

  const statusColor = STATUS_COLORS[order.status] || COLORS.text2;

  const isSeller = store.isSeller;
  const isSellerOfOrder = isSeller && order.items?.some((item: any) => item.seller_id === store.user?.id);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <ScreenHeader
        title={`${t('orderDetail.title')} #${order.id.slice(0, 8)}`}
        onBack={() => navigation.goBack()}
        variant="branded"
        bordered={false}
      />

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>{t('orderDetail.status')}</Text>
          <Text style={[styles.value, { color: statusColor, fontWeight: '700', textTransform: 'capitalize' }]}>{order.status}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>{t('orderDetail.total')}</Text>
          <Text style={[styles.value, { color: COLORS.coral, fontWeight: '700' }]}>
            Rs {formatPrice(Number(order.total_amount))}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>{t('orderDetail.deliveryMethod')}</Text>
          <Text style={styles.value}>{order.delivery_method === 'delivery' ? t('orderDetail.delivery') : t('orderDetail.meetup')}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>{t('orderDetail.date')}</Text>
          <Text style={styles.value}>{new Date(order.created_at).toLocaleDateString()}</Text>
        </View>
      </View>

      {/* ── Order Items ── */}
      {order.items && order.items.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('orderDetail.items')}</Text>
          {order.items.map((item: any, idx: number) => (
            <View key={item.id || idx} style={[styles.eventItem, { borderBottomColor: COLORS.border }]}>
              <Text style={styles.eventType}>{item.product_name || `Product #${item.product_id?.slice(0, 8)}`}</Text>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 4 }}>
                <Text style={styles.label}>x{item.quantity}</Text>
                <Text style={[styles.value, { color: COLORS.coral }]}>Rs {formatPrice(Number(item.price))}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {order.delivery_method === 'delivery' && order.delivery_name && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('orderDetail.deliveryAddress')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <MaterialCommunityIcons name="map-marker" size={14} color={COLORS.coral} />
            <Text style={styles.meetupText}>{order.delivery_name}</Text>
          </View>
          <Text style={styles.meetupText}>{order.delivery_address}{order.delivery_city ? `, ${order.delivery_city}` : ''}</Text>
          {order.delivery_phone && <Text style={styles.meetupNote}>{t('orderDetail.phone')}: {order.delivery_phone}</Text>}
          {order.delivery_note && <Text style={styles.meetupNote}>{t('orderDetail.note')}: {order.delivery_note}</Text>}
        </View>
      )}

      {order.meetup_address && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('orderDetail.meetup')} {t('orderDetail.deliveryMethod')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <MaterialCommunityIcons name="map-marker" size={14} color={COLORS.coral} />
            <Text style={styles.meetupText}>{order.meetup_address}</Text>
          </View>
          {order.meetup_note && <Text style={styles.meetupNote}>{t('orderDetail.note')}: {order.meetup_note}</Text>}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MaterialCommunityIcons
              name={order.meetup_confirmed ? 'check-circle' : 'clock-outline'}
              size={14}
              color={order.meetup_confirmed ? COLORS.green : COLORS.yellow}
            />
            <Text style={[styles.meetupConfirm, { color: order.meetup_confirmed ? COLORS.green : COLORS.yellow }]}>
              {order.meetup_confirmed ? t('orderDetail.confirmMeetup') : t('orderDetail.pending')}
            </Text>
          </View>
        </View>
      )}

      {events.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('orderDetail.timeline')}</Text>
          {events.map(event => (
            <View key={event.id} style={styles.eventItem}>
              <View style={styles.eventDot} />
              <View style={styles.eventInfo}>
                <Text style={styles.eventType}>{event.event_type.replace(/_/g, ' ')}</Text>
                {event.note && <Text style={styles.eventNote}>{event.note}</Text>}
                <Text style={styles.eventTime}>{new Date(event.created_at).toLocaleString()}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={styles.actions}>
        {/* ── Meetup CTA (for both buyer and seller) ── */}
        {order.delivery_method === 'meetup' && ['paid', 'completed'].includes(order.status) && (
          <TouchableOpacity
            style={styles.meetupBtn}
            onPress={() => navigation.navigate('Meetup', { orderId })}
            accessibilityLabel="go to meetup"
            accessibilityRole="button"
          >
            <MaterialCommunityIcons name="map-marker-radius" size={18} color={COLORS.white} />
            <Text style={styles.meetupBtnText}>Go to Meetup</Text>
          </TouchableOpacity>
        )}

        {/* ── Seller actions ── */}
        {isSellerOfOrder && order.status === 'paid' && (
          <TouchableOpacity style={styles.advanceBtn} onPress={() => handleAdvanceStatus('processing')} disabled={actionLoading} accessibilityLabel="mark processing" accessibilityRole="button">
            {actionLoading ? <ActivityIndicator size="small" color={COLORS.white} /> : (
              <Text style={styles.advanceBtnText}>{t('orderDetail.processing')}</Text>
            )}
          </TouchableOpacity>
        )}
        {isSellerOfOrder && order.status === 'processing' && (
          <TouchableOpacity style={styles.advanceBtn} onPress={() => handleAdvanceStatus('shipped')} disabled={actionLoading} accessibilityLabel="mark shipped" accessibilityRole="button">
            {actionLoading ? <ActivityIndicator size="small" color={COLORS.white} /> : (
              <Text style={styles.advanceBtnText}>{t('orderDetail.shipped')}</Text>
            )}
          </TouchableOpacity>
        )}
        {isSellerOfOrder && order.status === 'shipped' && (
          <TouchableOpacity style={styles.advanceBtn} onPress={() => handleAdvanceStatus('delivered')} disabled={actionLoading} accessibilityLabel="mark delivered" accessibilityRole="button">
            {actionLoading ? <ActivityIndicator size="small" color={COLORS.white} /> : (
              <Text style={styles.advanceBtnText}>{t('orderDetail.markDelivered')}</Text>
            )}
          </TouchableOpacity>
        )}

        {/* ── Buyer actions ── */}
        {store.user?.id === order.buyer_id && order.status === 'pending' && (
          <>
            <TouchableOpacity style={styles.retryBtn} onPress={handleRetryPayment} disabled={actionLoading} accessibilityLabel="retry payment" accessibilityRole="button">
              {actionLoading ? <ActivityIndicator size="small" color={COLORS.white} /> : (
                <Text style={styles.retryBtnText}>{t('orderDetail.retryPayment')}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} disabled={actionLoading} accessibilityLabel="cancel order" accessibilityRole="button">
              <Text style={styles.cancelBtnText}>{t('orderDetail.cancelOrder')}</Text>
            </TouchableOpacity>
          </>
        )}
        {store.user?.id === order.buyer_id && order.status === 'delivered' && (
          <TouchableOpacity style={styles.completeBtn} onPress={handleComplete} disabled={actionLoading} accessibilityLabel="confirm received" accessibilityRole="button">
            {actionLoading ? <ActivityIndicator size="small" color={COLORS.white} /> : (
              <Text style={styles.completeBtnText}>{t('orderDetail.completed')}</Text>
            )}
          </TouchableOpacity>
        )}
        {order.status === 'completed' && store.user?.id === order.buyer_id && (
          <TouchableOpacity style={styles.reviewBtn} onPress={() => setReviewModalVisible(true)} accessibilityLabel="review order" accessibilityRole="button">
            <MaterialCommunityIcons name="star-outline" size={16} color={COLORS.yellow} />
            <Text style={styles.reviewBtnText}>{t('orderDetail.reviewOrder')}</Text>
          </TouchableOpacity>
        )}
        {(order.status === 'completed' || order.status === 'delivered') && (
          <TouchableOpacity style={styles.reorderBtn} onPress={handleReorder} disabled={actionLoading} accessibilityLabel="reorder" accessibilityRole="button">
            <MaterialCommunityIcons name="replay" size={16} color={COLORS.coral} />
            <Text style={styles.reorderBtnText}>{t('orderDetail.reorder')}</Text>
          </TouchableOpacity>
        )}
        {['delivered', 'shipped', 'completed'].includes(order.status) && store.user?.id === order.buyer_id && (
          <TouchableOpacity style={styles.disputeBtn} onPress={() => setDisputeModalVisible(true)} accessibilityLabel="open dispute" accessibilityRole="button">
            <MaterialCommunityIcons name="flag-outline" size={16} color={COLORS.text2} />
            <Text style={styles.disputeBtnText}>{t('orderDetail.openDispute')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Review Modal ── */}
      <Modal visible={reviewModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('orderDetail.reviewOrder')}</Text>
              <TouchableOpacity onPress={() => setReviewModalVisible(false)} accessibilityLabel="close review modal" accessibilityRole="button">
                <MaterialCommunityIcons name="close" size={20} color={COLORS.text2} />
              </TouchableOpacity>
            </View>

            <View style={styles.starsPicker}>
              {[1, 2, 3, 4, 5].map(star => (
                <TouchableOpacity key={star} onPress={() => setReviewRating(star)} accessibilityLabel={`rate ${star} star${star > 1 ? 's' : ''}`} accessibilityRole="button">
                  <MaterialCommunityIcons
                    name={star <= reviewRating ? 'star' : 'star-outline'}
                    size={36}
                    color={star <= reviewRating ? COLORS.yellow : COLORS.surface2}
                  />
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.reviewInput}
              placeholder="Tell others about your experience (optional)"
              placeholderTextColor={COLORS.text2}
              value={reviewComment}
              onChangeText={setReviewComment}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              accessibilityLabel="review comment"
             
            />

            <TouchableOpacity
              style={[styles.submitReviewBtn, reviewSubmitting && { opacity: 0.5 }]}
              onPress={handleSubmitReview}
              disabled={reviewSubmitting}
              accessibilityLabel="submit review"
              accessibilityRole="button"
            >
              {reviewSubmitting ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Text style={styles.submitReviewBtnText}>{t('orderDetail.submit')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Dispute Modal ── */}
      <Modal visible={disputeModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('orderDetail.openDispute')}</Text>
              <TouchableOpacity onPress={() => setDisputeModalVisible(false)} accessibilityLabel="close dispute modal" accessibilityRole="button">
                <MaterialCommunityIcons name="close" size={20} color={COLORS.text2} />
              </TouchableOpacity>
            </View>

            <Text style={styles.disputeLabel}>{t('orderDetail.disputeReason')}</Text>
            {[
              { key: 'item_not_received', label: 'Item not received' },
              { key: 'item_not_as_described', label: 'Item not as described' },
              { key: 'damaged', label: 'Item arrived damaged' },
              { key: 'wrong_item', label: 'Wrong item received' },
              { key: 'other', label: 'Other' },
            ].map(reason => (
              <TouchableOpacity
                key={reason.key}
                style={[styles.disputeReasonBtn, disputeReason === reason.key && styles.disputeReasonActive]}
                onPress={() => setDisputeReason(reason.key)}
                accessibilityLabel={reason.label}
                accessibilityRole="button"
              >
                <MaterialCommunityIcons
                  name={disputeReason === reason.key ? 'radiobox-marked' : 'radiobox-blank'}
                  size={18}
                  color={disputeReason === reason.key ? COLORS.coral : COLORS.text2}
                />
                <Text style={[styles.disputeReasonText, disputeReason === reason.key && styles.disputeReasonTextActive]}>
                  {reason.label}
                </Text>
              </TouchableOpacity>
            ))}

            <TextInput
              style={[styles.reviewInput, { marginTop: 12 }]}
              placeholder="Describe the issue (optional)"
              placeholderTextColor={COLORS.text2}
              value={disputeDescription}
              onChangeText={setDisputeDescription}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              accessibilityLabel="dispute description"
             
            />

            <TouchableOpacity
              style={[styles.submitReviewBtn, { backgroundColor: COLORS.coral }, disputeSubmitting && { opacity: 0.5 }]}
              onPress={handleSubmitDispute}
              disabled={disputeSubmitting}
              accessibilityLabel="submit dispute"
              accessibilityRole="button"
            >
              {disputeSubmitting ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Text style={[styles.submitReviewBtnText, { color: COLORS.white }]}>{t('orderDetail.submitDispute')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loading: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingBottom: 60 },

  card: {
    marginHorizontal: SPACING.lg, marginBottom: 12, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.media, padding: 14,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  label: { fontSize: 13, color: COLORS.text2 },
  value: { fontSize: 13, color: COLORS.text },
  sectionTitle: { fontFamily: 'Syne', fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  meetupText: { fontSize: 13, color: COLORS.text, marginBottom: 4 },
  meetupNote: { fontSize: 12, color: COLORS.text2, marginBottom: 4 },
  meetupConfirm: { fontSize: 12, fontWeight: '600' },
  eventItem: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  eventDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.coral, marginTop: 5 },
  eventInfo: { flex: 1 },
  eventType: { fontSize: 13, fontWeight: '600', color: COLORS.text, textTransform: 'capitalize' },
  eventNote: { fontSize: 12, color: COLORS.text2, marginTop: 2 },
  eventTime: { fontSize: 11, color: COLORS.text2, marginTop: 2 },
  actions: { marginHorizontal: SPACING.lg, gap: 8 },
  cancelBtn: { padding: 14, borderRadius: RADIUS.pill, borderWidth: 1.5, borderColor: COLORS.coral, alignItems: 'center' },
  cancelBtnText: { color: COLORS.coral, fontWeight: '600', fontSize: 15 },
  completeBtn: { padding: 14, borderRadius: RADIUS.pill, backgroundColor: COLORS.green, alignItems: 'center' },
  completeBtnText: { color: COLORS.white, fontWeight: '600', fontSize: 15 },
  retryBtn: { padding: 14, borderRadius: RADIUS.pill, backgroundColor: COLORS.blue, alignItems: 'center' },
  retryBtnText: { color: COLORS.white, fontWeight: '600', fontSize: 15 },
  reorderBtn: { flexDirection: 'row', justifyContent: 'center', gap: 6, padding: 14, borderRadius: RADIUS.pill, borderWidth: 1.5, borderColor: COLORS.coral, alignItems: 'center' },
  reorderBtnText: { color: COLORS.coral, fontWeight: '600', fontSize: 15 },
  reviewBtn: {
    flexDirection: 'row', justifyContent: 'center', gap: 6, padding: 14, borderRadius: RADIUS.pill,
    borderWidth: 1.5, borderColor: COLORS.yellow, alignItems: 'center',
  },
  reviewBtnText: { color: COLORS.yellow, fontWeight: '600', fontSize: 15 },
  advanceBtn: { padding: 14, borderRadius: RADIUS.pill, backgroundColor: COLORS.blue, alignItems: 'center' },
  advanceBtnText: { color: COLORS.white, fontWeight: '600', fontSize: 15 },
  meetupBtn: {
    flexDirection: 'row', justifyContent: 'center', gap: 8, padding: 16, borderRadius: RADIUS.pill,
    backgroundColor: COLORS.green, alignItems: 'center',
  },
  meetupBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },

  /* Review modal */
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.pill, borderTopRightRadius: RADIUS.pill,
    padding: SPACING.lg, paddingBottom: SPACING.xxl + 20,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  modalTitle: { fontFamily: 'Syne', fontSize: 18, fontWeight: '800', color: COLORS.text },
  starsPicker: {
    flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: SPACING.lg,
  },
  reviewInput: {
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.card, padding: 12, fontSize: 14, color: COLORS.text,
    minHeight: 100, marginBottom: SPACING.lg,
  },
  submitReviewBtn: {
    padding: 14, borderRadius: RADIUS.pill, backgroundColor: COLORS.yellow, alignItems: 'center',
  },
  submitReviewBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  disputeBtn: {
    flexDirection: 'row', justifyContent: 'center', gap: 6, padding: 12, borderRadius: RADIUS.card,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center',
  },
  disputeBtnText: { color: COLORS.text2, fontWeight: '600', fontSize: 13 },
  disputeLabel: { fontSize: 12, fontWeight: '700', color: COLORS.text2, marginBottom: 8 },
  disputeReasonBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10,
    paddingHorizontal: 4, borderRadius: RADIUS.row,
  },
  disputeReasonActive: { backgroundColor: COLORS.surface2 },
  disputeReasonText: { fontSize: 14, color: COLORS.text2 },
  disputeReasonTextActive: { color: COLORS.text, fontWeight: '600' },
});
