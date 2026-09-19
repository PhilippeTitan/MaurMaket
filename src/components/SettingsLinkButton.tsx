import React from 'react';
import { TouchableOpacity, Text, StyleSheet, type ViewStyle } from 'react-native';
import { ONBOARDING_COLORS } from '../screens/onboarding/theme';

interface SettingsLinkButtonProps {
  onPress: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  /** Destructive variant — coral border + text instead of neutral */
  danger?: boolean;
  /** Small variant for inline rows (height 36 instead of 52) */
  small?: boolean;
  style?: ViewStyle;
}

/**
 * The onboarding secondary action — bordered ghost pill. Used for
 * "Change location", "Back", "Decline"-style links on settings screens.
 */
export default function SettingsLinkButton({
  onPress,
  children,
  disabled = false,
  danger = false,
  small = false,
  style,
}: SettingsLinkButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={[styles.pill, small && styles.pillSmall, danger && styles.danger, disabled && styles.disabled, style]}
    >
      <Text style={[styles.text, small && styles.textSmall, danger && styles.dangerText]}>{children}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: 52,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: ONBOARDING_COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
  },
  pillSmall: {
    height: 36,
    alignSelf: 'auto',
    paddingHorizontal: 16,
  },
  textSmall: {
    fontSize: 13,
  },
  danger: {
    borderColor: ONBOARDING_COLORS.coral,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: 15,
    fontWeight: '600',
    color: ONBOARDING_COLORS.text,
  },
  dangerText: {
    color: ONBOARDING_COLORS.coral,
  },
});
