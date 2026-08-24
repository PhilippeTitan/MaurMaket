import React from 'react';
import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../theme';

interface Props {
  children: React.ReactNode;
  /** Additional style for the card container */
  style?: StyleProp<ViewStyle>;
}

/**
 * Reusable card container for grouped settings rows.
 *
 * Provides consistent:
 * - Surface background color
 * - Border radius
 * - Border styling
 * - Overflow hidden for child dividers
 * - Horizontal margin from screen edge
 *
 * Usage:
 * ```tsx
 * <SettingsCard>
 *   <CardRow icon="email-outline" label="Email" value={email} chevron onPress={goEmail} divider />
 *   <CardRow icon="phone-outline" label="Phone" value={phone} chevron onPress={goPhone} />
 * </SettingsCard>
 * ```
 */
export default function SettingsCard({ children, style }: Props) {
  return (
    <View style={[styles.card, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.card,
    overflow: 'hidden',
  },
});
