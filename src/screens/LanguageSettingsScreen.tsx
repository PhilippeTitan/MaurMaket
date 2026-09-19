import React, { useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Animated,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import SettingsGroup from '../components/SettingsGroup';
import { i18n, useTranslation, type Language } from '@/localization';
import { store } from '../store';
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

  const anim = useRef({
    opacity: new Animated.Value(0),
    translateY: new Animated.Value(16),
  }).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(anim.opacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(anim.translateY, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleSelect = async (code: Language) => {
    if (code === language) return;
    await i18n.setLanguage(code);
    await store.setUser({ ...store.user! } as any, store.token!);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('language.title')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: anim.opacity, transform: [{ translateY: anim.translateY }] }}>
          <SettingsGroup
            header={t('language.select')}
            accentColor={COLORS.blue}
            description={t('language.selectDesc')}
          >
            {LANGUAGES.map((lang) => {
              const isSelected = language === lang.code;
              return (
                <TouchableOpacity
                  key={lang.code}
                  style={styles.langRow}
                  activeOpacity={0.6}
                  onPress={() => handleSelect(lang.code)}
                >
                  <Text style={styles.flag}>{lang.flag}</Text>
                  <View style={styles.langInfo}>
                    <Text style={[styles.langName, isSelected && { color: COLORS.blue }]}>{lang.native}</Text>
                    <Text style={styles.langSub}>{lang.label}</Text>
                  </View>
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
        </Animated.View>

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
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    minHeight: 60,
  },
  flag: {
    fontSize: 28,
  },
  langInfo: {
    flex: 1,
  },
  langName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.text,
  },
  langSub: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text2,
    marginTop: 1,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.blue,
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
