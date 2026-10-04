import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING } from '../../theme';

export interface ProfileSocialStat {
  key: string;
  value: number;
  label: string;
  accessibilityLabel: string;
  onPress?: () => void;
}

/** Instagram-style profile metrics: a bold count with a quiet label below it. */
export default function ProfileSocialStats({ stats }: { stats: ProfileSocialStat[] }) {
  return (
    <View style={styles.row}>
      {stats.map((stat) => {
        const content = (
          <>
            <Text style={styles.value} numberOfLines={1}>{stat.value.toLocaleString()}</Text>
            <Text style={styles.label} numberOfLines={1}>{stat.label}</Text>
          </>
        );
        return stat.onPress ? (
          <TouchableOpacity
            key={stat.key}
            style={styles.stat}
            onPress={stat.onPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={stat.accessibilityLabel}
          >
            {content}
          </TouchableOpacity>
        ) : (
          <View key={stat.key} style={styles.stat} accessible accessibilityLabel={stat.accessibilityLabel}>
            {content}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  stat: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 52, paddingHorizontal: SPACING.xs },
  value: { color: COLORS.text, fontSize: FONT_SIZES.xl, fontWeight: FONT_WEIGHTS.bold },
  label: { color: COLORS.text2, fontSize: FONT_SIZES.xs, marginTop: 2, textAlign: 'center' },
});
