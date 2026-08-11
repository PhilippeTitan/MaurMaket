import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../theme';
import { completeDob } from '../api';
import { store } from '../store';
import type { User } from '../types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Props {
  visible: boolean;
  onCompleted: () => void;
}

export default function DobConfirmModal({ visible, onCompleted }: Props) {
  const [birthMonth, setBirthMonth] = useState<number | null>(null);
  const [birthDay, setBirthDay] = useState<number | null>(null);
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!birthMonth || !birthDay || !birthYear) {
      setError('Please enter your full date of birth');
      return;
    }
    const dob = new Date(birthYear, birthMonth - 1, birthDay);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    if (age < 18) {
      setError('You must be at least 18 years old');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const dobStr = `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`;
      const res = await completeDob(dobStr) as { user: User; token: string };
      await store.setUser(res.user, res.token);
      onCompleted();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save date of birth';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = birthMonth && birthDay && birthYear && !loading;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <MaterialCommunityIcons name="shield-lock-outline" size={40} color={COLORS.coral} />
          </View>
          <Text style={styles.title}>Confirm your age</Text>
          <Text style={styles.subtitle}>
            MaurMaket is for ages 18 and up. Please enter your date of birth to continue.
          </Text>

          <View style={styles.dobRow}>
            <View style={styles.dobCol}>
              <Text style={styles.dobLabel}>Month</Text>
              <ScrollView style={styles.dobScroll} showsVerticalScrollIndicator={false}>
                {MONTHS.map((m, i) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.dobItem, birthMonth === i + 1 && styles.dobItemActive]}
                    onPress={() => { setBirthMonth(i + 1); setError(''); }}
                  >
                    <Text style={[styles.dobItemText, birthMonth === i + 1 && styles.dobItemTextActive]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={styles.dobCol}>
              <Text style={styles.dobLabel}>Day</Text>
              <ScrollView style={styles.dobScroll} showsVerticalScrollIndicator={false}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.dobItem, birthDay === d && styles.dobItemActive]}
                    onPress={() => { setBirthDay(d); setError(''); }}
                  >
                    <Text style={[styles.dobItemText, birthDay === d && styles.dobItemTextActive]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={styles.dobCol}>
              <Text style={styles.dobLabel}>Year</Text>
              <ScrollView style={styles.dobScroll} showsVerticalScrollIndicator={false}>
                {Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i).map(y => (
                  <TouchableOpacity
                    key={y}
                    style={[styles.dobItem, birthYear === y && styles.dobItemActive]}
                    onPress={() => { setBirthYear(y); setError(''); }}
                  >
                    <Text style={[styles.dobItemText, birthYear === y && styles.dobItemTextActive]}>{y}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
          >
            <Text style={styles.submitBtnText}>{loading ? 'Saving…' : 'Continue'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  card: {
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.coral + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontFamily: 'Syne',
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.text2,
    textAlign: 'center',
    marginBottom: SPACING.lg,
    lineHeight: 20,
  },
  dobRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginBottom: SPACING.md,
  },
  dobCol: { flex: 1 },
  dobLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text2,
    textTransform: 'uppercase',
    marginBottom: 6,
    textAlign: 'center',
  },
  dobScroll: {
    maxHeight: 160,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.card,
  },
  dobItem: { paddingVertical: 10, alignItems: 'center' },
  dobItemActive: { backgroundColor: COLORS.coral + '18' },
  dobItemText: { fontSize: 15, color: COLORS.text2, fontWeight: '500' },
  dobItemTextActive: { color: COLORS.coral, fontWeight: '700' },
  error: { color: COLORS.coral, fontSize: 12.5, marginBottom: 8, textAlign: 'center' },
  submitBtn: {
    backgroundColor: COLORS.coral,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: RADIUS.pill,
    width: '100%',
    alignItems: 'center',
    marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
