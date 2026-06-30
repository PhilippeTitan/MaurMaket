import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS } from '../theme';

interface Props {
  icon: string;
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Icon circle diameter. Defaults to 64 — use 56 for tighter list screens. */
  size?: number;
  /** Action button background color. Defaults to COLORS.coral. */
  actionColor?: string;
}

/**
 * Shared "nothing here yet" state: icon in a circle, bold message, optional
 * hint line, optional CTA button. Used by Wishlist, Addresses, Orders,
 * Payments, MeScreen tabs, Storefront, etc. so every empty state in the app
 * looks and feels the same.
 */
export default function EmptyState({ icon, title, hint, actionLabel, onAction, size = 64, actionColor = COLORS.coral }: Props) {
  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, { width: size, height: size, borderRadius: size / 2 }]}>
        <MaterialCommunityIcons name={icon as any} size={Math.round(size * 0.45)} color={COLORS.text2} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity style={[styles.action, { backgroundColor: actionColor }]} onPress={onAction}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40, gap: 8 },
  iconCircle: {
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 15, color: COLORS.text2, fontWeight: '600', textAlign: 'center' },
  hint: { fontSize: 12, color: COLORS.text2, opacity: 0.7, textAlign: 'center' },
  action: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: RADIUS.button,
  },
  actionText: { fontSize: 14, fontWeight: '700', color: COLORS.white },
});
