import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../theme';
import { supabase } from '../supabase';

interface AuthMethodsCardProps {
  googleConnected?: boolean;
  compact?: boolean;
  onPasskeyEnroll?: () => void;
}

export default function AuthMethodsCard({ googleConnected = false, compact = false, onPasskeyEnroll }: AuthMethodsCardProps) {
  const [passkeyCount, setPasskeyCount] = useState<number | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    (supabase.auth as any).listFactors().then(({ data }: any) => {
      const webAuthnFactors = data?.totp?.filter((f: any) => f.factor_type === 'webauthn') ?? [];
      setPasskeyCount(webAuthnFactors.length);
    }).catch(() => setPasskeyCount(0));
  }, []);

  return (
    <View style={[styles.card, compact && styles.compactCard]}>
      <View style={styles.headingRow}>
        <MaterialCommunityIcons name="shield-check-outline" size={18} color={COLORS.green} />
        <Text style={styles.heading}>Sign-in options</Text>
      </View>
      <Text style={styles.subtitle}>Use any method to access your MaurMaket account.</Text>
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
      {Platform.OS === 'web' && (
        <View style={styles.methodRow}>
          <MaterialCommunityIcons name="fingerprint" size={18} color={COLORS.purple} />
          <View style={styles.methodCopy}>
            <Text style={styles.methodTitle}>Passkey</Text>
            <Text style={styles.methodStatus}>
              {passkeyCount === null ? 'Checking…' : passkeyCount > 0 ? `${passkeyCount} registered` : 'Not set up'}
            </Text>
          </View>
          {passkeyCount === 0 ? (
            <TouchableOpacity onPress={onPasskeyEnroll} style={styles.enrollBtn}>
              <Text style={styles.enrollBtnText}>Set up</Text>
            </TouchableOpacity>
          ) : (
            <MaterialCommunityIcons name="check-circle" size={17} color={COLORS.green} />
          )}
        </View>
      )}
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
  enrollBtn: {
    backgroundColor: COLORS.purple + '18',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.purple + '40',
  },
  enrollBtnText: { color: COLORS.purple, fontSize: 12, fontWeight: '700' },
});
