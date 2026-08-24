import React from 'react';
import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../theme';

interface Props {
  children: React.ReactNode;
  /** Background color override. Defaults to COLORS.bg */
  backgroundColor?: string;
  /** Add bottom safe-area padding. Defaults to true */
  safeAreaBottom?: boolean;
  /** Add top safe-area padding. Defaults to false (ScreenHeader handles top) */
  safeAreaTop?: boolean;
  /** Additional style for the outer container */
  style?: StyleProp<ViewStyle>;
}

/**
 * Shared screen container that handles safe-area insets and background color.
 *
 * **Padding rule:** ScreenContainer controls ONLY structural layout (safe-area
 * insets, flex: 1, background). Content-level horizontal padding belongs to
 * the scrollable content (FlatList contentContainerStyle, ScrollView, etc.)
 * — never stack both.
 *
 * Usage:
 * ```tsx
 * <ScreenContainer>
 *   <ScreenHeader title="Settings" onBack={goBack} />
 *   <FlatList contentContainerStyle={{ paddingHorizontal: SPACING.lg }} ... />
 * </ScreenContainer>
 * ```
 */
export default function ScreenContainer({
  children,
  backgroundColor = COLORS.bg,
  safeAreaBottom = true,
  safeAreaTop = false,
  style,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor },
        safeAreaTop && { paddingTop: insets.top },
        safeAreaBottom && { paddingBottom: insets.bottom },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
});
