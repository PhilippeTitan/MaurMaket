import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getCategories, saveFeedTaste, skipFeedTaste } from '../api';
import { store } from '../store';
import { COLORS, RADIUS, SPACING } from '../theme';
import type { Category } from '../types';

export default function TasteOnboarding() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getCategories().then((res: any) => setCategories(res.categories || [])).catch(() => setCategories([]));
  }, []);

  const finish = async (skip = false) => {
    setSaving(true);
    try {
      if (skip) await skipFeedTaste();
      else await saveFeedTaste([...selected]);
      if (store.user) await store.setUser({ ...store.user, taste_onboarding_completed: true }, store.token);
    } finally {
      setSaving(false);
    }
  };

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <View style={styles.icon}><MaterialCommunityIcons name="sparkles" size={28} color={COLORS.coral} /></View>
          <Text style={styles.title}>Make your feed yours</Text>
          <Text style={styles.subtitle}>Choose at least 3 categories you want to discover. You can always change this through what you like and hide.</Text>
          <ScrollView contentContainerStyle={styles.chips} showsVerticalScrollIndicator={false}>
            {categories.length ? categories.map(category => {
              const active = selected.has(category.id);
              return <TouchableOpacity key={category.id} style={[styles.chip, active && styles.chipActive]} onPress={() => toggle(category.id)} accessibilityRole="checkbox" accessibilityState={{ checked: active }} accessibilityLabel={category.name}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{category.name}</Text>
                {active && <MaterialCommunityIcons name="check" size={16} color={COLORS.white} />}
              </TouchableOpacity>;
            }) : <ActivityIndicator color={COLORS.coral} style={styles.loader} />}
          </ScrollView>
          <TouchableOpacity disabled={selected.size < 3 || saving} style={[styles.primary, (selected.size < 3 || saving) && styles.primaryDisabled]} onPress={() => finish()} accessibilityRole="button" accessibilityLabel="Continue with selected categories">
            {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.primaryText}>{selected.size < 3 ? `Choose ${3 - selected.size} more` : 'Start exploring'}</Text>}
          </TouchableOpacity>
          <TouchableOpacity disabled={saving} style={styles.skip} onPress={() => finish(true)} accessibilityRole="button" accessibilityLabel="Skip choosing categories">
            <Text style={styles.skipText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', padding: SPACING.lg },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.card, padding: SPACING.xl, maxHeight: '84%', borderWidth: 1, borderColor: COLORS.border },
  icon: { width: 52, height: 52, borderRadius: 26, backgroundColor: `${COLORS.coral}18`, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md },
  title: { color: COLORS.text, fontSize: 24, fontWeight: '800' },
  subtitle: { color: COLORS.text2, fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: SPACING.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: SPACING.md },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: COLORS.coral, borderColor: COLORS.coral },
  chipText: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  chipTextActive: { color: COLORS.white },
  loader: { width: '100%', marginVertical: SPACING.xl },
  primary: { minHeight: 52, borderRadius: RADIUS.card, backgroundColor: COLORS.coral, alignItems: 'center', justifyContent: 'center', marginTop: SPACING.sm },
  primaryDisabled: { opacity: 0.45 },
  primaryText: { color: COLORS.white, fontWeight: '800', fontSize: 16 },
  skip: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  skipText: { color: COLORS.text2, fontWeight: '700', fontSize: 14 },
});
