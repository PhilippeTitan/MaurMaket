import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions, RefreshControl } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS } from '../theme';
import { getImageUrl } from '../api';
import { getCardHeight as computeCardHeight, preloadProductDimensions } from '../utils/imageDimensionCache';
import SalePriceTag from './SalePriceTag';
import StockBadge from './StockBadge';
import type { Product } from '../types';
import type { StyleProp, ViewStyle, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

const COL_GAP = 6;
const SIDE_PAD = 0;

interface MasonryGridProps {
  products: Product[];
  renderCard?: (item: Product, cardH: number, images: Product['images'], primaryUrl: string | undefined, hasMore: boolean, imgFailed: boolean) => React.ReactNode;
  columnGap?: number;
  sidePad?: number;
  contentFit?: 'cover' | 'contain';
  contentContainerStyle?: StyleProp<ViewStyle>;
  refreshControl?: React.ReactElement<React.ComponentProps<typeof RefreshControl>>;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onLongPress?: (item: Product) => void;
  onPress?: (item: Product) => void;
  ListEmptyComponent?: React.ReactNode;
  ListHeaderComponent?: React.ReactNode;
  /** When false, renders just the grid columns (no ScrollView wrapper) for embedding in parent scroll contexts */
  standalone?: boolean;
  /** Expose computed CARD_W to parent */
  onCardWidth?: (cardWidth: number) => void;
  /** Additional content rendered inside each card's image area (for custom overlays like remove/cart buttons) */
  renderCardOverlay?: (item: Product) => React.ReactNode;
  /** Custom name row rendered below each card image (replaces default cardName text) */
  renderCardBottom?: (item: Product) => React.ReactNode;
}

export default function MasonryGrid({
  products,
  renderCard,
  columnGap = COL_GAP,
  sidePad = SIDE_PAD,
  contentFit = 'cover',
  contentContainerStyle,
  refreshControl,
  onScroll,
  onLongPress,
  onPress,
  ListEmptyComponent,
  ListHeaderComponent,
  standalone = true,
  onCardWidth,
  renderCardOverlay,
  renderCardBottom,
}: MasonryGridProps) {
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();

  // ── Pinterest algorithm: dynamic column count from available width ──
  const COLUMN_COUNT = SCREEN_W < 600 ? 2 : SCREEN_W < 900 ? 3 : 4;
  const CARD_W = (SCREEN_W - sidePad * 2 - columnGap * (COLUMN_COUNT - 1)) / COLUMN_COUNT;
  useEffect(() => { onCardWidth?.(CARD_W); }, [CARD_W]);
  const MIN_H = CARD_W * 0.6;
  const MAX_H = SCREEN_H * 0.52;
  const NAME_AREA_H = 52;

  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [imageIndices, setImageIndices] = useState<Record<string, number>>({});

  // ── Dim tick: forces re-render when async dimensions arrive ──
  const [dimTick, setDimTick] = useState(0);
  useEffect(() => {
    if (products.length === 0) return;
    preloadProductDimensions(products);
    let tick = 0;
    const interval = setInterval(() => {
      tick++;
      setDimTick(t => t + 1);
      if (tick >= 10) clearInterval(interval);
    }, 200);
    return () => clearInterval(interval);
  }, [products]);

  const getCardHeight = (p: Product, overrideW?: number) => {
    const w = overrideW ?? CARD_W;
    const h = computeCardHeight(p, w, MIN_H, MAX_H);
    // Landscape cards get extra minimum height to reduce gaps in the grid
    const pres = getImagePresentation(p);
    if (pres === 'landscape') {
      const landscapeMinH = CARD_W * 0.85;
      return Math.max(landscapeMinH, h);
    }
    return h;
  };

  /**
   * Three-tier presentation classification based on aspect ratio:
   * - portrait (ratio < 0.75): tall image, normal 1-column card
   * - flexible (0.75–1.70): near-square, contain + blurred background, 1-column
   * - landscape (ratio > 1.70): clearly wide, spans 2 columns
   */
  const getImagePresentation = (p: Product): 'portrait' | 'flexible' | 'landscape' => {
    const img = p.images?.find(i => i.is_primary) || p.images?.[0];
    let w = 0, h = 0;
    if (img?.image_width && img.image_height && img.image_width > 0) {
      w = img.image_width; h = img.image_height;
    } else {
      const cached = require('../utils/imageDimensionCache').getCachedSize(p.id);
      if (cached && cached.w > 0) { w = cached.w; h = cached.h; }
    }
    if (w === 0 || h === 0) return 'portrait'; // unknown → default portrait
    const ratio = w / h; // >1 = wide, <1 = tall
    if (ratio > 1.70) return 'landscape';
    if (ratio >= 0.75) return 'flexible';
    return 'portrait';
  };

  // ── Absolute-positioned masonry layout ──
  // Each item gets { item, x, y, w, h } — landscape items span 2 columns
  const layoutItems = useMemo(() => {
    const heights = new Array(COLUMN_COUNT).fill(0);
    const LANDSCAPE_W = CARD_W * 2 + columnGap;
    const items: Array<{ item: Product; x: number; y: number; w: number; h: number }> = [];
    for (const product of products) {
      if (getImagePresentation(product) === 'landscape' && COLUMN_COUNT >= 2) {
        // Find shortest pair of adjacent columns
        let bestStart = 0, bestSum = Infinity;
        for (let i = 0; i <= COLUMN_COUNT - 2; i++) {
          const pairSum = heights[i] + heights[i + 1];
          if (pairSum < bestSum) { bestSum = pairSum; bestStart = i; }
        }
        const h = getCardHeight(product, LANDSCAPE_W);
        const x = sidePad + bestStart * (CARD_W + columnGap);
        const y = Math.max(heights[bestStart], heights[bestStart + 1]);
        items.push({ item: product, x, y, w: LANDSCAPE_W, h });
        heights[bestStart] = y + h + NAME_AREA_H + columnGap;
        heights[bestStart + 1] = heights[bestStart];
      } else {
        let minIdx = 0;
        for (let i = 1; i < COLUMN_COUNT; i++) {
          if (heights[i] < heights[minIdx]) minIdx = i;
        }
        const h = getCardHeight(product);
        const x = sidePad + minIdx * (CARD_W + columnGap);
        const y = heights[minIdx];
        items.push({ item: product, x, y, w: CARD_W, h });
        heights[minIdx] = y + h + NAME_AREA_H + columnGap;
      }
    }
    return { items, totalHeight: Math.max(0, ...heights) };
  }, [products, dimTick, CARD_W, COLUMN_COUNT]);

  const renderDefaultCard = (item: Product, cardW: number, cardH: number) => {
    const imgFailed = failedImages.has(item.id);
    const presentation = getImagePresentation(item);
    const images = item.images && item.images.length > 0
      ? item.images
      : [{ id: 'empty', image_url: '', thumbnail_url: null, is_primary: true, display_order: 0 }];
    const hasMore = images.length > 1;
    const primaryUrl = getImageUrl(images.find(i => i.is_primary)?.thumbnail_url || images.find(i => i.is_primary)?.image_url || images[0]?.thumbnail_url || images[0]?.image_url);

    // Flexible mode: contain + blurred background always
    const useBlurredBg = presentation === 'flexible' || (contentFit === 'cover' && presentation !== 'flexible');
    const imageFit = presentation === 'flexible' ? 'contain' : contentFit;

    if (renderCard) {
      return (
        <View key={item.id}>
          {renderCard(item, cardH, images, primaryUrl ?? undefined, hasMore, imgFailed)}
        </View>
      );
    }

    return (
      <View key={item.id}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => onPress?.(item)}
          onLongPress={() => onLongPress?.(item)}
          delayLongPress={400}
          accessibilityRole="button"
          accessibilityLabel={item.name}
        >
          <View style={styles.card}>
            <View style={[styles.cardImgWrap, { height: cardH, width: cardW }]}>
              {hasMore && !imgFailed ? (
                <FlatListCarousel
                  images={images}
                  cardWidth={cardW}
                  cardHeight={cardH}
                  contentFit={imageFit}
                  onIndexChange={(idx) => setImageIndices(prev => ({ ...prev, [item.id]: idx }))}
                  currentIndex={imageIndices[item.id] ?? 0}
                  onImageError={() => setFailedImages(prev => new Set(prev).add(item.id))}
                  onPress={() => onPress?.(item)}
                />
              ) : primaryUrl && !imgFailed ? (
                <>
                  {useBlurredBg && (
                    <ExpoImage source={{ uri: primaryUrl }} style={styles.cardImg} contentFit="cover" blurRadius={20} onError={() => setFailedImages(prev => new Set(prev).add(item.id))} cachePolicy="memory-disk" />
                  )}
                  <ExpoImage source={{ uri: primaryUrl }} style={StyleSheet.absoluteFill} contentFit={imageFit} onError={() => setFailedImages(prev => new Set(prev).add(item.id))} cachePolicy="memory-disk" />
                </>
              ) : (
                <View style={styles.cardPlaceholder}>
                  <MaterialCommunityIcons name="image-off-outline" size={24} color={COLORS.text2} />
                </View>
              )}
              {hasMore && (
                <View style={styles.imgDots} pointerEvents="none">
                  {images.map((_, index) => (
                    <View key={index} style={[styles.imgDot, index === (imageIndices[item.id] || 0) && styles.imgDotActive]} />
                  ))}
                </View>
              )}
              <View style={styles.cardPriceTop} pointerEvents="none">
                <SalePriceTag price={item.price} effectivePrice={item.effective_price ?? item.price} isOnSale={item.is_on_sale || false} discountPct={item.discount_pct || 0} size="sm" />
              </View>
              <View style={styles.cardStockBadge} pointerEvents="none">
                <StockBadge stock={item.stock} size="sm" />
              </View>
              {renderCardOverlay?.(item)}
            </View>
          </View>
        </TouchableOpacity>
        {renderCardBottom ? renderCardBottom(item) : <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>}
      </View>
    );
  };

  if (products.length === 0 && ListEmptyComponent) {
    return <>{ListEmptyComponent}</>;
  }

  const gridContent = (
    <View style={[styles.absoluteGrid, { height: layoutItems.totalHeight, paddingLeft: sidePad, paddingRight: sidePad }]}>
      {layoutItems.items.map(({ item, x, y, w, h }) => (
        <View key={item.id} style={{ position: 'absolute', left: x, top: y, width: w }}>
          {renderDefaultCard(item, w, h)}
        </View>
      ))}
    </View>
  );

  if (!standalone) return gridContent;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.gridContainer, contentContainerStyle]}
      onScroll={onScroll}
      refreshControl={refreshControl}
      showsVerticalScrollIndicator={false}
    >
      {ListHeaderComponent}
      {gridContent}
    </ScrollView>
  );
}

