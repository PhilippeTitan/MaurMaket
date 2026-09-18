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
  /** Icon name to render as a leading accent dot */
  accentIcon?: string;
  /** Accent color for the header icon dot */
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
  accentColor = ONBOARDING_COLORS.violet,
}: Props) {
  return (
    <View style={[styles.container, style]}>
      {header ? (
        <View style={styles.headerRow}>
          <View style={[styles.accentDot, { backgroundColor: accentColor }]} />
          <Text style={styles.header}>{header}</Text>
        </View>
      ) : null}
      {description ? (
        <Text style={styles.description}>{description}</Text>
      ) : null}
      <View style={[styles.card, cardStyle]}>
        {children}
      </View>
      {footer ? (
        <Text style={styles.footer}>{footer}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  accentDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    opacity: 0.9,
  },
  header: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: ONBOARDING_COLORS.sub,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
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
  footer: {
    fontSize: FONT_SIZES.xs,
    color: ONBOARDING_COLORS.faint,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    lineHeight: 16,
  },
});
