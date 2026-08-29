import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions, RefreshControl } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS } from '../theme';
import { getImageUrl } from '../api';
import { getCardHeight as computeCardHeight, resolveImageSizes } from '../utils/imageDimensionCache';
import SalePriceTag from './SalePriceTag';
import StockBadge from './StockBadge';
import type { Product } from '../types';
import type { StyleProp, ViewStyle, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

const COL_GAP = 3;
const SIDE_PAD = 0;

interface MasonryGridProps {
  products: Product[];
  renderCard?: (item: Product, cardH: number, images: Product['images'], primaryUrl: string | undefined, hasMore: boolean, imgFailed: boolean) => React.ReactNode;
  columnGap?: number;
  contentFit?: 'cover' | 'contain';
  contentContainerStyle?: StyleProp<ViewStyle>;
  refreshControl?: React.ReactElement<React.ComponentProps<typeof RefreshControl>>;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onLongPress?: (item: Product) => void;
  onPress?: (item: Product) => void;
  ListEmptyComponent?: React.ReactNode;
  ListHeaderComponent?: React.ReactNode;
}

export default function MasonryGrid({
  products,
  renderCard,
  columnGap = COL_GAP,
  contentFit = 'contain',
  contentContainerStyle,
  refreshControl,
  onScroll,
  onLongPress,
  onPress,
  ListEmptyComponent,
  ListHeaderComponent,
}: MasonryGridProps) {
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const CARD_W = (SCREEN_W - SIDE_PAD * 2 - columnGap) / 2;
  const DEFAULT_IMG_H = Math.round(CARD_W * 1.25);
  const MIN_H = CARD_W * 0.6;
  const MAX_H = SCREEN_H * 0.52;

  const [imageSizes, setImageSizes] = useState<Record<string, { w: number; h: number }>>({});
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [imageIndices, setImageIndices] = useState<Record<string, number>>({});

  const getCardHeight = (p: Product) => computeCardHeight(p, CARD_W, MIN_H, MAX_H);

  const [leftCol, rightCol] = useMemo(() => {
    const cols: [Product[], Product[]] = [[], []];
    const heights = [0, 0];
    for (const item of products) {
      const target = heights[0] <= heights[1] ? 0 : 1;
      cols[target].push(item);
      heights[target] += getCardHeight(item) + columnGap;
    }
    return cols;
  }, [products, imageSizes]);

  const renderDefaultCard = (item: Product) => {
    const cardH = getCardHeight(item);
    const imgFailed = failedImages.has(item.id);
    const images = item.images && item.images.length > 0
      ? item.images
      : [{ id: 'empty', image_url: '', thumbnail_url: null, is_primary: true, display_order: 0 }];
    const hasMore = images.length > 1;
    const primaryUrl = getImageUrl(images.find(i => i.is_primary)?.thumbnail_url || images.find(i => i.is_primary)?.image_url || images[0]?.thumbnail_url || images[0]?.image_url);

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
            <View style={[styles.cardImgWrap, { height: cardH }]}>
              {hasMore && !imgFailed ? (
                <FlatListCarousel
                  images={images}
                  cardWidth={CARD_W}
                  cardHeight={cardH}
                  contentFit={contentFit}
                  onIndexChange={(idx) => setImageIndices(prev => ({ ...prev, [item.id]: idx }))}
                  currentIndex={imageIndices[item.id] ?? 0}
                  onImageError={() => setFailedImages(prev => new Set(prev).add(item.id))}
                />
              ) : primaryUrl && !imgFailed ? (
                <>
                  {contentFit === 'cover' && (
                    <ExpoImage source={{ uri: primaryUrl }} style={styles.cardImg} contentFit="cover" blurRadius={20} onError={() => setFailedImages(prev => new Set(prev).add(item.id))} cachePolicy="memory-disk" />
                  )}
                  <ExpoImage source={{ uri: primaryUrl }} style={StyleSheet.absoluteFill} contentFit={contentFit} onError={() => setFailedImages(prev => new Set(prev).add(item.id))} cachePolicy="memory-disk" />
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
            </View>
          </View>
        </TouchableOpacity>
        <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
      </View>
    );
  };

  if (products.length === 0 && ListEmptyComponent) {
    return <>{ListEmptyComponent}</>;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.gridContainer, contentContainerStyle]}
      onScroll={onScroll}
      refreshControl={refreshControl}
      showsVerticalScrollIndicator={false}
    >
      {ListHeaderComponent}
      <View style={styles.grid}>
        <View style={styles.column}>
          {leftCol.map(item => <React.Fragment key={item.id}>{renderDefaultCard(item)}</React.Fragment>)}
        </View>
        <View style={styles.column}>
          {rightCol.map(item => <React.Fragment key={item.id}>{renderDefaultCard(item)}</React.Fragment>)}
        </View>
      </View>
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
}: {
  images: any[];
  cardWidth: number;
  cardHeight: number;
  contentFit: string;
  onIndexChange: (idx: number) => void;
  currentIndex: number;
  onImageError: () => void;
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
          <TouchableOpacity key={String(img.id || idx)} activeOpacity={1} style={{ width: cardWidth, height: cardHeight }} accessibilityRole="image">
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
  grid: {
    flexDirection: 'row',
    paddingTop: SIDE_PAD,
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
