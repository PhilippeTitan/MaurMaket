import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, type ViewStyle } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, TOUCH } from '../../theme';

interface Props {
  title: string;
  /** Optional right-side text action (e.g. "Change") */
  actionLabel?: string;
  onAction?: () => void;
  /** Optional helper line under the title */
  hint?: string;
  children: React.ReactNode;
  /** Remove the horizontal padding for full-bleed children (e.g. horizontal scrollers) */
  bleed?: boolean;
  style?: ViewStyle;
  /** Tighter top gap for the first section in a scroll view */
  first?: boolean;
}

/**
 * Consistent section wrapper: uppercase eyebrow label + optional action.
 * All checkout screens use it so the vertical rhythm is identical.
 */
export default function Section({ title, actionLabel, onAction, hint, children, bleed, style, first }: Props) {
  return (
    <View style={[styles.wrap, first && styles.first, style]}>
      <View style={styles.headRow}>
        <View style={styles.headCopy}>
          <Text style={styles.eyebrow}>{title}</Text>
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        </View>
        {actionLabel && onAction ? (
          <TouchableOpacity onPress={onAction} style={styles.action} accessibilityRole="button" accessibilityLabel={actionLabel} hitSlop={8}>
            <Text style={styles.actionText}>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={bleed ? undefined : styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: SPACING.xxl, gap: SPACING.md },
  first: { marginTop: SPACING.lg },
  headRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, gap: SPACING.md, minHeight: 20 },
  headCopy: { flex: 1, gap: SPACING.xxs },
  eyebrow: { fontSize: FONT_SIZES.sm, letterSpacing: 0.8, textTransform: 'uppercase', color: COLORS.text2, fontWeight: FONT_WEIGHTS.bold },
  hint: { fontSize: FONT_SIZES.sm, color: COLORS.text3 },
  action: { minHeight: 32, justifyContent: 'center', paddingHorizontal: SPACING.xs },
  actionText: { fontSize: FONT_SIZES.base, color: COLORS.coral, fontWeight: FONT_WEIGHTS.semibold },
  body: { paddingHorizontal: SPACING.lg },
});
