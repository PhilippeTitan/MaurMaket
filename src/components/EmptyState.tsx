import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING, FONT_SIZES, FONT_WEIGHTS, ICON_SIZES, TOUCH } from '../theme';

interface Props {
  icon: string;
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Icon circle diameter. Defaults to 72 — use 56 for tighter list screens. */
  size?: number;
  /** Action button background color. Defaults to COLORS.coral. */
  actionColor?: string;
}

/**
 * Shared "nothing here yet" state: icon in a circle, bold message, optional
 * hint line, optional CTA button. Used by Wishlist, Addresses, Orders,
 * Payments, MeScreen tabs, Storefront, etc. so every empty state in the app
 * looks and feels the same.
 */
export default function EmptyState({
  icon,
  title,
  hint,
  actionLabel,
  onAction,
  size = ICON_SIZES.illustration,
  actionColor = COLORS.coral,
}: Props) {
  return (
    <View style={styles.container}>
      <View
        style={[
          styles.iconCircle,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      >
        <MaterialCommunityIcons
          name={icon as any}
          size={Math.round(size * 0.45)}
          color={COLORS.text2}
        />
      </View>
      <Text style={styles.title}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity
          style={[styles.action, { backgroundColor: actionColor }]}
          onPress={onAction}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: SPACING.xxxl * 2.5,
    paddingHorizontal: SPACING.xxxl,
    gap: SPACING.sm,
  },
  iconCircle: {
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.text,
    fontWeight: FONT_WEIGHTS.semibold,
    textAlign: 'center',
  },
  hint: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text2,
    textAlign: 'center',
    lineHeight: 20,
  },
  action: {
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.button,
    minHeight: TOUCH.min,
    justifyContent: 'center',
  },
  actionText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
  },
});
