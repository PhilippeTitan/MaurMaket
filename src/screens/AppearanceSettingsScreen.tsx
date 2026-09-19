import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import SettingsGroup from '../components/SettingsGroup';
import { useTranslation } from '@/localization';
import { useToast } from '../components/Toast';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'AppearanceSettings'>;

const ACCENT_COLORS = [
  { nameKey: 'appearance.colorCoral', value: '#FF4D6A' },
  { nameKey: 'appearance.colorOcean', value: '#00C2FF' },
  { nameKey: 'appearance.colorEmerald', value: '#00E5A0' },
  { nameKey: 'appearance.colorAmber', value: '#F59E0B' },
  { nameKey: 'appearance.colorLavender', value: '#8B5CF6' },
  { nameKey: 'appearance.colorRose', value: '#F472B6' },
];

const THEMES = [
  { key: 'dark', labelKey: 'appearance.themeDark', icon: 'moon-waning-crescent', descKey: 'appearance.themeDarkDesc' },
  { key: 'light', labelKey: 'appearance.themeLight', icon: 'white-balance-sunny', descKey: 'appearance.themeLightDesc' },
  { key: 'auto', labelKey: 'appearance.themeAuto', icon: 'theme-light-dark', descKey: 'appearance.themeAutoDesc' },
];

const APP_ICONS = [
  { key: 'default', labelKey: 'appearance.iconDefault', colors: ['#FF4D6A', '#E63354'] },
  { key: 'midnight', labelKey: 'appearance.iconMidnight', colors: ['#0D1117', '#161B22'] },
  { key: 'ocean', labelKey: 'appearance.iconOcean', colors: ['#00C2FF', '#0066CC'] },
  { key: 'forest', labelKey: 'appearance.iconForest', colors: ['#00E5A0', '#00A36C'] },
];

export default function AppearanceSettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [selectedTheme, setSelectedTheme] = useState('dark');
  const [selectedAccent, setSelectedAccent] = useState('#FF4D6A');
  const [selectedIcon, setSelectedIcon] = useState('default');

  // Staggered entrance
  const sections = useRef(
    Array.from({ length: 4 }, () => ({
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(16),
    }))
  ).current;

  useEffect(() => {
    Animated.stagger(60,
      sections.map(s =>
        Animated.parallel([
          Animated.timing(s.opacity, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(s.translateY, { toValue: 0, duration: 350, useNativeDriver: true }),
        ])
      )
    ).start();
  }, []);

  const animStyle = (i: number) => ({
    opacity: sections[i].opacity,
    transform: [{ translateY: sections[i].translateY }],
  });

  const handleSave = () => {
    // TODO: Persist to server (user preferences) and apply theme
    toast.show({ kind: 'success', title: t('appearance.saved') });
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('appearance.title')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Theme */}
        <Animated.View style={animStyle(0)}>
          <SettingsGroup header={t('appearance.theme')}>
            <View style={styles.themeGrid}>
              {THEMES.map(theme => (
                <TouchableOpacity
                  key={theme.key}
                  style={[
                    styles.themeCard,
                    selectedTheme === theme.key && { borderColor: COLORS.coral, backgroundColor: COLORS.coralMuted },
                  ]}
                  activeOpacity={0.6}
                  onPress={() => setSelectedTheme(theme.key)}
                >
                  <View style={[
                    styles.themeIcon,
                    selectedTheme === theme.key && { backgroundColor: COLORS.coral + '30' },
                  ]}>
                    <MaterialCommunityIcons
                      name={theme.icon as any}
                      size={24}
                      color={selectedTheme === theme.key ? COLORS.coral : COLORS.text2}
                    />
                  </View>
                  <Text style={[
                    styles.themeLabel,
                    selectedTheme === theme.key && { color: COLORS.coral, fontWeight: FONT_WEIGHTS.semibold },
                  ]}>{t(theme.labelKey)}</Text>
                  <Text style={styles.themeDesc}>{t(theme.descKey)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </SettingsGroup>
        </Animated.View>

        {/* Accent Color */}
        <Animated.View style={animStyle(1)}>
          <SettingsGroup header={t('appearance.accentColor')}>
            <View style={styles.colorGrid}>
              {ACCENT_COLORS.map(color => (
                <TouchableOpacity
                  key={color.value}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: color.value + '20' },
                    selectedAccent === color.value && {
                      borderColor: color.value,
                      borderWidth: 2,
                      transform: [{ scale: 1.05 }],
                    },
                  ]}
                  activeOpacity={0.6}
                  onPress={() => setSelectedAccent(color.value)}
                >
                  <View style={[styles.colorDot, { backgroundColor: color.value }]} />
                  <Text style={[
                    styles.colorName,
                    selectedAccent === color.value && { color: color.value, fontWeight: FONT_WEIGHTS.semibold },
                  ]}>{t(color.nameKey)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </SettingsGroup>
        </Animated.View>

        {/* App Icon */}
        <Animated.View style={animStyle(2)}>
          <SettingsGroup header={t('appearance.appIcon')} footer={t('appearance.appIconFooter')}>
            <View style={styles.iconGrid}>
              {APP_ICONS.map(icon => (
                <TouchableOpacity
                  key={icon.key}
                  style={[
                    styles.iconCard,
                    selectedIcon === icon.key && { borderColor: COLORS.coral },
                  ]}
                  activeOpacity={0.6}
                  onPress={() => setSelectedIcon(icon.key)}
                >
                  <View style={[styles.appIcon, { backgroundColor: icon.colors[0] }]}>
                    <Text style={styles.appIconText}>M</Text>
                    {selectedIcon === icon.key && (
                      <View style={styles.iconCheck}>
                        <MaterialCommunityIcons name="check" size={12} color={COLORS.white} />
                      </View>
                    )}
                  </View>
                  <Text style={[
                    styles.iconLabel,
                    selectedIcon === icon.key && { color: COLORS.coral },
                  ]}>{t(icon.labelKey)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </SettingsGroup>
        </Animated.View>

        {/* Save Button */}
        <Animated.View style={animStyle(3)}>
          <TouchableOpacity style={styles.saveButton} activeOpacity={0.7} onPress={handleSave}>
            <MaterialCommunityIcons name="check" size={20} color={COLORS.white} />
            <Text style={styles.saveText}>{t('common.saveChanges')}</Text>
          </TouchableOpacity>
        </Animated.View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingBottom: SPACING.page },

  // Theme grid
  themeGrid: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  themeCard: {
    flex: 1,
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: RADIUS.card,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  themeIcon: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  themeLabel: { fontSize: FONT_SIZES.sm, fontWeight: FONT_WEIGHTS.medium, color: COLORS.text },
  themeDesc: { fontSize: FONT_SIZES.xs, color: COLORS.text3, marginTop: 2, textAlign: 'center' },

  // Color grid
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  colorSwatch: {
    width: '30%',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: RADIUS.card,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  colorDot: { width: 32, height: 32, borderRadius: RADIUS.full, marginBottom: SPACING.xs },
  colorName: { fontSize: FONT_SIZES.sm, color: COLORS.text2 },

  // Icon grid
  iconGrid: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  iconCard: {
    flex: 1,
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: RADIUS.card,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  appIcon: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.media,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  appIconText: { fontSize: 24, fontWeight: '800', color: COLORS.white },
  iconCheck: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLabel: { fontSize: FONT_SIZES.sm, color: COLORS.text2 },

  // Save
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
    paddingVertical: SPACING.lg,
    backgroundColor: COLORS.coral,
    borderRadius: RADIUS.card,
  },
  saveText: { fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.white },

  bottomSpacer: { height: 60 },
});
