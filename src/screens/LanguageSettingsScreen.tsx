import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import SettingsGroup from '../components/SettingsGroup';
import { i18n, useTranslation, type Language } from '@/localization';
import { store } from '../store';
import { updateProfile } from '../api';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'LanguageSettings'>;

const LANGUAGES: { code: Language; label: string; native: string; flag: string }[] = [
  { code: 'en', label: 'English', native: 'English', flag: '🇺🇸' },
  { code: 'ht', label: 'Kreyòl', native: 'Kreyòl Ayisyen', flag: '🇭🇹' },
  { code: 'fr', label: 'French', native: 'Français', flag: '🇫🇷' },
];

export default function LanguageSettingsScreen({ navigation }: Props) {
  const { t, language } = useTranslation();

  const handleSelect = async (code: Language) => {
    if (code === language) return;
    await i18n.setLanguage(code);
    if (store.user) {
      await store.setUser({ ...store.user, language: code } as any, store.token!);
      updateProfile({ language: code }).catch(() => {});
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('language.title')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View>
          <SettingsGroup
            header={t('language.select')}
            description={t('language.selectDesc')}
          >
            {LANGUAGES.map((lang, index) => {
              const isSelected = language === lang.code;
              return (
                <TouchableOpacity
                  key={lang.code}
                    style={[styles.langRow, index < LANGUAGES.length - 1 && styles.langDivider]}
                  activeOpacity={0.6}
                  onPress={() => handleSelect(lang.code)}
                >
                  <Text style={styles.flag}>{lang.flag}</Text>
                  <Text style={[styles.langName, isSelected && { color: COLORS.coral }]}>{lang.native}</Text>
                  {isSelected ? (
                    <View style={styles.checkCircle}>
                      <MaterialCommunityIcons name="check" size={14} color={COLORS.white} />
                    </View>
                  ) : (
                    <View style={styles.radio} />
                  )}
                </TouchableOpacity>
              );
            })}
          </SettingsGroup>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

/* ── Styles ──────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingBottom: SPACING.page },

  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    minHeight: 54,
  },
  langDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  flag: {
    fontSize: 22,
    width: 32,
    textAlign: 'center',
  },
  langName: {
    flex: 1,
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.text,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  bottomSpacer: {
    height: 60,
  },
});
