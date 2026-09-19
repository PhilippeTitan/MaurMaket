import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Animated, Image, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS, TIER_COLORS } from '../theme';
import { store } from '../store';
import { useUser } from '../hooks';
import ScreenHeader from '../components/ScreenHeader';
import SettingsGroup from '../components/SettingsGroup';
import SettingsRow from '../components/SettingsRow';
import { uploadImage, getImageUrl, updateProfile } from '../api';
import { useTranslation } from '@/localization';
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
  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : (user?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?');
  const tierColor = user?.seller_tier ? TIER_COLORS[user.seller_tier] ?? COLORS.text2 : undefined;

  // Entrance animation
  const anim = useRef({
    opacity: new Animated.Value(0),
    translateY: new Animated.Value(20),
  }).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(anim.opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(anim.translateY, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

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
    <View style={styles.container}>
      <ScreenHeader title={t('me.editProfile')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: anim.opacity, transform: [{ translateY: anim.translateY }] }}>

          {/* ── Avatar Section ── */}
          <TouchableOpacity
            style={styles.avatarSection}
            activeOpacity={0.7}
            onPress={handlePickAvatar}
            disabled={avatarUploading}
          >
            <View style={styles.avatarContainer}>
              {/* Tier-colored ring */}
              <View style={[styles.avatarRing, { borderColor: tierColor || COLORS.surface2 }]}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarInitials}>{initials}</Text>
                  </View>
                )}
              </View>
              {/* Camera overlay */}
              <View style={styles.cameraOverlay}>
                {avatarUploading ? (
                  <ActivityIndicator color={COLORS.white} size="small" />
                ) : (
                  <MaterialCommunityIcons name="camera" size={20} color={COLORS.white} />
                )}
              </View>
            </View>
            <Text style={styles.photoLabel}>
              {avatarUploading ? 'Uploading...' : t('me.editProfile')}
            </Text>
          </TouchableOpacity>

          {/* ── Profile Fields ── */}
          <SettingsGroup
            header="Profile"
            accentColor={COLORS.blue}
            description="Manage your display information"
          >
            <SettingsRow
              icon="at"
              iconBg={COLORS.surface2}
              label="Username"
              value={user?.username ? `@${user.username}` : 'Not set'}
              chevron
              onPress={() => navigation.navigate('UsernameSettings')}
              divider
            />
            <SettingsRow
              icon="account-outline"
              iconColor={COLORS.coral}
              iconBg={COLORS.coralMuted}
              label={t('settings.fullName')}
              value={user?.full_name}
              chevron
              onPress={() => goEdit('name', t('settings.fullName'))}
              divider
            />
            <SettingsRow
              icon="text-short"
              iconColor={COLORS.green}
              iconBg={COLORS.greenMuted}
              label={t('settings.bio')}
              value={user?.bio || 'Tell us about yourself'}
              valueColor={user?.bio ? COLORS.text2 : COLORS.text3}
              chevron
              onPress={() => goEdit('bio', t('settings.bio'))}
            />
          </SettingsGroup>

          {/* ── Bio preview ── */}
          {user?.bio ? (
            <View style={styles.bioPreview}>
              <Text style={styles.bioPreviewText}>{user.bio}</Text>
            </View>
          ) : null}

        </Animated.View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

/* ── Styles ──────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scroll: {
    paddingBottom: SPACING.page,
  },

  /* Avatar */
  avatarSection: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  avatarContainer: {
    position: 'relative',
    width: 88,
    height: 88,
  },
  avatarRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    padding: 3,
    overflow: 'hidden',
  },
  avatarImg: {
    width: 82,
    height: 82,
    borderRadius: 41,
  },
  avatarFallback: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 28,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text2,
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.blue,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.bg,
  },
  photoLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.blue,
    marginTop: SPACING.sm,
  },

  /* Bio preview */
  bioPreview: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.green,
  },
  bioPreviewText: {
    fontSize: FONT_SIZES.base,
    color: COLORS.text2,
    lineHeight: 22,
  },

  bottomSpacer: {
    height: 60,
  },
});
