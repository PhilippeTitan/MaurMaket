import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, Image as NativeImage, TouchableOpacity, ScrollView, StyleSheet, Alert,
  ActivityIndicator, Dimensions, Share, FlatList, Animated, Modal, Pressable,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Icon } from '../components/icons/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS, getDisplayName, formatPrice } from '../theme';
import { getProduct, getProducts, getSellerReviews, getProductReviews, getImageUrl, getFollowing, getCoPurchaseRecommendations, trackFeedEvent } from '../api';
import { store } from '../store';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import type { Product, Review } from '../types';
import { useTranslation } from '../i18n';
import { useToast } from '../components/Toast';
import SalePriceTag from '../components/SalePriceTag';
import BuyRow from '../components/BuyRow';
import FollowButton from '../components/FollowButton';
import UserAvatar from '../components/UserAvatar';
import BackButton from '../components/BackButton';
import { SkeletonBlock } from '../components/Skeleton';
import StockBadge from '../components/StockBadge';
import { queryClient, useLike, useWishlist } from '../hooks';
import ProductActionBar from '../components/ProductActionBar';
import MasonryGrid from '../components/MasonryGrid';

type Props = NativeStackScreenProps<RootStackParamList, 'ProductDetail'>;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SELLER_CARD = 80;
const SIDE_PAD = 2;
const HERO_MAX_H = SCREEN_H * 0.85;
const HERO_MIN_H = SCREEN_H * 0.45;
const HERO_DEFAULT_H = SCREEN_H * 0.65;

