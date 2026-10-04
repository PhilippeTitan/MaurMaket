import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, RADIUS, SPACING, type AppearanceMode } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import SettingsGroup from '../components/SettingsGroup';
import { useTranslation } from '@/localization';
import { useToast } from '../components/Toast';
import { store } from '../store';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'AppearanceSettings'>;

const THEMES: { key: AppearanceMode; labelKey: string; descriptionKey: string; icon: string }[] = [
  { key: 'system', labelKey: 'appearance.themeAuto', descriptionKey: 'appearance.themeAutoDesc', icon: 'theme-light-dark' },
  { key: 'light', labelKey: 'appearance.themeLight', descriptionKey: 'appearance.themeLightDesc', icon: 'white-balance-sunny' },
  { key: 'dark', labelKey: 'appearance.themeDark', descriptionKey: 'appearance.themeDarkDesc', icon: 'moon-waning-crescent' },
];

export default function AppearanceSettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [selectedTheme, setSelectedTheme] = useState<AppearanceMode>(store.appearanceMode);
  const [reduceMotion, setReduceMotion] = useState(false);
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduceMotion(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduceMotion);
    if (reduceMotion) entrance.setValue(1);
    else Animated.timing(entrance, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    return () => { active = false; subscription?.remove(); entrance.stopAnimation(); };
  }, [entrance, reduceMotion]);

  const chooseTheme = async (mode: AppearanceMode) => {
    if (mode === selectedTheme) return;
    setSelectedTheme(mode);
    try {
      await store.setAppearanceMode(mode);
      toast.show({ kind: 'success', title: t('appearance.saved') });
    } catch {
      setSelectedTheme(store.appearanceMode);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('appearance.title')} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
          <SettingsGroup header={t('appearance.theme')}>
            <View style={styles.themeList}>
              {THEMES.map((theme, index) => {
                const selected = selectedTheme === theme.key;
                return (
                  <TouchableOpacity
                    key={theme.key}
                    accessibilityRole="radio"
                    accessibilityLabel={`${t(theme.labelKey)}. ${t(theme.descriptionKey)}`}
                    accessibilityState={{ selected }}
                    style={[styles.themeRow, index < THEMES.length - 1 && styles.divider, selected && styles.selectedRow]}
                    activeOpacity={0.72}
                    onPress={() => void chooseTheme(theme.key)}
                  >
                    <View style={[styles.iconWrap, selected && styles.selectedIconWrap]}>
                      <MaterialCommunityIcons name={theme.icon as any} size={20} color={selected ? COLORS.coral : COLORS.text2} />
                    </View>
                    <View style={styles.copy}>
                      <Text style={[styles.label, selected && styles.selectedLabel]}>{t(theme.labelKey)}</Text>
                      <Text style={styles.description}>{t(theme.descriptionKey)}</Text>
                    </View>
                    {selected && <MaterialCommunityIcons name="check-circle" size={20} color={COLORS.coral} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </SettingsGroup>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxxl },
  themeList: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
  themeRow: {
    minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  selectedRow: { backgroundColor: COLORS.coralMuted, borderRadius: RADIUS.row },
  iconWrap: { width: 36, height: 36, borderRadius: RADIUS.full, backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center' },
  selectedIconWrap: { backgroundColor: COLORS.coralMuted },
  copy: { flex: 1, gap: 3 },
  label: { color: COLORS.text, fontSize: FONT_SIZES.md, fontWeight: FONT_WEIGHTS.semibold },
  selectedLabel: { color: COLORS.coral },
  description: { color: COLORS.text2, fontSize: FONT_SIZES.sm },
});
