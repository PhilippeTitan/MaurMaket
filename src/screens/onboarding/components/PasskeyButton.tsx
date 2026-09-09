import React, { useRef, useState } from 'react';
import { TouchableOpacity, Text, Animated, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { COLORS, RADIUS } from '../../../theme';
import { useTranslation } from '../../../i18n';
import { passkeyAuth, PasskeyUnavailableError } from '../../../api';
import { store } from '../../../store';
import type { User } from '../../../types';

function KeyMark({ size = 18, color = COLORS.coral }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="8" cy="8" r="4.2" stroke={color} strokeWidth={1.8} fill="none" />
      <Path d="M11 11l9 9M16.5 15.5l3-3M19 18l2-2" stroke={color} strokeWidth={1.8} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

interface PasskeyButtonProps {
  onAuthenticated?: () => void;
  label?: string;
}

export default function PasskeyButton({ onAuthenticated, label }: PasskeyButtonProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const press = useRef(new Animated.Value(1)).current;
  const animateTo = (v: number) => Animated.spring(press, { toValue: v, friction: 6, tension: 120, useNativeDriver: true }).start();

  const handlePress = async () => {
    setLoading(true);
    try {
      const res = await passkeyAuth() as { user: User; token: string };
      await store.setUser(res.user, res.token);
      onAuthenticated?.();
    } catch (err: unknown) {
      if (err instanceof PasskeyUnavailableError) {
        Alert.alert(t('auth.passkeyUnavailableTitle'), t('auth.passkeyUnavailableBody'));
      } else {
        const message = err instanceof Error ? err.message : 'Passkey sign-in failed';
        Alert.alert(t('common.error'), message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Animated.View style={{ transform: [{ scale: press }] }}>
      <TouchableOpacity
        onPress={handlePress}
        onPressIn={() => animateTo(0.97)}
        onPressOut={() => animateTo(1)}
        disabled={loading}
        activeOpacity={0.85}
        style={[styles.btn, loading && styles.disabled]}
        accessibilityRole="button"
        accessibilityLabel={label || t('auth.passkeySignIn')}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.coral} size="small" />
        ) : (
          <>
            <KeyMark />
            <Text style={styles.text}>{label || t('auth.passkeySignIn')}</Text>
          </>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    minHeight: 52, borderRadius: RADIUS.pill, borderWidth: 1.5, borderColor: COLORS.coralMuted,
    backgroundColor: 'rgba(255,77,106,0.06)',
  },
  disabled: { opacity: 0.5 },
  text: { color: COLORS.coral, fontSize: 15, fontWeight: '600' },
});
