import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, Dimensions, ViewStyle } from 'react-native';
import { COLORS, RADIUS } from '../theme';

interface BlockProps {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

/**
 * A single pulsing placeholder rectangle. Building block for skeleton
 * screens — compose several of these to mimic a card/list-row layout.
 */
export function SkeletonBlock({ width = '100%', height = 16, radius = RADIUS.row, style }: BlockProps) {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.85, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius: radius, backgroundColor: COLORS.surface2, opacity },
        style,
      ]}
    />
  );
}

/**
 * Skeleton for a vertical list of rows with a leading thumbnail — used by
 * Orders, Inbox (conversations), and Notifications, which all share the
 * same "square thumb + two lines of text" row shape.
 */
export function RowListSkeleton({ count = 6, thumbSize = 56 }: { count?: number; thumbSize?: number }) {
  const items = Array.from({ length: count });
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
      {items.map((_, i) => (
        <View key={i} style={styles.row}>
          <SkeletonBlock width={thumbSize} height={thumbSize} radius={RADIUS.card} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <SkeletonBlock width="70%" height={14} />
            <SkeletonBlock width="45%" height={12} style={{ marginTop: 8 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

const { width: SCREEN_W } = Dimensions.get('window');

/**
 * Skeleton for a 2-column product grid (Explore screen). Renders `count`
 * fake cards so the layout looks populated immediately instead of showing
 * a bare spinner over an empty screen while the first request resolves.
 */
export function ProductGridSkeleton({ count = 6, columns = 2 }: { count?: number; columns?: number }) {
  const gap = 6;
  const sidePad = 8;
  const cardW = (SCREEN_W - sidePad * 2 - gap * (columns - 1)) / columns;
  const items = Array.from({ length: count });

  return (
    <View style={styles.grid}>
      {items.map((_, i) => (
        <View key={i} style={[styles.card, { width: cardW }]}>
          <SkeletonBlock width={cardW} height={Math.round(cardW * 1.25)} radius={RADIUS.media} />
          <SkeletonBlock width={cardW * 0.7} height={12} style={{ marginTop: 8 }} />
          <SkeletonBlock width={cardW * 0.4} height={12} style={{ marginTop: 6 }} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    gap: 6,
  },
  card: {
    marginBottom: 12,
  },
});
