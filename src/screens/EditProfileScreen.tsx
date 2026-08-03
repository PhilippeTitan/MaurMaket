import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Image,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Icon } from '../components/icons/Icon';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, RADIUS, getDisplayName } from '../theme';
import { store } from '../store';
import { useUser } from '../hooks';
import ScreenHeader from '../components/ScreenHeader';
import { uploadImage, getImageUrl, updateProfile, updateUsername } from '../api';
import { useTranslation } from '../i18n';
import { useToast } from '../components/Toast';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'EditProfile'>;

export default function EditProfileScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useUser();
  const [avatarUploading, setAvatarUploading] = useState(false);

  const avatarUrl = getImageUrl(user?.avatar_url);

  const handlePickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setAvatarUploading(true);
      try {
        const uploadRes = await uploadImage(result.assets[0].uri);
        const res = await updateProfile({ avatarUrl: uploadRes.url }) as { user: typeof user };
        if (res.user) await store.setUser(res.user, store.token);
        toast.success('Photo updated');
      } catch (err: unknown) {
        toast.error(t('settings.error'), err instanceof Error ? err.message : t('settings.failed'));
      }
      setAvatarUploading(false);
    }
  };

  const goEdit = (field: 'name' | 'bio' | 'password', title: string) => {
    navigation.navigate('SettingsEdit', { field, title });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <ScreenHeader title={t('me.editProfile')} onBack={() => navigation.goBack()} />

      {/* ── Avatar ── */}
      <TouchableOpacity style={styles.avatarSection} onPress={handlePickAvatar} disabled={avatarUploading}>
        <View style={styles.avatarWrap}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarText}>
              {user?.username ? `@${user.username}`.slice(0, 2).toUpperCase() : (user?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?')}
            </Text>
          )}
          {avatarUploading && (
            <View style={styles.avatarLoadingOverlay}>
              <ActivityIndicator color={COLORS.white} size="small" />
            </View>
          )}
        </View>
        <Text style={styles.photoLabel}>{t('me.editProfile')}</Text>
      </TouchableOpacity>

      {/* ── Profile fields ── */}
      <Text style={styles.sectionHeader}>Profile</Text>
      <View style={styles.card}>
        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('UsernameSettings')}>
          <MaterialCommunityIcons name="at" size={18} color={COLORS.text2} />
          <Text style={styles.rowLabel}>Username</Text>
          <View style={styles.rowRight}>
            <Text style={styles.rowValue}>@{user?.username || ''}</Text>
            <Icon name="chevron-right" size={16} color={COLORS.text2} />
          </View>
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.row} onPress={() => goEdit('name', t('settings.fullName'))}>
          <MaterialCommunityIcons name="account-outline" size={18} color={COLORS.text2} />
          <Text style={styles.rowLabel}>{t('settings.fullName')}</Text>
          <View style={styles.rowRight}>
            <Text style={styles.rowValue} numberOfLines={1}>{getDisplayName(user)}</Text>
            <Icon name="chevron-right" size={16} color={COLORS.text2} />
          </View>
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.row} onPress={() => goEdit('bio', t('settings.bio'))}>
          <MaterialCommunityIcons name="text-short" size={18} color={COLORS.text2} />
          <Text style={styles.rowLabel}>{t('settings.bio')}</Text>
          <View style={styles.rowRight}>
            <Text style={styles.rowValue} numberOfLines={1}>{user?.bio || ''}</Text>
            <Icon name="chevron-right" size={16} color={COLORS.text2} />
          </View>
        </TouchableOpacity>
      </View>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingBottom: 20 },

  /* Avatar */
  avatarSection: {
    alignItems: 'center', paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  avatarWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(128,128,128,0.25)',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', position: 'relative',
  },
  avatarImg: { width: 72, height: 72, borderRadius: 36 },
  avatarText: { fontSize: 24, color: COLORS.text2, fontWeight: '700' },
  avatarLoadingOverlay: {
    ...StyleSheet.absoluteFill,
    borderRadius: 36, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  photoLabel: { fontSize: 12, fontWeight: '600', color: COLORS.blue, marginTop: 6 },

  /* Sections */
  sectionHeader: {
    fontSize: 10, fontWeight: '700', color: COLORS.text2,
    textTransform: 'uppercase', letterSpacing: 0.4,
    marginHorizontal: SPACING.lg, marginTop: 16, marginBottom: 4,
  },
  card: {
    marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.card, overflow: 'hidden',
  },

  /* Rows */
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  rowLabel: { flex: 1, fontSize: 14, color: COLORS.text },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowValue: { fontSize: 13, color: COLORS.text2, maxWidth: 160 },
  divider: { height: 1, backgroundColor: COLORS.border, marginLeft: 44 },
});
