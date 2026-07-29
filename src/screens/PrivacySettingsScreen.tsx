import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { Icon } from '../components/icons/Icon';
import { COLORS, SPACING, RADIUS } from '../theme';
import { store } from '../store';
import { useUser } from '../hooks';
import ScreenHeader from '../components/ScreenHeader';
import { updateProfile } from '../api';
import { useTranslation } from '../i18n';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'PrivacySettings'>;

export default function PrivacySettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { user } = useUser();
  const [loading, setLoading] = useState(false);

  const handleToggleShowName = async () => {
    const newVal = !user?.show_real_name;
    setLoading(true);
    try {
      await updateProfile({ showRealName: String(newVal) });
      await store.setUser({ ...store.user!, show_real_name: newVal } as any, store.token!);
    } catch { /* silent */ }
    setLoading(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <ScreenHeader title="Privacy" onBack={() => navigation.goBack()} />

      <Text style={styles.sectionHeader}>Profile Visibility</Text>
      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <Icon name="account-outline" size={18} color={COLORS.text2} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Show my real name</Text>
            <Text style={styles.rowHint}>
              Your username is always public. Turning this on shows your real name on your profile.
            </Text>
          </View>
          <View style={styles.rowRight}>
            <TouchableOpacity
              style={[styles.toggle, user?.show_real_name && styles.toggleActive]}
              onPress={handleToggleShowName}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="toggle show real name"
              accessibilityState={{ checked: user?.show_real_name }}
            >
              <View style={[styles.toggleKnob, user?.show_real_name && styles.toggleKnobActive]} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingBottom: 20 },
  sectionHeader: {
    fontSize: 11, fontWeight: '700', color: COLORS.text2,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginHorizontal: SPACING.lg, marginTop: 20, marginBottom: 6,
  },
  card: {
    marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.card, overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  rowLabel: { flex: 1, fontSize: 14, color: COLORS.text, fontWeight: '500' },
  rowHint: { fontSize: 11, color: COLORS.text2, lineHeight: 15, marginTop: 2 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toggle: {
    width: 44, height: 26, borderRadius: RADIUS.card, padding: 2,
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border,
    justifyContent: 'center',
  },
  toggleActive: { backgroundColor: COLORS.green + '80', borderColor: COLORS.green },
  toggleKnob: { width: 20, height: 20, borderRadius: RADIUS.row, backgroundColor: COLORS.text2 },
  toggleKnobActive: { backgroundColor: '#fff', alignSelf: 'flex-end' },
});
