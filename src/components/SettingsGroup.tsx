import React from 'react';
import { View, Text, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../theme';
import { ONBOARDING_COLORS } from '../screens/onboarding/theme';

interface Props {
  /** Section header title — renders as a bold label above the group */
  header?: string;
  /** Optional description below the header */
  description?: string;
  /** Group content (typically SettingsRow components) */
  children: React.ReactNode;
  /** Optional footer text below the group */
  footer?: string;
  /** Additional style for the outer container */
  style?: StyleProp<ViewStyle>;
  /** Additional style for the card container */
  cardStyle?: StyleProp<ViewStyle>;
  /** Compact, flat list treatment used by the top-level settings screen. */
  appearance?: 'default' | 'minimal';
  /** @deprecated No longer rendered — accent dot removed from headers */
  accentIcon?: string;
  /** @deprecated No longer rendered — accent dot removed from headers */
  accentColor?: string;
}

/**
 * Premium settings group component.
 *
 * Renders a section with:
 * - Optional header with accent dot and description
 * - Card container with subtle background (no harsh borders)
 * - Optional footer text
 *
 * Replaces the old SettingsCard + SectionHeader pattern.
 *
 * Design principles:
 * - No borderWidth — uses background color for grouping
 * - Generous padding for breathing room
 * - Typography hierarchy: header (13px bold) > description (12px) > footer (11px)
 */
export default function SettingsGroup({
  header,
  description,
  children,
  footer,
  style,
  cardStyle,
  appearance = 'minimal',
}: Props) {
  return (
    <View style={[styles.container, appearance === 'minimal' && styles.minimalContainer, style]}>
      {header ? (
        <View style={styles.headerRow}>
          <Text style={[styles.header, appearance === 'minimal' && styles.minimalHeader]}>{header}</Text>
        </View>
      ) : null}
      {description && appearance !== 'minimal' ? (
        <Text style={styles.description}>{description}</Text>
      ) : null}
      <View style={[styles.card, appearance === 'minimal' && styles.minimalCard, cardStyle]}>
        {children}
      </View>
      {footer && appearance !== 'minimal' ? (
        <Text style={styles.footer}>{footer}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.xs,
  },
  minimalContainer: {
    marginBottom: SPACING.md,
  },
  headerRow: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },
  header: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: ONBOARDING_COLORS.sub,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  minimalHeader: {
    color: COLORS.text3,
    letterSpacing: 0.8,
    marginTop: SPACING.lg,
    marginBottom: SPACING.xs,
  },
  description: {
    fontSize: FONT_SIZES.xs,
    color: ONBOARDING_COLORS.faint,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    lineHeight: 16,
  },
  card: {
    marginHorizontal: SPACING.lg,
    backgroundColor: ONBOARDING_COLORS.surface,
    borderWidth: 1,
    borderColor: ONBOARDING_COLORS.border,
    borderRadius: RADIUS.card,
    overflow: 'hidden',
  },
  minimalCard: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
  },
  footer: {
    fontSize: FONT_SIZES.xs,
    color: ONBOARDING_COLORS.faint,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    lineHeight: 16,
  },
});