function FlatListCarousel({
  images,
  cardWidth,
  cardHeight,
  contentFit,
  onIndexChange,
  currentIndex,
  onImageError,
  onPress,
}: {
  images: any[];
  cardWidth: number;
  cardHeight: number;
  contentFit: string;
  onIndexChange: (idx: number) => void;
  currentIndex: number;
  onImageError: () => void;
  onPress?: () => void;
}) {
  const ScrollView = require('react-native').ScrollView;

  return (
    <ScrollView
      horizontal
      pagingEnabled
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={(e: any) => {
        const idx = Math.round(e.nativeEvent.contentOffset.x / cardWidth);
        if (idx !== currentIndex) onIndexChange(idx);
      }}
    >
      {images.map((img: any, idx: number) => {
        const url = getImageUrl(img.thumbnail_url || img.image_url);
        return (
          <TouchableOpacity key={String(img.id || idx)} activeOpacity={1} onPress={onPress} style={{ width: cardWidth, height: cardHeight }} accessibilityRole="image">
            {url ? (
              <>
                {contentFit === 'cover' && (
                  <ExpoImage source={{ uri: url }} style={styles.cardImg} contentFit="cover" blurRadius={20} onError={onImageError} cachePolicy="memory-disk" />
                )}
                <ExpoImage source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit={contentFit as any} onError={onImageError} cachePolicy="memory-disk" />
              </>
            ) : (
              <View style={styles.cardPlaceholder}>
                <MaterialCommunityIcons name="image-off-outline" size={24} color={COLORS.text2} />
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export const masonryStyles = StyleSheet.create({
  container: { flex: 1 },
  gridContainer: { paddingBottom: 80 },
  absoluteGrid: {
    position: 'relative',
    width: '100%',
  },
  grid: {
    flexDirection: 'row',
    gap: COL_GAP,
  },
  column: {
    flex: 1,
    gap: COL_GAP,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.row,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardImgWrap: {
    width: '100%',
    backgroundColor: COLORS.surface2,
    position: 'relative',
  },
  cardImg: { width: '100%', height: '100%' },
  cardPlaceholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.surface2,
  },
  cardPriceTop: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  imgDots: {
    position: 'absolute', bottom: 8, alignSelf: 'center',
    flexDirection: 'row', gap: 4,
  },
  cardStockBadge: {
    position: 'absolute', bottom: 6, left: 6,
  },
  cardName: {
    color: COLORS.text, fontSize: 13, fontWeight: '500',
    marginTop: 6, marginBottom: 2, paddingHorizontal: 2,
  },
  imgDot: {
    width: 5, height: 5, borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  imgDotActive: {
    backgroundColor: COLORS.white,
  },
});

const styles = masonryStyles;
