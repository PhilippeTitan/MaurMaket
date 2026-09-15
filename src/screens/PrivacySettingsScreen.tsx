import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Animated,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../theme';
import { store } from '../store';
import { useUser } from '../hooks';
import ScreenHeader from '../components/ScreenHeader';
import SettingsGroup from '../components/SettingsGroup';
import { updateProfile } from '../api';
import { useTranslation } from '../i18n';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'PrivacySettings'>;

export default function PrivacySettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { user } = useUser();
  const [loading, setLoading] = useState(false);

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
    <View style={styles.container}>
      <ScreenHeader title="Privacy" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: anim.opacity, transform: [{ translateY: anim.translateY }] }}>
          <SettingsGroup
            header="Profile Visibility"
            accentColor="#8B5CF6"
            description="Control what others see on your profile"
          >
            <TouchableOpacity
              style={styles.toggleRow}
              activeOpacity={0.6}
              onPress={handleToggleShowName}
              disabled={loading}
            >
              <View style={styles.toggleIcon}>
                <MaterialCommunityIcons name="account-outline" size={20} color="#8B5CF6" />
              </View>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleLabel}>Show my real name</Text>
                <Text style={styles.toggleHint}>
                  Your username is always public. Turning this on shows your real name on your profile.
                </Text>
              </View>
              <View style={[styles.toggle, user?.show_real_name && styles.toggleActive]}>
                <View style={[styles.toggleKnob, user?.show_real_name && styles.toggleKnobActive]} />
              </View>
            </TouchableOpacity>
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

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    minHeight: 60,
  },
  toggleIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.card,
    backgroundColor: '#8B5CF618',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleInfo: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.text,
  },
  toggleHint: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.text2,
    lineHeight: 17,
    marginTop: 3,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 2,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: COLORS.green + '80',
    borderColor: COLORS.green,
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.text2,
  },
  toggleKnobActive: {
    backgroundColor: '#fff',
    alignSelf: 'flex-end',
  },

  bottomSpacer: {
    height: 60,
  },
});
