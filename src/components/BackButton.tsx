import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Icon } from './icons/Icon';
import { COLORS, RADIUS, TOUCH } from '../theme';

interface BackButtonProps {
  onPress: () => void;
  variant?: 'standard' | 'overlay';
  size?: number;
  style?: any;
}

/**
 * Shared back button with standard touch target and two variants:
 * - standard: for use in ScreenHeader (text-colored icon)
 * - overlay: for use on image/media backgrounds (white icon with dark scrim)
 */
export default function BackButton({ onPress, variant = 'standard', size = 20, style }: BackButtonProps) {
  const isOverlay = variant === 'overlay';
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={[isOverlay ? styles.overlay : styles.standard, style]}
      accessibilityLabel="Go back"
      accessibilityRole="button"
    >
      <Icon
        name="back"
        size={size}
        color={isOverlay ? COLORS.white : COLORS.text2}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  standard: {
    width: TOUCH.min,
    height: TOUCH.min,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    width: TOUCH.min,
    height: TOUCH.min,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
