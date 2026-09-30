import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, RADIUS, SPACING } from '../theme';
import { getSellerFulfillmentProfile, updateSellerFulfillmentProfile, type SellerFulfillmentProfile } from '../api';
import ScreenHeader from '../components/ScreenHeader';
import SettingsToggle from '../components/SettingsToggle';
import PrimaryButton from '../components/PrimaryButton';
import { useToast } from '../components/Toast';
import { useTranslation } from '@/localization';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'SellerFulfillmentSettings'>;
type FeeRuleDraft = { id: number; maxKm: string; fee: string };
type FeeType = SellerFulfillmentProfile['deliveryFeeType'];

const DEFAULT_PROFILE: SellerFulfillmentProfile = {
  deliveryEnabled: false,
  meetupEnabled: false,
  deliveryRadiusMeters: 5000,
  meetupRadiusMeters: 12000,
  deliveryFeeType: 'flat',
  flatDeliveryFee: 0,
  distanceFeeRules: [],
  distanceStepMeters: 2000,
  distanceStepFee: 0,
};

const kmText = (meters: number) => String(Number((meters / 1000).toFixed(1)));
const parseNumber = (value: string) => Number(value.trim().replace(',', '.'));

export default function SellerFulfillmentSettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<SellerFulfillmentProfile>(DEFAULT_PROFILE);
  const [deliveryRadius, setDeliveryRadius] = useState(kmText(DEFAULT_PROFILE.deliveryRadiusMeters));
  const [meetupRadius, setMeetupRadius] = useState(kmText(DEFAULT_PROFILE.meetupRadiusMeters));
  const [flatFee, setFlatFee] = useState(String(DEFAULT_PROFILE.flatDeliveryFee));
  const [distanceStepKm, setDistanceStepKm] = useState(kmText(DEFAULT_PROFILE.distanceStepMeters));
  const [distanceStepFee, setDistanceStepFee] = useState(String(DEFAULT_PROFILE.distanceStepFee));
  const [feeType, setFeeType] = useState<FeeType>(DEFAULT_PROFILE.deliveryFeeType);
  const [feeRules, setFeeRules] = useState<FeeRuleDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [nextRuleId, setNextRuleId] = useState(1);

  const applyProfile = useCallback((data: SellerFulfillmentProfile) => {
    const next = { ...DEFAULT_PROFILE, ...data };
    setProfile(next);
    setDeliveryRadius(kmText(next.deliveryRadiusMeters));
    setMeetupRadius(kmText(next.meetupRadiusMeters));
    setFlatFee(String(next.flatDeliveryFee));
    setDistanceStepKm(kmText(next.distanceStepMeters));
    setDistanceStepFee(String(next.distanceStepFee));
    setFeeType(next.deliveryFeeType);
    const rules = (Array.isArray(next.distanceFeeRules) ? next.distanceFeeRules : []).map((rule, index) => ({
      id: index + 1,
      maxKm: kmText(rule.maxDistanceMeters),
      fee: String(rule.fee),
    }));
    setFeeRules(rules);
    setNextRuleId(rules.length + 1);
    setProfileLoaded(true);
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    getSellerFulfillmentProfile()
      .then((data) => { if (active) applyProfile(data as SellerFulfillmentProfile); })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(true);
          toast.error(t('settings.error'), error instanceof Error ? error.message : t('settings.failed'));
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applyProfile, reloadVersion, t, toast]));

  const updateRule = (id: number, key: 'maxKm' | 'fee', value: string) => {
    setFeeRules(current => current.map(rule => rule.id === id ? { ...rule, [key]: value } : rule));
  };

  const selectFeeType = (nextType: FeeType) => {
    setFeeType(nextType);
    if (nextType === 'distance' && feeRules.length === 0) {
      setFeeRules([{ id: nextRuleId, maxKm: deliveryRadius || '5', fee: flatFee || '0' }]);
      setNextRuleId(id => id + 1);
    }
  };

  const addFeeRule = () => {
    const last = feeRules[feeRules.length - 1];
    const lastKm = parseNumber(last?.maxKm || '0');
    if (lastKm >= 50) return;
    setFeeRules(current => [...current, {
      id: nextRuleId,
      maxKm: String(Math.min(50, Math.round((lastKm + 5) * 10) / 10)),
      fee: last?.fee || '0',
    }]);
    setNextRuleId(id => id + 1);
  };

  const save = async () => {
    Keyboard.dismiss();
    const deliveryKm = profile.deliveryEnabled ? parseNumber(deliveryRadius) : profile.deliveryRadiusMeters / 1000;
    const meetupKm = profile.meetupEnabled ? parseNumber(meetupRadius) : profile.meetupRadiusMeters / 1000;
    const fee = profile.deliveryEnabled && feeType === 'flat' ? parseNumber(flatFee) : profile.flatDeliveryFee;
    const stepKm = parseNumber(distanceStepKm);
    const stepFee = parseNumber(distanceStepFee);
    if (profile.deliveryEnabled && (!Number.isFinite(deliveryKm) || deliveryKm < 0.1 || deliveryKm > 50)) {
      toast.error(t('settings.error'), t('fulfillmentSettings.radiusError'));
      return;
    }
    if (profile.meetupEnabled && (!Number.isFinite(meetupKm) || meetupKm < 0.1 || meetupKm > 50)) {
      toast.error(t('settings.error'), t('fulfillmentSettings.radiusError'));
      return;
    }
    if (profile.deliveryEnabled && feeType === 'flat' && (!flatFee.trim() || !Number.isFinite(fee) || fee < 0)) {
      toast.error(t('settings.error'), t('fulfillmentSettings.feeError'));
      return;
    }
    if (profile.deliveryEnabled && feeType === 'per_distance' && (!distanceStepKm.trim() || !Number.isFinite(stepKm) || stepKm < 0.1 || stepKm > 50 || !distanceStepFee.trim() || !Number.isFinite(stepFee) || stepFee < 0)) {
      toast.error(t('settings.error'), t('fulfillmentSettings.stepPricingError'));
      return;
    }
    if (profile.deliveryEnabled && feeType === 'distance' && feeRules.some(rule => !rule.fee.trim())) {
      toast.error(t('settings.error'), t('fulfillmentSettings.feeError'));
      return;
    }

    const normalizedRules = feeRules.map(rule => ({ maxDistanceMeters: Math.round(parseNumber(rule.maxKm) * 1000), fee: parseNumber(rule.fee) }));
    if (profile.deliveryEnabled && feeType === 'distance') {
      const validRules = normalizedRules.every((rule, index) =>
        Number.isFinite(rule.maxDistanceMeters) && rule.maxDistanceMeters >= 100 && rule.maxDistanceMeters <= 50000 &&
        Number.isFinite(rule.fee) && rule.fee >= 0 && (index === 0 || rule.maxDistanceMeters > normalizedRules[index - 1].maxDistanceMeters)
      );
      if (!normalizedRules.length || !validRules || normalizedRules[normalizedRules.length - 1].maxDistanceMeters < deliveryKm * 1000) {
        toast.error(t('settings.error'), t('fulfillmentSettings.distanceRulesError'));
        return;
      }
    }

    setSaving(true);
    try {
      const updated = await updateSellerFulfillmentProfile({
        deliveryEnabled: profile.deliveryEnabled,
        meetupEnabled: profile.meetupEnabled,
        deliveryRadiusMeters: Math.round(deliveryKm * 1000),
        meetupRadiusMeters: Math.round(meetupKm * 1000),
        deliveryFeeType: feeType,
        flatDeliveryFee: fee,
        distanceFeeRules: profile.deliveryEnabled && feeType === 'distance' ? normalizedRules : profile.distanceFeeRules,
        distanceStepMeters: profile.deliveryEnabled && feeType === 'per_distance' ? Math.round(stepKm * 1000) : profile.distanceStepMeters,
        distanceStepFee: profile.deliveryEnabled && feeType === 'per_distance' ? stepFee : profile.distanceStepFee,
      }) as SellerFulfillmentProfile;
      applyProfile(updated);
      toast.show({ kind: 'success', title: t('fulfillmentSettings.saved') });
    } catch (error: unknown) {
      toast.error(t('settings.error'), error instanceof Error ? error.message : t('settings.failed'));
    } finally {
      setSaving(false);
    }
  };

  const renderRadiusField = (label: string, value: string, onChangeText: (value: string) => void, enabled: boolean) => (
    <View style={[styles.fieldRow, !enabled && styles.inactive]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.numberInputWrap}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          style={styles.numberInput}
          accessibilityLabel={label}
          accessibilityState={{ disabled: !enabled }}
          editable={enabled && !saving}
          selectTextOnFocus
        />
        <Text style={styles.unit}>{t('fulfillmentSettings.km')}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('fulfillmentSettings.title')} onBack={() => navigation.goBack()} />
      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.coral} /></View>
      ) : loadError ? (
        <View style={styles.loadError}>
          <MaterialCommunityIcons name="cloud-alert-outline" size={30} color={COLORS.text2} />
          <Text style={styles.loadErrorText}>{t('fulfillmentSettings.loadError')}</Text>
          <PrimaryButton small onPress={() => setReloadVersion(version => version + 1)}>{t('common.retry')}</PrimaryButton>
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 24 + insets.bottom }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.intro}>{t('fulfillmentSettings.intro')}</Text>

            <Text style={styles.section}>{t('fulfillmentSettings.availability')}</Text>
            <View style={styles.group}>
              <View style={styles.toggleRow}>
                <View style={[styles.rowIcon, { backgroundColor: `${COLORS.blue}18` }]}><MaterialCommunityIcons name="truck-delivery-outline" size={19} color={COLORS.blue} /></View>
                <Text style={styles.rowLabel}>{t('sellerTools.offerDelivery')}</Text>
                <SettingsToggle value={profile.deliveryEnabled} onValueChange={value => setProfile(current => ({ ...current, deliveryEnabled: value }))} disabled={saving} accessibilityLabel={t('sellerTools.offerDelivery')} />
              </View>
              <View style={styles.divider} />
              <View style={styles.toggleRow}>
                <View style={[styles.rowIcon, { backgroundColor: `${COLORS.coral}18` }]}><MaterialCommunityIcons name="map-marker-outline" size={19} color={COLORS.coral} /></View>
                <Text style={styles.rowLabel}>{t('sellerTools.offerMeetups')}</Text>
                <SettingsToggle value={profile.meetupEnabled} onValueChange={value => setProfile(current => ({ ...current, meetupEnabled: value }))} disabled={saving} accessibilityLabel={t('sellerTools.offerMeetups')} />
              </View>
            </View>

            <Text style={styles.section}>{t('fulfillmentSettings.serviceArea')}</Text>
            <View style={styles.group}>
              {renderRadiusField(t('sellerTools.deliveryRadius'), deliveryRadius, setDeliveryRadius, profile.deliveryEnabled)}
              <View style={styles.divider} />
              {renderRadiusField(t('sellerTools.meetupRadius'), meetupRadius, setMeetupRadius, profile.meetupEnabled)}
            </View>
            <Text style={styles.helper}>{t('fulfillmentSettings.radiusHint')}</Text>

            <Text style={styles.section}>{t('fulfillmentSettings.deliveryFee')}</Text>
            <View style={[styles.feeOptions, !profile.deliveryEnabled && styles.inactive]}>
              {(['free', 'flat', 'distance', 'per_distance'] as FeeType[]).map(option => (
                <TouchableOpacity
                  key={option}
                  style={[styles.feeOption, feeType === option && styles.feeOptionActive]}
                  onPress={() => selectFeeType(option)}
                  accessibilityRole="radio"
                  accessibilityLabel={t(`fulfillmentSettings.feeType.${option}`)}
                  accessibilityState={{ selected: feeType === option, disabled: !profile.deliveryEnabled || saving }}
                  disabled={!profile.deliveryEnabled || saving}
                >
                  <Text style={[styles.feeOptionText, feeType === option && styles.feeOptionTextActive]}>{t(`fulfillmentSettings.feeType.${option}`)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {feeType === 'flat' && (
              <View style={[styles.group, styles.amountGroup]}>
                <Text style={styles.fieldLabel}>{t('fulfillmentSettings.amountPerDelivery')}</Text>
                <View style={styles.numberInputWrap}>
                  <Text style={styles.unit}>G</Text>
                  <TextInput value={flatFee} onChangeText={setFlatFee} keyboardType="decimal-pad" style={styles.numberInput} accessibilityLabel={t('fulfillmentSettings.amountPerDelivery')} editable={profile.deliveryEnabled && !saving} selectTextOnFocus />
                </View>
              </View>
            )}

            {feeType === 'distance' && (
              <View style={[styles.rulesWrap, !profile.deliveryEnabled && styles.inactive]}>
                <Text style={styles.helper}>{t('fulfillmentSettings.distanceHint')}</Text>
                {feeRules.map((rule, index) => (
                  <View key={rule.id} style={styles.ruleRow}>
                    <View style={styles.ruleField}>
                      <Text style={styles.ruleLabel}>{t('fulfillmentSettings.upTo')}</Text>
                      <View style={styles.ruleInputWrap}>
                        <TextInput value={rule.maxKm} onChangeText={value => updateRule(rule.id, 'maxKm', value)} keyboardType="decimal-pad" style={styles.ruleInput} accessibilityLabel={t('fulfillmentSettings.maxDistance')} editable={profile.deliveryEnabled && !saving} selectTextOnFocus />
                        <Text style={styles.unit}>{t('fulfillmentSettings.km')}</Text>
                      </View>
                    </View>
                    <View style={styles.ruleField}>
                      <Text style={styles.ruleLabel}>{t('fulfillmentSettings.fee')}</Text>
                      <View style={styles.ruleInputWrap}>
                        <Text style={styles.unit}>G</Text>
                        <TextInput value={rule.fee} onChangeText={value => updateRule(rule.id, 'fee', value)} keyboardType="decimal-pad" style={styles.ruleInput} accessibilityLabel={t('fulfillmentSettings.fee')} editable={profile.deliveryEnabled && !saving} selectTextOnFocus />
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => setFeeRules(current => current.filter(item => item.id !== rule.id))} style={styles.removeRule} accessibilityRole="button" accessibilityLabel={t('fulfillmentSettings.removeBand', { number: index + 1 })} disabled={!profile.deliveryEnabled || saving}>
                      <MaterialCommunityIcons name="close" size={19} color={COLORS.text2} />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity onPress={addFeeRule} style={styles.addRule} accessibilityRole="button" accessibilityLabel={t('fulfillmentSettings.addBand')} disabled={!profile.deliveryEnabled || saving}>
                  <MaterialCommunityIcons name="plus" size={18} color={COLORS.coral} />
                  <Text style={styles.addRuleText}>{t('fulfillmentSettings.addBand')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {feeType === 'per_distance' && (
              <View style={[styles.group, styles.stepGroup, !profile.deliveryEnabled && styles.inactive]}>
                <Text style={styles.helper}>{t('fulfillmentSettings.stepPricingHint')}</Text>
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>{t('fulfillmentSettings.everyDistance')}</Text>
                  <View style={styles.numberInputWrap}>
                    <TextInput value={distanceStepKm} onChangeText={setDistanceStepKm} keyboardType="decimal-pad" style={styles.numberInput} accessibilityLabel={t('fulfillmentSettings.everyDistance')} editable={profile.deliveryEnabled && !saving} selectTextOnFocus />
                    <Text style={styles.unit}>{t('fulfillmentSettings.km')}</Text>
                  </View>
                </View>
                <View style={styles.divider} />
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>{t('fulfillmentSettings.chargePerStep')}</Text>
                  <View style={styles.numberInputWrap}>
                    <Text style={styles.unit}>G</Text>
                    <TextInput value={distanceStepFee} onChangeText={setDistanceStepFee} keyboardType="decimal-pad" style={styles.numberInput} accessibilityLabel={t('fulfillmentSettings.chargePerStep')} editable={profile.deliveryEnabled && !saving} selectTextOnFocus />
                  </View>
                </View>
              </View>
            )}
          </ScrollView>
          <View style={[styles.saveBar, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
            <PrimaryButton onPress={save} disabled={saving || !profileLoaded}>
              {saving ? <ActivityIndicator size="small" color={COLORS.white} /> : t('fulfillmentSettings.save')}
            </PrimaryButton>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  keyboard: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadError: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: SPACING.md },
  loadErrorText: { color: COLORS.text2, fontSize: FONT_SIZES.md, textAlign: 'center' },
  scroll: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },
  intro: { fontSize: FONT_SIZES.sm, lineHeight: 20, color: COLORS.text2, marginBottom: SPACING.md },
  section: { fontSize: 11, fontWeight: FONT_WEIGHTS.bold, color: COLORS.text3, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: SPACING.lg, marginBottom: SPACING.xs },
  group: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.card, paddingHorizontal: SPACING.md },
  toggleRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  rowIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, color: COLORS.text, fontSize: FONT_SIZES.md, fontWeight: FONT_WEIGHTS.medium },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginLeft: 48 },
  fieldRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md },
  fieldLabel: { color: COLORS.text, fontSize: FONT_SIZES.sm, flex: 1 },
  numberInputWrap: { minWidth: 92, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.row, paddingHorizontal: SPACING.sm },
  numberInput: { minWidth: 42, paddingVertical: 9, textAlign: 'right', color: COLORS.text, fontSize: FONT_SIZES.sm },
  unit: { color: COLORS.text2, fontSize: FONT_SIZES.xs, marginLeft: 5 },
  helper: { color: COLORS.text3, fontSize: FONT_SIZES.xs, lineHeight: 17, marginTop: SPACING.xs },
  feeOptions: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.row, padding: 4, gap: 4 },
  feeOption: { flexBasis: '48%', flexGrow: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderRadius: RADIUS.row - 4 },
  feeOptionActive: { backgroundColor: COLORS.coralMuted },
  feeOptionText: { color: COLORS.text2, fontSize: FONT_SIZES.xs, fontWeight: FONT_WEIGHTS.medium, textAlign: 'center' },
  feeOptionTextActive: { color: COLORS.coral, fontWeight: FONT_WEIGHTS.semibold },
  inactive: { opacity: 0.48 },
  amountGroup: { minHeight: 58, flexDirection: 'row', alignItems: 'center', marginTop: SPACING.sm },
  stepGroup: { paddingVertical: SPACING.sm, marginTop: SPACING.sm },
  rulesWrap: { marginTop: SPACING.sm, gap: SPACING.sm },
  ruleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.sm },
  ruleField: { flex: 1, gap: 6 },
  ruleLabel: { color: COLORS.text3, fontSize: FONT_SIZES.xs },
  ruleInputWrap: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.row, paddingHorizontal: SPACING.sm },
  ruleInput: { flex: 1, minWidth: 24, paddingVertical: 8, color: COLORS.text, fontSize: FONT_SIZES.sm, textAlign: 'right' },
  removeRule: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  addRule: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  addRuleText: { color: COLORS.coral, fontSize: FONT_SIZES.sm, fontWeight: FONT_WEIGHTS.semibold },
  saveBar: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.bg },
});
