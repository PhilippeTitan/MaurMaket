import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../theme';

type SurfaceProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'default' | 'success' | 'info' | 'warning';
};

/** A quiet, consistently spaced surface for every stage of checkout. */
export function CheckoutSurface({ children, style, tone = 'default' }: SurfaceProps) {
  return <View style={[styles.surface, tone !== 'default' && styles[tone], style]}>{children}</View>;
}

export function CheckoutSection({ icon, title, detail }: { icon?: keyof typeof MaterialCommunityIcons.glyphMap; title: string; detail?: string }) {
  return (
    <View style={styles.section}>
      {icon ? <MaterialCommunityIcons name={icon} size={16} color={COLORS.coral} /> : null}
      <Text style={styles.sectionTitle}>{title}</Text>
      {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: RADIUS.card, borderWidth: 1, padding: SPACING.lg },
  success: { backgroundColor: COLORS.green + '0D', borderColor: COLORS.green + '40' },
  info: { backgroundColor: COLORS.blue + '0D', borderColor: COLORS.blue + '40' },
  warning: { backgroundColor: COLORS.yellow + '0D', borderColor: COLORS.yellow + '40' },
  section: { alignItems: 'center', flexDirection: 'row', gap: SPACING.xs, marginBottom: SPACING.sm },
  sectionTitle: { color: COLORS.text, flex: 1, fontSize: 12, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  sectionDetail: { color: COLORS.text2, fontSize: 12 },
});
