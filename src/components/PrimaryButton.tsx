import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ONBOARDING_COLORS, ONBOARDING_GRADIENT } from '../screens/onboarding/theme';

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
 * The onboarding primary CTA — 52px gradient pill (violet → pink → amber)
 * with dark text. The signature button of the app's auth experience, now
 * shared across settings screens.
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
      <LinearGradient
        colors={inactive ? ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.08)'] : [...ONBOARDING_GRADIENT]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.pill, small && styles.pillSmall, inactive && styles.pillDisabled]}
      >
        {loading ? (
          <ActivityIndicator color={ONBOARDING_COLORS.text} size="small" />
        ) : (
          <Text style={[styles.text, small && styles.textSmall, inactive && { color: ONBOARDING_COLORS.faint }]}>
            {children}
          </Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: 52,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
  },
  pillSmall: {
    height: 36,
    paddingHorizontal: 16,
    alignSelf: 'auto',
  },
  pillDisabled: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  text: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A0B12',
  },
  textSmall: {
    fontSize: 13,
  },
  smallWrap: {
    alignSelf: 'flex-start',
  },
});
