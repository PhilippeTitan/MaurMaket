import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '../theme';

interface Props {
  onPress: () => void;
  color?: string;
  topOffset?: number;
}

export default function FloatingBackButton({ onPress, color = COLORS.white, topOffset = 12 }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <TouchableOpacity
      style={[styles.btn, { top: insets.top + topOffset }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <MaterialCommunityIcons name="arrow-left" size={18} color={color} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: 'absolute',
    left: 12,
    zIndex: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
