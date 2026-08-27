import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert, useWindowDimensions, FlatList, Image,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Icon } from '../components/icons/Icon';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING, RADIUS } from '../theme';
import { useTranslation } from '../i18n';
import { getWishlist, toggleWishlist, getImageUrl } from '../api';
import { store } from '../store';
import { useToast } from '../components/Toast';
import type { Product } from '../types';
import type { RootStackParamList } from '../navigation';
import ScreenHeader from '../components/ScreenHeader';
import EmptyState from '../components/EmptyState';
import { RowListSkeleton } from '../components/Skeleton';
import SalePriceTag from '../components/SalePriceTag';
import StockBadge from '../components/StockBadge';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const WISHLIST_CACHE_TTL = 60_000;
let _wishlistCache: { data: any; timestamp: number } | null = null;

export default function WishlistScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const toast = useToast();
  const [items, setItems] = useState<Product[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const CARD_W = (SCREEN_W - 3) / 2;
  const DEFAULT_IMG_H = Math.round(CARD_W * 1.25);
  const MIN_H = CARD_W * 0.6;
  const MAX_H = SCREEN_H * 0.52;
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [imageSizes, setImageSizes] = useState<Record<string, { w: number; h: number }>>({});
  const [listingImageIndices, setListingImageIndices] = useState<Record<string, number>>({});

  const fetchData = useCallback(async (force = false) => {
    if (!force && _wishlistCache && Date.now() - _wishlistCache.timestamp < WISHLIST_CACHE_TTL) {
      setItems(_wishlistCache.data.items);
      setLoading(false);
      return;
    }
    try {
      const res = await getWishlist() as { items: Product[] };
      const list = res.items || [];
      setItems(list);
      _wishlistCache = { timestamp: Date.now(), data: { items: list } };
    } catch { Alert.alert(t('common.error'), t('wishlist.loadFailed')); }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData(true);
    setRefreshing(false);
  }, []);

  const handleRemove = async (productId: string) => {
    const previousItems = items;
    setItems(prev => prev.filter(i => i.id !== productId));
    try {
      await toggleWishlist(productId);
    } catch {
      setItems(previousItems);
      Alert.alert(t('common.error'), t('wishlist.removeFailed'));
    }
  };

  // Resolve image sizes for masonry heights
  useEffect(() => {
    for (const p of items) {
      if (imageSizes[p.id]) continue;
      const img = p.images?.find(i => i.is_primary) || p.images?.[0];
      const uri = getImageUrl(img?.thumbnail_url || img?.image_url);
      if (!uri || failedImages.has(p.id)) continue;
      Image.getSize(uri, (w, h) => {
        setImageSizes(prev => ({ ...prev, [p.id]: { w, h } }));
      }, () => {
        setFailedImages(prev => new Set(prev).add(p.id));
      });
    }
  }, [items, failedImages]);

  const getCardHeight = (p: Product) => {
    const size = imageSizes[p.id];
    if (size && size.w > 0) {
      const ratio = size.h / size.w;
      return Math.max(MIN_H, Math.min(MAX_H, CARD_W * ratio));
    }
    return DEFAULT_IMG_H;
  };

  const [leftCol, rightCol] = (() => {
    const cols: [Product[], Product[]] = [[], []];
    const heights = [0, 0];
    for (const item of items) {
      const target = heights[0] <= heights[1] ? 0 : 1;
      cols[target].push(item);
      heights[target] += getCardHeight(item) + 3;
    }
    return cols;
  })();

  const renderGridItem = (item: Product) => {
    const imgFailed = failedImages.has(item.id);
    const cardH = getCardHeight(item);
    const images = item.images && item.images.length > 0
      ? item.images
      : [{ id: 'empty', image_url: '', thumbnail_url: null, is_primary: true, display_order: 0 }];
    const hasMore = images.length > 1;
    const primaryUrl = getImageUrl(images.find(i => i.is_primary)?.thumbnail_url || images.find(i => i.is_primary)?.image_url || images[0]?.thumbnail_url || images[0]?.image_url);
    return (
      <View key={item.id}>
        <View style={styles.card}>
          <View style={[styles.cardImgWrap, { height: cardH }]}>
            {hasMore && !imgFailed ? (
              <FlatList
                data={images}
                horizontal
                pagingEnabled
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                windowSize={3}
                maxToRenderPerBatch={2}
                keyExtractor={(img, idx) => String(img.id || idx)}
                onScroll={(e) => {
                  const index = Math.round(e.nativeEvent.contentOffset.x / CARD_W);
                  if (index !== (listingImageIndices[item.id] ?? 0)) {
                    setListingImageIndices(prev => ({ ...prev, [item.id]: index }));
                  }
                }}
                scrollEventThrottle={16}
                getItemLayout={(_, index) => ({ length: CARD_W, offset: CARD_W * index, index })}
                renderItem={({ item: img }) => {
                  const url = getImageUrl(img.thumbnail_url || img.image_url);
                  return (
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => nav.navigate('ProductDetail', { productId: item.id })}
                      style={{ width: CARD_W, height: cardH }}
                      accessibilityRole="button"
                      accessibilityLabel={item.name}
                    >
                      {url ? (
                        <ExpoImage source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" onError={() => setFailedImages(prev => new Set(prev).add(item.id))} />
                      ) : (
                        <View style={styles.cardPlaceholder}>
                          <Icon name="image-unavailable" size={20} color={COLORS.text2} />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            ) : primaryUrl && !imgFailed ? (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => nav.navigate('ProductDetail', { productId: item.id })}
                style={StyleSheet.absoluteFill}
                accessibilityRole="button"
                accessibilityLabel={item.name}
              >
                <ExpoImage source={{ uri: primaryUrl }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" onError={() => setFailedImages(prev => new Set(prev).add(item.id))} />
              </TouchableOpacity>
            ) : (
              <View style={styles.cardPlaceholder}>
                <Icon name="image-unavailable" size={20} color={COLORS.text2} />
              </View>
            )}
            {hasMore && (
              <View style={styles.imgDots} pointerEvents="none">
                {images.map((_, index) => (
                  <View key={index} style={[styles.imgDot, index === (listingImageIndices[item.id] || 0) && styles.imgDotActive]} />
                ))}
              </View>
            )}
            {/* Price — top right */}
            <View style={styles.cardPriceTop} pointerEvents="none">
              <SalePriceTag price={item.price} effectivePrice={item.effective_price ?? item.price} isOnSale={item.is_on_sale || false} discountPct={item.discount_pct || 0} size="sm" />
            </View>
            {/* Stock badge — bottom left */}
            <View style={styles.cardStockBadge} pointerEvents="none">
              <StockBadge stock={item.stock} size="sm" />
            </View>
            {/* Remove from wishlist — top left */}
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => handleRemove(item.id)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="remove from wishlist"
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="heart" size={18} color={COLORS.coral} />
            </TouchableOpacity>
            {/* Add to cart — bottom right */}
            <TouchableOpacity
              style={styles.cartBtn}
              onPress={async () => {
                const result = await store.addToCart({
                  id: item.id,
                  name: item.name,
                  price: item.price,
                  effective_price: item.effective_price,
                  is_on_sale: item.is_on_sale,
                  discount_pct: item.discount_pct,
                  quantity: 1,
                  images: item.images,
                  seller_id: item.seller_id,
                  seller_name: item.seller?.full_name,
                  store_name: item.seller?.store_name,
                  stock: item.stock ?? 0,
                } as any);
                if (result.added) {
                  toast.success('Added to cart', `${item.name} added.`);
                } else if (result.reason === 'out-of-stock') {
                  toast.warning('Out of stock', 'This item is no longer available.');
                } else if (result.reason === 'max-stock') {
                  toast.info('Max quantity', 'You already have the maximum quantity in your cart.');
                } else if (result.reason === 'own-product') {
                  toast.warning('Your product', "You can't add your own product to cart.");
                }
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="add to cart"
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="cart-plus" size={18} color={COLORS.blue} />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('wishlist.title')} onBack={() => nav.goBack()} />
      <ScrollView
        contentContainerStyle={items.length > 0 ? styles.masonryGrid : { flex: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.coral} />}
      >
        {loading ? (
          <RowListSkeleton count={6} thumbSize={56} />
        ) : items.length === 0 && !refreshing ? (
          <EmptyState icon="heart-outline" title={t('wishlist.empty')} size={56} />
        ) : (
          <>
            <View style={styles.masonryCol}>
              {leftCol.map(item => renderGridItem(item))}
            </View>
            <View style={styles.masonryCol}>
              {rightCol.map(item => renderGridItem(item))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  masonryGrid: { flexDirection: 'row', gap: 3, paddingTop: SPACING.sm },
  masonryCol: { flex: 1, gap: 3 },
  card: {
    borderRadius: RADIUS.row, overflow: 'hidden',
    backgroundColor: COLORS.surface2,
  },
  cardImgWrap: {
    width: '100%', backgroundColor: COLORS.surface2, position: 'relative',
  },
  cardPlaceholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.surface2,
  },
  cardPriceTop: {
    position: 'absolute', top: 6, right: 6, zIndex: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  cardStockBadge: {
    position: 'absolute', bottom: 6, left: 6, zIndex: 6,
  },
  removeBtn: {
    position: 'absolute', top: 6, left: 6, zIndex: 6,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10,
    width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
  },
  cartBtn: {
    position: 'absolute', bottom: 6, right: 6, zIndex: 6,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10,
    width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
  },
  imgDots: {
    position: 'absolute', bottom: 8, alignSelf: 'center', zIndex: 6,
    flexDirection: 'row', gap: 4,
  },
  imgDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  imgDotActive: { backgroundColor: COLORS.white, width: 8, height: 8, borderRadius: 4 },
  cardName: { fontSize: 13, color: COLORS.text, fontWeight: '600', marginTop: 4, marginBottom: 2, paddingHorizontal: 2 },
});
