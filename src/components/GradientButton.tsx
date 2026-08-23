import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BUTTON_GRADIENT, RADIUS } from '../theme';

interface GradientButtonProps {
  onPress: () => void;
  children: string;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  borderRadius?: number;
  start?: { x: number; y: number };
  end?: { x: number; y: number };
}

export default function GradientButton({
  onPress,
  children,
  disabled = false,
  loading = false,
  style,
  textStyle,
  borderRadius = RADIUS.button,
  start = { x: 0, y: 0 },
  end = { x: 1, y: 0 },
}: GradientButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[styles.wrapper, style, (disabled || loading) && styles.disabled]}
    >
      <LinearGradient
        colors={BUTTON_GRADIENT}
        start={start}
        end={end}
        style={[styles.gradient, { borderRadius }]}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={[styles.text, textStyle]}>{children}</Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: RADIUS.button,
    overflow: 'hidden',
  },
  gradient: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: 52,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center' as const,
  },
  disabled: {
    opacity: 0.5,
  },
});
