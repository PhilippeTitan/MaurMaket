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
              {THEMES.map((theme, index) => (
                <TouchableOpacity
                  key={theme.key}
                  accessibilityRole="radio"
                  accessibilityLabel={t(theme.labelKey)}
                  accessibilityState={{ selected: selectedTheme === theme.key }}
                  style={[
                    styles.themeCard,
                    index < THEMES.length - 1 && styles.optionDivider,
                    selectedTheme === theme.key && styles.selectedThemeRow,
                  ]}
                  activeOpacity={0.6}
                  onPress={() => setSelectedTheme(theme.key)}
                >
                  <View style={[
                    styles.themeIcon,
                  ]}>
                    <MaterialCommunityIcons
                      name={theme.icon as any}
                      size={20}
                      color={selectedTheme === theme.key ? COLORS.coral : COLORS.text2}
                    />
                  </View>
                  <Text style={[
                    styles.themeLabel,
                    selectedTheme === theme.key && { color: COLORS.coral, fontWeight: FONT_WEIGHTS.semibold },
                  ]}>{t(theme.labelKey)}</Text>
                  {selectedTheme === theme.key && <MaterialCommunityIcons name="check" size={18} color={COLORS.coral} />}
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
                  accessibilityRole="radio"
                  accessibilityLabel={t(color.nameKey)}
                  accessibilityState={{ selected: selectedAccent === color.value }}
                  style={[
                    styles.colorSwatch,
                    selectedAccent === color.value && {
                      borderColor: color.value,
                      borderWidth: 2,
                    },
                  ]}
                  activeOpacity={0.6}
                  onPress={() => setSelectedAccent(color.value)}
                >
                  <View style={[styles.colorDot, { backgroundColor: color.value }]} />
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
                  accessibilityRole="radio"
                  accessibilityLabel={t(icon.labelKey)}
                  accessibilityState={{ selected: selectedIcon === icon.key }}
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
    flexDirection: 'column',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  themeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    minHeight: 52,
    paddingHorizontal: SPACING.sm,
  },
  selectedThemeRow: { backgroundColor: 'rgba(255,77,106,0.06)' },
  optionDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  themeIcon: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeLabel: { flex: 1, fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.medium, color: COLORS.text },

  // Color grid
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  colorSwatch: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.full,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  colorDot: { width: 26, height: 26, borderRadius: RADIUS.full },

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
