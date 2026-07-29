import React from 'react';
import { View, StyleSheet } from 'react-native';
import { COLORS } from '../theme';

interface StockBadgeProps {
  stock: number;
  size?: 'sm' | 'md';
}

export default function StockBadge({ stock, size = 'md' }: StockBadgeProps) {
  const isSoldOut = stock <= 0;
  const dotColor = isSoldOut ? COLORS.coral : COLORS.green;
  const isSm = size === 'sm';

  return (
    <View
      style={[styles.dot, isSm && styles.dotSm, { backgroundColor: dotColor }]}
      accessibilityLabel={isSoldOut ? 'Sold out' : `${stock} available`}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotSm: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
