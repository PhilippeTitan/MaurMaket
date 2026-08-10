import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../../../theme';

interface ReviewRowProps {
  label: string;
  value: string;
  muted?: boolean;
}

export default function ReviewRow({ label, value, muted }: ReviewRowProps) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={[styles.reviewValue, muted && { color: COLORS.text2 }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  reviewRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  reviewLabel: { color: COLORS.text2, fontSize: 13.5 },
  reviewValue: { color: COLORS.text, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
});
