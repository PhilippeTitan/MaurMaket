import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Linking,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import { Icon } from '../components/icons/Icon';
import { COLORS, SPACING, RADIUS, formatPrice } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import ConfirmModal from '../components/ConfirmModal';
import NativeMap from '../components/NativeMap';
import { getOrder, getOrderTimeline, cancelOrder, sellerCancelOrder, requestOrderCancellation, respondToCancellationRequest, withdrawCancellationRequest, completeOrder, retryPayment, reorder, createReview, editReview, deleteReview, createDispute, updateOrderStatus, confirmMeetup, proposeMeetup, getImageUrl, confirmNatCashSeller, confirmNatCashReceived, reportNatCashNotReceived } from '../api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { store } from '../store';
import { useTranslation } from '@/localization';
import { useToast } from '../components/Toast';
import { SkeletonBlock } from '../components/Skeleton';
import LocationPicker from '../components/LocationPicker';
import { useUser } from '../hooks';
// Shared with the sign-out sweep (APP-Q403): an unfinished payment reference must
// not outlive the account that started it.
import { PENDING_PAYMENT_KEY } from '../utils/signOutPolicy';

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

const STATUS_STEPS = ['pending', 'paid', 'shipped', 'delivered', 'completed'];

function getStatusLabel(status: string, t: (k: string) => string): string {
  switch (status) {
    case 'pending': return t('notif.status.pending');
    case 'paid': return t('notif.status.paid');
    case 'processing': return t('notif.status.processing');
    case 'shipped': return t('notif.status.shipped');
    case 'delivered': return t('notif.status.delivered');
    case 'completed': return t('notif.status.completed');
    case 'cancelled': return t('notif.status.cancelled');
    default: return status;
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'pending': return 'clock-outline';
    case 'paid': return 'check-circle-outline';
    case 'processing': return 'cog-outline';
    case 'shipped': return 'truck-delivery-outline';
    case 'delivered': return 'map-marker-check';
    case 'completed': return 'check-all';
    case 'cancelled': return 'close-circle-outline';
    default: return 'circle-outline';
  }
}

function getCancellationReasonLabel(reason: string, t: (key: string) => string): string {
  switch (reason) {
    case 'changed_mind': return t('orderDetail.cancellationReason.changed_mind');
    case 'timing': return t('orderDetail.cancellationReason.timing');
    case 'seller_unavailable': return t('orderDetail.cancellationReason.seller_unavailable');
    case 'item_issue': return t('orderDetail.cancellationReason.item_issue');
    case 'other': return t('orderDetail.cancellationReason.other');
    default: return '';
  }
}

function getOrderEventLabel(eventType: string, t: (key: string) => string): string {
  const keyByType: Record<string, string> = {
    order_placed: 'orderDetail.eventOrderPlaced',
    status_change: 'orderDetail.eventStatusChange',
    payment_received: 'orderDetail.eventPaymentReceived',
    meetup_proposed: 'orderDetail.eventMeetupProposed',
    meetup_confirmed: 'orderDetail.eventMeetupConfirmed',
    meetup_arrived: 'orderDetail.eventMeetupArrived',
    meetup_extended: 'orderDetail.eventMeetupExtended',
    exchange_confirmed: 'orderDetail.eventExchangeConfirmed',
    cancellation_requested: 'orderDetail.eventCancellationRequested',
    cancellation_response: 'orderDetail.eventCancellationResponse',
  };
  const translationKey = keyByType[eventType];
  return translationKey ? t(translationKey) : eventType.replace(/_/g, ' ');
}

const errorMessage = (err: unknown, fallback = 'Failed') => err instanceof Error ? err.message : fallback;

