import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS, TOUCH } from '../theme';

interface Props {
  /** Left icon name (MaterialCommunityIcons) */
  icon?: string;
  /** Icon color override */
  iconColor?: string;
  /** Background color for the icon container */
  iconBg?: string;
  /** Main label text */
  label: string;
  /** Optional subtitle below the label */
  subtitle?: string;
  /** Secondary value text displayed on the right */
  value?: string | null;
  /** Value text color override */
  valueColor?: string;
  /** Show a status chip instead of value text */
  chip?: { label: string; color: string; bgColor?: string };
  /** Optional right chevron */
  chevron?: boolean;
  /** Optional right element (replaces value + chevron) */
  rightElement?: React.ReactNode;
  /** Press handler — if omitted, row is non-interactive */
  onPress?: () => void;
  /** Additional style for the row container */
  style?: StyleProp<ViewStyle>;
  /** Show a divider below the row */
  divider?: boolean;
  /** Destructive row (coral accent for logout, delete, etc.) */
  destructive?: boolean;
}

/**
 * Premium settings row component.
 *
 * Features:
 * - 52px minimum touch target (exceeds WCAG 44px)
 * - 22px icons in 36px containers with optional background
 * - Subtitle support for multi-line descriptions
 * - Status chips for connected/available/not-set-up states
 * - Destructive variant for logout/delete actions
 * - No harsh borders — clean flat design
 */
export default function SettingsRow({
  icon,
  iconColor = COLORS.white,
  iconBg,
  label,
  subtitle,
  value,
  valueColor = COLORS.text3,
  chip,
  chevron = false,
  rightElement,
  onPress,
  style,
  divider = false,
  destructive = false,
}: Props) {
  const labelColor = destructive ? COLORS.coral : COLORS.text;
  const finalIconColor = destructive ? COLORS.coral : iconColor;

  const content = (
    <View style={[styles.row, style]}>
      {icon ? (
        <View style={[styles.iconContainer, iconBg ? { backgroundColor: iconBg } : null]}>
          <MaterialCommunityIcons name={icon as any} size={22} color={finalIconColor} />
        </View>
      ) : null}
      <View style={styles.textContainer}>
        <Text style={[styles.label, { color: labelColor }]} numberOfLines={1}>
          {label}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text>
        ) : null}
      </View>
      <View style={styles.right}>
        {chip ? (
          <View style={[styles.chip, { backgroundColor: chip.bgColor || chip.color + '18', borderColor: chip.color + '30' }]}>
            <Text style={[styles.chipText, { color: chip.color }]}>{chip.label}</Text>
          </View>
        ) : value ? (
          <Text style={[styles.value, { color: destructive ? COLORS.coral : valueColor }]} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        {rightElement || null}
        {chevron && !rightElement ? (
          <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text3} style={styles.chevron} />
        ) : null}
      </View>
    </View>
  );

  if (divider) {
    return (
      <View>
        {onPress ? (
          <TouchableOpacity activeOpacity={0.6} onPress={onPress}>
            {content}
          </TouchableOpacity>
        ) : (
          content
        )}
        <View style={styles.divider} />
      </View>
    );
  }

  return onPress ? (
    <TouchableOpacity activeOpacity={0.6} onPress={onPress}>
      {content}
    </TouchableOpacity>
  ) : content;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.text3,
    lineHeight: 15,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  value: {
    fontSize: FONT_SIZES.base,
    color: COLORS.text3,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  chipText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  chevron: {
    marginLeft: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginLeft: SPACING.md + 36 + SPACING.md, // align with label text
  },
});
