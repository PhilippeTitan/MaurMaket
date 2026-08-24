import React from 'react';
import {
  View, Text, Image, TouchableOpacity, ScrollView, StyleSheet, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Icon } from '../components/icons/Icon';
import { COLORS, SPACING, RADIUS } from '../theme';
import { store } from '../store';
import { useUser } from '../hooks';
import moncashLogo from '../../assets/MonNatCash/moncash.webp';
import natcashLogo from '../../assets/MonNatCash/natcash.webp';
import ScreenHeader from '../components/ScreenHeader';
import { i18n, useTranslation, type Language } from '../i18n';
import { useToast } from '../components/Toast';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const SectionHeader = ({ title }: { title: string }) => (
  <Text style={styles.sectionHeader}>{title}</Text>
);

export default function SettingsScreen({ navigation }: Props) {
  const { t, language } = useTranslation();
  const toast = useToast();
  const { user } = useUser();

  const tierLabel = user?.seller_tier === 'business' ? 'Business' : user?.seller_tier === 'verified' ? 'Verified' : user?.seller_tier === 'casual' ? 'Casual' : '';
  const langLabel = language === 'en' ? 'English' : language === 'ht' ? 'Kreyòl' : 'Français';

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm(t('settings.logoutConfirm'))) {
        store.logout();
      }
      return;
    }
    toast.show({
      kind: 'warning',
      title: t('settings.logout'),
      message: t('settings.logoutConfirm'),
      actionLabel: t('settings.logout'),
      onAction: () => store.logout(),
    });
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('settings.title')} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll}>

      {/* ── Account ── */}
      <SectionHeader title="Account" />
      <View style={styles.card}>
        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('SettingsEdit', { field: 'email', title: t('settings.email') })}>
          <MaterialCommunityIcons name="email-outline" size={18} color={COLORS.text2} />
          <Text style={styles.rowLabel}>{t('settings.email')}</Text>
          <View style={styles.rowRight}>
            <Text style={styles.rowValue} numberOfLines={1}>{user?.email || ''}</Text>
            <Icon name="chevron-right" size={16} color={COLORS.text2} />
          </View>
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('SettingsEdit', { field: 'phones', title: t('settings.phone') })}>
          <MaterialCommunityIcons name="phone-outline" size={18} color={COLORS.text2} />
          <Text style={styles.rowLabel}>{t('settings.phone')}</Text>
          <View style={styles.rowRight}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {user?.phone ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,194,255,0.1)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 }}>
                  <Image source={moncashLogo} style={{ width: 12, height: 12 }} resizeMode="cover" />
                  <Text style={{ fontSize: 9, color: COLORS.blue, fontWeight: '600' }}>MC</Text>
                </View>
              ) : null}
              {user?.natcash_phone ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(139,92,246,0.1)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 }}>
                  <Image source={natcashLogo} style={{ width: 12, height: 12 }} resizeMode="cover" />
                  <Text style={{ fontSize: 9, color: '#8b5cf6', fontWeight: '600' }}>NC</Text>
                </View>
              ) : null}
              {!user?.phone && !user?.natcash_phone ? (
                <Text style={styles.rowValue}>Not set</Text>
              ) : null}
            </View>
            <Icon name="chevron-right" size={16} color={COLORS.text2} />
          </View>
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('SettingsEdit', { field: 'password', title: t('settings.changePassword') })}>
          <MaterialCommunityIcons name="lock-outline" size={18} color={COLORS.text2} />
          <Text style={styles.rowLabel}>{t('settings.changePassword')}</Text>
          <View style={styles.rowRight}>
            <Text style={styles.rowValue}>••••••••</Text>
            <Icon name="chevron-right" size={16} color={COLORS.text2} />
          </View>
        </TouchableOpacity>
      </View>

      {/* ── Privacy ── */}
      <SectionHeader title="Privacy" />
      <View style={styles.card}>
        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('PrivacySettings')}>
          <Icon name="locked" size={18} color={COLORS.text2} />
          <Text style={styles.rowLabel}>Profile visibility</Text>
          <Text style={styles.rowValue}>{user?.show_real_name ? 'Name visible' : 'Name hidden'}</Text>
          <Icon name="chevron-right" size={16} color={COLORS.text2} />
        </TouchableOpacity>
      </View>

      {/* ── Location ── */}
      <SectionHeader title="Location" />
      <View style={styles.card}>
        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('LocationSettings')}>
          <Icon name="location-pin" size={18} color={COLORS.green} />
          <Text style={styles.rowLabel}>Delivery address</Text>
          <Text style={styles.rowValue} numberOfLines={1}>{user?.location_city || ''}</Text>
          <Icon name="chevron-right" size={16} color={COLORS.text2} />
        </TouchableOpacity>
      </View>

      {/* ── Verification & tier ── */}
      <SectionHeader title="Verification & tier" />
      <View style={styles.card}>
        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('SellerToolsSettings')}>
          <Icon name="verified" size={18} color={COLORS.yellow} />
          <Text style={styles.rowLabel}>Seller tools</Text>
          {tierLabel ? <Text style={[styles.rowValue, { color: COLORS.green }]}>{tierLabel}</Text> : null}
          <Icon name="chevron-right" size={16} color={COLORS.text2} />
        </TouchableOpacity>
      </View>

      {/* ── Preferences ── */}
      <SectionHeader title="Preferences" />
      <View style={styles.card}>
        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('LanguageSettings')}>
          <Icon name="time" size={18} color={COLORS.text2} />
          <Text style={styles.rowLabel}>Language</Text>
          <View style={styles.rowRight}>
            <Text style={styles.rowValue}>{langLabel}</Text>
            <Icon name="chevron-right" size={16} color={COLORS.text2} />
          </View>
        </TouchableOpacity>
      </View>

      {/* ── Log out ── */}
      <View style={styles.logoutCard}>
        <TouchableOpacity style={styles.row} onPress={handleLogout}>
          <MaterialCommunityIcons name="logout" size={18} color={COLORS.coral} />
          <Text style={[styles.rowLabel, { color: COLORS.coral, fontWeight: '600' }]}>Log out</Text>
        </TouchableOpacity>
      </View>

      <Text style={{ textAlign: 'center', fontSize: 11, color: COLORS.text2, marginTop: 20 }}>
        MaurMaket v1.0.0
      </Text>

      <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingBottom: 20 },

  /* Sections */
  sectionHeader: {
    fontSize: 10, fontWeight: '700', color: COLORS.text2,
    textTransform: 'uppercase', letterSpacing: 0.4,
    marginHorizontal: SPACING.lg, marginTop: 16, marginBottom: 4, paddingBottom: 4,
  },
  card: {
    marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.card, overflow: 'hidden',
  },
  logoutCard: {
    marginHorizontal: SPACING.lg, marginTop: 20, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.card, overflow: 'hidden',
  },

  /* Rows */
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  rowLabel: { flex: 1, fontSize: 14, color: COLORS.text },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowValue: { fontSize: 12, color: COLORS.text2 },
  divider: { height: 1, backgroundColor: COLORS.border, marginLeft: 44 },
});
