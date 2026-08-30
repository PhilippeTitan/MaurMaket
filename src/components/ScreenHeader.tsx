import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  COLORS,
  SPACING,
  HEADER,
  FONT_SIZES,
  FONT_WEIGHTS,
  FONTS,
  TOUCH,
} from '../theme';
import BackButton from './BackButton';

interface Props {
  title: string;
  onBack?: () => void;
  /** Optional element rendered on the right side (e.g. an add/edit icon). */
  right?: React.ReactNode;
  /** Show a bottom border under the header. Defaults to true */
  bordered?: boolean;
  /** Use the larger branded ("Syne") title treatment for top-level screens. */
  variant?: 'default' | 'branded';
  /** Optional subtitle rendered below the title */
  subtitle?: string;
  /** Optional left element that replaces the back button area */
  left?: React.ReactNode;
  /** Override the default title font size (default: FONT_SIZES.xl = 16) */
  titleSize?: number;
  /** Override the default back arrow icon size (default: 20) */
  backSize?: number;
}

/**
 * Shared header with mathematically centered title.
 *
 * Uses absolute positioning for the title so it stays centered regardless of
 * asymmetric left/right action widths. Left and right slots are fixed
 * TOUCH.min (44px) containers to ensure symmetry.
 */
export default function ScreenHeader({
  title,
  onBack,
  right,
  bordered = true,
  variant = 'default',
  subtitle,
  left,
  titleSize,
  backSize,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        { paddingTop: insets.top + HEADER.topPad },
        bordered && styles.bordered,
      ]}
    >
      {/* Left slot — fixed width for symmetry */}
      <View style={styles.sideSlot}>
        {left || (onBack ? <BackButton onPress={onBack} size={backSize ?? 24} /> : null)}
      </View>

      {/* Title — absolutely centered in the full header width */}
      <View style={styles.titleContainer}>
        <Text
          style={variant === 'branded' ? styles.titleBranded : [styles.title, titleSize ? { fontSize: titleSize } : undefined]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      {/* Right slot — fixed width for symmetry */}
      <View style={styles.sideSlot}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.bg,
  },
  bordered: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sideSlot: {
    width: TOUCH.min,
    height: TOUCH.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: TOUCH.min + SPACING.sm,
  },
  title: {
    textAlign: 'center',
    fontSize: 20,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
  },
  titleBranded: {
    textAlign: 'center',
    fontFamily: FONTS.heading,
    fontSize: FONT_SIZES.title,
    fontWeight: FONT_WEIGHTS.extrabold,
    color: COLORS.text,
  },
  subtitle: {
    textAlign: 'center',
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.text2,
    marginTop: 2,
  },
});
