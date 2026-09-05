import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../theme';

interface AuthMethodsCardProps {
  googleConnected?: boolean;
  compact?: boolean;
}

export default function AuthMethodsCard({ googleConnected = false, compact = false }: AuthMethodsCardProps) {
  return (
    <View style={[styles.card, compact && styles.compactCard]}>
      <View style={styles.headingRow}>
        <MaterialCommunityIcons name="shield-check-outline" size={18} color={COLORS.green} />
        <Text style={styles.heading}>Sign-in options</Text>
      </View>
      <Text style={styles.subtitle}>Use either method to access your MaurMaket account.</Text>
      <View style={styles.methodRow}>
        <MaterialCommunityIcons name="email-outline" size={18} color={COLORS.text2} />
        <View style={styles.methodCopy}>
          <Text style={styles.methodTitle}>Email and password</Text>
          <Text style={styles.methodStatus}>Available</Text>
        </View>
        <MaterialCommunityIcons name="check-circle" size={17} color={COLORS.green} />
      </View>
      <View style={styles.methodRow}>
        <MaterialCommunityIcons name="google" size={18} color="#4285F4" />
        <View style={styles.methodCopy}>
          <Text style={styles.methodTitle}>Google</Text>
          <Text style={styles.methodStatus}>{googleConnected ? 'Connected' : 'Available'}</Text>
        </View>
        <MaterialCommunityIcons name={googleConnected ? 'check-circle' : 'arrow-right'} size={17} color={googleConnected ? COLORS.green : COLORS.text3} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  compactCard: { marginTop: SPACING.sm, padding: SPACING.sm + 2 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { color: COLORS.text, fontSize: 14, fontWeight: '800' },
  subtitle: { color: COLORS.text2, fontSize: 12, lineHeight: 17, marginTop: 5, marginBottom: 4 },
  methodRow: { flexDirection: 'row', alignItems: 'center', minHeight: 40, gap: 10 },
  methodCopy: { flex: 1 },
  methodTitle: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  methodStatus: { color: COLORS.text2, fontSize: 11, marginTop: 2 },
});
