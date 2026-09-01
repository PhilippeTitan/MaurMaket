import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS, DURATION } from '../../theme';

interface Props {
  /** 1-based index of the current step */
  current: number;
  /** Step labels; length defines the segment count */
  labels: string[];
  /** Optional caption template. Defaults to "Step X of N" */
  caption?: string;
}

function Segment({ active, done }: { active: boolean; done: boolean }) {
  const fill = useSharedValue(done ? 1 : active ? 1 : 0);
  useEffect(() => {
    fill.value = withTiming(done || active ? 1 : 0, { duration: DURATION.slow, easing: Easing.out(Easing.cubic) });
  }, [active, done]);
  const style = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, active && !done && styles.fillCurrent, style]} />
    </View>
  );
}

/**
 * Slim segmented progress bar used across the checkout flow.
 * Replaces the circle stepper with a lighter, calmer indicator.
 */
export default function ProgressBar({ current, labels, caption }: Props) {
  const total = labels.length;
  const label = labels[Math.min(Math.max(current, 1), total) - 1] ?? '';
  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: total, now: current, text: label }}>
      <View style={styles.segments}>
        {labels.map((_, i) => (
          <Segment key={i} active={i + 1 === current} done={i + 1 < current} />
        ))}
      </View>
      <View style={styles.captionRow}>
        <Text style={styles.caption}>{caption ?? `Step ${current} of ${total}`}</Text>
        <Text style={styles.captionLabel} numberOfLines={1}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.xs, gap: SPACING.sm },
  segments: { flexDirection: 'row', gap: SPACING.xs },
  track: { flex: 1, height: 3, borderRadius: RADIUS.full, backgroundColor: COLORS.border, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: RADIUS.full, backgroundColor: COLORS.coral },
  fillCurrent: { backgroundColor: COLORS.coral },
  captionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: SPACING.sm },
  caption: { fontSize: FONT_SIZES.sm, color: COLORS.text3, fontWeight: FONT_WEIGHTS.medium },
  captionLabel: { fontSize: FONT_SIZES.sm, color: COLORS.text2, fontWeight: FONT_WEIGHTS.semibold, flexShrink: 1 },
});
