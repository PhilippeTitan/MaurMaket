import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { Icon } from '../components/icons/Icon';
import { COLORS, SPACING, RADIUS } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import { i18n, useTranslation, type Language } from '../i18n';
import { store } from '../store';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'LanguageSettings'>;

const LANGUAGES: { code: Language; label: string; native: string }[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'ht', label: 'Kreyòl', native: 'Kreyòl Ayisyen' },
  { code: 'fr', label: 'French', native: 'Français' },
];

export default function LanguageSettingsScreen({ navigation }: Props) {
  const { language } = useTranslation();

  const handleSelect = async (code: Language) => {
    if (code === language) return;
    await i18n.setLanguage(code);
    await store.setUser({ ...store.user! } as any, store.token!);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <ScreenHeader title="Language" onBack={() => navigation.goBack()} />

      <Text style={styles.sectionHeader}>Select Language</Text>
      <View style={styles.card}>
        {LANGUAGES.map((lang, i) => (
          <React.Fragment key={lang.code}>
            {i > 0 && <View style={styles.divider} />}
            <TouchableOpacity style={styles.row} onPress={() => handleSelect(lang.code)}>
              <Text style={styles.rowLabel}>{lang.native}</Text>
              {language === lang.code && (
                <Icon name="check-circle" size={20} color={COLORS.green} />
              )}
            </TouchableOpacity>
          </React.Fragment>
        ))}
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
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 13,
  },
  rowLabel: { flex: 1, fontSize: 15, color: COLORS.text, fontWeight: '500' },
  divider: { height: 1, backgroundColor: COLORS.border, marginLeft: 14 },
});
