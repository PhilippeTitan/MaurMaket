import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, ScrollView, TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import { COLORS, SPACING, RADIUS, formatPrice } from '../theme';
import { useTranslation } from '@/localization';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import { getOfferDetail, respondToOffer, counterOffer, getImageUrl, markOfferSeen } from '../api';
import { useToast } from '../components/Toast';
import { store } from '../store';
import ScreenHeader from '../components/ScreenHeader';
import { SkeletonBlock } from '../components/Skeleton';

type Props = NativeStackScreenProps<RootStackParamList, 'OfferDetail'>;

type OfferDetail = {
  messageId: string;
  productId: string;
  productName: string;
  productImage?: string;
  offeredPrice: number;
  listPrice: number;
  status: string;
  negotiationRound: number;
  counterCount: number;
  quantity: number;
  senderId: string;
  currentStock: number;
  productAvailable: boolean;
  isBlocked: boolean;
  acceptedExpiresAt?: string | null;
  isInCheckout?: boolean;
  history?: { messageId: string; offeredPrice: number; status: string; senderId: string; senderName: string; createdAt: string; quantity: number; round: number }[];
  buyerId: string;
  sellerId: string;
  buyerName?: string;
  buyerAvatar?: string;
  sellerName?: string;
  sellerAvatar?: string;
  sellerTier?: string;
  sellerUseStoreIdentity?: boolean;
  sellerStoreLogoUrl?: string;
  expiresAt: string;
};

