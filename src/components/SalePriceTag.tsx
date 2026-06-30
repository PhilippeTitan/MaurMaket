import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../theme';

type Size = 'sm' | 'md' | 'lg';

interface SalePriceTagProps {
  price: number;
  effectivePrice: number;
  isOnSale: boolean;
  discountPct: number;
  size?: Size;
}

const SIZES = {
  sm: { saleFontSize: 13, origFontSize: 10, badgeFontSize: 9, badgePadH: 4, badgePadV: 1, badgeRadius: 4, gap: 4 },
  md: { saleFontSize: 17, origFontSize: 12, badgeFontSize: 10, badgePadH: 5, badgePadV: 2, badgeRadius: 6, gap: 6 },
  lg: { saleFontSize: 22, origFontSize: 14, badgeFontSize: 11, badgePadH: 7, badgePadV: 2, badgeRadius: 8, gap: 8 },
};

export default function SalePriceTag({ price, effectivePrice, isOnSale, discountPct, size = 'md' }: SalePriceTagProps) {
  const s = SIZES[size];

  if (!isOnSale) {
    return (
      <View style={styles.row}>
        <Text style={[styles.salePrice, { fontSize: s.saleFontSize }]}>
          Rs {price.toLocaleString()}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Text style={[styles.salePrice, { fontSize: s.saleFontSize }]}>
        Rs {effectivePrice.toLocaleString()}
      </Text>
      <Text style={[styles.originalPrice, { fontSize: s.origFontSize }]}>
        Rs {price.toLocaleString()}
      </Text>
      {discountPct > 0 && (
        <View style={[styles.badge, { paddingHorizontal: s.badgePadH, paddingVertical: s.badgePadV, borderRadius: s.badgeRadius }]}>
          <Text style={[styles.badgeText, { fontSize: s.badgeFontSize }]}>-{discountPct}%</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  salePrice: {
    color: COLORS.coral,
    fontWeight: '700',
  },
  originalPrice: {
    color: 'rgba(255,255,255,0.45)',
    textDecorationLine: 'line-through',
  },
  badge: {
    backgroundColor: 'rgba(0,229,160,0.18)',
  },
  badgeText: {
    color: '#00E5A0',
    fontWeight: '600',
  },
});
