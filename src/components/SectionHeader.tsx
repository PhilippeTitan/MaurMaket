import React from 'react';
import { Text, StyleSheet } from 'react-native';
import {
  COLORS,
  SPACING,
  FONT_SIZES,
  FONT_WEIGHTS,
} from '../theme';

interface Props {
  title: string;
}

/**
 * Reusable section header for grouped settings/lists.
 *
 * Renders an uppercase, small, bold label with consistent
 * spacing from the card below.
 *
 * Usage:
 * ```tsx
 * <SectionHeader title="Account" />
 * <SettingsCard>...</SettingsCard>
 * ```
 */
export default function SectionHeader({ title }: Props) {
  return (
    <Text style={styles.header}>{title}</Text>
  );
}

const styles = StyleSheet.create({
  header: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text2,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
    marginBottom: SPACING.sm,
  },
});
