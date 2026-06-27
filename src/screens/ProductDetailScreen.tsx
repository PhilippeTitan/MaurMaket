import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, Image, TouchableOpacity, ScrollView, StyleSheet, Alert,
  ActivityIndicator, Dimensions, FlatList, Share,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, getDisplayName, getSellerAvatar } from '../theme';
import { createConversation, getProduct, getProducts, toggleWishlist, checkWishlist, getSellerReviews, getProductReviews, getImageUrl } from '../api';
import { store } from '../store';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import type { Product, Review } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ProductDetail'>;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SELLER_CARD = 80;
const GRID_GAP = 2;
const GRID_COLS = 2;
const SIDE_PAD = 2;
const GRID_CARD_W = (SCREEN_W - GRID_GAP * (GRID_COLS + 1) - SIDE_PAD * 2) / GRID_COLS;
const GRID_MIN_H = GRID_CARD_W * 0.7;
const GRID_MAX_H = SCREEN_H * 0.3;

export default function ProductDetailScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { productId } = route.params;
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [wishlisted, setWishlisted] = useState(false);
  const [sellerReviews, setSellerReviews] = useState<Review[]>([]);
  const [productReviews, setProductReviews] = useState<Review[]>([]);
  const [avgRating, setAvgRating] = useState(0);
  const [sellerProducts, setSellerProducts] = useState<Product[]>([]);
  const [categoryProducts, setCategoryProducts] = useState<Product[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [imageSizes, setImageSizes] = useState<Record<string, { w: number; h: number }>>({});
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await getProduct(productId) as { product: Product };
        const p = res.product;
        setProduct(p);

        try {
          const wlRes = await checkWishlist(productId) as { wishlisted: boolean };
          setWishlisted(wlRes.wishlisted);
        } catch { /* silent */ }

        if (p.seller_id) {
          try {
            const revRes = await getSellerReviews(p.seller_id) as {
              reviews: Review[];
              stats?: { avg_rating?: string | number };
              avg_rating?: string | number;
            };
            setSellerReviews(revRes.reviews || []);
            setAvgRating(Number(revRes.stats?.avg_rating ?? revRes.avg_rating ?? 0));
          } catch { /* silent */ }
        }

        try {
          const prodRevRes = await getProductReviews(productId) as { reviews?: Review[] };
          setProductReviews(prodRevRes.reviews || []);
        } catch { /* silent */ }

        setLoadingRelated(true);
        try {
          const relatedReqs: Promise<{ products: Product[] }>[] = [];
          const catName = typeof p.category === 'string'
            ? p.category
            : p.category?.name;
          if (p.seller_id) {
            relatedReqs.push(getProducts({ seller: p.seller_id, limit: '20' }) as Promise<{ products: Product[] }>);
          }
          if (catName) {
            relatedReqs.push(getProducts({ category: catName, limit: '20' }) as Promise<{ products: Product[] }>);
          }
          const results = await Promise.all(relatedReqs);
          if (p.seller_id && results[0]) {
            setSellerProducts(results[0].products.filter((pp: Product) => pp.id !== p.id).slice(0, 12));
          }
          if (catName && results[p.seller_id ? 1 : 0]) {
            const catProds = results[p.seller_id ? 1 : 0].products.filter((pp: Product) => pp.id !== p.id).slice(0, 9);
            setCategoryProducts(catProds);
            catProds.forEach((cp: Product) => {
              const url = getImageUrl(cp.images?.find(i => i.is_primary)?.image_url || cp.images?.[0]?.image_url);
              if (!url) return;
              Image.getSize(url, (w, h) => {
                if (mountedRef.current) {
                  setImageSizes(prev => ({ ...prev, [cp.id]: { w, h } }));
                }
              }, () => {});
            });
          }
        } catch { /* silent */ }
        setLoadingRelated(false);
      } catch {
        Alert.alert('Error', 'Product not found');
        navigation.goBack();
      }
      setLoading(false);
    })();
  }, [productId]);

  const handleWishlist = async () => {
    try {
      const res = await toggleWishlist(productId) as { wishlisted: boolean };
      setWishlisted(res.wishlisted);
    } catch { /* silent */ }
  };

  const handleAddToCart = async () => {
    if (!product) return;
    const result = await store.addToCart({
      id: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
      images: product.images,
      seller_id: product.seller_id,
      seller_name: product.seller?.full_name || null,
      store_name: product.seller?.store_name || null,
      stock: product.stock,
    });
    if (!result.added) {
      Alert.alert('Stock limit', result.reason === 'out-of-stock' ? 'This item is sold out.' : `Only ${result.stock} available.`);
      return;
    }
    Alert.alert('Added to Cart', 'Item added successfully', [
      { text: 'Continue Shopping', style: 'cancel' },
      { text: 'View Cart', onPress: () => navigation.navigate('Cart') },
    ]);
  };

  const handleMakeOffer = async () => {
    if (!product?.seller) return;
    try {
      const res = await createConversation({
        sellerId: product.seller_id,
        productId: product.id,
      }) as { conversationId: string };
      navigation.navigate('Chat', {
        conversationId: res.conversationId,
        otherUserName: getDisplayName(product.seller),
        draftOffer: {
          productId: product.id,
          productName: product.name,
          listPrice: product.price,
        },
      });
    } catch {
      Alert.alert('Message unavailable', 'Could not start negotiation right now.');
    }
  };

  const handleShare = async () => {
    if (!product) return;
    try {
      await Share.share({
        message: `Check out "${product.name}" on MaurMaket — Rs ${product.price.toLocaleString()}`,
      });
    } catch { /* silent */ }
  };

  const getItemImageUrl = (p: Product) => {
    const img = p.images?.find(i => i.is_primary) || p.images?.[0];
    return getImageUrl(img?.image_url);
  };

  const renderSellerCard = useCallback(({ item }: { item: Product }) => {
    const imgUrl = getItemImageUrl(item);
    return (
      <TouchableOpacity
        style={styles.sellerCard}
        activeOpacity={0.8}
        onPress={() => navigation.push('ProductDetail', { productId: item.id })}
      >
        {imgUrl ? (
          <Image source={{ uri: imgUrl }} style={styles.sellerCardImg} resizeMode="cover" />
        ) : (
          <View style={styles.sellerCardPlaceholder}>
            <MaterialCommunityIcons name="image-off-outline" size={16} color={COLORS.text2} />
          </View>
        )}
        <View style={styles.sellerCardPriceOverlay}>
          <Text style={styles.sellerCardPrice}>Rs {item.price.toLocaleString()}</Text>
        </View>
      </TouchableOpacity>
    );
  }, [navigation]);

  const renderCategoryGrid = useCallback((items: Product[]) => {
    const [leftCol, rightCol] = items.reduce<[Product[], Product[]]>(
      (acc, item, idx) => { acc[idx % 2 === 0 ? 0 : 1].push(item); return acc; },
      [[], []]
    );
    const getCardH = (item: Product) => {
      const size = imageSizes[item.id];
      if (size && size.w > 0) {
        return Math.max(GRID_MIN_H, Math.min(GRID_MAX_H, GRID_CARD_W * (size.h / size.w)));
      }
      return GRID_CARD_W;
    };
    const renderCard = (item: Product) => {
      const imgUrl = getItemImageUrl(item);
      const cardH = getCardH(item);
      return (
        <TouchableOpacity
          key={item.id}
          style={[styles.gridCard, { height: cardH }]}
          activeOpacity={0.82}
          onPress={() => navigation.push('ProductDetail', { productId: item.id })}
        >
          {imgUrl ? (
            <Image source={{ uri: imgUrl }} style={styles.gridCardImg} resizeMode="cover" />
          ) : (
            <View style={styles.gridCardPlaceholder}>
              <MaterialCommunityIcons name="image-off-outline" size={18} color={COLORS.text2} />
            </View>
          )}
          <View style={styles.gridPriceOverlay}>
            <Text style={styles.gridPriceText}>Rs {item.price.toLocaleString()}</Text>
          </View>
        </TouchableOpacity>
      );
    };
    return (
      <View style={styles.gridRow}>
        <View style={styles.gridCol}>{leftCol.map(renderCard)}</View>
        <View style={styles.gridCol}>{rightCol.map(renderCard)}</View>
      </View>
    );
  }, [navigation, imageSizes]);

  if (loading || !product) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.coral} /></View>;
  }

  const isOwnProduct = store.user?.id === product.seller_id;

  const allImages = product.images && product.images.length > 0
    ? product.images
    : [{ id: 'empty', image_url: '', is_primary: true, display_order: 0 }];

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Hero image carousel ── */}
        <View style={styles.hero}>
          <FlatList
            data={allImages}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
              setActiveImageIndex(index);
            }}
            renderItem={({ item }) => {
              const url = getImageUrl(item.image_url);
              return (
                <View style={{ width: SCREEN_W, height: SCREEN_H * 0.42 }}>
                  {url ? (
                    <Image source={{ uri: url }} style={styles.heroImg} resizeMode="cover" />
                  ) : (
                    <View style={styles.heroPlaceholder}>
                      <MaterialCommunityIcons name="image-off-outline" size={40} color={COLORS.text2} />
                    </View>
                  )}
                </View>
              );
            }}
          />
          {allImages.length > 1 && (
            <View style={styles.dotsRow}>
              {allImages.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i === activeImageIndex && styles.dotActive]}
                />
              ))}
            </View>
          )}
          <TouchableOpacity style={[styles.backBtn, { top: insets.top + 12 }]} onPress={() => navigation.goBack()}>
            <MaterialCommunityIcons name="arrow-left" size={18} color={COLORS.white} />
          </TouchableOpacity>
          {!isOwnProduct && (
            <TouchableOpacity style={[styles.wishlistBtn, { top: insets.top + 12 }]} onPress={handleWishlist}>
              <MaterialCommunityIcons
                name={wishlisted ? 'heart' : 'heart-outline'}
                size={18}
                color={wishlisted ? COLORS.coral : COLORS.white}
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.shareBtn, { top: insets.top + 12 }]} onPress={handleShare}>
            <MaterialCommunityIcons name="share-variant" size={16} color={COLORS.white} />
          </TouchableOpacity>
          <View style={styles.stockOverlay}>
            <View style={[styles.stockDot, { backgroundColor: product.stock > 0 ? COLORS.green : COLORS.coral }]} />
            <Text style={styles.stockOverlayText}>
              {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
            </Text>
          </View>
          <View style={styles.priceOverlay}>
            <Text style={styles.priceOverlayText}>Rs {product.price.toLocaleString()}</Text>
          </View>
        </View>

        {/* ── Seller row ── */}
        {product.seller && (
          <TouchableOpacity
            style={styles.sellerRow}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Storefront', { sellerId: product.seller_id })}
          >
            <View style={styles.sellerAvatar}>
              {getSellerAvatar(product.seller) ? (
                <Image
                  source={{ uri: getImageUrl(getSellerAvatar(product.seller)) || '' }}
                  style={styles.sellerAvatarImg}
                />
              ) : (
                <Text style={styles.sellerAvatarText}>{(getDisplayName(product.seller)).charAt(0)}</Text>
              )}
            </View>
            <View style={styles.sellerInfo}>
              <Text style={styles.sellerName}>{getDisplayName(product.seller)}</Text>
              {(typeof product.category === 'string' ? product.category : product.category?.name) && (
                <Text style={styles.sellerMeta}> · {typeof product.category === 'string' ? product.category : product.category?.name}</Text>
              )}
            </View>
            {(sellerReviews.length > 0 || productReviews.length > 0) && (
              <View style={styles.sellerRatingRow}>
                <MaterialCommunityIcons name="star" size={11} color={COLORS.yellow} />
                <Text style={styles.sellerRating}>{avgRating.toFixed(1)}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* ── Product name + description ── */}
        <View style={styles.infoBlock}>
          <Text style={styles.productName}>{product.name}</Text>
          {product.description ? (
            <Text style={styles.description}>{product.description}</Text>
          ) : null}
        </View>

        {/* ── Reviews section ── */}
        {productReviews.length > 0 && (
          <View style={styles.sectionBorder}>
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.sectionTitle}>Reviews</Text>
                <View style={styles.ratingBadge}>
                  <MaterialCommunityIcons name="star" size={10} color={COLORS.yellow} />
                  <Text style={styles.ratingBadgeText}>{avgRating.toFixed(1)}</Text>
                </View>
                <Text style={styles.reviewCount}>({productReviews.length})</Text>
              </View>
            </View>
            {productReviews.slice(0, 5).map(review => (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <View style={styles.reviewerRow}>
                    <View style={styles.reviewerAvatar}>
                      <Text style={styles.reviewerAvatarText}>
                        {(review.reviewer?.full_name || 'A').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.reviewerName}>{review.reviewer?.full_name || 'Anonymous'}</Text>
                      <Text style={styles.reviewDate}>{new Date(review.created_at).toLocaleDateString()}</Text>
                    </View>
                  </View>
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <MaterialCommunityIcons
                        key={star}
                        name={star <= review.rating ? 'star' : 'star-outline'}
                        size={12}
                        color={star <= review.rating ? COLORS.yellow : COLORS.text2}
                      />
                    ))}
                  </View>
                </View>
                {review.comment ? (
                  <Text style={styles.reviewComment}>{review.comment}</Text>
                ) : null}
                {review.seller_response ? (
                  <View style={styles.sellerResponse}>
                    <View style={styles.sellerResponseHeader}>
                      <MaterialCommunityIcons name="reply" size={12} color={COLORS.coral} />
                      <Text style={styles.sellerResponseLabel}>Seller reply</Text>
                    </View>
                    <Text style={styles.sellerResponseText}>{review.seller_response}</Text>
                  </View>
                ) : null}
              </View>
            ))}
            {productReviews.length > 5 && (
              <Text style={styles.seeAllReviews}>
                See all {productReviews.length} reviews
              </Text>
            )}
          </View>
        )}

        {/* ── More from seller ── */}
        {sellerProducts.length > 0 && (
          <View style={styles.sectionBorder}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>More from {getDisplayName(product.seller)}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Storefront', { sellerId: product.seller_id })}>
                <Text style={styles.sectionSeeAll}>See all</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={sellerProducts}
              renderItem={renderSellerCard}
              keyExtractor={item => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sellerScroll}
            />
          </View>
        )}

        {/* ── More in category — 2-col square grid ── */}
        {categoryProducts.length > 0 && (
          <View style={styles.sectionBorder}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                More in {typeof product.category === 'string' ? product.category : product.category?.name || 'this category'}
              </Text>
            </View>
            {renderCategoryGrid(categoryProducts)}
            <View style={{ height: GRID_GAP }} />
          </View>
        )}

        {loadingRelated && (
          <ActivityIndicator size="small" color={COLORS.coral} style={{ marginVertical: 16 }} />
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* ── Sticky bottom CTA ── */}
      <View style={styles.bottomBar}>
        {isOwnProduct ? (
          <TouchableOpacity
            style={styles.editListingBtn}
            onPress={() => navigation.navigate('EditListing', { productId: product.id })}
          >
            <MaterialCommunityIcons name="pencil-outline" size={16} color={COLORS.white} />
            <Text style={styles.editListingBtnText}>Edit Listing</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.ctaRow}>
            <TouchableOpacity
              style={[styles.offerBtn, product.stock <= 0 && styles.addBtnDisabled]}
              onPress={handleMakeOffer}
              disabled={product.stock <= 0}
            >
              <MaterialCommunityIcons name="tag-outline" size={17} color={COLORS.white} />
              <Text style={styles.offerBtnText}>Make Offer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.addBtn, product.stock <= 0 && styles.addBtnDisabled]}
              onPress={handleAddToCart}
              disabled={product.stock <= 0}
            >
              <MaterialCommunityIcons name="cart-plus" size={17} color={COLORS.white} />
              <Text style={styles.addBtnText}>
                {product.stock <= 0 ? 'Out of Stock' : 'Add to Cart'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loading: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 80 },

  /* Hero */
  hero: {
    width: SCREEN_W,
    height: SCREEN_H * 0.42,
    backgroundColor: COLORS.surface2,
    position: 'relative',
  },
  heroImg: { width: '100%', height: '100%' },
  heroPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backBtn: {
    position: 'absolute', top: 44, left: 10,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center',
  },
  wishlistBtn: {
    position: 'absolute', top: 44, right: 48,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center',
  },
  shareBtn: {
    position: 'absolute', top: 44, right: 10,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center',
  },
  stockOverlay: {
    position: 'absolute', bottom: 10, left: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  stockDot: { width: 5, height: 5, borderRadius: 2.5 },
  stockOverlayText: { fontSize: 10, color: COLORS.white, fontWeight: '600' },
  priceOverlay: {
    position: 'absolute', bottom: 10, right: 10,
    backgroundColor: COLORS.coral, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  priceOverlayText: { fontSize: 13, fontWeight: '800', color: COLORS.white },
  dotsRow: {
    position: 'absolute', bottom: 50, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 5,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: { backgroundColor: COLORS.white, width: 16 },

  /* Seller row */
  sellerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    paddingHorizontal: 12, paddingVertical: 11,
  },
  sellerAvatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: COLORS.coral, justifyContent: 'center', alignItems: 'center',
    overflow: 'hidden', flexShrink: 0,
  },
  sellerAvatarImg: { width: 30, height: 30 },
  sellerAvatarText: { color: COLORS.white, fontSize: 12, fontWeight: '700' },
  sellerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  sellerName: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  sellerMeta: { fontSize: 11, color: COLORS.text2 },
  sellerRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sellerRating: { fontSize: 11, color: COLORS.text2 },

  /* Product info */
  infoBlock: {
    paddingHorizontal: 12, paddingTop: 6, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  productName: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 4, lineHeight: 21 },
  description: { fontSize: 12, color: COLORS.text2, lineHeight: 18 },

  /* Reviews */
  ratingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: COLORS.surface2, borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  ratingBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.yellow },
  reviewCount: { fontSize: 11, color: COLORS.text2 },
  reviewCard: {
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  reviewHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  reviewerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  reviewerAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.coral, justifyContent: 'center', alignItems: 'center',
  },
  reviewerAvatarText: { fontSize: 11, fontWeight: '700', color: COLORS.white },
  reviewerName: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  reviewDate: { fontSize: 10, color: COLORS.text2, marginTop: 1 },
  starsRow: { flexDirection: 'row', gap: 1 },
  reviewComment: { fontSize: 12, color: COLORS.text2, marginTop: 6, lineHeight: 17 },
  sellerResponse: {
    marginTop: 6, marginLeft: 8, paddingLeft: 8,
    borderLeftWidth: 2, borderLeftColor: COLORS.coral,
  },
  sellerResponseHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  sellerResponseLabel: { fontSize: 10, fontWeight: '600', color: COLORS.coral },
  sellerResponseText: { fontSize: 11, color: COLORS.text2, lineHeight: 16 },
  seeAllReviews: {
    textAlign: 'center', fontSize: 12, color: COLORS.coral,
    fontWeight: '600', paddingVertical: 10,
  },

  /* Section wrapper */
  sectionBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },

  /* Section headers */
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 9,
  },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  sectionSeeAll: { fontSize: 11, color: COLORS.coral, fontWeight: '600' },

  /* Seller horizontal scroll — 80px square cards */
  sellerScroll: { paddingHorizontal: 12, paddingBottom: 12, gap: 6 },
  sellerCard: {
    width: SELLER_CARD, height: SELLER_CARD,
    borderRadius: 6, overflow: 'hidden',
    backgroundColor: COLORS.surface2, flexShrink: 0,
  },
  sellerCardImg: { width: '100%', height: '100%' },
  sellerCardPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sellerCardPriceOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 4, paddingVertical: 2,
  },
  sellerCardPrice: {
    color: COLORS.white, fontSize: 9, fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.85)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },

  /* Category 2-col square grid */
  gridRow: { flexDirection: 'row', gap: GRID_GAP, paddingHorizontal: SIDE_PAD },
  gridCol: { flex: 1, gap: GRID_GAP },
  gridCard: {
    backgroundColor: COLORS.surface2, overflow: 'hidden',
    borderRadius: 4,
  },
  gridCardImg: { width: '100%', height: '100%' },
  gridCardPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gridPriceOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 3, paddingVertical: 2,
  },
  gridPriceText: {
    color: COLORS.white, fontSize: 8, fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.85)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },

  /* Sticky bottom bar */
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 12, paddingTop: 8,
    paddingBottom: SPACING.xxl + 12,
    backgroundColor: COLORS.bg, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  addBtn: {
    flex: 1.15,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 10, backgroundColor: COLORS.coral,
  },
  ctaRow: { flexDirection: 'row', gap: 10 },
  offerBtn: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 10,
    backgroundColor: COLORS.blue,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  offerBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 13 },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 13 },
  ownProductRow: {
    padding: 10, borderRadius: 10, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center',
  },
  ownProductText: { color: COLORS.text2, fontWeight: '600', fontSize: 12 },
  editListingBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 10, backgroundColor: COLORS.blue,
  },
  editListingBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 13 },
});
