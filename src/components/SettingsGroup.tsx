import React from 'react';
import { View, Text, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../theme';

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
  accentColor = COLORS.coral,
}: Props) {
  return (
    <View style={[styles.container, style]}>
      {header ? (
        <View style={styles.headerRow}>
          {accentColor ? (
            <View style={[styles.accentDot, { backgroundColor: accentColor }]} />
          ) : null}
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
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },
  accentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  header: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text2,
    letterSpacing: 0.3,
  },
  description: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.text3,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    lineHeight: 16,
  },
  card: {
    marginHorizontal: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    // No borderWidth — clean flat design
  },
  footer: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.text3,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    lineHeight: 16,
  },
});
