import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, HEADER } from '../theme';
import BackButton from './BackButton';

interface Props {
  title: string;
  onBack?: () => void;
  /** Optional element rendered on the right side (e.g. an add/edit icon). */
  right?: React.ReactNode;
  /** Show a bottom border under the header. Defaults to true. */
  bordered?: boolean;
  /** Use the larger branded ("Syne") title treatment for top-level screens. */
  variant?: 'default' | 'branded';
}

/**
 * Shared header used across every non-tab screen: back arrow + centered-ish
 * title + optional right-side action. Handles safe-area top inset itself so
 * screens never need to hand-roll `insets.top + SPACING.md` again.
 */
export default function ScreenHeader({ title, onBack, right, bordered = true, variant = 'default' }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        { paddingTop: insets.top + HEADER.topPad },
        bordered && styles.bordered,
      ]}
    >
      {onBack ? (
        <BackButton onPress={onBack} />
      ) : (
        <View style={styles.backSpacer} />
      )}
      <Text
        style={variant === 'branded' ? styles.titleBranded : styles.title}
        numberOfLines={1}
      >
        {title}
      </Text>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.bg,
  },
  bordered: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backSpacer: { width: 35 },
  title: {
    flex: 1,
    fontSize: HEADER.titleSize,
    fontWeight: '700',
    color: COLORS.text,
  },
  titleBranded: {
    flex: 1,
    fontFamily: 'Syne',
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  right: {
    minWidth: 20,
    alignItems: 'flex-end',
  },
});
