import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, ScrollView, TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, formatPrice } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import { getOfferDetail, respondToOffer, counterOffer, getImageUrl } from '../api';
import { useToast } from '../components/Toast';
import { store } from '../store';
import BackButton from '../components/BackButton';
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
  const { messageId, conversationId } = route.params;
  const [offer, setOffer] = useState<OfferDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [counterPrice, setCounterPrice] = useState('');

  const userId = store.user?.id;
  const isBuyer = offer?.buyerId === userId;
  const isSeller = offer?.sellerId === userId;
  const isPending = offer?.status === 'pending';
  const isCountered = offer?.status === 'countered';
  const canRespond = (isSeller && isPending) || (isBuyer && isCountered);
  const canCounter = isSeller && (isPending || isCountered);
  const maxRounds = (offer?.negotiationRound || 0) >= 3;

  useEffect(() => {
    getOfferDetail(messageId)
      .then((res: any) => {
        setOffer(res.offer);
        if (res.offer) setCounterPrice(String(res.offer.listPrice));
      })
      .catch(() => toast.error('Could not load offer'))
      .finally(() => setLoading(false));
  }, [messageId]);

  const handleAccept = async () => {
    if (!offer) return;
    setActing(true);
    try {
      await respondToOffer(offer.messageId, 'accepted');
      toast.success('Offer accepted');
      setOffer(prev => prev ? { ...prev, status: 'accepted' } : prev);
    } catch {
      toast.error('Could not accept offer');
    } finally {
      setActing(false);
    }
  };

  const handleDecline = async () => {
    if (!offer) return;
    setActing(true);
    try {
      await respondToOffer(offer.messageId, 'declined');
      toast.success('Offer declined');
      setOffer(prev => prev ? { ...prev, status: 'declined' } : prev);
    } catch {
      toast.error('Could not decline offer');
    } finally {
      setActing(false);
    }
  };

  const handleCounter = async () => {
    if (!offer) return;
    const price = Number(counterPrice.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(price) || price <= 0) {
      toast.error('Enter a valid price');
      return;
    }
    setActing(true);
    try {
      const res = await counterOffer(offer.messageId, price) as any;
      toast.success('Counter sent', `G ${formatPrice(price)}`);
      setOffer(prev => prev ? { ...prev, offeredPrice: price, status: 'countered', negotiationRound: res.negotiationRound || prev.negotiationRound + 1 } : prev);
    } catch (err: any) {
      toast.error('Could not send counter', err?.message || 'Try again');
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
        <View style={styles.header}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={styles.headerTitle}>Offer</Text>
        </View>
        <View style={styles.emptyWrap}>
          <MaterialCommunityIcons name="alert-circle-outline" size={48} color={COLORS.text2} />
          <Text style={styles.emptyText}>Offer not found</Text>
        </View>
      </View>
    );
  }

  const isFinalized = offer.status === 'accepted' || offer.status === 'declined';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>Offer</Text>
      </View>

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
            <Text style={styles.priceLabel}>Listed price</Text>
            <Text style={styles.listPrice}>{formatPrice(offer.listPrice)} G</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Current offer</Text>
            <Text style={styles.offerPrice}>{formatPrice(offer.offeredPrice)} G</Text>
          </View>
          {discount > 0 && (
            <Text style={styles.discount}>{discount}% off listed price</Text>
          )}
        </View>

        <View style={styles.infoRow}>
          <View style={[styles.statusBadge, offer.status === 'accepted' && styles.statusAccepted, offer.status === 'declined' && styles.statusDeclined, isCountered && styles.statusCountered]}>
            <Text style={styles.statusText}>
              {offer.status === 'pending' ? 'Waiting for response' : offer.status === 'accepted' ? 'Accepted' : offer.status === 'declined' ? 'Declined' : `Countered (${offer.negotiationRound}/3)`}
            </Text>
          </View>
          {expiresIn !== null && !isFinalized && (
            <Text style={[styles.expiresText, expiresIn < 6 && styles.expiresUrgent]}>
              {expiresIn}h left
            </Text>
          )}
        </View>

        {maxRounds && !isFinalized && (
          <View style={styles.roundBanner}>
            <MaterialCommunityIcons name="information-outline" size={18} color={COLORS.coral} />
            <Text style={styles.roundBannerText}>Max 3 rounds reached. Accept, decline, or go to chat to buy at listed price.</Text>
          </View>
        )}
      </ScrollView>

      {!isFinalized && (
        <View style={[styles.actions, { paddingBottom: insets.bottom + SPACING.md }]}>
          {canRespond && (
            <>
              <TouchableOpacity style={styles.acceptBtn} onPress={handleAccept} disabled={acting} accessibilityLabel="accept offer" accessibilityRole="button">
                <Text style={styles.acceptBtnText}>{acting ? '...' : 'Accept offer'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.declineBtn} onPress={handleDecline} disabled={acting} accessibilityLabel="decline offer" accessibilityRole="button">
                <Text style={styles.declineBtnText}>Decline</Text>
              </TouchableOpacity>
            </>
          )}
          {canCounter && !maxRounds && (
            <View style={styles.counterRow}>
              <TextInput
                style={styles.counterInput}
                value={counterPrice}
                onChangeText={setCounterPrice}
                keyboardType="decimal-pad"
                placeholder="Counter price"
                placeholderTextColor={COLORS.text2}
                accessibilityLabel="counter price"
              />
              <TouchableOpacity style={styles.counterBtn} onPress={handleCounter} disabled={acting} accessibilityLabel="send counter" accessibilityRole="button">
                <Text style={styles.counterBtnText}>{acting ? '...' : 'Counter'}</Text>
              </TouchableOpacity>
            </View>
          )}
          {!canRespond && !canCounter && (            <TouchableOpacity style={styles.chatBtn} onPress={() => {
              const ou = isBuyer ? { name: offer.sellerName, avatar: offer.sellerAvatar, tier: offer.sellerTier, storeLogoUrl: offer.sellerStoreLogoUrl, useStoreIdentity: offer.sellerUseStoreIdentity } : { name: offer.buyerName, avatar: offer.buyerAvatar };
              navigation.navigate('Chat', { conversationId, otherUserName: ou.name || '', otherUserId: isBuyer ? offer.sellerId : offer.buyerId, otherUserAvatar: ou.avatar, otherUserStoreLogoUrl: (ou as any).storeLogoUrl, otherUserUseStoreIdentity: (ou as any).useStoreIdentity, otherUserTier: (ou as any).tier });
            }} accessibilityLabel="open chat" accessibilityRole="button">
              <Text style={styles.chatBtnText}>Open chat</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {isFinalized && (
        <View style={[styles.actions, { paddingBottom: insets.bottom + SPACING.md }]}>
            <TouchableOpacity style={styles.chatBtn} onPress={() => {
              const ou = isBuyer ? { name: offer.sellerName, avatar: offer.sellerAvatar, tier: offer.sellerTier, storeLogoUrl: offer.sellerStoreLogoUrl, useStoreIdentity: offer.sellerUseStoreIdentity } : { name: offer.buyerName, avatar: offer.buyerAvatar };
              navigation.navigate('Chat', { conversationId, otherUserName: ou.name || '', otherUserId: isBuyer ? offer.sellerId : offer.buyerId, otherUserAvatar: ou.avatar, otherUserStoreLogoUrl: (ou as any).storeLogoUrl, otherUserUseStoreIdentity: (ou as any).useStoreIdentity, otherUserTier: (ou as any).tier });
            }} accessibilityLabel="open chat" accessibilityRole="button">
            <Text style={styles.chatBtnText}>Open chat</Text>
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
