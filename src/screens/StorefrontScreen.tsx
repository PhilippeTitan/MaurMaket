import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, RefreshControl, useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, isVerifiedSeller, getDisplayName, getSellerAvatar } from '../theme';
import { getSellerProfile, getSellerReviews, toggleFollow, getFollowerCount, getImageUrl, createConversation } from '../api';
import { store } from '../store';
import { useTranslation } from '../i18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation';
import type { Product, Review, SellerProfile } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Storefront'>;

export default function StorefrontScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { sellerId } = route.params;
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [messageLoading, setMessageLoading] = useState(false);
  const [imageSizes, setImageSizes] = useState<Record<string, { w: number; h: number }>>({});
  const { width: SCREEN_W } = useWindowDimensions();
  const CARD_W = (SCREEN_W - SPACING.sm * 2 - 10) / 2;
  const DEFAULT_IMG_H = Math.round(CARD_W * 1.25);
  const MIN_IMG_H = CARD_W * 0.6;

  const fetchSellerData = useCallback(async () => {
    try {
      const [sellerRes, prodRes, revRes, followingRes] = await Promise.all([
        getSellerProfile(sellerId) as Promise<{ seller: SellerProfile }>,
        import('../api').then(m => m.getProducts({ seller: sellerId, limit: '50' })) as Promise<{ products: Product[] }>,
        getSellerReviews(sellerId) as Promise<{ reviews: Review[] }>,
        store.isLoggedIn ? import('../api').then(m => m.getFollowing()) as Promise<{ following?: Array<{ seller_id?: string; id?: string }> }> : Promise.resolve({ following: [] }),
      ]);
      setSeller(sellerRes.seller);
      setProducts(prodRes.products || []);
      (prodRes.products || []).forEach((p: Product) => {
        const img = p.images?.find(i => i.is_primary) || p.images?.[0];
        if (img?.image_url) {
          Image.getSize(getImageUrl(img.image_url) || '', (w, h) => {
            setImageSizes(prev => ({ ...prev, [p.id]: { w, h } }));
          }, () => {});
        }
      });
      setReviews(revRes.reviews || []);
      const followIds = (followingRes.following || []).map(f => f.seller_id || f.id).filter(Boolean);
      setFollowing(followIds.includes(sellerId));
      const countRes = await getFollowerCount(sellerId) as { count: number };
      setFollowerCount(countRes.count || 0);
      } catch {       Alert.alert(t('common.error'), 'Could not load seller profile.'); }
    setLoading(false);
  }, [sellerId]);

  useFocusEffect(useCallback(() => { fetchSellerData(); }, [fetchSellerData]));

  const handleFollow = async () => {
    if (followLoading) return;
    const wasFollowing = following;
    const previousCount = followerCount;
    setFollowLoading(true);
    setFollowing(!wasFollowing);
    setFollowerCount(prev => Math.max(0, prev + (wasFollowing ? -1 : 1)));
    try {
      const res = await toggleFollow(sellerId) as { following: boolean };
      setFollowing(res.following);
      setFollowerCount(Math.max(0, previousCount + (res.following ? 1 : 0) - (wasFollowing ? 1 : 0)));
    } catch {
      setFollowing(wasFollowing);
      setFollowerCount(previousCount);
      Alert.alert(t('storefront.followUnavailable'), t('storefront.followUnavailable'));
    }
    setFollowLoading(false);
  };

  const handleMessage = async () => {
    if (!store.user) return;
    if (messageLoading) return;
    setMessageLoading(true);
    try {
      const productContext = products[0];
      const res = await createConversation({ sellerId, productId: productContext?.id }) as { conversationId: string };
      navigation.navigate('Chat', {
        conversationId: res.conversationId,
        otherUserName: getDisplayName(seller) || 'Seller',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed';
      Alert.alert(t('common.error'), msg);
    }
    setMessageLoading(false);
  };

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.coral} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={[styles.topbar, { paddingTop: insets.top + SPACING.md }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.text2} />
        </TouchableOpacity>
        <Text style={styles.title}>{getDisplayName(seller) || t('storefront.store')}</Text>
      </View>

      <FlatList
        data={products}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.scroll}
        keyExtractor={item => item.id}
        ListHeaderComponent={
          <View>
            <View style={styles.hero}>
              <View style={styles.avatar}>
                {getSellerAvatar(seller) ? (
                  <Image source={{ uri: getImageUrl(getSellerAvatar(seller)) || '' }} style={{ width: 76, height: 76, borderRadius: 38 }} />
                ) : (
                  <Text style={styles.avatarText}>{(getDisplayName(seller)).charAt(0) || '?'}</Text>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.sellerName}>{getDisplayName(seller)}</Text>
                {seller && (seller.seller_tier === 'verified' || seller.seller_tier === 'business') && (
                  <MaterialCommunityIcons name="shield-check" size={16} color={COLORS.blue} />
                )}
              </View>
              {seller?.bio && <Text style={styles.bio}>{seller.bio}</Text>}

              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statNum}>{seller?.product_count || 0}</Text>
                  <Text style={styles.statLabel}>{t('storefront.products')}</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statNum}>{followerCount}</Text>
                  <Text style={styles.statLabel}>{t('storefront.followers')}</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statNum}>{seller?.avg_rating?.toFixed(1) || '—'}</Text>
                  <Text style={styles.statLabel}>{t('storefront.rating')}</Text>
                </View>
              </View>

              {store.isLoggedIn && store.user?.id !== sellerId && (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.followBtn, following && styles.followBtnActive, followLoading && styles.actionDisabled]}
                    onPress={handleFollow}
                    disabled={followLoading}
                  >
                    <Text style={[styles.followBtnText, following && styles.followBtnTextActive]}>
                      {followLoading ? '...' : following ? t('storefront.following') : t('storefront.follow')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.msgBtn, messageLoading && styles.actionDisabled]}
                    onPress={handleMessage}
                    disabled={messageLoading}
                  >
                    <MaterialCommunityIcons name="message-outline" size={16} color={COLORS.blue} />
                    <Text style={styles.msgBtnText}>{messageLoading ? t('storefront.opening') : t('storefront.message')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            <Text style={styles.sectionTitle}>{t('storefront.products')}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const img = item.images?.find(i => i.is_primary) || item.images?.[0];
          const imgUrl = getImageUrl(img?.image_url);
          const size = imageSizes[item.id];
          const cardH = size && size.w > 0 ? Math.max(MIN_IMG_H, Math.round(CARD_W * size.h / size.w)) : DEFAULT_IMG_H;
          return (
            <TouchableOpacity
              style={[styles.card, { height: cardH + 50 }]}
              onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
            >
              <View style={[styles.cardImage, { height: cardH }]}>
                {imgUrl ? <Image source={{ uri: imgUrl }} style={styles.cardImg} resizeMode="cover" /> : <MaterialCommunityIcons name="image-off-outline" size={24} color={COLORS.text2} />}
                <View style={styles.priceBadge}>
                  <Text style={styles.priceText}>Rs {item.price.toLocaleString()}</Text>
                </View>
              </View>
              <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons name="storefront-outline" size={28} color={COLORS.text2} />
            </View>
            <Text style={styles.emptyText}>{t('storefront.noProducts')}</Text>
          </View>
        }
        ListFooterComponent={
          reviews.length > 0 ? (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.sectionTitle}>{t('storefront.reviews')}</Text>
              {reviews.map(rev => (
                <View key={rev.id} style={[styles.card, { width: '100%', padding: 12, marginBottom: 8 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <View style={[styles.avatar, { width: 28, height: 28, borderRadius: 14 }]}>
                      <Text style={[styles.avatarText, { fontSize: 12 }]}>
                        {(rev.reviewer?.full_name || 'A').charAt(0)}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text, flex: 1 }} numberOfLines={1}>
                      {rev.reviewer?.full_name || 'Anonymous'}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 2 }}>
                      {[1, 2, 3, 4, 5].map(s => (
                        <MaterialCommunityIcons
                          key={s}
                          name={s <= rev.rating ? 'star' : 'star-outline'}
                          size={14}
                          color={s <= rev.rating ? COLORS.yellow : COLORS.text2}
                        />
                      ))}
                    </View>
                  </View>
                  {rev.comment && <Text style={{ fontSize: 13, color: COLORS.text2 }}>{rev.comment}</Text>}
                </View>
              ))}
            </View>
          ) : null
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await fetchSellerData(); setRefreshing(false); }} tintColor={COLORS.coral} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loading: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' },
  topbar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { color: COLORS.text, fontSize: 24 },
  title: { fontFamily: 'Syne', fontSize: 18, fontWeight: '800', color: COLORS.text },
  scroll: { padding: SPACING.sm, paddingBottom: 100 },
  hero: { alignItems: 'center', paddingVertical: SPACING.lg, gap: 6, paddingHorizontal: SPACING.lg },
  avatar: {
    width: 76, height: 76, borderRadius: 38, backgroundColor: COLORS.coral,
    justifyContent: 'center', alignItems: 'center', marginBottom: 4,
  },
  avatarText: { fontSize: 28, fontWeight: '800', color: COLORS.white },
  sellerName: { fontFamily: 'Syne', fontSize: 20, fontWeight: '800', color: COLORS.text },
  bio: { fontSize: 13, color: COLORS.text2, textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: 16, marginTop: 8 },
  stat: { alignItems: 'center' },
  statNum: { fontFamily: 'Syne', fontSize: 18, fontWeight: '800', color: COLORS.coral },
  statLabel: { fontSize: 11, color: COLORS.text2 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  followBtn: {
    flex: 1, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20,
    borderWidth: 1.5, borderColor: COLORS.blue, alignItems: 'center',
  },
  followBtnActive: { backgroundColor: COLORS.blue },
  followBtnText: { color: COLORS.blue, fontWeight: '600', fontSize: 14 },
  followBtnTextActive: { color: COLORS.white },
  actionDisabled: { opacity: 0.55 },
  msgBtn: {
    flex: 1, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20,
    borderWidth: 1.5, borderColor: COLORS.blue, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  msgBtnText: { color: COLORS.blue, fontWeight: '600', fontSize: 14 },
  sectionTitle: {
    fontFamily: 'Syne', fontSize: 14, fontWeight: '700', color: COLORS.text,
    paddingHorizontal: SPACING.sm, marginBottom: 8,
  },
  row: { justifyContent: 'space-between', paddingHorizontal: SPACING.xs },
  card: {
    width: '48%', backgroundColor: COLORS.surface, borderRadius: 16,
    marginBottom: SPACING.sm, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border,
  },
  cardImage: {
    backgroundColor: COLORS.surface2, justifyContent: 'center', alignItems: 'center', position: 'relative',
  },
  cardImg: { width: '100%', height: '100%' },
  priceBadge: {
    position: 'absolute', top: 8, right: 8, backgroundColor: COLORS.coral,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3,
  },
  priceText: { color: COLORS.white, fontSize: 11, fontWeight: '700' },
  cardName: { padding: 10, fontSize: 13, fontWeight: '600', color: COLORS.text },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { textAlign: 'center', color: COLORS.text2, paddingTop: 12, fontSize: 14, fontWeight: '500' },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center', marginTop: 40 },
});
