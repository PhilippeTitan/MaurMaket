import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, ViewStyle } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useViewport } from '@/hooks';
import { useReduceMotion } from '@/hooks/useReduceMotion';

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
export function SkeletonBlock({
  width = '100%',
  height = 16,
  radius = RADIUS.row,
  style,
}: BlockProps) {
  const opacity = useRef(new Animated.Value(0.35)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(0.6);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 650,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduceMotion]);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius: radius,
          backgroundColor: COLORS.surface2,
          opacity,
        },
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
export function RowListSkeleton({
  count = 6,
  thumbSize = 56,
}: {
  count?: number;
  thumbSize?: number;
}) {
  const items = Array.from({ length: count });
  return (
    <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm }}>
      {items.map((_, i) => (
        <View key={i} style={styles.row}>
          <SkeletonBlock
            width={thumbSize}
            height={thumbSize}
            radius={RADIUS.card}
          />
          <View style={{ flex: 1, marginLeft: SPACING.md }}>
            <SkeletonBlock width="70%" height={14} />
            <SkeletonBlock
              width="45%"
              height={12}
              style={{ marginTop: SPACING.sm }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Skeleton for the product grid (Explore screen). Renders `count` fake cards so the
 * layout looks populated immediately instead of showing a bare spinner over an empty
 * screen while the first request resolves.
 *
 * The card size is read from the live window and the column count follows the same
 * breakpoints as the real grid (see MasonryGrid), so the placeholders are exactly the
 * size of the cards that replace them — on a phone, a fold, a tablet and a desktop
 * window alike — instead of the size of the window the app happened to boot in.
 */
export function ProductGridSkeleton({
  count = 6,
  columns,
}: {
  count?: number;
  columns?: number;
}) {
  const vp = useViewport();
  const colCount = columns ?? (vp.width < 600 ? 2 : vp.width < 900 ? 3 : 4);
  const gap = SPACING.sm;
  const sidePad = SPACING.sm;
  const cardW =
    (vp.width - sidePad * 2 - gap * (colCount - 1)) / colCount;
  const items = Array.from({ length: count });

  return (
    <View style={styles.grid}>
      {items.map((_, i) => (
        <View key={i} style={[styles.card, { width: cardW }]}>
          <SkeletonBlock
            width={cardW}
            height={Math.round(cardW * 1.25)}
            radius={RADIUS.media}
          />
          <SkeletonBlock
            width={cardW * 0.7}
            height={12}
            style={{ marginTop: SPACING.sm }}
          />
          <SkeletonBlock
            width={cardW * 0.4}
            height={12}
            style={{ marginTop: SPACING.xs }}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.sm,
    gap: SPACING.sm,
  },
  card: {
    marginBottom: SPACING.md,
  },
});
