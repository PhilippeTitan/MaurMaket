import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Icon } from './icons/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../theme';

interface Props {
  onPress: () => void;
  color?: string;
  topOffset?: number;
  /** Button diameter — defaults to 36. Icon auto-sizes to 50%. */
  size?: number;
}

export default function FloatingBackButton({
  onPress,
  color = COLORS.white,
  topOffset = 12,
  size = 36,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <TouchableOpacity
      style={[
        styles.btn,
        { top: insets.top + topOffset, width: size, height: size, borderRadius: size / 2 },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Icon name="back" size={Math.round(size * 0.5)} color={color} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: 'absolute',
    left: 12,
    zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
