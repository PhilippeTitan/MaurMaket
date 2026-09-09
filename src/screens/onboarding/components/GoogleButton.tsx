import React, { useRef } from 'react';
import { TouchableOpacity, Text, Animated, StyleSheet, ActivityIndicator } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { COLORS, RADIUS } from '../../../theme';

function GoogleMark({ size = 19 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z" />
      <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <Path fill="#4CAF50" d="M24 44c5.4 0 10.3-2.1 14-5.4l-6.5-5.5C29.5 34.9 26.9 36 24 36c-5.3 0-9.6-3.3-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.5 5.5C39.9 37 44 31.4 44 24c0-1.2-.1-2.4-.4-3.5z" />
    </Svg>
  );
}

interface GoogleButtonProps {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
}

export default function GoogleButton({ onPress, loading, disabled, label = 'Continue with Google' }: GoogleButtonProps) {
  const press = useRef(new Animated.Value(1)).current;
  const animateTo = (v: number) => Animated.spring(press, { toValue: v, friction: 6, tension: 120, useNativeDriver: true }).start();

  return (
    <Animated.View style={{ transform: [{ scale: press }] }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={() => animateTo(0.97)}
        onPressOut={() => animateTo(1)}
        disabled={disabled || loading}
        activeOpacity={0.85}
        style={[styles.btn, (disabled || loading) && styles.disabled]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.text} size="small" />
        ) : (
          <>
            <GoogleMark />
            <Text style={styles.text}>{label}</Text>
          </>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    minHeight: 52, borderRadius: RADIUS.pill, borderWidth: 1.5, borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  disabled: { opacity: 0.5 },
  text: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
});
