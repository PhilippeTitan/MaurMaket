import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Icon } from './icons/Icon';
import { COLORS } from '../theme';

interface BackButtonProps {
  onPress: () => void;
  variant?: 'standard' | 'overlay';
  size?: number;
  style?: any;
}

export default function BackButton({ onPress, variant = 'standard', size = 35, style }: BackButtonProps) {
  const isOverlay = variant === 'overlay';
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={[isOverlay ? styles.overlay : undefined, style]}
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
  overlay: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
