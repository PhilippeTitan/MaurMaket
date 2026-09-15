import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Platform, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING, FONT_SIZES, FONT_WEIGHTS } from '../theme';

interface AuthMethodsCardProps {
  googleConnected?: boolean;
  compact?: boolean;
  onPasskeyEnroll?: () => void;
}

export default function AuthMethodsCard({ googleConnected = false, compact = false, onPasskeyEnroll }: AuthMethodsCardProps) {
  const [passkeyCount, setPasskeyCount] = useState<number | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    if (Platform.OS !== 'web') return;
    const { API_BASE } = require('../api');
    fetch(`${API_BASE.replace('/api', '')}/api/auth/list-sessions`, { method: 'GET' })
      .then(r => r.json())
      .then(() => setPasskeyCount(0))
      .catch(() => setPasskeyCount(0));
  }, []);

  return (
    <Animated.View style={[styles.card, compact && styles.compactCard, { opacity }]}>
      <View style={styles.headingRow}>
        <View style={styles.headingIcon}>
          <MaterialCommunityIcons name="shield-check-outline" size={16} color={COLORS.white} />
        </View>
        <View style={styles.headingText}>
          <Text style={styles.heading}>Sign-in options</Text>
          <Text style={styles.subtitle}>Use any method to access your account</Text>
        </View>
      </View>

      <View style={styles.methods}>
        {/* Email + Password */}
        <View style={styles.methodRow}>
          <View style={styles.methodIcon}>
            <MaterialCommunityIcons name="email-outline" size={18} color={COLORS.white} />
          </View>
          <View style={styles.methodCopy}>
            <Text style={styles.methodTitle}>Email and password</Text>
          </View>
          <View style={styles.statusChip}>
            <MaterialCommunityIcons name="check-circle" size={14} color={COLORS.green} />
            <Text style={[styles.statusText, { color: COLORS.green }]}>Active</Text>
          </View>
        </View>

        <View style={styles.methodDivider} />

        {/* Google */}
        <TouchableOpacity
          style={styles.methodRow}
          activeOpacity={0.6}
          onPress={() => {
            // Trigger Google OAuth flow
            const { API_BASE } = require('../api');
            window.location.href = `${API_BASE.replace('/api', '')}/api/auth/sign-in/google`;
          }}
        >
          <View style={styles.methodIcon}>
            <MaterialCommunityIcons name="google" size={18} color={COLORS.white} />
          </View>
          <View style={styles.methodCopy}>
            <Text style={styles.methodTitle}>Google</Text>
          </View>
          <View style={[styles.statusChip, { backgroundColor: googleConnected ? COLORS.greenMuted : COLORS.surface2, borderColor: googleConnected ? COLORS.green + '30' : COLORS.border }]}>
            <Text style={[styles.statusText, { color: googleConnected ? COLORS.green : COLORS.text3 }]}>
              {googleConnected ? 'Connected' : 'Connect'}
            </Text>
            {!googleConnected && (
              <MaterialCommunityIcons name="arrow-right" size={12} color={COLORS.text3} />
            )}
          </View>
        </TouchableOpacity>

        {/* Passkey — web only */}
        {Platform.OS === 'web' && (
          <>
            <View style={styles.methodDivider} />
            <View style={styles.methodRow}>
              <View style={styles.methodIcon}>
                <MaterialCommunityIcons name="fingerprint" size={18} color={COLORS.white} />
              </View>
              <View style={styles.methodCopy}>
                <Text style={styles.methodTitle}>Passkey</Text>
              </View>
              {passkeyCount === 0 || passkeyCount === null ? (
                <TouchableOpacity onPress={onPasskeyEnroll} style={styles.statusChip}>
                  <Text style={[styles.statusText, { color: COLORS.text3 }]}>Set up</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.statusChip}>
                  <MaterialCommunityIcons name="check-circle" size={14} color={COLORS.green} />
                  <Text style={[styles.statusText, { color: COLORS.green }]}>{passkeyCount} registered</Text>
                </View>
              )}
            </View>
          </>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    padding: SPACING.lg,
    marginTop: SPACING.md,
  },
  compactCard: { marginTop: SPACING.sm, padding: SPACING.md },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  headingIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.greenMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headingText: {
    flex: 1,
  },
  heading: {
    color: COLORS.text,
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
  },
  subtitle: {
    color: COLORS.text3,
    fontSize: FONT_SIZES.xs,
    marginTop: 2,
  },
  methods: {
    gap: 0,
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    gap: SPACING.md,
  },
  methodIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodCopy: {
    flex: 1,
  },
  methodTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.medium,
  },
  methodDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.xs,
    marginLeft: 36 + SPACING.md, // align with text, not icons
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.greenMuted,
  },
  statusText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});
