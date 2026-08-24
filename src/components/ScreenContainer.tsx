import React from 'react';
import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '../theme';

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
  /** Content goes inside a scrollview-like padded area */
  padded?: boolean;
}

/**
 * Shared screen container that handles safe-area insets, background color,
 * and consistent padding across all screens.
 *
 * Usage:
 * ```tsx
 * <ScreenContainer>
 *   <ScreenHeader title="Settings" onBack={goBack} />
 *   <FlatList ... />
 * </ScreenContainer>
 * ```
 *
 * For screens with a fixed header + scrollable content:
 * ```tsx
 * <ScreenContainer>
 *   <ScreenHeader title="Settings" onBack={goBack} />
 *   <ScrollView contentContainerStyle={styles.scroll}>
 *     ...content
 *   </ScrollView>
 * </ScreenContainer>
 * ```
 */
export default function ScreenContainer({
  children,
  backgroundColor = COLORS.bg,
  safeAreaBottom = true,
  safeAreaTop = false,
  style,
  padded = false,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor },
        safeAreaTop && { paddingTop: insets.top },
        safeAreaBottom && { paddingBottom: insets.bottom },
        padded && styles.padded,
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
  padded: {
    paddingHorizontal: SPACING.lg,
  },
});
