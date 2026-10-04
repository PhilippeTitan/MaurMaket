import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, View, type ViewStyle } from 'react-native';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, RADIUS } from '../theme';

interface PrimaryButtonProps {
  onPress: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  /** Small variant for inline CTAs (tier upgrade, etc.) */
  small?: boolean;
  /** Accessibility label — pass a translated t() value */
  accessibilityLabel?: string;
  style?: ViewStyle;
}

/**
 * Shared primary CTA with the app's coral accent and adaptive disabled state.
 */
export default function PrimaryButton({
  onPress,
  children,
  disabled = false,
  loading = false,
  small = false,
  accessibilityLabel,
  style,
}: PrimaryButtonProps) {
  const inactive = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={inactive}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[small && styles.smallWrap, style, inactive && { opacity: 0.7 }]}
    >
      <View style={[styles.pill, small && styles.pillSmall, inactive && styles.pillDisabled]}>
        {loading ? (
          <ActivityIndicator color={COLORS.black} size="small" />
        ) : (
          <Text style={[styles.text, small && styles.textSmall, inactive && { color: COLORS.text2 }]}>
            {children}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: 52,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.coral,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
  },
  pillSmall: {
    height: 44,
    paddingHorizontal: 16,
    alignSelf: 'auto',
  },
  pillDisabled: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface2,
  },
  text: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.black,
  },
  textSmall: {
    fontSize: FONT_SIZES.base,
  },
  smallWrap: {
    alignSelf: 'flex-start',
  },
});
