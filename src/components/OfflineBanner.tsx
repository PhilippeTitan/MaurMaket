import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { network } from '../network';
import { COLORS, SPACING } from '../theme';
import { useTranslation } from '@/localization';
import { useReduceMotion } from '@/hooks/useReduceMotion';

export default function OfflineBanner() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [online, setOnline] = useState(network.isOnline);
  const reduceMotion = useReduceMotion();
  const opacity = useRef(new Animated.Value(online ? 0 : 1)).current;
  const translateY = useRef(new Animated.Value(online ? -40 : 0)).current;

  useEffect(() => {
    return network.onChange(setOnline);
  }, []);

  useEffect(() => {
    const toValue = online ? 0 : 1;
    const translateTo = online ? -40 : 0;
    if (reduceMotion) {
      opacity.setValue(toValue);
      translateY.setValue(translateTo);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, { toValue, duration: 250, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: translateTo, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [online, opacity, reduceMotion, translateY]);

  if (online) return null;

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          paddingTop: insets.top + SPACING.xs,
          opacity,
          transform: [{ translateY }],
        },
      ]}
      accessibilityRole="alert"
      accessibilityLabel={t('network.offline')}
    >
      <MaterialCommunityIcons name="wifi-off" size={14} color={COLORS.yellow} />
      <Text style={styles.text}>{t('network.offline')}</Text>
      <Text style={styles.subtext}>{t('network.cachedData')}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: '#2D2200',
    paddingBottom: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#5C4800',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.yellow,
  },
  subtext: {
    fontSize: 11,
    color: '#B8A040',
  },
});
