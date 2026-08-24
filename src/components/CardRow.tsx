import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Icon } from './icons/Icon';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS, TOUCH } from '../theme';

interface Props {
  /** Left icon name (MaterialCommunityIcons) */
  icon?: string;
  /** Icon color */
  iconColor?: string;
  /** Main label text */
  label: string;
  /** Secondary value text displayed on the right */
  value?: string | null;
  /** Value text color override */
  valueColor?: string;
  /** Optional right chevron */
  chevron?: boolean;
  /** Press handler — if omitted, row is non-interactive */
  onPress?: () => void;
  /** Additional style for the row container */
  style?: StyleProp<ViewStyle>;
  /** Show a divider below the row */
  divider?: boolean;
}

/**
 * Reusable card row for settings lists, detail pages, and menu items.
 *
 * Handles:
 * - 44px minimum touch target
 * - Consistent icon/label/value/chevron layout
 * - Interactive vs static variants
 *
 * Usage:
 * ```tsx
 * <CardRow icon="email-outline" label="Email" value={user.email} chevron onPress={goToEmail} />
 * <CardRow icon="logout" label="Log out" iconColor={COLORS.coral} onPress={logout} divider />
 * ```
 */
export default function CardRow({
  icon,
  iconColor = COLORS.text2,
  label,
  value,
  valueColor = COLORS.text2,
  chevron = false,
  onPress,
  style,
  divider = false,
}: Props) {
  const content = (
    <View style={[styles.row, style]}>
      {icon && (
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons name={icon as any} size={20} color={iconColor} />
        </View>
      )}
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.right}>
        {value && (
          <Text style={[styles.value, { color: valueColor }]} numberOfLines={1}>
            {value}
          </Text>
        )}
        {chevron && (
          <Icon name="chevron-right" size={16} color={COLORS.text3} />
        )}
      </View>
    </View>
  );

  if (divider) {
    return (
      <View>
        {onPress ? (
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={onPress}
            style={styles.touchable}
          >
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
    <TouchableOpacity
      activeOpacity={0.6}
      onPress={onPress}
      style={styles.touchable}
    >
      {content}
    </TouchableOpacity>
  ) : (
    content
  );
}

const styles = StyleSheet.create({
  touchable: {
    minHeight: TOUCH.min,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
  },
  iconContainer: {
    width: 28,
    alignItems: 'center',
  },
  label: {
    flex: 1,
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.text,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  value: {
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.regular,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: TOUCH.min,
  },
});