export default function ProductDetailScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { productId } = route.params;
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const { liked, likeCount, toggle: toggleLike } = useLike(productId);
  const { wishlisted, toggle: toggleWishlist } = useWishlist(productId);
  const [sellerReviews, setSellerReviews] = useState<Review[]>([]);
  const [productReviews, setProductReviews] = useState<Review[]>([]);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [avgRating, setAvgRating] = useState(0);
  const [categoryProducts, setCategoryProducts] = useState<Product[]>([]);
  const [coPurchaseProducts, setCoPurchaseProducts] = useState<Product[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [heroHeight, setHeroHeight] = useState(HERO_DEFAULT_H);
  const [storeTick, setStoreTick] = useState(0);
  const mountedRef = useRef(true);
  const flatListRef = useRef<FlatList>(null);
  const scrollRef = useRef<ScrollView>(null);
  const reviewsSectionRef = useRef<View>(null);

  // ── More menu (fanning animation) ──
  const [menuOpen, setMenuOpen] = useState(false);
  const fanProgress = useRef(new Animated.Value(0)).current;
  const iconScales = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;

  const openMenu = useCallback(() => {
    setMenuOpen(true);
    Animated.spring(fanProgress, { toValue: 1, useNativeDriver: false, tension: 120, friction: 12 }).start();
    iconScales.forEach((s, i) => {
      Animated.spring(s, { toValue: 1, useNativeDriver: false, tension: 120, friction: 12, delay: i * 50 }).start();
    });
  }, [fanProgress, iconScales]);

  const closeMenu = useCallback(() => {
    Animated.spring(fanProgress, { toValue: 0, useNativeDriver: false, tension: 120, friction: 14 }).start();
    iconScales.forEach(s => {
      Animated.spring(s, { toValue: 0, useNativeDriver: false, tension: 120, friction: 14 }).start();
    });
    setTimeout(() => setMenuOpen(false), 200);
  }, [fanProgress, iconScales]);

  const handleFeedback = async (eventType: 'relevant' | 'not_relevant') => {
    if (!product) return;
    closeMenu();
    try {
      await trackFeedEvent(product.id, eventType);
      if (eventType === 'not_relevant') {
        toast.show({ kind: 'info', title: 'Hidden', message: 'This product was hidden from your feed.' });
      }
    } catch {}
  };

  const handleMenuShare = async () => {
    if (!product) return;
    closeMenu();
    try {
      await Share.share({
        message: `Check out "${product.name}" on MaurMaket — ${formatPrice(product.effective_price ?? product.price)} G`,
      });
    } catch {}
  };

  const handleReport = () => {
    if (!product) return;
    closeMenu();
    Alert.alert(
      'Report Listing',
      'Why are you reporting this?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Spam', onPress: () => { trackFeedEvent(product.id, 'not_relevant').catch(() => {}); Alert.alert('Thanks', 'We\'ll review this listing.'); } },
        { text: 'Inappropriate', onPress: () => { trackFeedEvent(product.id, 'not_relevant').catch(() => {}); Alert.alert('Thanks', 'We\'ll review this listing.'); } },
        { text: 'Wrong category', onPress: () => { trackFeedEvent(product.id, 'not_relevant').catch(() => {}); Alert.alert('Thanks', 'We\'ll review this listing.'); } },
      ],
    );
  };

  useEffect(() => {
    mountedRef.current = true;
    const unsub = store.onChange(() => setStoreTick(t => t + 1));
    return () => { mountedRef.current = false; unsub(); };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const detailKey = ['product-detail', productId] as const;
        const cached = queryClient.getQueryData<{ product: Product }>(detailKey);
        if (cached?.product) {
          setProduct(cached.product);
          setLoading(false);
        }
        const res = await queryClient.fetchQuery({
          queryKey: detailKey,
          queryFn: () => getProduct(productId) as Promise<{ product: Product }>,
          staleTime: 5 * 60_000,
        });
        const p = res.product;
        setProduct(p);

        const postProduct: Promise<void>[] = [];

        if (p.seller_id) {
          postProduct.push(
            getSellerReviews(p.seller_id).then(revRes => {
              const r = revRes as { reviews: Review[]; stats?: { avg_rating?: string | number }; avg_rating?: string | number };
              if (mountedRef.current) {
                setSellerReviews(r.reviews || []);
                setAvgRating(Number(r.stats?.avg_rating ?? r.avg_rating ?? 0));
              }
            }).catch(() => {})
          );
          postProduct.push(
            getFollowing().then(folRes => {
              const list = (folRes as { following?: { seller_id: string }[] }).following || [];
              store.setFollowingList(list.map((f: any) => f.seller_id || f.id).filter(Boolean));
            }).catch(() => {})
          );
        }

        postProduct.push(
          getProductReviews(productId).then(prodRevRes => {
            const pr = prodRevRes as { reviews?: Review[] };
            if (mountedRef.current) {
              setProductReviews((pr.reviews || []).map((r: any) => ({
                ...r,
                reviewer: r.reviewer || {
                  full_name: r.reviewer_name,
                  avatar_url: r.reviewer_avatar,
                  username: r.reviewer_username,
                },
              })));
            }
          }).catch(() => {})
        );

        await Promise.all(postProduct);

        setLoadingRelated(true);
        try {
          const relatedReqs: Promise<{ products: Product[] }>[] = [
            queryClient.fetchQuery({
              queryKey: ['co-purchase-products', p.id],
              queryFn: () => getCoPurchaseRecommendations(p.id) as Promise<{ products: Product[] }>,
              staleTime: 5 * 60_000,
            }),
          ];
          const catName = typeof p.category === 'string'
            ? p.category
            : p.category?.name;
          if (p.seller_id) {
            relatedReqs.push(queryClient.fetchQuery({
              queryKey: ['seller-related-products', p.seller_id],
              queryFn: () => getProducts({ seller: p.seller_id, limit: '20' }) as Promise<{ products: Product[] }>,
              staleTime: 5 * 60_000,
            }));
          }
          if (catName) {
            relatedReqs.push(queryClient.fetchQuery({
              queryKey: ['category-related-products', catName],
              queryFn: () => getProducts({ category: catName, limit: '20' }) as Promise<{ products: Product[] }>,
              staleTime: 5 * 60_000,
            }));
          }
          const results = await Promise.all(relatedReqs);
          if (results[0]) setCoPurchaseProducts(results[0].products.slice(0, 8));
          const sellerOffset = 1;
          const categoryOffset = sellerOffset + (p.seller_id ? 1 : 0);
          if (catName && results[categoryOffset]) {
            let catProds = results[categoryOffset].products.filter((pp: Product) => pp.id !== p.id).slice(0, 12);
            // Mix in a few of the seller's latest products
            if (p.seller_id && results[sellerOffset]) {
              const sellerLatest = results[sellerOffset].products
                .filter((pp: Product) => pp.id !== p.id && !catProds.some((cp: Product) => cp.id === pp.id))
                .slice(0, 3);
              // Interleave: 1 seller item after every 3 category items
              const mixed: Product[] = [];
              let si = 0;
              for (let i = 0; i < catProds.length; i++) {
                mixed.push(catProds[i]);
                if ((i + 1) % 3 === 0 && si < sellerLatest.length) {
                  mixed.push(sellerLatest[si++]);
                }
              }
              while (si < sellerLatest.length) mixed.push(sellerLatest[si++]);
              catProds = mixed;
            }
            setCategoryProducts(catProds);
          }
        } catch { /* silent */ }
        setLoadingRelated(false);
      } catch {
        toast.error(t('common.error'), 'Product not found');
        navigation.goBack();
      }
      setLoading(false);
    })();
  }, [productId]);

  useEffect(() => {
    const imgs = product?.images;
    const img = imgs && imgs.length > 0 ? imgs[activeImageIndex] || imgs[0] : null;
    const url = img ? getImageUrl(img.image_url) : null;
    if (!url) { setHeroHeight(HERO_DEFAULT_H); return; }
    NativeImage.getSize(url, (w, h) => {
      if (!mountedRef.current || w === 0) return;
      const aspectH = (h / w) * SCREEN_W;
      setHeroHeight(Math.max(HERO_MIN_H, Math.min(HERO_MAX_H, aspectH)));
    }, () => { setHeroHeight(HERO_DEFAULT_H); });
  }, [activeImageIndex, product]);

  const handleShare = async () => {
    if (!product) return;
    try {
      await Share.share({
        message: `Check out "${product.name}" on MaurMaket — ${formatPrice(product.effective_price ?? product.price)} G`,
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
      <View>
        <TouchableOpacity
          style={styles.sellerCard}
          activeOpacity={0.8}
          onPress={() => navigation.push('ProductDetail', { productId: item.id })}
          accessibilityRole="button"
          accessibilityLabel={t('accessibility.viewProduct')}
        >
          {imgUrl ? (
            <ExpoImage source={{ uri: imgUrl }} style={styles.sellerCardImg} contentFit="cover" cachePolicy="memory-disk" />
          ) : (
            <View style={styles.sellerCardPlaceholder}>
              <Icon name="image-unavailable" size={16} color={COLORS.text2} />
            </View>
          )}
          <View style={styles.sellerCardPriceOverlay}>
            <SalePriceTag price={item.price} effectivePrice={item.effective_price ?? item.price} isOnSale={item.is_on_sale || false} discountPct={item.discount_pct || 0} size="sm" />
          </View>
        </TouchableOpacity>
        <ProductActionBar productId={item.id} variant="card" />
      </View>
    );
  }, [navigation]);

  if (loading || !product) {
    const { width: SCREEN_W } = Dimensions.get('window');
    const heroH = Math.round(SCREEN_W * 1.1);
    return (
      <View style={styles.loading}>
        {/* Hero image skeleton */}
        <SkeletonBlock width={SCREEN_W} height={heroH} radius={0} />
        {/* Seller row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 }}>
          <SkeletonBlock width={40} height={40} radius={20} />
          <View style={{ flex: 1, gap: 6 }}>
            <SkeletonBlock width="55%" height={14} />
            <SkeletonBlock width="35%" height={11} />
          </View>
          <SkeletonBlock width={70} height={30} radius={14} />
        </View>
        {/* Product name + description */}
        <View style={{ padding: 14, gap: 8 }}>
          <SkeletonBlock width="80%" height={18} />
          <SkeletonBlock width="100%" height={12} />
          <SkeletonBlock width="65%" height={12} />
        </View>
        {/* Action buttons row */}
        <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 14, marginTop: 8 }}>
          <SkeletonBlock width={44} height={44} radius={22} />
          <SkeletonBlock width={44} height={44} radius={22} />
        </View>
      </View>
    );
  }

  const isOwnProduct = store.user?.id === product.seller_id;

  const allImages = product.images && product.images.length > 0
    ? product.images
    : [{ id: 'empty', image_url: '', is_primary: true, display_order: 0 }];

  const heroUrl = getImageUrl(allImages[activeImageIndex]?.image_url);

  return (
    <View style={styles.container}>
      {/* ── Back button — always on top ── */}
      <View style={[styles.backBtn, { top: insets.top + 12 }]}>
        <BackButton onPress={() => navigation.goBack()} variant="overlay" />
      </View>

      {/* ── Everything scrolls together ── */}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero image — scrolls with content ── */}
        <View style={{ width: SCREEN_W, height: heroHeight, backgroundColor: COLORS.surface2, overflow: 'hidden' }}>
          {allImages.length > 1 ? (
            <ScrollView
              ref={flatListRef as any}
              horizontal
              pagingEnabled
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              style={{ width: SCREEN_W, height: heroHeight }}
              onMomentumScrollEnd={(e: any) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
                setActiveImageIndex(idx);
              }}
            >
              {allImages.map((img, idx) => {
                const url = getImageUrl(img.image_url);
                return (
                  <View key={String(img.id || idx)} style={{ width: SCREEN_W, height: heroHeight, backgroundColor: '#000' }}>
                    {url ? (
                      <>
                        <ExpoImage source={{ uri: url }} style={styles.mediaFill} contentFit="cover" blurRadius={30} cachePolicy="memory-disk" />
                        <ExpoImage source={{ uri: url }} style={styles.mediaContain} contentFit="contain" cachePolicy="memory-disk" />
                      </>
                    ) : (
                      <View style={styles.heroPlaceholder}>
                        <Icon name="image-unavailable" size={40} color={COLORS.text2} />
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          ) : heroUrl ? (
            <>
              <ExpoImage source={{ uri: heroUrl }} style={styles.mediaFill} contentFit="cover" blurRadius={30} cachePolicy="memory-disk" />
              <ExpoImage source={{ uri: heroUrl }} style={styles.mediaContain} contentFit="contain" cachePolicy="memory-disk" />
            </>
          ) : (
            <View style={styles.heroPlaceholder}>
              <Icon name="image-unavailable" size={40} color={COLORS.text2} />
            </View>
          )}
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
          <View style={styles.stockOverlay}>
            <StockBadge stock={product.stock} />
          </View>
          <View style={styles.priceOverlay}>
            <SalePriceTag price={product.price} effectivePrice={product.effective_price ?? product.price} isOnSale={product.is_on_sale || false} discountPct={product.discount_pct || 0} size="lg" />
          </View>
        </View>

        <View style={styles.contentSheet}>

          {/* ── Seller row ── */}
          {product.seller && (
            <View style={styles.sellerBlock}>
              {/* ── Action rail — like · reviews · bookmark · share ── */}
              {!isOwnProduct && (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => toggleLike()}
                    accessibilityRole="button"
                    accessibilityLabel={liked ? t('accessibility.unlike') : t('accessibility.like')}
                  >
                    <MaterialCommunityIcons
                      name={liked ? 'heart' : 'heart-outline'}
                      size={28}
                      color={liked ? COLORS.coral : COLORS.text}
                    />
                    {(Number(likeCount) || 0) > 0 && <Text style={styles.actionCount}>{Number(likeCount) || 0}</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => {
                      reviewsSectionRef.current?.measureLayout(
                        scrollRef.current as any,
                        (x, y) => scrollRef.current?.scrollTo({ y: y - 60, animated: true }),
                        () => {}
                      );
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('accessibility.viewReviews')}
                  >
                    <MaterialCommunityIcons name="comment-outline" size={28} color={COLORS.text} />
                    {(product.review_count || 0) > 0 && <Text style={styles.actionCount}>{product.review_count || 0}</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => toggleWishlist()}
                    accessibilityRole="button"
                    accessibilityLabel={wishlisted ? t('accessibility.unbookmark') : t('accessibility.bookmark')}
                  >
                    <MaterialCommunityIcons
                      name={wishlisted ? 'bookmark' : 'bookmark-outline'}
                      size={28}
                      color={wishlisted ? COLORS.coral : COLORS.text}
                    />
                  </TouchableOpacity>
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={openMenu}
                    accessibilityRole="button"
                    accessibilityLabel="More options"
                  >
                    <MaterialCommunityIcons name="dots-horizontal" size={28} color={COLORS.text} />
                  </TouchableOpacity>
                </View>
              )}
              {/* ── Avatar · Name · Follow ── */}
              <View style={styles.sellerRow}>
                <TouchableOpacity
                  style={styles.sellerLeft}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('Storefront', { sellerId: product.seller_id, preloadedSeller: product.seller })}
                  accessibilityRole="button"
                  accessibilityLabel={t('accessibility.visitStore')}
                >
                  <UserAvatar seller={product.seller} animated={true} />
                  <View style={styles.sellerInfo}>
                    <View style={styles.sellerNameRow}>
                      <Text style={styles.sellerName}>{getDisplayName(product.seller)}</Text>
                      {!isOwnProduct && product.seller_id && (
                        <FollowButton sellerId={product.seller_id} />
                      )}
                    </View>
                    <Text style={styles.sellerMeta}>
                      {avgRating.toFixed(1)} ★ · {product.seller?.sales_count ?? 0} sales
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* ── Trust Bar ── */}
              {product.seller && (
                <View style={styles.trustBar}>
                  {(product.seller.id_verification_result === 'verified' || product.seller.id_verified) && (
                    <View style={styles.trustPill}>
                      <MaterialCommunityIcons name="shield-check" size={12} color="#1D9E75" />
                      <Text style={styles.trustPillText}>Verified</Text>
                    </View>
                  )}
                  {product.seller.seller_tier === 'business' && (
                    <View style={styles.trustPill}>
                      <MaterialCommunityIcons name="office-building" size={12} color={COLORS.coral} />
                      <Text style={styles.trustPillText}>Business</Text>
                    </View>
                  )}
                  {avgRating >= 4 && (
                    <View style={styles.trustPill}>
                      <MaterialCommunityIcons name="star" size={12} color={COLORS.yellow} />
                      <Text style={styles.trustPillText}>{avgRating.toFixed(1)} rated</Text>
                    </View>
                  )}
                  <View style={styles.trustPill}>
                    <MaterialCommunityIcons name="shield-lock" size={12} color={COLORS.coral} />
                    <Text style={styles.trustPillText}>Protected payment</Text>
                  </View>
                  {product.seller.location_address && (
                    <View style={styles.trustPill}>
                      <MaterialCommunityIcons name="map-marker" size={12} color={COLORS.coral} />
                      <Text style={styles.trustPillText}>Meetup</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
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
            <View ref={reviewsSectionRef} style={styles.sectionBorder}>
              <View style={styles.sectionHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.sectionTitle}>{t('productDetail.reviews')}</Text>
                  <View style={styles.ratingBadge}>
                    <Icon name="rating" size={10} color={COLORS.yellow} />
                    <Text style={styles.ratingBadgeText}>{avgRating.toFixed(1)}</Text>
                  </View>
                  <Text style={styles.reviewCount}>({productReviews.length})</Text>
                </View>
              </View>
              {productReviews.slice(0, showAllReviews ? productReviews.length : 5).map(review => (
                <View key={review.id} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <View style={styles.reviewerRow}>
                      <View style={styles.reviewerAvatar}>
                        <Text style={styles.reviewerAvatarText}>
                          {(review.reviewer?.username || 'A').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.reviewerName}>{review.reviewer?.username ? `${review.reviewer.username}` : 'Anonymous'}</Text>
                        <Text style={styles.reviewDate}>{new Date(review.created_at).toLocaleDateString()}</Text>
                      </View>
                    </View>
                    <View style={styles.starsRow}>
                      {[1, 2, 3, 4, 5].map(star => (
                        <Icon
                          key={star}
                          name={star <= review.rating ? 'rating' : 'rate-this'}
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
                <TouchableOpacity
                  style={{ alignItems: 'center', paddingVertical: 10 }}
                  onPress={() => setShowAllReviews(!showAllReviews)}
                  accessibilityRole="button"
                  accessibilityLabel={showAllReviews ? 'Show fewer reviews' : t('accessibility.viewReviews')}
                >
                  <Text style={styles.seeAllReviews}>
                    {showAllReviews ? 'Show fewer reviews' : `${t('productDetail.reviews')} (${productReviews.length})`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── More from seller ── */}
          {coPurchaseProducts.length > 0 && (
            <View style={styles.sectionBorder}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Often bought together</Text>
              </View>
              <Text style={styles.sectionHint}>Based on completed purchases from MaurMaket shoppers.</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.sellerScroll, { gap: 10 }]}>
                {coPurchaseProducts.map(item => <View key={item.id} style={{ width: 130 }}>{renderSellerCard({ item })}</View>)}
              </ScrollView>
            </View>
          )}

          {/* ── More in category — with seller items mixed in ── */}
          {categoryProducts.length > 0 && (
            <View style={styles.sectionBorder}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  More in {typeof product.category === 'string' ? product.category : product.category?.name || 'this category'}
                </Text>
              </View>
              <MasonryGrid
                products={categoryProducts}
                standalone={false}
                onPress={(item) => navigation.push('ProductDetail', { productId: item.id })}
                contentFit="cover"
              />
            </View>
          )}

          {loadingRelated && (
            <ActivityIndicator size="small" color={COLORS.coral} style={{ marginVertical: 16 }} />
          )}

          <View style={{ height: 80 }} />
        </View>
      </ScrollView>

      {/* ── Sticky bottom CTA ── */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(16, insets.bottom + 12) }]}>
        <BuyRow product={product} navigation={navigation} />
      </View>

      {/* ── More menu (fanning animation) ── */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={closeMenu}>
        <Pressable style={styles.menuOverlay} onPress={closeMenu}>
          <Pressable style={styles.menuSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.menuHandle} />
            {[
              { icon: 'thumb-up-outline', color: COLORS.green, label: 'Show more like this', action: () => handleFeedback('relevant') },
              { icon: 'thumb-down-outline', color: COLORS.coral, label: 'Not interested', action: () => handleFeedback('not_relevant') },
              { icon: 'share-variant-outline', color: COLORS.blue, label: 'Share', action: handleMenuShare },
              { icon: 'flag-outline', color: COLORS.coral, label: 'Report', action: handleReport },
            ].map((item, i) => {
              const ty = iconScales[i].interpolate({ inputRange: [0, 1], outputRange: [30, 0] });
              return (
                <Animated.View key={item.label} style={{ opacity: iconScales[i], transform: [{ translateY: ty }] }}>
                  <TouchableOpacity style={styles.menuItem} onPress={item.action} accessibilityRole="button">
                    <MaterialCommunityIcons name={item.icon as any} size={20} color={item.color} />
                    <Text style={[styles.menuItemText, item.label === 'Report' && { color: COLORS.coral }]}>{item.label}</Text>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loading: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: {},

  backBtn: {
    position: 'absolute', left: 10, zIndex: 10,
  },
  heroImg: { width: '100%', height: '100%' },
  heroPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mediaFill: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    width: '100%', height: '100%',
    opacity: 0.4,
  },
  mediaContain: {
    width: '100%', height: '100%',
  },
  priceOverlay: {
    position: 'absolute', bottom: 10, right: 10,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: RADIUS.row,
    paddingHorizontal: 9, paddingVertical: 4, zIndex: 2,
  },
  stockOverlay: {
    position: 'absolute', bottom: 10, left: 10, zIndex: 2,
  },
  dotsRow: {
    position: 'absolute', bottom: 38, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 5, zIndex: 2,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: { backgroundColor: COLORS.white, width: 16 },

  /* Content sheet — scrolls over hero */
  contentSheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },

  /* Seller block */
  sellerBlock: {
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 10, paddingTop: 8, paddingBottom: 2,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 20,
  },
  actionCount: {
    fontSize: 14, fontWeight: '600', color: COLORS.text,
  },
  /* Seller row */
  sellerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10, gap: 10,
  },
  sellerLeft: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9,
  },
  sellerInfo: { flex: 1, minWidth: 0 },
  sellerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sellerName: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  sellerMeta: { fontSize: 12, color: COLORS.text2, marginTop: 2 },

  /* Trust bar */
  trustBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 10 },
  trustPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.border + '40' },
  trustPillText: { fontSize: 10, fontWeight: '600', color: COLORS.text2 },

  /* Product info */
  infoBlock: {
    paddingHorizontal: 14, paddingTop: 4, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  productName: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 6, lineHeight: 24 },
  description: { fontSize: 14, color: COLORS.text2, lineHeight: 20 },

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
  sectionHint: { fontSize: 12, color: COLORS.text2, paddingHorizontal: 12, paddingBottom: 10 },
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

  /* Sticky bottom bar */
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 12, paddingTop: 8,
    backgroundColor: COLORS.bg, borderTopWidth: 1, borderTopColor: COLORS.border,
  },

  /* More menu */
  menuOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12,
  },
  menuHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: 16,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14,
  },
  menuItemText: {
    fontSize: 15, fontWeight: '600', color: COLORS.text,
  },
});