export default function OrderDetailScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { user } = useUser();

  const { orderId } = route.params;
  const [order, setOrder] = useState<Order | null>(null);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewEditId, setReviewEditId] = useState<string | null>(null);
  const [showDeleteReviewModal, setShowDeleteReviewModal] = useState(false);
  const [disputeModalVisible, setDisputeModalVisible] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeDescription, setDisputeDescription] = useState('');
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [declineLoading, setDeclineLoading] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [buyerCancelScopeModalVisible, setBuyerCancelScopeModalVisible] = useState(false);
  const [buyerCancelSelection, setBuyerCancelSelection] = useState<{ scope: 'seller' | 'order'; sellerId?: string }>({ scope: 'order' });
  const [cancellationModalSellerId, setCancellationModalSellerId] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState('changed_mind');
  const [cancellationDetails, setCancellationDetails] = useState('');
  const [cancellationResponseConfirm, setCancellationResponseConfirm] = useState<{ requestId: string; decision: 'accept' | 'decline' } | null>(null);
  const [sellerCancellationModalVisible, setSellerCancellationModalVisible] = useState(false);
  const [sellerCancellationConfirmVisible, setSellerCancellationConfirmVisible] = useState(false);
  const [sellerCancellationReason, setSellerCancellationReason] = useState('seller_unavailable');
  const [sellerCancellationDetails, setSellerCancellationDetails] = useState('');
  const [showCounterMeetup, setShowCounterMeetup] = useState(false);
  const [counterMeetupLocation, setCounterMeetupLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);

  const fetchData = async () => {
    try {
      const [orderRes, timelineRes] = await Promise.all([
        getOrder(orderId) as Promise<{ order: Order }>,
        getOrderTimeline(orderId) as Promise<{ events: OrderEvent[] }>,
      ]);
      setOrder(orderRes.order);
      setEvents(timelineRes.events || []);
    } catch (err: unknown) {
      toast.error(t('common.error'), errorMessage(err, 'Order not found') || t('orderDetail.trackOrder'));
      navigation.goBack();
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [orderId]);

  const handleCancelConfirmed = async () => {
    try {
      const result = await cancelOrder(orderId, buyerCancelSelection) as { refundRequested?: boolean; partial?: boolean };
      setBuyerCancelSelection({ scope: 'order' });
      if (result.refundRequested) toast.success(t('meetup.refundRequestTitle'), t('meetup.refundRequestMsg'));
      fetchData();
    }
    catch (err: unknown) { toast.error(t('common.error'), errorMessage(err)); }
  };

  const handleCancel = () => {
    if (order?.seller_count && order.seller_count > 1 && order.status !== 'pending') {
      setBuyerCancelScopeModalVisible(true);
      return;
    }
    setBuyerCancelSelection({ scope: 'order' });
    setShowCancelModal(true);
  };

  const submitCancellationRequest = async () => {
    if (!cancellationModalSellerId || actionLoading) return;
    setActionLoading(true);
    try {
      await requestOrderCancellation(orderId, { sellerId: cancellationModalSellerId, reason: cancellationReason, details: cancellationDetails.trim() });
      setCancellationModalSellerId(null);
      setCancellationDetails('');
      toast.success(t('orderDetail.cancellationSentTitle'), t('orderDetail.cancellationSentBody'));
      await fetchData();
    } catch (err: unknown) { toast.error(t('common.error'), errorMessage(err)); }
    finally { setActionLoading(false); }
  };

  const answerCancellationRequest = async (requestId: string, decision: 'accept' | 'decline') => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await respondToCancellationRequest(orderId, requestId, decision);
      await fetchData();
      toast.success(t('orderDetail.cancellationUpdatedTitle'), t('orderDetail.cancellationSettlementNotice'));
    } catch (err: unknown) { toast.error(t('common.error'), errorMessage(err)); }
    finally { setActionLoading(false); }
  };

  const withdrawCancellation = async (requestId: string) => {
    if (actionLoading) return;
    setActionLoading(true);
    try { await withdrawCancellationRequest(orderId, requestId); await fetchData(); }
    catch (err: unknown) { toast.error(t('common.error'), errorMessage(err)); }
    finally { setActionLoading(false); }
  };

  const submitSellerCancellation = async () => {
    if (!order || actionLoading) return;
    setActionLoading(true);
    try {
      const result = await sellerCancelOrder(orderId, { reason: sellerCancellationReason, details: sellerCancellationDetails.trim() }) as { refundRequested?: boolean };
      setSellerCancellationModalVisible(false);
      setSellerCancellationConfirmVisible(false);
      setSellerCancellationDetails('');
      if (result.refundRequested) toast.success(t('meetup.refundRequestTitle'), t('meetup.refundRequestMsg'));
      else toast.success(t('orderDetail.sellerCancellationCompleteTitle'), t('orderDetail.sellerCancellationCompleteBody'));
      await fetchData();
    } catch (err: unknown) { toast.error(t('common.error'), errorMessage(err)); }
    finally { setActionLoading(false); }
  };

  const handleComplete = async () => {
    setActionLoading(true);
    try { await completeOrder(orderId); fetchData(); }
    catch (err: unknown) { toast.error(t('common.error'), errorMessage(err)); }
    setActionLoading(false);
  };

  const updateNatCash = async (action: 'claim' | 'received' | 'not_received', sellerId?: string) => {
    setActionLoading(true);
    try {
      if (action === 'claim' && sellerId) await confirmNatCashSeller(orderId, sellerId);
      else if (action === 'received') await confirmNatCashReceived(orderId);
      else if (action === 'not_received') await reportNatCashNotReceived(orderId);
      await fetchData();
    } catch (err: unknown) {
      toast.error(t('common.error'), errorMessage(err));
    } finally { setActionLoading(false); }
  };

  const handleRetryPayment = async () => {
    setActionLoading(true);
    try {
      const res = await retryPayment(orderId) as { paymentUrl?: string; retryMethod?: string; orderId?: string };
      if (res.retryMethod === 'natcash') {
        toast.info(t('natcash.handoffTitle'), t('natcash.retryHandoff'));
      } else if (res.paymentUrl) {
        // Store pending order ID so we can detect abandonment when user returns
        try {
          const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
          await AsyncStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify({ orderId, createdAt: Date.now() }));
        } catch {}
        await Linking.openURL(res.paymentUrl);
      }
    } catch (err: unknown) {
      toast.error(t('common.error'), errorMessage(err, 'Could not open payment'));
    }
    setActionLoading(false);
  };

  const handleReorder = async () => {
    setActionLoading(true);
    try {
      const res = await reorder(orderId);
      const items = (res as any)?.items || [];
      let addedCount = 0;
      for (const item of items) {
        const result = await store.addToCart({
          id: item.productId,
          name: item.name,
          price: item.price,
          stock: item.stock,
          image: item.images?.[0]?.url,
          sellerId: item.sellerId,
          sellerName: undefined,
          salePrice: undefined,
        } as any);
        if (result.added) addedCount++;
      }
      if (addedCount > 0) {
        toast.show({
          kind: 'success',
          title: t('orderDetail.added'),
          message: t('orderDetail.itemsAddedToCart', { count: addedCount }),
          actionLabel: t('cart.viewCart'),
          onAction: () => navigation.navigate('Cart' as any),
        });
      } else {
        toast.warning(t('orderDetail.unavailable'), t('orderDetail.itemsNoLongerAvailable'));
      }
    } catch (err: unknown) {
      toast.error(t('common.error'), errorMessage(err, 'Could not reorder'));
    }
    setActionLoading(false);
  };

  const openReviewEditor = (review: Order['my_review']) => {
    if (review) {
      setReviewEditId(review.id);
      setReviewRating(review.rating || 0);
      setReviewComment(review.comment || '');
    } else {
      setReviewEditId(null);
      setReviewRating(0);
      setReviewComment('');
    }
    setReviewModalVisible(true);
  };

  const closeReviewModal = () => {
    setReviewModalVisible(false);
    setReviewEditId(null);
    setReviewRating(0);
    setReviewComment('');
  };

  const handleSubmitReview = async () => {
    if (reviewRating === 0) {
      toast.warning(t('orderDetail.rating'), 'Please select a star rating.');
      return;
    }
    const editing = !!reviewEditId;
    setReviewSubmitting(true);
    try {
      if (reviewEditId) {
        await editReview(reviewEditId, reviewRating, reviewComment.trim());
      } else {
        await createReview(orderId, reviewRating, reviewComment.trim());
      }
      closeReviewModal();
      toast.success(t('orderDetail.thanks'), editing ? t('orderDetail.reviewUpdated') : t('orderDetail.reviewSubmitted'));
      fetchData();
    } catch (err: unknown) {
      toast.error(t('common.error'), errorMessage(err, 'Could not submit review'));
    }
    setReviewSubmitting(false);
  };

  const handleDeleteReview = async () => {
    if (!order?.my_review) return;
    setShowDeleteReviewModal(false);
    setActionLoading(true);
    try {
      await deleteReview(order.my_review.id);
      toast.success(t('orderDetail.reviewDeletedTitle'), t('orderDetail.reviewDeletedBody'));
      fetchData();
    } catch (err: unknown) {
      toast.error(t('common.error'), errorMessage(err, 'Could not delete review'));
    }
    setActionLoading(false);
  };

  const handleSubmitDispute = async () => {
    if (!disputeReason) {
      toast.warning(t('orderDetail.disputeReason'), 'Please select a reason for the dispute.');
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
      toast.success(t('orderDetail.reportSubmitted'), t('orderDetail.reportReviewMsg'));
      fetchData();
    } catch (err: unknown) {
      toast.error(t('common.error'), errorMessage(err, 'Could not submit report'));
    }
    setDisputeSubmitting(false);
  };

  const handleAdvanceStatus = async (nextStatus: string) => {
    setActionLoading(true);
    try {
      await updateOrderStatus(orderId, nextStatus);
      fetchData();
    } catch (err: unknown) {
      toast.error(t('common.error'), errorMessage(err, 'Could not update status'));
    }
    setActionLoading(false);
  };

  const handleAcceptMeetup = async () => {
    setConfirmLoading(true);
    try {
      await confirmMeetup(orderId);
      toast.success(t('orderDetail.confirmMeetup'), t('orderDetail.meetupConfirmed'));
      fetchData();
    } catch (err: unknown) {
      toast.error(t('common.error'), errorMessage(err, 'Could not confirm meetup'));
    }
    setConfirmLoading(false);
  };

  const handleCounterMeetup = async () => {
    if (!counterMeetupLocation) return;
    setDeclineLoading(true);
    try {
      await proposeMeetup(orderId, counterMeetupLocation.lat, counterMeetupLocation.lng, counterMeetupLocation.address, '');
      setShowCounterMeetup(false);
      setCounterMeetupLocation(null);
      toast.success(t('orderDetail.meetupSuggestionSent'), t('orderDetail.counterMeetupHint'));
      await fetchData();
    } catch (err: unknown) {
      toast.error(t('common.error'), errorMessage(err, 'Could not send meetup suggestion'));
    } finally {
      setDeclineLoading(false);
    }
  };

  const handleDeclineMeetup = () => {
    setShowCounterMeetup(true);
    setCounterMeetupLocation(null);
  };

  if (loading || !order) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.detailSkeletonHeader}><SkeletonBlock width={38} height={38} radius={19} /><SkeletonBlock width="38%" height={16} /></View>
        <View style={styles.detailSkeleton}>
          <SkeletonBlock height={126} radius={RADIUS.card} />
          <SkeletonBlock height={112} radius={RADIUS.card} />
          <SkeletonBlock height={76} radius={RADIUS.card} />
          <SkeletonBlock height={52} radius={RADIUS.button} />
        </View>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[order.status] || COLORS.text2;
  const currentStep = STATUS_STEPS.indexOf(order.status);
  const isCancelled = order.status === 'cancelled';
  const isHistory = ['completed', 'cancelled'].includes(order.status);

  const isSeller = store.isSeller;
  const isSellerOfOrder = isSeller && order.items?.some((item: any) => item.seller_id === store.user?.id);
  const isBuyerOfOrder = store.user?.id === order.buyer_id;
  const sellerFulfillments = order.seller_fulfillments || [];
  const ownSellerFulfillment = sellerFulfillments.find((f) => f.seller_id === store.user?.id);
  const sellerPortionCancelled = ownSellerFulfillment?.fulfillment_status === 'cancelled';
  const sellerCanCancelBeforeFulfillment = !!isSellerOfOrder && (order.status !== 'pending' || order.seller_count === 1) && !order.meetup_started && !!ownSellerFulfillment &&
    ownSellerFulfillment.fulfillment_status === 'pending' && (
      (order.status === 'pending' && order.seller_count === 1 && ownSellerFulfillment.payment_status === 'pending') ||
      (['paid', 'active', 'processing', 'shipped', 'delivered'].includes(order.status) && order.payment_method === 'moncash' && ownSellerFulfillment.fulfillment_method === 'delivery' && ownSellerFulfillment.payment_status === 'verified')
    );
  const sellerCancellationPaused = order.cancellation_requests?.some((r) => r.seller_id === store.user?.id && r.status === 'under_review') || false;

  const paidCancellationStatuses = ['paid', 'active', 'processing', 'shipped', 'delivered'];
  const cancellablePaidSellerIds = sellerFulfillments
    .filter((f) => f.fulfillment_method === 'delivery' && f.fulfillment_status === 'pending' && f.payment_status === 'verified' && order.escrow?.some((e) => e.seller_id === f.seller_id && e.escrow_status === 'held'))
    .map((f) => f.seller_id);
  const buyerCanCancelPaidOrder = paidCancellationStatuses.includes(order.status) && order.payment_method === 'moncash' &&
    order.seller_count === sellerFulfillments.length && sellerFulfillments.length > 0 &&
    sellerFulfillments.every((f) => f.fulfillment_method === 'delivery' && f.fulfillment_status === 'pending' && f.payment_status === 'verified') &&
    sellerFulfillments.every((f) => order.escrow?.some((e) => e.seller_id === f.seller_id && e.escrow_status === 'held'));
  const buyerCanCancelBeforeFulfillment = isBuyerOfOrder && (
    (order.status === 'pending' && sellerFulfillments.length === order.seller_count && sellerFulfillments.length > 0 && sellerFulfillments.every((f) => f.fulfillment_status === 'pending' && f.payment_status === 'pending')) ||
    (paidCancellationStatuses.includes(order.status) && order.payment_method === 'moncash' && cancellablePaidSellerIds.length > 0)
  );

  const subtotal = order.items?.reduce((sum: number, item: any) => sum + Number(item.price) * Number(item.quantity), 0) || Number(order.total_amount);

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t('orderDetail.title')}
        onBack={() => navigation.goBack()}
        variant="branded"
        bordered={false}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

      {/* ── Status Hero ── */}
      <View style={[styles.statusHero, { borderLeftColor: statusColor }]}>
        <View style={styles.statusHeroTop}>
          <View style={[styles.statusIconWrap, { backgroundColor: statusColor + '18' }]}>
            <MaterialCommunityIcons name={getStatusIcon(order.status) as any} size={22} color={statusColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusHeroLabel, { color: statusColor }]}>{getStatusLabel(order.status, t)}</Text>
            <Text style={styles.statusHeroDate}>
              {new Date(order.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
          </View>
          <Text style={styles.orderIdBadge}>#{order.id.slice(0, 8)}</Text>
        </View>

        {/* Progress stepper */}
        {!isCancelled && currentStep >= 0 && (
          <View
            style={styles.stepper}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t('orderDetail.status')}
            accessibilityValue={{ min: 0, max: STATUS_STEPS.length - 1, now: Math.max(0, currentStep), text: getStatusLabel(order.status, t) }}
          >
            {STATUS_STEPS.map((step, i) => {
              const isActive = i <= currentStep;
              const isCurrent = i === currentStep;
              return (
                <React.Fragment key={step}>
                  <View style={styles.stepCol}>
                    <View style={[
                      styles.stepDot,
                      isActive && { backgroundColor: statusColor },
                      isCurrent && styles.stepDotCurrent,
                      isCurrent && { borderColor: statusColor },
                    ]}>
                      {isCurrent && <View style={[styles.stepDotInner, { backgroundColor: statusColor }]} />}
                    </View>
                    <Text style={[styles.stepLabel, isActive && { color: statusColor }]} numberOfLines={1}>
                      {getStatusLabel(step, t)}
                    </Text>
                  </View>
                  {i < STATUS_STEPS.length - 1 && (
                    <View style={[styles.stepLine, i < currentStep && { backgroundColor: statusColor }]} />
                  )}
                </React.Fragment>
              );
            })}
          </View>
        )}
        {isCancelled && (
          <View style={styles.cancelledBanner}>
            <MaterialCommunityIcons name="close-circle-outline" size={16} color={COLORS.coral} />
            <Text style={styles.cancelledBannerText}>{t('orderDetail.orderCancelledBanner')}</Text>
          </View>
        )}
      </View>

      {/* ── Order Items ── */}
      {order.items && order.items.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('orderDetail.items')}</Text>
          {order.items?.map((item: any, idx: number) => {
            const img = item.image_url || item.product_image;
            const imgUrl = img ? getImageUrl(img) : null;
            return (
              <View key={item.id || idx} style={[styles.itemRow, idx < (order.items?.length || 0) - 1 && styles.itemRowBorder]}>
                {imgUrl ? (
                  <ExpoImage source={{ uri: imgUrl }} style={styles.itemImage} contentFit="cover" cachePolicy="memory-disk" accessibilityLabel={item.product_name || t('orderDetail.productN')} />
                ) : (
                  <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
                    <MaterialCommunityIcons name="package-variant" size={20} color={COLORS.text2} />
                  </View>
                )}
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName} numberOfLines={2}>{item.product_name || `${t('orderDetail.productN')} #${item.product_id?.slice(0, 8)}`}</Text>
                  <Text style={styles.itemQty}>x{item.quantity}</Text>
                </View>
                <Text style={styles.itemPrice}>{formatPrice(Number(item.price) * Number(item.quantity))} G</Text>
              </View>
            );
          })}
          {/* Total row */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t('orderDetail.total')}</Text>
            <Text style={styles.totalValue}>{formatPrice(Number(order.total_amount))} G</Text>
          </View>
          {/* Fee breakdown */}
          {(order as any).escrow && (() => {
            const escrows = Array.isArray((order as any).escrow) ? (order as any).escrow : [(order as any).escrow];
            const moncashFee = Math.round(Number(order.total_amount) * 0.079);
            return (
              <View style={styles.feeBreakdown}>
                {escrows.map((e: any, idx: number) => {
                  if (!e || !e.gross_amount) return null;
                  const rate = e.gross_amount > 0 ? Math.round((e.commission_amount / e.gross_amount) * 100) : 0;
                  const sellerReceives = Math.round(Number(e.net_amount));
                  return (
                    <View key={idx} style={{ marginBottom: idx < escrows.length - 1 ? 8 : 0 }}>
                      {escrows.length > 1 && (
                        <Text style={[styles.feeLabel, { fontWeight: '700', marginBottom: 4 }]}>{t('orderDetail.sellerN', { n: idx + 1 })}</Text>
                      )}
                      <View style={styles.feeRow}>
                        <Text style={styles.feeLabel}>{t('orderDetail.maurmaketFee', { rate })}</Text>
                        <Text style={styles.feeValue}>-{formatPrice(Math.round(Number(e.commission_amount)))} G</Text>
                      </View>
                      <View style={styles.feeRow}>
                        <Text style={styles.feeLabel}>{t('orderDetail.moncashFee')}</Text>
                        <Text style={styles.feeValue}>~-{formatPrice(moncashFee)} G</Text>
                      </View>
                      <View style={[styles.feeRow, { marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: COLORS.border }]}>
                        <Text style={[styles.feeLabel, { fontWeight: '700', color: COLORS.text }]}>{t('orderDetail.sellerReceives')}</Text>
                        <Text style={[styles.feeValue, { color: COLORS.green, fontWeight: '700' }]}>{formatPrice(sellerReceives)} G</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })()}
        </View>
      )}

      {(order as any).payment_method === 'natcash' && Array.isArray((order as any).seller_fulfillments) && (
        <View style={styles.card}>
          <View style={styles.infoHeader}>
            <View style={[styles.infoIconWrap, { backgroundColor: COLORS.purpleMuted }]}>
              <MaterialCommunityIcons name="cash-multiple" size={18} color={COLORS.purple} />
            </View>
            <Text style={styles.sectionTitle}>{t('natcash.handoffTitle')}</Text>
          </View>
          <Text style={styles.infoText}>{t('natcash.handoffDisclosure')}</Text>
          {(order as any).my_role === 'buyer' && (order as any).seller_fulfillments.filter((sf: any) => sf.payment_method === 'natcash' && sf.payment_status === 'pending').map((sf: any) => (
          <TouchableOpacity key={sf.id} disabled={actionLoading} onPress={() => updateNatCash('claim', sf.seller_id)} style={styles.natcashAction} accessibilityRole="button" accessibilityState={{ disabled: actionLoading, busy: actionLoading }}>
              <Text style={styles.natcashActionText}>{t('natcash.iSent')}</Text>
            </TouchableOpacity>
          ))}
          {(order as any).my_role === 'seller' && (() => {
            const own = (order as any).seller_fulfillments.find((sf: any) => sf.seller_id === user?.id && sf.payment_method === 'natcash');
            if (!own || own.payment_status !== 'buyer_claimed') return null;
            return <View style={styles.natcashButtons}>
              <TouchableOpacity disabled={actionLoading} onPress={() => updateNatCash('received')} style={styles.natcashAction} accessibilityRole="button" accessibilityState={{ disabled: actionLoading, busy: actionLoading }}>
                <Text style={styles.natcashActionText}>{t('natcash.iReceived')}</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={actionLoading} onPress={() => updateNatCash('not_received')} style={styles.natcashSecondary} accessibilityRole="button" accessibilityState={{ disabled: actionLoading, busy: actionLoading }}>
                <Text style={styles.natcashSecondaryText}>{t('natcash.notReceived')}</Text>
              </TouchableOpacity>
            </View>;
          })()}
        </View>
      )}

      {/* ── Seller Fulfillment Status (multi-seller) ── */}
      {(order as any).seller_fulfillments && (order as any).seller_fulfillments.length > 1 && (
        <View style={styles.card}>
          <View style={styles.infoHeader}>
            <View style={[styles.infoIconWrap, { backgroundColor: COLORS.coral + '18' }]}>
              <MaterialCommunityIcons name="account-group-outline" size={18} color={COLORS.coral} />
            </View>
            <Text style={styles.sectionTitle}>{t('orderDetail.sellerStatus')}</Text>
          </View>
          {(order as any).seller_fulfillments.map((sf: any) => (
            <View key={sf.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.text }}>{sf.seller_id.slice(0, 8)}…</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <View style={[styles.miniBadge, { backgroundColor: sf.payment_status === 'verified' ? COLORS.green + '20' : sf.payment_status === 'buyer_claimed' ? COLORS.yellow + '20' : COLORS.border }]}>
                    <Text style={[styles.miniBadgeText, { color: sf.payment_status === 'verified' ? COLORS.green : sf.payment_status === 'buyer_claimed' ? COLORS.yellow : COLORS.text2 }]}>
                      {sf.payment_status === 'verified' ? ((order as any).payment_method === 'natcash' ? t('natcash.sellerConfirmed') : t('notif.status.paid')) : sf.payment_status === 'buyer_claimed' ? t('natcash.buyerClaimed') : sf.payment_status}
                    </Text>
                  </View>
                  <View style={[styles.miniBadge, { backgroundColor: sf.fulfillment_status === 'completed' ? COLORS.green + '20' : COLORS.blue + '20' }]}>
                    <Text style={[styles.miniBadgeText, { color: sf.fulfillment_status === 'completed' ? COLORS.green : COLORS.blue }]}>
                      {sf.fulfillment_status}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ── Delivery Address ── */}
      {order.delivery_method === 'delivery' && order.delivery_name && (
        <View style={styles.card}>
          <View style={styles.infoHeader}>
            <View style={[styles.infoIconWrap, { backgroundColor: COLORS.blue + '18' }]}>
              <MaterialCommunityIcons name="truck-delivery-outline" size={18} color={COLORS.blue} />
            </View>
            <Text style={styles.sectionTitle}>{t('orderDetail.deliveryAddress')}</Text>
          </View>
          <Text style={styles.infoName}>{order.delivery_name}</Text>
          <Text style={styles.infoText}>{order.delivery_address}{order.delivery_city ? `, ${order.delivery_city}` : ''}</Text>
          {order.delivery_phone && <Text style={styles.infoMeta}>{t('orderDetail.phone')}: {order.delivery_phone}</Text>}
          {order.delivery_note && <Text style={styles.infoMeta}>{t('orderDetail.note')}: {order.delivery_note}</Text>}
        </View>
      )}

      {/* ── Meetup Info ── */}
      {order.meetup_address && (
        <View style={styles.card}>
          <View style={styles.infoHeader}>
            <View style={[styles.infoIconWrap, { backgroundColor: COLORS.coral + '18' }]}>
              <MaterialCommunityIcons name="map-marker-outline" size={18} color={COLORS.coral} />
            </View>
            <Text style={styles.sectionTitle}>{t('orderDetail.meetup')}</Text>
          </View>
          <Text style={styles.infoName}>{order.meetup_address}</Text>
          {order.meetup_note && <Text style={styles.infoMeta}>{t('orderDetail.note')}: {order.meetup_note}</Text>}

          {/* Status + Accept/Decline buttons */}
          {(isSellerOfOrder || isBuyerOfOrder) && !order.meetup_confirmed && order.meetup_proposed_by !== store.user?.id ? (
            <View style={styles.meetupActionWrap}>
              <View style={styles.meetupAlert}>
                <MaterialCommunityIcons name="alert-circle-outline" size={16} color={COLORS.yellow} />
                <Text style={[styles.meetupAlertText, { color: COLORS.yellow }]}>
                  {t('orderDetail.meetupLocationProposed')}
                </Text>
              </View>

              {/* Mini map preview */}
              {order.meetup_lat && order.meetup_lng && (
                <View style={styles.miniMapContainer}>
                  <NativeMap
                    style={styles.miniMap}
                    center={[order.meetup_lng, order.meetup_lat]}
                    zoom={15}
                    showUserLocation={false}
                    selectedLat={order.meetup_lat}
                    selectedLng={order.meetup_lng}
                  />
                </View>
              )}

              <View style={styles.meetupButtons}>
                <TouchableOpacity
                  style={[styles.meetupAcceptBtn]}
                  onPress={handleAcceptMeetup}
                  disabled={confirmLoading || declineLoading}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: confirmLoading || declineLoading, busy: confirmLoading }}
                >
                  {confirmLoading ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <Text style={styles.meetupAcceptBtnText}>{t('orderDetail.acceptMeetup')}</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.meetupSecondaryBtn}
                  onPress={handleDeclineMeetup}
                  disabled={confirmLoading || declineLoading}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: confirmLoading || declineLoading, busy: declineLoading }}
                >
                  {declineLoading ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <Text style={styles.meetupSecondaryBtnText}>{t('orderDetail.suggestAnotherPlace')}</Text>
                  )}
                </TouchableOpacity>
              </View>
              {showCounterMeetup && (
                <View style={styles.counterMeetupPanel}>
                  <Text style={styles.counterMeetupHint}>{t('orderDetail.counterMeetupHint')}</Text>
                  <LocationPicker
                    allowCurrentLocation={false}
                    initialLat={order.meetup_lat}
                    initialLng={order.meetup_lng}
                    onLocationSelect={(lat, lng, address) => setCounterMeetupLocation({ lat, lng, address })}
                    height={190}
                  />
                  {counterMeetupLocation && (
                    <Text style={styles.counterMeetupSelected} accessibilityLiveRegion="polite">
                      {t('orderDetail.meetupSuggestionSelected')}: {counterMeetupLocation.address}
                    </Text>
                  )}
                  <View style={styles.meetupButtons}>
                    <TouchableOpacity
                      style={[styles.meetupAcceptBtn, (!counterMeetupLocation || declineLoading) && { opacity: 0.55 }]}
                      onPress={handleCounterMeetup}
                      disabled={!counterMeetupLocation || declineLoading}
                      accessibilityRole="button"
                      accessibilityLabel={t('orderDetail.sendMeetupSuggestion')}
                    >
                      {declineLoading ? <ActivityIndicator size="small" color={COLORS.white} /> : (
                        <Text style={styles.meetupAcceptBtnText}>{t('orderDetail.sendMeetupSuggestion')}</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.meetupSecondaryBtn}
                      onPress={() => { setShowCounterMeetup(false); setCounterMeetupLocation(null); }}
                      disabled={declineLoading}
                      accessibilityRole="button"
                      accessibilityLabel={t('common.cancel')}
                    >
                      <Text style={styles.meetupSecondaryBtnText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.meetupStatusRow}>
              <MaterialCommunityIcons
                name={order.meetup_confirmed ? 'check-circle' : 'clock-outline'}
                size={16}
                color={order.meetup_confirmed ? COLORS.green : COLORS.yellow}
              />
              <Text style={[styles.meetupStatusText, { color: order.meetup_confirmed ? COLORS.green : COLORS.yellow }]}>
                {order.meetup_confirmed ? t('orderDetail.meetupConfirmed') : t('orderDetail.pending')}
              </Text>
            </View>
          )}
        </View>
      )}

      {!!order.cancellation_requests?.length && (
        <View style={styles.card}>
          <View style={styles.infoHeader}>
            <View style={[styles.infoIconWrap, { backgroundColor: COLORS.yellow + '18' }]}>
              <MaterialCommunityIcons name="clipboard-alert-outline" size={18} color={COLORS.yellow} />
            </View>
            <Text style={styles.sectionTitle}>{t('orderDetail.cancellationRequests')}</Text>
          </View>
          {order.cancellation_requests.map((request) => {
            const mine = request.raised_by === user?.id;
            const waiting = request.status === 'open';
            const accepted = request.resolution === 'seller_accepted_pending_settlement';
            const overdue = request.resolution === 'seller_response_overdue';
            const declined = request.resolution === 'seller_declined';
            const orderResumed = request.resolution === 'admin_reviewed_order_resumes';
            const portionCancelledRefundPending = request.resolution === 'admin_cancelled_before_shipment_refund_review';
            const requestUnderReview = request.status === 'under_review';
            let requestReason = '';
            let requestDetails = '';
            try {
              const parsed = JSON.parse(request.description || '{}');
              if (typeof parsed.reason === 'string') requestReason = parsed.reason;
              if (typeof parsed.details === 'string') requestDetails = parsed.details;
            } catch { /* Older request descriptions remain displayable as status only. */ }
            return (
              <View key={request.id} style={styles.cancellationRequest}>
                <Text style={styles.cancellationRequestTitle}>
                  {request.seller_name || t('orderDetail.seller')} · {waiting ? t('orderDetail.cancellationWaiting') : orderResumed ? t('orderDetail.cancellationOrderResumed') : portionCancelledRefundPending ? t('orderDetail.cancellationPortionCancelled') : accepted ? t('orderDetail.cancellationAccepted') : overdue ? t('orderDetail.cancellationUnresolved') : declined ? t('orderDetail.cancellationDeclined') : t('orderDetail.cancellationClosed')}
                </Text>
                <Text style={styles.cancellationRequestCopy}>{waiting ? t('orderDetail.cancellationAwaitingResponse') : orderResumed ? t('orderDetail.cancellationOrderResumedBody') : portionCancelledRefundPending ? t('orderDetail.cancellationRefundReviewPending') : overdue ? t('orderDetail.cancellationUnansweredBody') : t('orderDetail.cancellationSettlementNotice')}</Text>
                {!!requestReason && <Text style={styles.cancellationRequestCopy}>{getCancellationReasonLabel(requestReason, t)}{requestDetails ? ` · ${requestDetails}` : ''}</Text>}
                {waiting && request.response_deadline && <Text style={styles.cancellationRequestCopy}>{t('orderDetail.cancellationDeadline', { date: new Date(request.response_deadline).toLocaleString() })}</Text>}
                {isSellerOfOrder && request.seller_id === user?.id && waiting && (
                  <View style={styles.cancellationActions}>
                    <TouchableOpacity style={styles.cancellationAccept} onPress={() => setCancellationResponseConfirm({ requestId: request.id, decision: 'accept' })} disabled={actionLoading} accessibilityRole="button" accessibilityState={{ disabled: actionLoading, busy: actionLoading }}>
                      <Text style={styles.cancellationAcceptText}>{t('orderDetail.cancellationAccept')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.cancellationDecline} onPress={() => setCancellationResponseConfirm({ requestId: request.id, decision: 'decline' })} disabled={actionLoading} accessibilityRole="button" accessibilityState={{ disabled: actionLoading, busy: actionLoading }}>
                      <Text style={styles.cancellationDeclineText}>{t('orderDetail.cancellationDecline')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {isBuyerOfOrder && mine && waiting && (
                  <TouchableOpacity style={styles.cancellationDecline} onPress={() => withdrawCancellation(request.id)} disabled={actionLoading} accessibilityRole="button" accessibilityState={{ disabled: actionLoading, busy: actionLoading }}>
                    <Text style={styles.cancellationDeclineText}>{t('orderDetail.cancellationWithdraw')}</Text>
                  </TouchableOpacity>
                )}
                {isBuyerOfOrder && requestUnderReview && (accepted || overdue || declined) && <Text style={styles.cancellationUnavailable}>{t('orderDetail.supportNotConnected')}</Text>}
                {isSellerOfOrder && request.seller_id === user?.id && requestUnderReview && <Text style={styles.cancellationUnavailable}>{t('orderDetail.cancellationSellerReviewPending')}</Text>}
              </View>
            );
          })}
        </View>
      )}

      {/* ── Timeline ── */}
      {events.length > 0 && (
        <View style={styles.card}>
          <View style={styles.infoHeader}>
            <View style={[styles.infoIconWrap, { backgroundColor: COLORS.green + '18' }]}>
              <MaterialCommunityIcons name="timeline-text-outline" size={18} color={COLORS.green} />
            </View>
            <Text style={styles.sectionTitle}>{t('orderDetail.timeline')}</Text>
          </View>
          {events.map((event, idx) => (
            <View key={event.id} style={[styles.eventRow, idx < events.length - 1 && styles.eventRowBorder]}>
              <View style={styles.eventTimeline}>
                <View style={[styles.eventDot, { backgroundColor: idx === events.length - 1 ? statusColor : COLORS.text2 }]} />
                {idx < events.length - 1 && <View style={styles.eventLine} />}
              </View>
              <View style={styles.eventContent}>
                <Text style={styles.eventType}>{getOrderEventLabel(event.event_type, t)}</Text>
                <Text style={styles.eventActor}>{t('orderDetail.eventBy', { name: event.actor_name || t('orderDetail.system') })}</Text>
                {event.note && <Text style={styles.eventNote}>{event.note}</Text>}
                <Text style={styles.eventTime}>{new Date(event.created_at).toLocaleString()}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Bottom Action Bar ── */}
      <View style={[styles.bottomBar, { paddingBottom: SPACING.lg }]}>
        {/* One button per active seller portion: a multi-seller checkout can cancel one portion without touching the others (APP-Q340). */}
        {isBuyerOfOrder && order.delivery_method !== 'meetup' && order.seller_fulfillments?.filter((f) => ['processing', 'shipped', 'delivered'].includes(f.fulfillment_status)).map((f) => {
          const active = order.cancellation_requests?.some((request) => request.seller_id === f.seller_id && ['open', 'under_review'].includes(request.status));
          const seller = order.other_sellers?.find((candidate: any) => candidate.id === f.seller_id);
          if (active) return null;
          return (
            <TouchableOpacity key={f.seller_id} style={styles.cancellationRequestButton} onPress={() => { setCancellationModalSellerId(f.seller_id); setCancellationReason('changed_mind'); }} disabled={actionLoading} accessibilityRole="button" accessibilityState={{ disabled: actionLoading }}>
              <MaterialCommunityIcons name="cancel" size={17} color={COLORS.coral} />
              <Text style={styles.cancellationRequestButtonText}>{t('orderDetail.requestCancellation')}{order.seller_count && order.seller_count > 1 ? ` · ${seller?.full_name || t('orderDetail.seller')}` : ''}</Text>
            </TouchableOpacity>
          );
        })}
        {/* Meetup CTA (for both buyer and seller) */}
        {order.delivery_method === 'meetup' && order.status === 'paid' && (
          <TouchableOpacity
            style={styles.meetupCtaBtn}
            onPress={() => navigation.navigate('Meetup', { orderId })}
            accessibilityRole="button"
          >
            <MaterialCommunityIcons name="map-marker-radius" size={18} color={COLORS.white} />
            <Text style={styles.meetupCtaBtnText}>{t('orderDetail.goToMeetup')}</Text>
          </TouchableOpacity>
        )}

        {/* Seller actions */}
        {sellerCanCancelBeforeFulfillment && (
          <TouchableOpacity
            style={styles.cancellationRequestButton}
            onPress={() => { setSellerCancellationReason('seller_unavailable'); setSellerCancellationDetails(''); setSellerCancellationModalVisible(true); }}
            disabled={actionLoading}
            accessibilityRole="button"
            accessibilityState={{ disabled: actionLoading }}
          >
            <MaterialCommunityIcons name="cancel" size={17} color={COLORS.coral} />
            <Text style={styles.cancellationRequestButtonText}>{t('orderDetail.sellerCancelButton')}</Text>
          </TouchableOpacity>
        )}
        {isSellerOfOrder && sellerPortionCancelled && <Text style={styles.cancellationUnavailable}>{t('orderDetail.sellerPortionCancelledNotice')}</Text>}
        {isSellerOfOrder && !sellerPortionCancelled && sellerCancellationPaused && <Text style={styles.cancellationUnavailable}>{t('orderDetail.cancellationSellerPaused')}</Text>}
        {isSellerOfOrder && !sellerPortionCancelled && !sellerCancellationPaused && order.status === 'paid' && (
          <TouchableOpacity style={styles.primaryBtn} onPress={() => handleAdvanceStatus('processing')} disabled={actionLoading} accessibilityRole="button" accessibilityState={{ disabled: actionLoading, busy: actionLoading }}>
            {actionLoading ? <ActivityIndicator size="small" color={COLORS.white} /> : (
              <>
                <MaterialCommunityIcons name="cog-outline" size={18} color={COLORS.white} />
                <Text style={styles.primaryBtnText}>{t('orderDetail.processing')}</Text>
              </>
            )}
          </TouchableOpacity>
        )}
        {isSellerOfOrder && !sellerPortionCancelled && !sellerCancellationPaused && order.status === 'processing' && (
          <TouchableOpacity style={styles.primaryBtn} onPress={() => handleAdvanceStatus('shipped')} disabled={actionLoading} accessibilityRole="button" accessibilityState={{ disabled: actionLoading, busy: actionLoading }}>
            {actionLoading ? <ActivityIndicator size="small" color={COLORS.white} /> : (
              <>
                <MaterialCommunityIcons name="truck-delivery-outline" size={18} color={COLORS.white} />
                <Text style={styles.primaryBtnText}>{t('orderDetail.shipped')}</Text>
              </>
            )}
          </TouchableOpacity>
        )}
        {isSellerOfOrder && !sellerPortionCancelled && !sellerCancellationPaused && order.status === 'shipped' && (
          <TouchableOpacity style={styles.primaryBtn} onPress={() => handleAdvanceStatus('delivered')} disabled={actionLoading} accessibilityRole="button" accessibilityState={{ disabled: actionLoading, busy: actionLoading }}>
            {actionLoading ? <ActivityIndicator size="small" color={COLORS.white} /> : (
              <>
                <MaterialCommunityIcons name="map-marker-check" size={18} color={COLORS.white} />
                <Text style={styles.primaryBtnText}>{t('orderDetail.markDelivered')}</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Buyer: pending → pay */}
        {buyerCanCancelBeforeFulfillment && (
          <View style={styles.actionRow}>
            {order.status === 'pending' && <TouchableOpacity style={styles.primaryBtnFlex} onPress={handleRetryPayment} disabled={actionLoading} accessibilityRole="button" accessibilityState={{ disabled: actionLoading, busy: actionLoading }}>
              {actionLoading ? <ActivityIndicator size="small" color={COLORS.white} /> : <Text style={styles.primaryBtnText}>{t('orderDetail.retryPayment')}</Text>}
            </TouchableOpacity>}
            <TouchableOpacity style={styles.cancelBtnFlex} onPress={handleCancel} disabled={actionLoading} accessibilityRole="button" accessibilityState={{ disabled: actionLoading, busy: actionLoading }}>
              <Text style={styles.cancelBtnFlexText}>{t('orderDetail.cancelOrder')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Buyer: delivered → confirm/review */}
        {isBuyerOfOrder && order.status === 'delivered' && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.primaryBtnFlex} onPress={handleComplete} disabled={actionLoading} accessibilityRole="button" accessibilityState={{ disabled: actionLoading, busy: actionLoading }}>
              {actionLoading ? <ActivityIndicator size="small" color={COLORS.white} /> : (
                <Text style={styles.primaryBtnText}>{t('orderDetail.completed')}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.disputeBtnFlex} onPress={() => setDisputeModalVisible(true)} accessibilityRole="button">
              <MaterialCommunityIcons name="flag-outline" size={14} color={COLORS.text2} />
              <Text style={styles.disputeBtnText}>{t('orderDetail.openDispute')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Buyer: completed → own review (edit/delete) or review prompt, plus reorder */}
        {order.status === 'completed' && isBuyerOfOrder && (
          <View>
            {order.my_review?.deleted_at ? (
              // One review per order: a deleted review keeps its slot, so no new
              // prompt is shown (submitting again would fail).
              <Text style={styles.myReviewMeta}>{t('orderDetail.reviewDeletedBody')}</Text>
            ) : order.my_review ? (
              <View style={styles.myReviewCard}>
                <View style={styles.myReviewHeader}>
                  <Text style={styles.myReviewTitle}>{t('orderDetail.yourReview')}</Text>
                  <View style={styles.myReviewStars}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <MaterialCommunityIcons
                        key={star}
                        name={star <= (order.my_review?.rating || 0) ? 'star' : 'star-outline'}
                        size={14}
                        color={COLORS.yellow}
                      />
                    ))}
                  </View>
                </View>
                {!!order.my_review.comment && (
                  <Text style={styles.myReviewComment}>{order.my_review.comment}</Text>
                )}
                {order.my_review.is_edited && (
                  <Text style={styles.myReviewMeta}>{t('orderDetail.reviewEdited')}</Text>
                )}
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.reviewBtnFlex} onPress={() => openReviewEditor(order.my_review)} accessibilityRole="button" accessibilityLabel={t('orderDetail.editReview')}>
                    <MaterialCommunityIcons name="pencil" size={16} color={COLORS.yellow} />
                    <Text style={styles.reviewBtnText}>{t('orderDetail.editReview')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.disputeBtnFlex} onPress={() => setShowDeleteReviewModal(true)} accessibilityRole="button" accessibilityLabel={t('orderDetail.deleteReview')}>
                    <MaterialCommunityIcons name="trash-can-outline" size={14} color={COLORS.text2} />
                    <Text style={styles.disputeBtnText}>{t('orderDetail.deleteReview')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.reviewBtnFlex} onPress={() => openReviewEditor(null)} accessibilityRole="button">
                  <MaterialCommunityIcons name="star-outline" size={16} color={COLORS.yellow} />
                  <Text style={styles.reviewBtnText}>{t('orderDetail.reviewOrder')}</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={[styles.actionRow, styles.reorderRowSpaced]}>
              <TouchableOpacity style={styles.reorderBtnFlex} onPress={handleReorder} disabled={actionLoading} accessibilityRole="button" accessibilityState={{ disabled: actionLoading, busy: actionLoading }}>
                <MaterialCommunityIcons name="replay" size={14} color={COLORS.coral} />
                <Text style={styles.reorderBtnText}>{t('orderDetail.reorder')}</Text>
              </TouchableOpacity>
            </View>
          </View>
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
              <Text style={styles.modalTitle} accessibilityRole="header">{reviewEditId ? t('orderDetail.editReview') : t('orderDetail.reviewOrder')}</Text>
              <TouchableOpacity style={styles.modalClose} onPress={closeReviewModal} accessibilityLabel={t('accessibility.close')} accessibilityRole="button">
                <Icon name="close" size={20} color={COLORS.text2} />
              </TouchableOpacity>
            </View>

            <View style={styles.starsPicker}>
              {[1, 2, 3, 4, 5].map(star => (
                <TouchableOpacity key={star} style={styles.ratingTarget} onPress={() => setReviewRating(star)} accessibilityLabel={t('orderDetail.rateStarsA11y', { count: star })} accessibilityRole="button" accessibilityState={{ selected: reviewRating === star }}>
                  <Icon
                    name={star <= reviewRating ? 'rating' : 'rate-this'}
                    size={36}
                    color={star <= reviewRating ? COLORS.yellow : COLORS.surface2}
                  />
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.reviewInput}
              placeholder={t('orderDetail.reviewPlaceholder')}
              placeholderTextColor={COLORS.text2}
              value={reviewComment}
              onChangeText={setReviewComment}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              accessibilityLabel={t('orderDetail.reviewCommentA11y')}
            />

            {/* Private feedback stays separate from the public review (Profile &
                Settings handoff): concerns for MaurMaket go through Help & Support. */}
            <Text style={styles.reviewPrivateNote}>{t('orderDetail.privateFeedbackNote')}</Text>
            <TouchableOpacity
              style={styles.reviewPrivateLink}
              onPress={() => {
                closeReviewModal();
                navigation.navigate('HelpSupport');
              }}
              accessibilityRole="button"
              accessibilityLabel={t('orderDetail.privateFeedbackAction')}
            >
              <MaterialCommunityIcons name="lifebuoy" size={14} color={COLORS.coral} />
              <Text style={styles.reviewPrivateLinkText}>{t('orderDetail.privateFeedbackAction')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: COLORS.yellow }, reviewSubmitting && { opacity: 0.5 }]}
              onPress={handleSubmitReview}
              disabled={reviewSubmitting}
              accessibilityLabel={t('orderDetail.submitReviewA11y')}
              accessibilityRole="button"
              accessibilityState={{ disabled: reviewSubmitting, busy: reviewSubmitting }}
            >
              {reviewSubmitting ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Text style={styles.submitBtnText}>{t('orderDetail.submit')}</Text>
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
              <Text style={styles.modalTitle} accessibilityRole="header">{t('orderDetail.openDispute')}</Text>
              <TouchableOpacity style={styles.modalClose} onPress={() => setDisputeModalVisible(false)} accessibilityLabel={t('accessibility.close')} accessibilityRole="button">
                <Icon name="close" size={20} color={COLORS.text2} />
              </TouchableOpacity>
            </View>

            <Text style={styles.disputeLabel}>{t('orderDetail.disputeReason')}</Text>
            {[
              { key: 'item_not_received', label: t('dispute.itemNotReceived') },
              { key: 'item_not_as_described', label: t('dispute.itemNotAsDescribed') },
              { key: 'damaged', label: t('dispute.itemArrivedDamaged') },
              { key: 'wrong_item', label: t('dispute.wrongItemReceived') },
              { key: 'other', label: t('dispute.other') },
            ].map(reason => (
              <TouchableOpacity
                key={reason.key}
                style={[styles.disputeReasonBtn, disputeReason === reason.key && styles.disputeReasonActive]}
                onPress={() => setDisputeReason(reason.key)}
                accessibilityLabel={reason.label}
                accessibilityRole="button"
                accessibilityState={{ selected: disputeReason === reason.key }}
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
              placeholder={t('orderDetail.disputeDescriptionOptional')}
              placeholderTextColor={COLORS.text2}
              value={disputeDescription}
              onChangeText={setDisputeDescription}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              accessibilityLabel={t('orderDetail.disputeDescriptionA11y')}
            />

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: COLORS.coral }, disputeSubmitting && { opacity: 0.5 }]}
              onPress={handleSubmitDispute}
              disabled={disputeSubmitting}
              accessibilityRole="button"
              accessibilityState={{ disabled: disputeSubmitting, busy: disputeSubmitting }}
            >
              {disputeSubmitting ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Text style={styles.submitBtnText}>{t('orderDetail.submitDispute')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmModal
        visible={showDeleteReviewModal}
        title={t('orderDetail.deleteReviewConfirmTitle')}
        message={t('orderDetail.deleteReviewConfirmBody')}
        confirmLabel={t('orderDetail.deleteReview')}
        cancelLabel={t('common.cancel')}
        kind="danger"
        onCancel={() => setShowDeleteReviewModal(false)}
        onConfirm={handleDeleteReview}
      />

      <ConfirmModal
        visible={showCancelModal}
        title={t('orderDetail.cancelOrder')}
        message={buyerCancelSelection.scope === 'seller' ? t('orderDetail.cancelPartialPaidConfirm') : (order?.status !== 'pending' ? t('orderDetail.cancelPaidBeforeFulfillmentConfirm') : t('orderDetail.cancelConfirm'))}
        confirmLabel={t('orderDetail.yesCancel')}
        cancelLabel={t('common.cancel')}
        kind="danger"
        onConfirm={() => {
          setShowCancelModal(false);
          handleCancelConfirmed();
        }}
        onCancel={() => setShowCancelModal(false)}
      />

      <Modal visible={buyerCancelScopeModalVisible} transparent animationType="slide" onRequestClose={() => setBuyerCancelScopeModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} accessibilityRole="header">{t('orderDetail.cancelScopeTitle')}</Text>
              <TouchableOpacity onPress={() => setBuyerCancelScopeModalVisible(false)} style={styles.modalClose} accessibilityRole="button" accessibilityLabel={t('orderDetail.close')}>
                <MaterialCommunityIcons name="close" size={22} color={COLORS.text2} />
              </TouchableOpacity>
            </View>
            <Text style={styles.cancellationRequestCopy}>{t('orderDetail.cancelScopeExplainer')}</Text>
            {cancellablePaidSellerIds.map((sellerId) => {
              const seller = order.other_sellers?.find((candidate) => candidate.id === sellerId);
              return (
                <TouchableOpacity key={sellerId} style={styles.cancellationReasonOption} onPress={() => { setBuyerCancelSelection({ scope: 'seller', sellerId }); setBuyerCancelScopeModalVisible(false); setShowCancelModal(true); }} accessibilityRole="button">
                  <Text style={styles.cancellationReasonText}>{t('orderDetail.cancelSellerPortion')} · {seller?.full_name || t('orderDetail.seller')}</Text>
                </TouchableOpacity>
              );
            })}
            {buyerCanCancelPaidOrder && (
              <TouchableOpacity style={styles.cancellationReasonOption} onPress={() => { setBuyerCancelSelection({ scope: 'order' }); setBuyerCancelScopeModalVisible(false); setShowCancelModal(true); }} accessibilityRole="button">
                <Text style={styles.cancellationReasonText}>{t('orderDetail.cancelWholeCheckout')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={sellerCancellationConfirmVisible}
        title={t('orderDetail.sellerCancelConfirmTitle')}
        message={order?.status === 'paid' ? t('orderDetail.sellerCancelPaidConfirmBody') : t('orderDetail.sellerCancelConfirmBody')}
        confirmLabel={t('orderDetail.yesCancel')}
        cancelLabel={t('common.cancel')}
        kind="danger"
        onCancel={() => setSellerCancellationConfirmVisible(false)}
        onConfirm={submitSellerCancellation}
      />

      <ConfirmModal
        visible={!!cancellationResponseConfirm}
        title={cancellationResponseConfirm?.decision === 'accept' ? t('orderDetail.cancellationAcceptConfirmTitle') : t('orderDetail.cancellationDeclineConfirmTitle')}
        message={cancellationResponseConfirm?.decision === 'accept' ? t('orderDetail.cancellationAcceptConfirmBody') : t('orderDetail.cancellationDeclineConfirmBody')}
        confirmLabel={cancellationResponseConfirm?.decision === 'accept' ? t('orderDetail.cancellationAccept') : t('orderDetail.cancellationDecline')}
        cancelLabel={t('common.cancel')}
        kind={cancellationResponseConfirm?.decision === 'accept' ? 'warning' : 'info'}
        onCancel={() => setCancellationResponseConfirm(null)}
        onConfirm={() => {
          const pending = cancellationResponseConfirm;
          setCancellationResponseConfirm(null);
          if (pending) void answerCancellationRequest(pending.requestId, pending.decision);
        }}
      />

      <Modal visible={!!cancellationModalSellerId} transparent animationType="slide" onRequestClose={() => setCancellationModalSellerId(null)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} accessibilityRole="header">{t('orderDetail.requestCancellation')}</Text>
              <TouchableOpacity onPress={() => setCancellationModalSellerId(null)} style={styles.modalClose} accessibilityRole="button" accessibilityLabel={t('orderDetail.close')}><MaterialCommunityIcons name="close" size={22} color={COLORS.text2} /></TouchableOpacity>
            </View>
            <Text style={styles.cancellationRequestCopy}>{t('orderDetail.cancellationRequestExplainer')}</Text>
            <View style={styles.cancellationReasonList}>
              {(['changed_mind', 'timing', 'seller_unavailable', 'item_issue', 'other'] as const).map((reason) => (
                <TouchableOpacity key={reason} style={[styles.cancellationReasonOption, cancellationReason === reason && styles.cancellationReasonSelected]} onPress={() => setCancellationReason(reason)} accessibilityRole="radio" accessibilityState={{ selected: cancellationReason === reason }}>
                  <Text style={[styles.cancellationReasonText, cancellationReason === reason && styles.cancellationReasonTextSelected]}>{getCancellationReasonLabel(reason, t)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.cancellationDetailsInput} value={cancellationDetails} onChangeText={setCancellationDetails} placeholder={t('orderDetail.cancellationDetails')} placeholderTextColor={COLORS.text3} maxLength={300} multiline accessibilityLabel={t('orderDetail.cancellationDetails')} />
            <Text style={styles.cancellationRequestCopy}>{t('orderDetail.cancellationNoStateChange')}</Text>
            <TouchableOpacity style={[styles.submitBtn, actionLoading && { opacity: 0.55 }]} onPress={submitCancellationRequest} disabled={actionLoading} accessibilityRole="button" accessibilityState={{ disabled: actionLoading, busy: actionLoading }}>
              {actionLoading ? <ActivityIndicator size="small" color={COLORS.white} /> : <Text style={styles.submitBtnText}>{t('orderDetail.cancellationSend')}</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={sellerCancellationModalVisible} transparent animationType="slide" onRequestClose={() => setSellerCancellationModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('orderDetail.sellerCancelTitle')}</Text>
              <TouchableOpacity onPress={() => setSellerCancellationModalVisible(false)} style={styles.modalClose} accessibilityRole="button" accessibilityLabel={t('orderDetail.close')}>
                <MaterialCommunityIcons name="close" size={22} color={COLORS.text2} />
              </TouchableOpacity>
            </View>
            <Text style={styles.cancellationRequestCopy}>{t('orderDetail.sellerCancelExplainer')}</Text>
            <View style={styles.cancellationReasonList}>
              {(['out_of_stock', 'seller_unavailable', 'delivery_issue', 'other'] as const).map((reason) => (
                <TouchableOpacity key={reason} style={[styles.cancellationReasonOption, sellerCancellationReason === reason && styles.cancellationReasonSelected]} onPress={() => setSellerCancellationReason(reason)} accessibilityRole="radio" accessibilityState={{ selected: sellerCancellationReason === reason }}>
                  <Text style={[styles.cancellationReasonText, sellerCancellationReason === reason && styles.cancellationReasonTextSelected]}>{t(`orderDetail.sellerCancelReason.${reason}`)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.cancellationDetailsInput} value={sellerCancellationDetails} onChangeText={setSellerCancellationDetails} placeholder={t('orderDetail.cancellationDetails')} placeholderTextColor={COLORS.text3} maxLength={300} multiline accessibilityLabel={t('orderDetail.cancellationDetails')} />
            <Text style={styles.cancellationRequestCopy}>{t('orderDetail.sellerCancelReasonNotice')}</Text>
            <TouchableOpacity style={[styles.submitBtn, actionLoading && { opacity: 0.55 }]} onPress={() => { setSellerCancellationModalVisible(false); setSellerCancellationConfirmVisible(true); }} disabled={actionLoading} accessibilityRole="button" accessibilityState={{ disabled: actionLoading }}>
              <Text style={styles.submitBtnText}>{t('orderDetail.sellerCancelReview')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loading: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' },
  detailSkeletonHeader: { height: 62, paddingHorizontal: SPACING.lg, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: COLORS.surface },
  detailSkeleton: { padding: SPACING.lg, gap: SPACING.md },
  scroll: { paddingBottom: 20 },

  /* ── Status Hero ── */
  statusHero: {
    marginHorizontal: SPACING.lg, marginBottom: 12,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.media, padding: 16,
    borderLeftWidth: 3,
  },
  statusHeroTop: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  statusIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  statusHeroLabel: {
    fontSize: 17, fontWeight: '700',
  },
  statusHeroDate: {
    fontSize: 12, color: COLORS.text2, marginTop: 1,
  },
  orderIdBadge: {
    fontSize: 12, color: COLORS.text2,
    backgroundColor: COLORS.surface2, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, overflow: 'hidden',
  },

  /* Stepper */
  stepper: {
    flexDirection: 'row', alignItems: 'flex-start', marginTop: 16, gap: 0,
  },
  stepCol: { alignItems: 'center', width: 52 },
  stepDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: COLORS.border, marginBottom: 4,
  },
  stepDotCurrent: {
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 2, borderColor: COLORS.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  stepDotInner: {
    width: 6, height: 6, borderRadius: 3,
  },
  stepLine: {
    flex: 1, height: 2, backgroundColor: COLORS.border,
    marginTop: 5, marginHorizontal: -2,
  },
  stepLabel: {
    fontSize: 9, color: COLORS.text2, fontWeight: '500', textAlign: 'center',
  },
  cancelledBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12,
    paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: COLORS.coral + '12', borderRadius: RADIUS.row,
  },
  cancelledBannerText: { fontSize: 13, fontWeight: '600', color: COLORS.coral },
  natcashButtons: { gap: 10 },
  natcashAction: { minHeight: 48, backgroundColor: COLORS.purple, borderRadius: RADIUS.button, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  natcashActionText: { color: COLORS.white, fontWeight: '700', fontSize: 14 },
  natcashSecondary: { minHeight: 44, borderWidth: 1, borderColor: COLORS.borderLight, borderRadius: RADIUS.button, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  natcashSecondaryText: { color: COLORS.text2, fontWeight: '600', fontSize: 14 },

  /* ── Card ── */
  card: {
    marginHorizontal: SPACING.lg, marginBottom: 12, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.media, padding: 16,
  },
  sectionTitle: {
    fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 12,
  },

  /* ── Items ── */
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10,
  },
  itemRowBorder: {
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  itemImage: {
    width: 48, height: 48, borderRadius: RADIUS.row, backgroundColor: COLORS.surface2,
  },
  itemImagePlaceholder: {
    alignItems: 'center', justifyContent: 'center',
  },
  itemInfo: { flex: 1, gap: 2 },
  itemName: { fontSize: 14, fontWeight: '600', color: COLORS.text, lineHeight: 19 },
  itemQty: { fontSize: 12, color: COLORS.text2 },
  itemPrice: { fontSize: 14, fontWeight: '700', color: COLORS.coral },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  totalLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  totalValue: { fontSize: 18, fontWeight: '800', color: COLORS.coral },
  feeBreakdown: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  miniBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill },
  miniBadgeText: { fontSize: 11, fontWeight: '700' },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  feeLabel: { fontSize: 12, color: COLORS.text2 },
  feeValue: { fontSize: 12, fontWeight: '600', color: COLORS.text2 },

  /* ── Info sections (delivery / meetup) ── */
  infoHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10,
  },
  infoIconWrap: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  infoName: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  infoText: { fontSize: 13, color: COLORS.text2, marginBottom: 4 },
  infoMeta: { fontSize: 12, color: COLORS.text2, marginBottom: 2 },

  /* Meetup action */
  meetupActionWrap: { marginTop: 8, gap: 8 },
  meetupAlert: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: COLORS.yellow + '12', borderRadius: RADIUS.row,
  },
  meetupAlertText: { fontSize: 13, fontWeight: '600', flex: 1 },
  miniMapContainer: {
    height: 120, borderRadius: RADIUS.card,
    overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border,
  },
  miniMap: { flex: 1 },
  meetupButtons: { flexDirection: 'row', gap: 8 },
  meetupAcceptBtn: {
    flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 6,
    minHeight: 48, paddingHorizontal: 12, borderRadius: RADIUS.pill, backgroundColor: COLORS.green, alignItems: 'center',
  },
  meetupAcceptBtnText: { color: COLORS.white, fontWeight: '600', fontSize: 14 },
  meetupSecondaryBtn: {
    flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 6,
    minHeight: 48, paddingHorizontal: 12, borderRadius: RADIUS.pill, backgroundColor: COLORS.surface2,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center',
  },
  meetupSecondaryBtnText: { color: COLORS.text, fontWeight: '600', fontSize: 14 },
  counterMeetupPanel: { gap: 10, marginTop: 4 },
  counterMeetupHint: { color: COLORS.text2, fontSize: 13, lineHeight: 19 },
  counterMeetupSelected: { color: COLORS.text, fontSize: 13, lineHeight: 18 },
  meetupStatusRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8,
  },
  meetupStatusText: { fontSize: 13, fontWeight: '600' },

  cancellationRequest: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12, marginTop: 8, gap: 8 },
  cancellationRequestTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  cancellationRequestCopy: { color: COLORS.text2, fontSize: 13, lineHeight: 19 },
  cancellationUnavailable: { color: COLORS.yellow, fontSize: 12, lineHeight: 17 },
  cancellationActions: { flexDirection: 'row', gap: 8 },
  cancellationAccept: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.pill, backgroundColor: COLORS.green },
  cancellationAcceptText: { color: COLORS.white, fontSize: 13, fontWeight: '700' },
  cancellationDecline: { minHeight: 44, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.pill, backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border, marginTop: 4 },
  cancellationDeclineText: { color: COLORS.text2, fontSize: 13, fontWeight: '600' },
  cancellationRequestButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.coral, marginBottom: 8, paddingHorizontal: 12 },
  cancellationRequestButtonText: { color: COLORS.coral, fontSize: 14, fontWeight: '700' },
  cancellationReasonList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  cancellationReasonOption: { minHeight: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface2 },
  cancellationReasonSelected: { borderColor: COLORS.coral, backgroundColor: COLORS.coral + '18' },
  cancellationReasonText: { color: COLORS.text2, fontSize: 13 },
  cancellationReasonTextSelected: { color: COLORS.coral, fontWeight: '700' },
  cancellationDetailsInput: { backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.card, padding: 12, fontSize: 14, color: COLORS.text, minHeight: 76, textAlignVertical: 'top' },

  /* ── Timeline ── */
  eventRow: {
    flexDirection: 'row', gap: 12,
  },
  eventRowBorder: {
    paddingBottom: 12, marginBottom: 0,
  },
  eventTimeline: { alignItems: 'center', width: 16 },
  eventDot: {
    width: 8, height: 8, borderRadius: 4, marginTop: 4,
  },
  eventLine: {
    width: 1, flex: 1, backgroundColor: COLORS.border, marginTop: 4,
  },
  eventContent: { flex: 1, paddingBottom: 12 },
  eventType: { fontSize: 13, fontWeight: '600', color: COLORS.text, textTransform: 'capitalize' },
  eventActor: { fontSize: 11, color: COLORS.text2, marginTop: 2 },
  eventNote: { fontSize: 12, color: COLORS.text2, marginTop: 2 },
  eventTime: { fontSize: 11, color: COLORS.text2, marginTop: 2 },

  /* ── Bottom Bar ── */
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.md,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 8,
  },
  primaryBtn: {
    flexDirection: 'row', justifyContent: 'center', gap: 8,
    padding: 14, borderRadius: RADIUS.pill, backgroundColor: COLORS.blue, alignItems: 'center',
  },
  primaryBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  meetupCtaBtn: {
    flexDirection: 'row', justifyContent: 'center', gap: 8,
    padding: 14, borderRadius: RADIUS.pill, backgroundColor: COLORS.green, alignItems: 'center',
  },
  meetupCtaBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  actionRow: { flexDirection: 'row', gap: 8 },
  reorderRowSpaced: { marginTop: 8 },
  myReviewCard: { backgroundColor: COLORS.surface2, borderRadius: RADIUS.row, padding: 12, marginBottom: 8 },
  myReviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  myReviewTitle: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  myReviewStars: { flexDirection: 'row', gap: 2 },
  myReviewComment: { fontSize: 14, color: COLORS.text2, lineHeight: 20, marginTop: 4, marginBottom: 8 },
  myReviewMeta: { fontSize: 12, color: COLORS.text3, marginBottom: 8 },
  primaryBtnFlex: {
    flex: 1, padding: 14, borderRadius: RADIUS.pill, backgroundColor: COLORS.green,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6,
  },
  cancelBtnFlex: {
    padding: 14, borderRadius: RADIUS.pill,
    borderWidth: 1.5, borderColor: COLORS.coral, alignItems: 'center', justifyContent: 'center',
    minWidth: 100,
  },
  cancelBtnFlexText: { color: COLORS.coral, fontWeight: '600', fontSize: 14 },
  disputeBtnFlex: {
    padding: 14, borderRadius: RADIUS.pill,
    borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 4, minWidth: 100,
  },
  disputeBtnText: { fontSize: 13, color: COLORS.text2, fontWeight: '500' },
  reviewBtnFlex: {
    flex: 1, padding: 14, borderRadius: RADIUS.pill,
    borderWidth: 1.5, borderColor: COLORS.yellow, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 6,
  },
  reviewBtnText: { color: COLORS.yellow, fontWeight: '600', fontSize: 14 },
  reorderBtnFlex: {
    padding: 14, borderRadius: RADIUS.pill,
    borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 4, minWidth: 80,
  },
  reorderBtnText: { fontSize: 13, color: COLORS.text2, fontWeight: '500' },

  /* ── Modals ── */
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
  modalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  starsPicker: {
    flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: SPACING.lg,
  },
  ratingTarget: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  modalClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  reviewPrivateNote: { fontSize: 12, color: COLORS.text3, marginTop: 10, lineHeight: 16 },
  reviewPrivateLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, minHeight: 44 },
  reviewPrivateLinkText: { fontSize: 13, color: COLORS.coral, fontWeight: '600' },
  reviewInput: {
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.card, padding: 12, fontSize: 14, color: COLORS.text,
    minHeight: 100, marginBottom: SPACING.lg,
  },
  submitBtn: {
    minHeight: 48, padding: 14, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center',
  },
  submitBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  disputeLabel: { fontSize: 12, fontWeight: '700', color: COLORS.text2, marginBottom: 8 },
  disputeReasonBtn: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10,
    paddingHorizontal: 4, borderRadius: RADIUS.row,
  },
  disputeReasonActive: { backgroundColor: COLORS.surface2 },
  disputeReasonText: { fontSize: 14, color: COLORS.text2 },
  disputeReasonTextActive: { color: COLORS.text, fontWeight: '600' },
});
