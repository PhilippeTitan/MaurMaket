import React from 'react';
import { ScrollView, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, RADIUS, SPACING } from '../../theme';

interface Props {
  categories: string[];
  /** null means "All". */
  active: string | null;
  onChange: (category: string | null) => void;
  allLabel: string;
}

/**
 * Category chips above a seller's catalog, shown only when the catalog is big
 * and varied enough for filtering to help. "All" is always first and default.
 */
export default function CategoryFilterRow({ categories, active, onChange, allLabel }: Props) {
  const items: Array<{ key: string | null; label: string }> = [
    { key: null, label: allLabel },
    ...categories.map((c) => ({ key: c, label: c })),
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <TouchableOpacity
            key={item.key ?? '__all__'}
            style={[styles.chip, isActive && styles.chipActive]}
            onPress={() => onChange(item.key)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: isActive }}
          >
            <Text style={[styles.chipText, isActive && styles.chipTextActive]} numberOfLines={1}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.coralMuted,
    borderColor: COLORS.coral,
  },
  chipText: {
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.text2,
  },
  chipTextActive: { color: COLORS.coral },
});
