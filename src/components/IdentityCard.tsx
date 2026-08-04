import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../theme';

interface IdentityCardProps {
  firstName: string;
  email: string;
  phone: string;
  hasPassword: boolean;
  progress: number; // 0–1
}

export default function IdentityCard({ firstName, email, phone, hasPassword, progress }: IdentityCardProps) {
  const initial = firstName ? firstName[0].toUpperCase() : '?';
  const circumference = 2 * Math.PI * 26;
  const dash = circumference * (1 - progress);

  return (
    <View style={styles.card}>
      <View style={styles.avatarWrap}>
        <View style={[styles.avatar, { borderColor: progress > 0 ? COLORS.coral : COLORS.border }]}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.progressRing}>
          <Text style={styles.progressPct}>{Math.round(progress * 100)}%</Text>
        </View>
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {firstName || 'Your profile'}
        </Text>
        <View style={styles.pills}>
          {email ? (
            <View style={styles.pill}>
              <MaterialCommunityIcons name="email-outline" size={10} color={COLORS.text2} />
              <Text style={styles.pillText} numberOfLines={1}>
                {email.length > 18 ? email.slice(0, 16) + '…' : email}
              </Text>
            </View>
          ) : null}
          {phone.length === 8 ? (
            <View style={styles.pill}>
              <MaterialCommunityIcons name="phone-outline" size={10} color={COLORS.text2} />
              <Text style={styles.pillText}>+509 {phone}</Text>
            </View>
          ) : null}
          {hasPassword ? (
            <View style={[styles.pill, { borderColor: COLORS.green }]}>
              <MaterialCommunityIcons name="shield-check-outline" size={10} color={COLORS.green} />
              <Text style={[styles.pillText, { color: COLORS.green }]}>secured</Text>
            </View>
          ) : null}
          {!email && !phone && !hasPassword ? (
            <Text style={styles.fillingText}>filling in as you go</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    padding: 14,
    marginTop: 18,
  },
  avatarWrap: {
    position: 'relative',
    width: 56,
    height: 56,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.surface2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: 'Syne',
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },
  progressRing: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: COLORS.coral,
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  progressPct: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontFamily: 'Syne',
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.text2,
  },
  fillingText: {
    fontSize: 12,
    color: COLORS.text2,
  },
});
