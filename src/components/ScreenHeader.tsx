import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, HEADER, FONT_SIZES, FONT_WEIGHTS, FONTS, RADIUS, ICON_SIZES } from '../theme';
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
}

/**
 * Shared header used across every non-tab screen: back arrow + centered-ish
 * title + optional right-side action. Handles safe-area top inset itself so
 * screens never need to hand-roll `insets.top + SPACING.md` again.
 */
export default function ScreenHeader({
  title,
  onBack,
  right,
  bordered = true,
  variant = 'default',
  subtitle,
  left,
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
      {left || (onBack ? (
        <BackButton onPress={onBack} />
      ) : (
        <View style={styles.backSpacer} />
      ))}
      <View style={styles.titleContainer}>
        <Text
          style={variant === 'branded' ? styles.titleBranded : styles.title}
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
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.bg,
  },
  bordered: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backSpacer: { width: ICON_SIZES.xxl + SPACING.sm },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    textAlign: 'center',
    fontSize: FONT_SIZES.xl,
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
  right: {
    minWidth: ICON_SIZES.xxl + SPACING.sm,
    alignItems: 'flex-end',
  },
});
