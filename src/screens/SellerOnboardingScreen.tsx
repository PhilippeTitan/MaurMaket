import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Image,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING } from '../theme';
import { becomeSeller, uploadImage } from '../api';
import { useTranslation } from '../i18n';
import { store } from '../store';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Step = 'welcome' | 'choose' | 'store' | 'verify' | 'done';
type ChosenTier = 'casual' | 'verified' | 'business' | null;

export default function SellerOnboardingScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const [step, setStep] = useState<Step>('welcome');
  const [chosenTier, setChosenTier] = useState<ChosenTier>(null);
  const [storeName, setStoreName] = useState('');
  const [storeLogoUrl, setStoreLogoUrl] = useState<string | null>(null);
  const [idDocUrl, setIdDocUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pickLoading, setPickLoading] = useState(false);

  const handlePickLogo = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (res.canceled || !res.assets?.[0]) return;
    setPickLoading(true);
    try {
      const uploaded = await uploadImage(res.assets[0].uri);
      setStoreLogoUrl(uploaded.url);
    } catch { /* ignore */ }
    setPickLoading(false);
  };

  const handlePickId = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (res.canceled || !res.assets?.[0]) return;
    setPickLoading(true);
    try {
      const uploaded = await uploadImage(res.assets[0].uri);
      setIdDocUrl(uploaded.url);
    } catch { /* ignore */ }
    setPickLoading(false);
  };

  const handleComplete = async (navigateBack = true) => {
    if (!chosenTier) return;
    setLoading(true);
    try {
      const data: { storeName?: string; storeLogoUrl?: string; idDocumentUrl?: string; tier: string } = { tier: chosenTier };
      if (chosenTier === 'business' && storeName.trim()) data.storeName = storeName.trim();
      if (chosenTier === 'business' && storeLogoUrl) data.storeLogoUrl = storeLogoUrl;
      if ((chosenTier === 'verified' || chosenTier === 'business') && idDocUrl) data.idDocumentUrl = idDocUrl;

      const res = await becomeSeller(data) as { user: typeof store.user; token: string };
      if (res.user && res.token) {
        await store.setUser(res.user, res.token);
      }
      if (navigateBack) nav.goBack();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      Alert.alert(t('common.error'), msg);
    }
    setLoading(false);
  };

  const handleChooseTier = (tier: ChosenTier) => {
    setChosenTier(tier);
    if (tier === 'casual') {
      handleCompleteWithTier('casual');
    } else if (tier === 'verified') {
      setStep('verify');
    } else if (tier === 'business') {
      setStep('store');
    }
  };

  const handleCompleteWithTier = async (tier: ChosenTier) => {
    if (!tier) return;
    setLoading(true);
    try {
      const data: { tier: string } = { tier };
      const res = await becomeSeller(data) as { user: typeof store.user; token: string };
      if (res.user && res.token) {
        await store.setUser(res.user, res.token);
      }
      nav.goBack();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      Alert.alert(t('common.error'), msg);
    }
    setLoading(false);
  };

  const renderStep = () => {
    switch (step) {
      case 'welcome':
        return (
          <View style={styles.stepContent}>
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons name="store-plus" size={48} color={COLORS.coral} />
            </View>
            <Text style={styles.title}>{t('sellerOnboarding.startTitle')}</Text>
            <Text style={styles.subtitle}>
              {t('sellerOnboarding.startSubtitle')}
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep('choose')}>
              <Text style={styles.primaryBtnText}>{t('sellerOnboarding.getStart')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkBtn} onPress={() => nav.goBack()}>
              <Text style={styles.linkBtnText}>{t('sellerOnboarding.maybeLater')}</Text>
            </TouchableOpacity>
          </View>
        );

      case 'choose': {
        const currentTier = store.user?.seller_tier;
        const tierOrder = ['casual', 'verified', 'business'];
        const currentIdx = tierOrder.indexOf(currentTier || '');

        const tiers = [
          { key: 'casual' as const, icon: 'account-outline', iconBg: COLORS.blue, color: COLORS.blue, title: t('sellerOnboarding.casualTitle'), desc: t('sellerOnboarding.casualDesc'), features: [t('sellerOnboarding.casualFeature1'), t('sellerOnboarding.casualFeature2')] },
          { key: 'verified' as const, icon: 'shield-check-outline', iconBg: COLORS.green, color: COLORS.green, title: t('sellerOnboarding.verifiedTitle'), desc: t('sellerOnboarding.verifiedDesc'), features: [t('sellerOnboarding.verifiedFeature1'), t('sellerOnboarding.verifiedFeature2'), t('sellerOnboarding.verifiedFeature3')] },
          { key: 'business' as const, icon: 'storefront-outline', iconBg: COLORS.coral, color: COLORS.coral, title: t('sellerOnboarding.businessTitle'), desc: t('sellerOnboarding.businessDesc'), features: [t('sellerOnboarding.businessFeature1'), t('sellerOnboarding.businessFeature2'), t('sellerOnboarding.businessFeature3')] },
        ];

        return (
          <View style={styles.stepContent}>
            <Text style={styles.title}>{t('sellerOnboarding.chooseTitle')}</Text>
            <Text style={styles.subtitle}>
              {currentTier ? t('sellerOnboarding.upgradeHint') : t('sellerOnboarding.chooseSubtitle')}
            </Text>

            {tiers.map((tier) => {
              const isCurrent = tier.key === currentTier;
              const isDowngrade = tierOrder.indexOf(tier.key) <= currentIdx;
              const disabled = loading || isDowngrade;
              return (
                <TouchableOpacity
                  key={tier.key}
                  style={[styles.tierCard, disabled && styles.tierCardDisabled]}
                  onPress={() => !disabled && handleChooseTier(tier.key)}
                  activeOpacity={disabled ? 1 : 0.8}
                  disabled={disabled}
                >
                  <View style={[styles.tierIcon, { backgroundColor: (disabled ? COLORS.text2 : tier.iconBg) + '20' }]}>
                    <MaterialCommunityIcons name={tier.icon as any} size={26} color={disabled ? COLORS.text2 : tier.color} />
                  </View>
                  <View style={styles.tierInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.tierTitle, disabled && { color: COLORS.text2 }]}>{tier.title}</Text>
                      {isCurrent && (
                        <View style={styles.currentBadge}>
                          <Text style={styles.currentBadgeText}>{t('sellerOnboarding.current')}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.tierDesc, disabled && { opacity: 0.5 }]}>{tier.desc}</Text>
                    <View style={styles.tierFeatures}>
                      {tier.features.map((f) => (
                        <Text key={f} style={[styles.tierFeature, disabled && { opacity: 0.4 }]}>✓ {f}</Text>
                      ))}
                    </View>
                  </View>
                  {!isDowngrade && <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.text2} />}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity style={styles.linkBtn} onPress={() => setStep('welcome')}>
              <Text style={styles.linkBtnText}>{t('sellerOnboarding.back')}</Text>
            </TouchableOpacity>
          </View>
        );
      }

      case 'store':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.title}>{t('sellerOnboarding.setUpStore')}</Text>
            <Text style={styles.subtitle}>{t('sellerOnboarding.storeSubtitle')}</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t('sellerOnboarding.storeNameLabel')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('sellerOnboarding.storeNamePlaceholder')}
                placeholderTextColor={COLORS.text2}
                value={storeName}
                onChangeText={setStoreName}
                maxLength={50}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t('sellerOnboarding.storeLogoOptional')}</Text>
              <TouchableOpacity style={styles.logoPicker} onPress={handlePickLogo} disabled={pickLoading}>
                {pickLoading ? (
                  <ActivityIndicator size="small" color={COLORS.coral} />
                ) : storeLogoUrl ? (
                  <Image source={{ uri: storeLogoUrl }} style={styles.logoPreview} />
                ) : (
                  <View style={styles.logoPlaceholder}>
                    <MaterialCommunityIcons name="camera-plus-outline" size={24} color={COLORS.text2} />
                    <Text style={styles.logoPlaceholderText}>{t('sellerOnboarding.addLogo')}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, !storeName.trim() && styles.primaryBtnDisabled]}
              onPress={() => setStep('verify')}
              disabled={!storeName.trim() || loading}
            >
              <Text style={styles.primaryBtnText}>{t('sellerOnboarding.continue')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkBtn} onPress={() => setStep('choose')}>
              <Text style={styles.linkBtnText}>{t('sellerOnboarding.back')}</Text>
            </TouchableOpacity>
          </View>
        );

      case 'verify':
        return (
          <View style={styles.stepContent}>
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons name="shield-check-outline" size={40} color={COLORS.green} />
            </View>
            <Text style={styles.title}>{t('sellerOnboarding.verifyIdentity')}</Text>
            <Text style={styles.subtitle}>
              {t('sellerOnboarding.verifySubtitle')}
            </Text>

            <TouchableOpacity style={styles.idPicker} onPress={handlePickId} disabled={pickLoading}>
              {pickLoading ? (
                <ActivityIndicator size="small" color={COLORS.coral} />
              ) : idDocUrl ? (
                <View style={styles.idUploaded}>
                  <MaterialCommunityIcons name="check-circle" size={24} color={COLORS.green} />
                  <Text style={styles.idUploadedText}>{t('sellerOnboarding.idUploaded')}</Text>
                </View>
              ) : (
                <View style={styles.idPlaceholder}>
                  <MaterialCommunityIcons name="card-account-details-outline" size={32} color={COLORS.text2} />
                  <Text style={styles.idPlaceholderText}>{t('sellerOnboarding.tapToUpload')}</Text>
                  <Text style={styles.idPlaceholderHint}>{t('sellerOnboarding.idFormat')}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryBtn, { flexDirection: 'row', justifyContent: 'center', gap: 8 }]}
              onPress={async () => {
                await handleComplete(false);
                nav.navigate('AddListing');
              }}
            >
              <MaterialCommunityIcons name="plus" size={18} color={COLORS.white} />
              <Text style={styles.primaryBtnText}>{t('sellerOnboarding.addFirstListing')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkBtn} onPress={async () => {
              await handleComplete();
              nav.goBack();
            }}>
              <Text style={styles.linkBtnText}>{t('sellerOnboarding.doItLater')}</Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  const totalSteps = chosenTier === 'business' ? 4 : chosenTier === 'verified' ? 3 : 2;
  const currentStepIdx = step === 'welcome' ? 0 : step === 'choose' ? 1 : step === 'store' ? 2 : step === 'verify' ? 3 : 4;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => nav.goBack()} style={{ alignSelf: 'flex-start', marginBottom: 16 }}>
        <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.text2} />
      </TouchableOpacity>
      {step !== 'welcome' && step !== 'done' && (
        <View style={styles.stepIndicatorFlow}>
          {Array.from({ length: totalSteps }, (_, i) => (
            <View
              key={i}
              style={[styles.stepDot, i <= currentStepIdx && styles.stepDotActive]}
            />
          ))}
        </View>
      )}
      {renderStep()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { flexGrow: 1, justifyContent: 'center', padding: SPACING.xl },

  stepIndicatorFlow: {
    flexDirection: 'row', justifyContent: 'center', gap: 8,
    marginBottom: 16, alignSelf: 'center',
  },
  stepIndicator: {
    flexDirection: 'row', justifyContent: 'center', gap: 8,
  },
  stepDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border,
  },
  stepDotActive: { backgroundColor: COLORS.coral, borderColor: COLORS.coral },

  stepContent: { alignItems: 'center', gap: 12 },

  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.surface, borderWidth: 2, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },

  title: { fontSize: 22, fontWeight: '800', color: COLORS.text, textAlign: 'center', lineHeight: 28 },
  subtitle: { fontSize: 14, color: COLORS.text2, textAlign: 'center', lineHeight: 20, paddingHorizontal: 10 },

  tierCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    width: '100%', padding: 14, marginTop: 8,
    backgroundColor: COLORS.surface, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  tierIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  tierInfo: { flex: 1 },
  tierTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  tierDesc: { fontSize: 12, color: COLORS.text2, marginTop: 2 },
  tierFeatures: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  tierFeature: { fontSize: 10, color: COLORS.text2, fontWeight: '500' },
  tierCardDisabled: { opacity: 0.45 },
  currentBadge: {
    backgroundColor: COLORS.green + '20', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  currentBadgeText: { fontSize: 9, fontWeight: '700', color: COLORS.green, textTransform: 'uppercase' },

  tipsList: { width: '100%', gap: 10, marginTop: 12 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  tipIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  tipContent: { flex: 1 },
  tipTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  tipHint: { fontSize: 11, color: COLORS.text2, marginTop: 1, lineHeight: 16 },

  fieldGroup: { width: '100%', gap: 6, marginTop: 8 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  input: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: COLORS.text,
  },

  logoPicker: {
    width: 80, height: 80, borderRadius: 16,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
  logoPreview: { width: 80, height: 80 },
  logoPlaceholder: { alignItems: 'center', gap: 4 },
  logoPlaceholderText: { fontSize: 10, color: COLORS.text2 },

  idPicker: {
    width: '100%', paddingVertical: 24,
    backgroundColor: COLORS.surface, borderRadius: 14,
    borderWidth: 1.5, borderColor: COLORS.border, borderStyle: 'dashed',
    alignItems: 'center', marginTop: 8,
  },
  idPlaceholder: { alignItems: 'center', gap: 4 },
  idPlaceholderText: { fontSize: 13, color: COLORS.text2, fontWeight: '600' },
  idPlaceholderHint: { fontSize: 11, color: COLORS.text2, opacity: 0.6 },
  idUploaded: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  idUploadedText: { fontSize: 14, color: COLORS.green, fontWeight: '600' },

  primaryBtn: {
    width: '100%', paddingVertical: 14, borderRadius: 14,
    backgroundColor: COLORS.coral, alignItems: 'center', marginTop: 16,
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },

  linkBtn: { paddingVertical: 10 },
  linkBtnText: { color: COLORS.text2, fontSize: 13, fontWeight: '500', textAlign: 'center' },
});
