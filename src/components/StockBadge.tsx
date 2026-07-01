import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, RADIUS } from '../theme';
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

  let label: string;
  if (isSoldOut) {
    label = t('feed.soldOut');
  } else if (isOneLeft) {
    label = t('feed.oneLeft');
  } else {
    label = `${stock} ${t('feed.available').toLowerCase()}`;
  }

  const isSm = size === 'sm';

  return (
    <View style={[styles.badge, isSm && styles.badgeSm]}>
      <View style={[styles.dot, isSm && styles.dotSm, { backgroundColor: dotColor }]} />
      <Text style={[styles.text, isSm && styles.textSm]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: RADIUS.row,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeSm: {
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  dotSm: {
    width: 4,
    height: 4,
    borderRadius: 2,
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
