import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../theme';

interface BackButtonProps {
  onPress: () => void;
  variant?: 'standard' | 'overlay';
  size?: number;
}

export default function BackButton({ onPress, variant = 'standard', size = 35 }: BackButtonProps) {
  const isOverlay = variant === 'overlay';
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={isOverlay ? styles.overlay : undefined}
      accessibilityLabel="Go back"
      accessibilityRole="button"
    >
      <MaterialCommunityIcons
        name="arrow-left"
        size={size}
        color={isOverlay ? COLORS.white : COLORS.text2}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
