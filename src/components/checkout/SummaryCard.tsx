import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../../theme';

export interface SummaryRow {
  label: string;
  value: string;
  /** Tint both label and value (e.g. COLORS.green for a discount) */
  tone?: 'default' | 'success' | 'muted';
}

interface Props {
  rows: SummaryRow[];
  /** Emphasized final row rendered after a divider */
  total?: { label: string; value: string };
  style?: ViewStyle;
  /** Render without the surface card (for use inside another card) */
  flat?: boolean;
}

/**
 * Totals card shared by Cart, Checkout review, and NatCash order card.
 */
export default function SummaryCard({ rows, total, style, flat }: Props) {
  return (
    <View style={[!flat && styles.card, style]}>
      <View style={styles.rows}>
        {rows.map((row, i) => (
          <View key={`${row.label}-${i}`} style={styles.row}>
            <Text style={[styles.label, row.tone === 'success' && styles.success, row.tone === 'muted' && styles.muted]} numberOfLines={1}>{row.label}</Text>
            <Text style={[styles.value, row.tone === 'success' && styles.success, row.tone === 'muted' && styles.muted]}>{row.value}</Text>
          </View>
        ))}
      </View>
      {total ? (
        <>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.totalLabel}>{total.label}</Text>
            <Text style={styles.totalValue}>{total.value}</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.card, padding: SPACING.lg },
  rows: { gap: SPACING.sm + 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: SPACING.md },
  label: { flex: 1, fontSize: FONT_SIZES.base, color: COLORS.text2 },
  value: { fontSize: FONT_SIZES.base, color: COLORS.text, fontWeight: FONT_WEIGHTS.semibold },
  success: { color: COLORS.green },
  muted: { color: COLORS.text3 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.md },
  totalLabel: { fontSize: FONT_SIZES.md, color: COLORS.text, fontWeight: FONT_WEIGHTS.semibold },
  totalValue: { fontSize: FONT_SIZES.title, color: COLORS.text, fontWeight: FONT_WEIGHTS.extrabold, letterSpacing: -0.3 },
});
