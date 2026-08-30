import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Linking,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { WebView } from 'react-native-webview';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Icon } from '../components/icons/Icon';
import { COLORS, SPACING, RADIUS, formatPrice } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import ConfirmModal from '../components/ConfirmModal';
import { getOrder, getOrderTimeline, cancelOrder, completeOrder, retryPayment, reorder, createReview, createDispute, updateOrderStatus, confirmMeetup, getImageUrl } from '../api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LEAFLET_CSS, LEAFLET_JS } from '../lib/leaflet-bundle';
import { store } from '../store';
import { useTranslation } from '../i18n';
import { useToast } from '../components/Toast';
import { SkeletonBlock } from '../components/Skeleton';

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

function getStatusLabel(status: string): string {
  switch (status) {
    case 'pending': return 'To Pay';
    case 'paid': return 'Paid';
    case 'processing': return 'Processing';
    case 'shipped': return 'Shipped';
    case 'delivered': return 'Delivered';
    case 'completed': return 'Completed';
    case 'cancelled': return 'Cancelled';
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

const errorMessage = (err: unknown, fallback = 'Failed') => err instanceof Error ? err.message : fallback;

function buildMiniMapHtml(lat: number, lng: number): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<style>${LEAFLET_CSS}</style>
<script>${LEAFLET_JS}</script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#map{width:100%;height:100%;background:#0D1117;overflow:hidden}
.leaflet-control-zoom{display:none}
.leaflet-control-attribution{display:none!important}
.meetup-pin{width:24px;height:24px;border-radius:50%;background:#FF6B6B;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3)}
</style>
</head>
<body>
<div id="map"></div>
<script>
var map = L.map("map",{zoomControl:false,attributionControl:false}).setView([${lat},${lng}],15);
L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",{maxZoom:20,subdomains:"abcd"}).addTo(map);
var icon = L.divIcon({className:'',iconSize:[24,24],iconAnchor:[12,12],html:'<div class="meetup-pin"></div>'});
L.marker([${lat},${lng}],{icon:icon}).addTo(map);
setTimeout(function(){map.invalidateSize()},200);
</script>
</body>
</html>`;
}

export default function OrderDetailScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const insets = useSafeAreaInsets();

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
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [declineLoading, setDeclineLoading] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);

  const fetchData = async () => {
    try {
      const [orderRes, timelineRes] = await Promise.all([
        getOrder(orderId) as Promise<{ order: Order }>,
        getOrderTimeline(orderId) as Promise<{ events: OrderEvent[] }>,
      ]);
      setOrder(orderRes.order);
      setEvents(timelineRes.events || []);
    } catch (err: unknown) {
      toast.error(t('common.error'), errorMessage(err, 'Order not found'));
      navigation.goBack();
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [orderId]);

  const handleCancelConfirmed = async () => {
    try { await cancelOrder(orderId); fetchData(); }
    catch (err: unknown) { toast.error(t('common.error'), errorMessage(err)); }
  };

  const handleCancel = () => {
    setShowCancelModal(true);
  };

  const handleComplete = async () => {
    setActionLoading(true);
    try { await completeOrder(orderId); fetchData(); }
    catch (err: unknown) { toast.error(t('common.error'), errorMessage(err)); }
    setActionLoading(false);
  };

  const handleRetryPayment = async () => {
    setActionLoading(true);
    try {
      const res = await retryPayment(orderId) as { paymentUrl?: string; retryMethod?: string; orderId?: string };
      if (res.retryMethod === 'natcash') {
        // NatCash order — go back to NatCash payment screen
        navigation.navigate('NatCashPayment', { orderId: res.orderId || orderId, total: Number((order as any)?.total_amount || 0), sellerName: (order as any)?.other_party?.full_name || '', sellerPhone: (order as any)?.other_party?.natcash_phone || (order as any)?.other_party?.phone || '' });
      } else if (res.paymentUrl) {
        // Store pending order ID so we can detect abandonment when user returns
        try {
          const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
          await AsyncStorage.setItem('mm_pending_payment', JSON.stringify({ orderId, createdAt: Date.now() }));
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
          title: 'Added',
          message: `${addedCount} item${addedCount > 1 ? 's' : ''} added to your cart.`,
          actionLabel: 'View Cart',
          onAction: () => navigation.navigate('Cart' as any),
        });
      } else {
        toast.warning('Unavailable', 'Items from this order are no longer available.');
      }
    } catch (err: unknown) {
      toast.error(t('common.error'), errorMessage(err, 'Could not reorder'));
    }
    setActionLoading(false);
  };

  const handleSubmitReview = async () => {
    if (reviewRating === 0) {
      toast.warning(t('orderDetail.rating'), 'Please select a star rating.');
      return;
    }
    setReviewSubmitting(true);
    try {
      await createReview(orderId, reviewRating, reviewComment.trim());
      setReviewModalVisible(false);
      setReviewRating(0);
      setReviewComment('');
      toast.success('Thanks!', t('orderDetail.reviewSubmitted'));
      fetchData();
    } catch (err: unknown) {
      toast.error(t('common.error'), errorMessage(err, 'Could not submit review'));
    }
    setReviewSubmitting(false);
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
      toast.success('Report submitted', 'We will review your case and get back to you.');
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

  const handleDeclineMeetupConfirmed = async () => {
    setDeclineLoading(true);
    try {
      await cancelOrder(orderId);
      toast.success(t('orderDetail.orderCancelled'));
      fetchData();
    } catch (err: unknown) {
      toast.error(t('common.error'), errorMessage(err, 'Could not decline meetup'));
    }
    setDeclineLoading(false);
  };

  const handleDeclineMeetup = () => {
    setShowDeclineModal(true);
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
            <Text style={[styles.statusHeroLabel, { color: statusColor }]}>{getStatusLabel(order.status)}</Text>
            <Text style={styles.statusHeroDate}>
              {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
          </View>
          <Text style={styles.orderIdBadge}>#{order.id.slice(0, 8)}</Text>
        </View>

        {/* Progress stepper */}
        {!isCancelled && currentStep >= 0 && (
          <View style={styles.stepper}>
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
                      {getStatusLabel(step)}
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
            <Text style={styles.cancelledBannerText}>This order has been cancelled</Text>
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
                  <ExpoImage source={{ uri: imgUrl }} style={styles.itemImage} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
                    <MaterialCommunityIcons name="package-variant" size={20} color={COLORS.text2} />
                  </View>
                )}
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName} numberOfLines={2}>{item.product_name || `Product #${item.product_id?.slice(0, 8)}`}</Text>
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
            const e = (order as any).escrow;
            const rate = e.gross_amount > 0 ? Math.round((e.commission_amount / e.gross_amount) * 100) : 0;
            const moncashFee = Math.round(Number(order.total_amount) * 0.079);
            const sellerReceives = Math.round(Number(e.net_amount));
            return (
              <View style={styles.feeBreakdown}>
                <View style={styles.feeRow}>
                  <Text style={styles.feeLabel}>MaurMaket fee ({rate}%)</Text>
                  <Text style={styles.feeValue}>-{formatPrice(Math.round(Number(e.commission_amount)))} G</Text>
                </View>
                <View style={styles.feeRow}>
                  <Text style={styles.feeLabel}>MonCash fee (~7.9%)</Text>
                  <Text style={styles.feeValue}>~-{formatPrice(moncashFee)} G</Text>
                </View>
                <View style={[styles.feeRow, { marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: COLORS.border + '40' }]}>
                  <Text style={[styles.feeLabel, { fontWeight: '700', color: COLORS.text }]}>Seller receives</Text>
                  <Text style={[styles.feeValue, { color: COLORS.green, fontWeight: '700' }]}>{formatPrice(sellerReceives)} G</Text>
                </View>
              </View>
            );
          })()}
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
          {isSellerOfOrder && !order.meetup_confirmed && order.meetup_proposed_by !== store.user?.id ? (
            <View style={styles.meetupActionWrap}>
              <View style={styles.meetupAlert}>
                <MaterialCommunityIcons name="alert-circle-outline" size={16} color={COLORS.yellow} />
                <Text style={[styles.meetupAlertText, { color: COLORS.yellow }]}>
                  {t('orderDetail.buyerProposedLocation')}
                </Text>
              </View>

              {/* Mini map preview */}
              {order.meetup_lat && order.meetup_lng && (
                <View style={styles.miniMapContainer}>
                  <WebView
                    source={{ html: buildMiniMapHtml(order.meetup_lat, order.meetup_lng) }}
                    style={styles.miniMap}
                    scrollEnabled={false}
                    showsHorizontalScrollIndicator={false}
                    showsVerticalScrollIndicator={false}
                  />
                </View>
              )}

              <View style={styles.meetupButtons}>
                <TouchableOpacity
                  style={[styles.meetupAcceptBtn]}
                  onPress={handleAcceptMeetup}
                  disabled={confirmLoading || declineLoading}
                >
                  {confirmLoading ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <Text style={styles.meetupAcceptBtnText}>{t('orderDetail.acceptMeetup')}</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.meetupDeclineBtn]}
                  onPress={handleDeclineMeetup}
                  disabled={confirmLoading || declineLoading}
                >
                  {declineLoading ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <Text style={styles.meetupDeclineBtnText}>{t('orderDetail.declineMeetup')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.meetupStatusRow}>
              <MaterialCommunityIcons
                name={order.meetup_confirmed ? 'check-circle' : 'clock-outline'}
                size={16}
                color={order.meetup_confirmed ? COLORS.green : COLORS.yellow}
              />
              <Text style={[styles.meetupStatusText, { color: order.meetup_confirmed ? COLORS.green : COLORS.yellow }]}>
                {order.meetup_confirmed ? t('orderDetail.confirmMeetup') : t('orderDetail.pending')}
              </Text>
            </View>
          )}
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
                <Text style={styles.eventType}>{event.event_type.replace(/_/g, ' ')}</Text>
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
        {/* Meetup CTA (for both buyer and seller) */}
        {order.delivery_method === 'meetup' && order.status === 'paid' && (
          <TouchableOpacity
            style={styles.meetupCtaBtn}
            onPress={() => navigation.navigate('Meetup', { orderId })}
            accessibilityLabel="go to meetup"
            accessibilityRole="button"
          >
            <MaterialCommunityIcons name="map-marker-radius" size={18} color={COLORS.white} />
            <Text style={styles.meetupCtaBtnText}>Go to Meetup</Text>
          </TouchableOpacity>
        )}

        {/* Seller actions */}
        {isSellerOfOrder && order.status === 'paid' && (
          <TouchableOpacity style={styles.primaryBtn} onPress={() => handleAdvanceStatus('processing')} disabled={actionLoading} accessibilityLabel="mark processing" accessibilityRole="button">
            {actionLoading ? <ActivityIndicator size="small" color={COLORS.white} /> : (
              <>
                <MaterialCommunityIcons name="cog-outline" size={18} color={COLORS.white} />
                <Text style={styles.primaryBtnText}>{t('orderDetail.processing')}</Text>
              </>
            )}
          </TouchableOpacity>
        )}
        {isSellerOfOrder && order.status === 'processing' && (
          <TouchableOpacity style={styles.primaryBtn} onPress={() => handleAdvanceStatus('shipped')} disabled={actionLoading} accessibilityLabel="mark shipped" accessibilityRole="button">
            {actionLoading ? <ActivityIndicator size="small" color={COLORS.white} /> : (
              <>
                <MaterialCommunityIcons name="truck-delivery-outline" size={18} color={COLORS.white} />
                <Text style={styles.primaryBtnText}>{t('orderDetail.shipped')}</Text>
              </>
            )}
          </TouchableOpacity>
        )}
        {isSellerOfOrder && order.status === 'shipped' && (
          <TouchableOpacity style={styles.primaryBtn} onPress={() => handleAdvanceStatus('delivered')} disabled={actionLoading} accessibilityLabel="mark delivered" accessibilityRole="button">
            {actionLoading ? <ActivityIndicator size="small" color={COLORS.white} /> : (
              <>
                <MaterialCommunityIcons name="map-marker-check" size={18} color={COLORS.white} />
                <Text style={styles.primaryBtnText}>{t('orderDetail.markDelivered')}</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Buyer: pending → pay */}
        {isBuyerOfOrder && order.status === 'pending' && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.primaryBtnFlex} onPress={handleRetryPayment} disabled={actionLoading} accessibilityLabel="retry payment" accessibilityRole="button">
              {actionLoading ? <ActivityIndicator size="small" color={COLORS.white} /> : (
                <Text style={styles.primaryBtnText}>{t('orderDetail.retryPayment')}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtnFlex} onPress={handleCancel} disabled={actionLoading} accessibilityLabel="cancel order" accessibilityRole="button">
              <Text style={styles.cancelBtnFlexText}>{t('orderDetail.cancelOrder')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Buyer: delivered → confirm/review */}
        {isBuyerOfOrder && order.status === 'delivered' && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.primaryBtnFlex} onPress={handleComplete} disabled={actionLoading} accessibilityLabel="confirm received" accessibilityRole="button">
              {actionLoading ? <ActivityIndicator size="small" color={COLORS.white} /> : (
                <Text style={styles.primaryBtnText}>{t('orderDetail.completed')}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.disputeBtnFlex} onPress={() => setDisputeModalVisible(true)} accessibilityLabel="open dispute" accessibilityRole="button">
              <MaterialCommunityIcons name="flag-outline" size={14} color={COLORS.text2} />
              <Text style={styles.disputeBtnText}>{t('orderDetail.openDispute')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Buyer: completed → review/reorder */}
        {order.status === 'completed' && isBuyerOfOrder && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.reviewBtnFlex} onPress={() => setReviewModalVisible(true)} accessibilityLabel="review order" accessibilityRole="button">
              <MaterialCommunityIcons name="star-outline" size={16} color={COLORS.yellow} />
              <Text style={styles.reviewBtnText}>{t('orderDetail.reviewOrder')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reorderBtnFlex} onPress={handleReorder} disabled={actionLoading} accessibilityLabel="reorder" accessibilityRole="button">
              <MaterialCommunityIcons name="replay" size={14} color={COLORS.coral} />
              <Text style={styles.reorderBtnText}>{t('orderDetail.reorder')}</Text>
            </TouchableOpacity>
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
              <Text style={styles.modalTitle}>{t('orderDetail.reviewOrder')}</Text>
              <TouchableOpacity onPress={() => setReviewModalVisible(false)} accessibilityLabel="close review modal" accessibilityRole="button">
                <Icon name="close" size={20} color={COLORS.text2} />
              </TouchableOpacity>
            </View>

            <View style={styles.starsPicker}>
              {[1, 2, 3, 4, 5].map(star => (
                <TouchableOpacity key={star} onPress={() => setReviewRating(star)} accessibilityLabel={`rate ${star} star${star > 1 ? 's' : ''}`} accessibilityRole="button">
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
              style={[styles.submitBtn, { backgroundColor: COLORS.yellow }, reviewSubmitting && { opacity: 0.5 }]}
              onPress={handleSubmitReview}
              disabled={reviewSubmitting}
              accessibilityLabel="submit review"
              accessibilityRole="button"
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
              <Text style={styles.modalTitle}>{t('orderDetail.openDispute')}</Text>
              <TouchableOpacity onPress={() => setDisputeModalVisible(false)} accessibilityLabel="close dispute modal" accessibilityRole="button">
                <Icon name="close" size={20} color={COLORS.text2} />
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
              style={[styles.submitBtn, { backgroundColor: COLORS.coral }, disputeSubmitting && { opacity: 0.5 }]}
              onPress={handleSubmitDispute}
              disabled={disputeSubmitting}
              accessibilityLabel="submit dispute"
              accessibilityRole="button"
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
        visible={showCancelModal}
        title={t('orderDetail.cancelOrder')}
        message={t('orderDetail.cancelConfirm')}
        confirmLabel="Yes, cancel"
        cancelLabel={t('common.cancel')}
        kind="danger"
        onConfirm={() => {
          setShowCancelModal(false);
          handleCancelConfirmed();
        }}
        onCancel={() => setShowCancelModal(false)}
      />

      <ConfirmModal
        visible={showDeclineModal}
        title={t('orderDetail.declineMeetup')}
        message={t('orderDetail.declineMeetupConfirm')}
        confirmLabel="Yes, decline"
        cancelLabel={t('common.cancel')}
        kind="danger"
        onConfirm={() => {
          setShowDeclineModal(false);
          handleDeclineMeetupConfirmed();
        }}
        onCancel={() => setShowDeclineModal(false)}
      />
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
    fontSize: 12, fontFamily: 'monospace', color: COLORS.text2,
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
  totalValue: { fontFamily: 'Syne', fontSize: 18, fontWeight: '800', color: COLORS.coral },
  feeBreakdown: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border + '60' },
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
    padding: 12, borderRadius: RADIUS.pill, backgroundColor: COLORS.green, alignItems: 'center',
  },
  meetupAcceptBtnText: { color: COLORS.white, fontWeight: '600', fontSize: 14 },
  meetupDeclineBtn: {
    flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 6,
    padding: 12, borderRadius: RADIUS.pill, backgroundColor: COLORS.coral, alignItems: 'center',
  },
  meetupDeclineBtnText: { color: COLORS.white, fontWeight: '600', fontSize: 14 },
  meetupStatusRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8,
  },
  meetupStatusText: { fontSize: 13, fontWeight: '600' },

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
  modalTitle: { fontFamily: 'Syne', fontSize: 18, fontWeight: '800', color: COLORS.text },
  starsPicker: {
    flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: SPACING.lg,
  },
  reviewInput: {
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.card, padding: 12, fontSize: 14, color: COLORS.text,
    minHeight: 100, marginBottom: SPACING.lg,
  },
  submitBtn: {
    padding: 14, borderRadius: RADIUS.pill, alignItems: 'center',
  },
  submitBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  disputeLabel: { fontSize: 12, fontWeight: '700', color: COLORS.text2, marginBottom: 8 },
  disputeReasonBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10,
    paddingHorizontal: 4, borderRadius: RADIUS.row,
  },
  disputeReasonActive: { backgroundColor: COLORS.surface2 },
  disputeReasonText: { fontSize: 14, color: COLORS.text2 },
  disputeReasonTextActive: { color: COLORS.text, fontWeight: '600' },
});
