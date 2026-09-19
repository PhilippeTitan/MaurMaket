import React from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { ONBOARDING_COLORS } from '../screens/onboarding/theme';

interface SettingsToggleProps {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  /** Accent color for the active state (defaults to mint) */
  accent?: string;
  /** Accessibility label — pass a translated t() value */
  accessibilityLabel?: string;
}

/**
 * The onboarding-style pill toggle — 44×26 track with a sliding knob.
 * Replaces the raw RN Switch across all settings screens for a consistent
 * look and feel.
 */
export default function SettingsToggle({
  value,
  onValueChange,
  disabled = false,
  accent = ONBOARDING_COLORS.mint,
  accessibilityLabel,
}: SettingsToggleProps) {
  return (
    <TouchableOpacity
      onPress={() => !disabled && onValueChange(!value)}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value }}
      style={[
        styles.track,
        value ? { backgroundColor: accent + '40', borderColor: accent } : styles.trackOff,
        disabled && styles.disabled,
      ]}
    >
      <View style={[styles.knob, value ? { backgroundColor: accent, alignSelf: 'flex-end' } : styles.knobOff]} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 44,
    height: 26,
    borderRadius: 999,
    padding: 2,
    borderWidth: 1,
    justifyContent: 'center',
  },
  trackOff: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: ONBOARDING_COLORS.border,
  },
  knob: {
    width: 20,
    height: 20,
    borderRadius: 999,
  },
  knobOff: {
    backgroundColor: ONBOARDING_COLORS.sub,
  },
  disabled: {
    opacity: 0.5,
  },
});
