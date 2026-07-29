import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../theme';
import { useTranslation } from '../i18n';

interface StockBadgeProps {
  stock: number;
  size?: 'sm' | 'md';
}

export default function StockBadge({ stock, size = 'md' }: StockBadgeProps) {
  const { t } = useTranslation();
  const isSoldOut = stock <= 0;
  const isOneLeft = stock === 1;
  const dotColor = isSoldOut ? COLORS.coral : COLORS.green;
  const isSm = size === 'sm';

  let label: string;
  if (isSoldOut) {
    label = t('feed.soldOut');
  } else if (isOneLeft) {
    label = `1 ${t('feed.oneLeft').toLowerCase()}`;
  } else {
    label = `${stock} ${t('feed.available').toLowerCase()}`;
  }

  return (
    <View style={[styles.badge, isSm && styles.badgeSm]} accessibilityLabel={isSoldOut ? 'Sold out' : `${stock} available`}>
      <View style={[styles.dot, isSm && styles.dotSm, { backgroundColor: dotColor }]} />
      <Text style={[styles.text, isSm && styles.textSm]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeSm: {
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotSm: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  text: {
    fontSize: 10,
    color: COLORS.white,
    fontWeight: '600',
  },
  textSm: {
    fontSize: 9,
  },
});