export default function OfferDetailScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { t } = useTranslation();
  const { messageId, conversationId } = route.params;
  const [offer, setOffer] = useState<OfferDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [counterPrice, setCounterPrice] = useState('');

  const userId = store.user?.id;
  const isBuyer = offer?.buyerId === userId;
  const isPending = offer?.status === 'pending';
  const isCountered = offer?.status === 'countered';
  const canRespond = !!offer && isPending && offer.senderId !== userId && !offer.isBlocked;
  const canCounter = canRespond;
  const maxRounds = (offer?.counterCount || 0) >= 6;

  const openConversation = () => {
    if (!offer) return;
    const peerId = isBuyer ? offer.sellerId : offer.buyerId;
    const peerName = isBuyer ? offer.sellerName : offer.buyerName;
    const peerAvatar = isBuyer ? offer.sellerAvatar : offer.buyerAvatar;
    navigation.navigate('Chat', { conversationId, otherUserName: peerName || '', otherUserId: peerId, otherUserAvatar: peerAvatar, otherUserStoreLogoUrl: isBuyer ? offer.sellerStoreLogoUrl : undefined, otherUserUseStoreIdentity: isBuyer ? offer.sellerUseStoreIdentity : undefined, otherUserTier: isBuyer ? offer.sellerTier : undefined });
  };

  useEffect(() => {
    getOfferDetail(messageId)
      .then((res: any) => {
        setOffer(res.offer);
        if (res.offer) { setCounterPrice(String(res.offer.listPrice)); markOfferSeen(messageId).catch(() => {}); }
      })
      .catch(() => toast.error(t('offer.couldNotLoad')))
      .finally(() => setLoading(false));
  }, [messageId]);

  const handleAccept = async () => {
    if (!offer) return;
    setActing(true);
    try {
      await respondToOffer(offer.messageId, 'accepted');
      toast.success(t('offer.acceptedToast'));
      openConversation();
    } catch {
      toast.error(t('offer.couldNotAccept'));
    } finally {
      setActing(false);
    }
  };

  const handleDecline = async () => {
    if (!offer) return;
    setActing(true);
    try {
      await respondToOffer(offer.messageId, 'declined');
      toast.success(t('offer.declinedToast'));
      openConversation();
    } catch {
      toast.error(t('offer.couldNotDecline'));
    } finally {
      setActing(false);
    }
  };

  const handleCounter = async () => {
    if (!offer) return;
    const price = Number(counterPrice.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(price) || price <= 0) {
      toast.error(t('offer.invalidPrice'));
      return;
    }
    setActing(true);
    try {
      await counterOffer(offer.messageId, price);
      toast.success(t('offer.counterSent'), `${formatPrice(price)} G`);
      openConversation();
    } catch (err: any) {
      toast.error(t('offer.couldNotCounter'), err?.message || t('common.retry'));
    } finally {
      setActing(false);
    }
  };

  const expiresIn = offer?.expiresAt ? Math.max(0, Math.floor((new Date(offer.expiresAt).getTime() - Date.now()) / 3600000)) : null;
  const discount = offer ? Math.round(((offer.listPrice - offer.offeredPrice) / offer.listPrice) * 100) : 0;

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.offerSkeletonHeader}><SkeletonBlock width={36} height={36} radius={18} /><SkeletonBlock width="32%" height={16} /></View>
        <View style={styles.offerSkeleton}>
          <SkeletonBlock height={188} radius={RADIUS.media} />
          <SkeletonBlock width="65%" height={20} />
          <SkeletonBlock width="45%" height={14} />
          <SkeletonBlock height={54} radius={RADIUS.button} />
        </View>
      </View>
    );
  }

  if (!offer) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ScreenHeader title={t('offer.detailTitle')} onBack={() => navigation.goBack()} bordered={false} />
        <View style={styles.emptyWrap}>
          <MaterialCommunityIcons name="alert-circle-outline" size={48} color={COLORS.text2} />
          <Text style={styles.emptyText}>{t('offer.notFound')}</Text>
        </View>
      </View>
    );
  }

  const isFinalized = ['accepted', 'declined', 'expired', 'redeemed'].includes(offer.status);
  const isExpired = offer.status === 'expired' || offer.status === 'redeemed' || (['pending', 'countered'].includes(offer.status) && !!offer.expiresAt && new Date(offer.expiresAt) <= new Date()) || (offer.status === 'accepted' && !!offer.acceptedExpiresAt && new Date(offer.acceptedExpiresAt) <= new Date());
  const stockSufficient = offer.productAvailable && offer.currentStock >= offer.quantity;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenHeader title={t('offer.detailTitle')} onBack={() => navigation.goBack()} bordered={false} />

      <ScrollView contentContainerStyle={styles.content}>
        {offer.productImage ? (
          <View style={styles.productImageWrap}>
            <Image source={{ uri: getImageUrl(offer.productImage) ?? undefined }} style={styles.productImageBg} blurRadius={20} />
            <Image source={{ uri: getImageUrl(offer.productImage) ?? undefined }} style={StyleSheet.absoluteFill} resizeMode="contain" />
          </View>
        ) : (
          <View style={[styles.productImageWrap, styles.productImagePlaceholder]}>
            <MaterialCommunityIcons name="package-variant" size={48} color={COLORS.text2} />
          </View>
        )}

        <Text style={styles.productName}>{offer.productName}</Text>

        <View style={styles.priceCard}>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>{t('offer.listedPrice')}</Text>
            <Text style={styles.listPrice}>{formatPrice(offer.listPrice)} G</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>{t('offer.currentOffer')}</Text>
            <Text style={styles.offerPrice}>{formatPrice(offer.offeredPrice)} G</Text>
          </View>
          {discount > 0 && (
            <Text style={styles.discount}>{t('offer.discountOff', { percent: String(discount) })}</Text>
          )}
          <View style={styles.divider} />
          <View style={styles.priceRow}><Text style={styles.priceLabel}>{t('offer.quantity')}</Text><Text style={styles.quantityText}>×{offer.quantity}</Text></View>
          <View style={styles.priceRow}><Text style={styles.priceLabel}>{t('offer.total')}</Text><Text style={styles.totalPrice}>{formatPrice(offer.offeredPrice * offer.quantity)} G</Text></View>
        </View>

        <Text style={styles.stockNote}>{isExpired && offer.status === 'redeemed' ? t('offer.redeemed') : offer.isInCheckout ? t('offer.inCheckout') : offer.status === 'accepted' && offer.acceptedExpiresAt && !isExpired ? t('offer.acceptedUntil', { date: new Date(offer.acceptedExpiresAt).toLocaleString() }) : stockSufficient ? t('offer.stockNoReservation', { count: String(offer.currentStock) }) : t('offer.stockUnavailable')}</Text>
        {offer.isBlocked && <Text style={styles.stockNote}>{t('chat.blockedNotice')}</Text>}

        {!!offer.history?.length && (
          <View style={styles.historyCard}>
            <Text style={styles.historyTitle}>{t('offer.negotiationHistory')}</Text>
            {offer.history.map((entry, index) => <View key={entry.messageId} style={styles.historyRow}>
              <View style={styles.historyNumber}><Text style={styles.historyNumberText}>{index + 1}</Text></View>
              <View style={{ flex: 1 }}><Text style={styles.historySender}>{entry.senderId === userId ? t('offer.you') : entry.senderName}</Text><Text style={styles.historyMeta}>{t('offer.quantityAndTotal', { quantity: String(entry.quantity), total: formatPrice(entry.offeredPrice * entry.quantity) })}</Text></View>
              <Text style={styles.historyPrice}>{formatPrice(entry.offeredPrice)} G</Text>
            </View>)}
          </View>
        )}

        <View style={styles.infoRow}>
          <View style={[styles.statusBadge, offer.status === 'accepted' && !isExpired && styles.statusAccepted, (offer.status === 'declined' || isExpired) && styles.statusDeclined, isCountered && styles.statusCountered]}>
            <Text style={styles.statusText}>
              {isExpired ? (offer.status === 'redeemed' ? t('offer.redeemed') : t('offer.expired')) : offer.status === 'pending' ? t('offer.pending') : offer.status === 'accepted' ? t('offer.accepted') : offer.status === 'declined' ? t('offer.declined') : t('offer.countered', { round: String(offer.counterCount) })}
            </Text>
          </View>
          {expiresIn !== null && !isFinalized && !isExpired && (
            <Text style={[styles.expiresText, expiresIn < 6 && styles.expiresUrgent]}>
              {t('offer.expiresIn', { hours: String(expiresIn) })}
            </Text>
          )}
        </View>

        {maxRounds && !isFinalized && !isExpired && (
          <View style={styles.roundBanner}>
            <MaterialCommunityIcons name="information-outline" size={18} color={COLORS.coral} />
            <Text style={styles.roundBannerText}>{t('offer.maxRounds')}</Text>
          </View>
        )}
      </ScrollView>

      {!isFinalized && !isExpired && (
        <View style={[styles.actions, { paddingBottom: insets.bottom + SPACING.md }]}>
          {canRespond && (
            <>
              <TouchableOpacity style={[styles.acceptBtn, !stockSufficient && { opacity: 0.45 }]} onPress={handleAccept} disabled={acting || !stockSufficient} accessibilityLabel="accept offer" accessibilityRole="button">
                <Text style={styles.acceptBtnText}>{acting ? '...' : t('offer.acceptOffer')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.declineBtn} onPress={handleDecline} disabled={acting} accessibilityLabel="decline offer" accessibilityRole="button">
                <Text style={styles.declineBtnText}>{t('offer.declineOffer')}</Text>
              </TouchableOpacity>
            </>
          )}
          {canCounter && !maxRounds && stockSufficient && (
            <View style={styles.counterRow}>
              <TextInput
                style={styles.counterInput}
                value={counterPrice}
                onChangeText={setCounterPrice}
                keyboardType="decimal-pad"
                placeholder={t('offer.counterPrice')}
                placeholderTextColor={COLORS.text2}
                accessibilityLabel="counter price"
              />
              <TouchableOpacity style={styles.counterBtn} onPress={handleCounter} disabled={acting} accessibilityLabel="send counter" accessibilityRole="button">
                <Text style={styles.counterBtnText}>{acting ? '...' : t('offer.counterBtn')}</Text>
              </TouchableOpacity>
            </View>
          )}
          {!canRespond && !canCounter && (
            <TouchableOpacity style={styles.chatBtn} onPress={openConversation} accessibilityLabel={t('offer.openChat')} accessibilityRole="button">
              <Text style={styles.chatBtnText}>{t('offer.openChat')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {(isFinalized || isExpired) && (
        <View style={[styles.actions, { paddingBottom: insets.bottom + SPACING.md }]}>
          <TouchableOpacity style={styles.chatBtn} onPress={openConversation} accessibilityLabel={t('offer.openChat')} accessibilityRole="button">
            <Text style={styles.chatBtnText}>{t('offer.openChat')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  offerSkeletonHeader: { height: 58, paddingHorizontal: SPACING.lg, flexDirection: 'row', alignItems: 'center', gap: 14 },
  offerSkeleton: { padding: SPACING.lg, gap: SPACING.md },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text, flex: 1 },
  content: { padding: SPACING.md },
  productImageWrap: { width: '100%', height: 220, borderRadius: RADIUS.media, overflow: 'hidden', backgroundColor: COLORS.surface2, marginBottom: SPACING.md },
  productImageBg: { width: '100%', height: '100%' },
  productImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  productName: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.md },
  priceCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.card, padding: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md,
  },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  priceLabel: { fontSize: 13, color: COLORS.text2 },
  listPrice: { fontSize: 14, color: COLORS.text2, textDecorationLine: 'line-through' },
  offerPrice: { fontSize: 18, fontWeight: '700', color: COLORS.coral },
  quantityText: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  totalPrice: { color: COLORS.coral, fontSize: 16, fontWeight: '800' },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 4 },
  discount: { fontSize: 12, fontWeight: '700', color: COLORS.green, marginTop: 6 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.md },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill, backgroundColor: COLORS.surface2 },
  statusAccepted: { backgroundColor: 'rgba(0,229,160,0.15)' },
  statusDeclined: { backgroundColor: 'rgba(255,77,106,0.15)' },
  statusCountered: { backgroundColor: 'rgba(0,194,255,0.15)' },
  statusText: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  expiresText: { fontSize: 12, color: COLORS.text2 },
  expiresUrgent: { color: COLORS.coral, fontWeight: '700' },
  roundBanner: {
    flexDirection: 'row', gap: 8, backgroundColor: COLORS.surface, borderRadius: RADIUS.card,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
  },
  roundBannerText: { flex: 1, fontSize: 13, color: COLORS.text2, lineHeight: 18 },
  stockNote: { fontSize: 12, lineHeight: 18, color: COLORS.text2, marginBottom: SPACING.md },
  historyCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.card, padding: SPACING.md, marginBottom: SPACING.md },
  historyTitle: { color: COLORS.text, fontSize: 14, fontWeight: '800', marginBottom: SPACING.sm },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  historyNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center' },
  historyNumberText: { color: COLORS.text2, fontSize: 11, fontWeight: '800' },
  historySender: { color: COLORS.text, fontSize: 12, fontWeight: '700' },
  historyMeta: { color: COLORS.text2, fontSize: 11, marginTop: 2 },
  historyPrice: { color: COLORS.coral, fontSize: 13, fontWeight: '800' },
  actions: { paddingHorizontal: SPACING.md, gap: 10 },
  acceptBtn: { backgroundColor: COLORS.coral, borderRadius: RADIUS.pill, paddingVertical: 14, alignItems: 'center' },
  acceptBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.white },
  declineBtn: { backgroundColor: COLORS.surface, borderRadius: RADIUS.pill, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  declineBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.text2 },
  counterRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  counterInput: {
    flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 12, color: COLORS.text, fontSize: 15,
  },
  counterBtn: { backgroundColor: COLORS.blue, borderRadius: RADIUS.pill, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center' },
  counterBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  chatBtn: { backgroundColor: COLORS.surface, borderRadius: RADIUS.pill, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  chatBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, color: COLORS.text2, marginTop: 8 },
});
