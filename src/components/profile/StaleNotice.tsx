import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, RADIUS, SPACING } from '../../theme';
import { useReduceMotion } from '../../hooks';
import { useTranslation } from '@/localization';

interface Props {
  onRetry?: () => void;
}

/**
 * Quiet notice for a profile rendered from the offline snapshot: the content is
 * still useful, so it stays on screen — the label just says it may be out of
 * date and offers a retry.
 */
export default function StaleNotice({ onRetry }: Props) {
  const { t } = useTranslation();
  const reduceMotion = useReduceMotion();
  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      return;
    }
    Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [opacity, reduceMotion]);

  return (
    <Animated.View style={[styles.wrap, { opacity }]} accessibilityRole="alert">
      <MaterialCommunityIcons name="cloud-off-outline" size={15} color={COLORS.yellow} />
      <Text style={styles.text}>{t('profile.showingSaved')}</Text>
      {onRetry ? (
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={onRetry}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('common.retry')}
        >
          <Text style={styles.retryText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    marginBottom: SPACING.md,
  },
  text: { flex: 1, fontSize: FONT_SIZES.sm, color: COLORS.text2 },
  retryBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    minHeight: 36,
    justifyContent: 'center',
  },
  retryText: { fontSize: FONT_SIZES.sm, fontWeight: FONT_WEIGHTS.bold, color: COLORS.coral },
});
