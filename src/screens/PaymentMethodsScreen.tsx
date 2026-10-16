import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING, RADIUS } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import SettingsLinkButton from '../components/SettingsLinkButton';
import { useTranslation } from '@/localization';
import { useToast } from '../components/Toast';
import { getNatCashAccess, getPayoutDestination, updatePayoutDestination, updateSellerProfile } from '../api';
import { store } from '../store';
import type { RootStackParamList } from '../navigation';
import moncashLogo from '../../assets/MonNatCash/moncash.webp';
import natcashLogo from '../../assets/MonNatCash/natcash.webp';

type Props = NativeStackScreenProps<RootStackParamList, 'PaymentMethods'>;
type AccessState = { source: string | null; status: string; entitled: boolean; paymentMethodEnabled?: boolean; phoneConfigured?: boolean; expiresAt?: string | null; inGracePeriod?: boolean };

const maskDestination = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return `+509 •••• ${digits.slice(-4)}`;
};

export default function PaymentMethodsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const toast = useToast();
  const isSeller = store.isSeller;

  const [loading, setLoading] = useState(isSeller);
  const [hasPassword, setHasPassword] = useState(false);
  const [destination, setDestination] = useState<string | null>(store.user?.phone || null);
  const [access, setAccess] = useState<AccessState | null>(null);
  const [busy, setBusy] = useState(false);

  const [destModal, setDestModal] = useState(false);
  const [destValue, setDestValue] = useState('');
  const [destPassword, setDestPassword] = useState('');
  const [destError, setDestError] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!isSeller) { setLoading(false); return; }
    try {
      const [dest, natcash] = await Promise.all([
        getPayoutDestination(),
        getNatCashAccess() as Promise<{ access: AccessState }>,
      ]);
      setDestination(dest.destination);
      setHasPassword(dest.has_password);
      setAccess(natcash.access);
    } catch (error) {
      toast.error(t('common.error'), error instanceof Error ? error.message : t('settings.failed'));
    } finally {
      setLoading(false);
    }
  }, [isSeller, t, toast]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const openDestinationModal = () => {
    setDestValue(destination || '');
    setDestPassword('');
    setDestError('');
    setDestModal(true);
  };

  const saveDestination = async () => {
    const normalized = destValue.replace(/[\s()-]/g, '').replace(/^\+?509/, '').replace(/^\+/, '');
    if (!/^\d{8}$/.test(normalized)) {
      setDestError(t('paymentMethods.destinationInvalid'));
      return;
    }
    setSaving(true);
    setDestError('');
    try {
      const result = await updatePayoutDestination(normalized, hasPassword ? destPassword.trim() : undefined);
      await store.setUser(result.user, store.token);
      setDestination(result.destination);
      setDestModal(false);
      toast.success(t('paymentMethods.destinationModalTitle'), t('paymentMethods.destinationSuccess'));
    } catch (error) {
      const code = (error as any)?.code;
      if (code === 'PASSWORD_REQUIRED') setDestError(t('paymentMethods.destinationPasswordRequired'));
      else if (code === 'INVALID_PASSWORD') setDestError(t('paymentMethods.destinationPasswordWrong'));
      else if (code === 'INVALID_DESTINATION') setDestError(t('paymentMethods.destinationInvalid'));
      else toast.error(t('common.error'), error instanceof Error ? error.message : t('settings.failed'));
    } finally {
      setSaving(false);
    }
  };

  const setAcceptingNatCash = async (enabled: boolean) => {
    if (!access?.entitled || !access.phoneConfigured) return;
    setBusy(true);
    try {
      const methods = new Set(store.user?.accepted_payment_methods || ['moncash']);
      if (enabled) methods.add('natcash'); else methods.delete('natcash');
      const result = await updateSellerProfile({ acceptedPaymentMethods: [...methods] }) as { user?: any };
      if (result.user) {
        await store.setUser(result.user, store.token);
        setAccess(current => current ? { ...current, paymentMethodEnabled: (result.user.accepted_payment_methods || []).includes('natcash') } : current);
      }
    } catch (error) {
      toast.error(t('common.error'), error instanceof Error ? error.message : t('settings.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('settings.paymentMethods')} onBack={() => navigation.goBack()} />
      {loading ? (
        <View style={styles.loader}><ActivityIndicator color={COLORS.coral} /></View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACING.xl }]}>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('paymentMethods.paySection')}</Text>
            <MethodRow logo={moncashLogo} title={t('paymentMethods.moncashTitle')} body={t('paymentMethods.moncashBody')} alt="MonCash" />
            <View style={styles.rule} />
            <MethodRow logo={natcashLogo} title={t('paymentMethods.natcashTitle')} body={t('paymentMethods.natcashBody')} alt="NatCash" />
          </View>

          {isSeller ? (
            <>
              <View style={styles.card}>
                <View style={styles.headingRow}>
                  <View style={styles.icon}><MaterialCommunityIcons name="bank-transfer-out" size={22} color={COLORS.coral} /></View>
                  <Text style={styles.sectionTitle}>{t('paymentMethods.destinationSection')}</Text>
                </View>
                <Text style={styles.body}>{t('paymentMethods.destinationBody')}</Text>
                <View style={styles.destinationRow}>
                  <Text style={styles.destinationLabel}>{t('paymentMethods.destinationNumberLabel')}</Text>
                  <Text numberOfLines={1} style={destination ? styles.destinationText : styles.destinationEmptyText}>
                    {destination ? maskDestination(destination) : t('paymentMethods.destinationMissing')}
                  </Text>
                </View>
                <View style={styles.buttonRow}>
                  <SettingsLinkButton small onPress={openDestinationModal}>
                    {destination ? t('paymentMethods.destinationChange') : t('paymentMethods.destinationAdd')}
                  </SettingsLinkButton>
                  <SettingsLinkButton small onPress={() => navigation.navigate('Payments')}>
                    {t('paymentMethods.viewPayouts')}
                  </SettingsLinkButton>
                </View>
              </View>

              <View style={styles.card}>
                <View style={styles.headingRow}>
                  <View style={styles.iconPurple}><MaterialCommunityIcons name="cash-multiple" size={22} color={COLORS.purple} /></View>
                  <Text style={styles.sectionTitle}>{t('paymentMethods.natcashTitle')}</Text>
                </View>
                <TouchableOpacity
                  style={styles.detailRow}
                  activeOpacity={0.65}
                  onPress={() => navigation.navigate('SettingsEdit', { field: 'natcash_phone', title: t('natcashAccess.phoneTitle') })}
                  accessibilityRole="button"
                  accessibilityLabel={t('paymentMethods.natcashNumberSection')}
                >
                  <View style={styles.headingText}>
                    <Text style={styles.rowTitle}>{t('paymentMethods.natcashNumberSection')}</Text>
                    <Text style={styles.meta}>{store.user?.natcash_phone || t('natcashAccess.addPhone')}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text3} />
                </TouchableOpacity>
                <View style={styles.rule} />
                <View style={styles.toggleRow}>
                  <View style={styles.headingText}>
                    <Text style={styles.rowTitle}>{t('natcashAccess.acceptOrders')}</Text>
                    <Text style={styles.meta}>
                      {!access?.entitled
                        ? t('natcashAccess.enableAfterPayment')
                        : !access.phoneConfigured
                          ? t('natcashAccess.addPhoneFirst')
                          : t('natcashAccess.acceptOrdersHint')}
                    </Text>
                  </View>
                  <Switch
                    value={!!access?.paymentMethodEnabled}
                    onValueChange={setAcceptingNatCash}
                    disabled={!access?.entitled || !access.phoneConfigured || busy}
                    trackColor={{ false: COLORS.borderLight, true: COLORS.green }}
                    thumbColor={COLORS.white}
                    accessibilityLabel={t('natcashAccess.acceptOrders')}
                  />
                </View>
                <SettingsLinkButton onPress={() => navigation.navigate('NatCashAccess')} style={styles.manageLink}>
                  {t('paymentMethods.manageAccess')}
                </SettingsLinkButton>
              </View>
            </>
          ) : null}

          <Text style={styles.footnote}>{t('paymentMethods.footnote')}</Text>
        </ScrollView>
      )}

      <Modal visible={destModal} transparent animationType="fade" onRequestClose={() => setDestModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('paymentMethods.destinationModalTitle')}</Text>
              <TouchableOpacity
                onPress={() => setDestModal(false)}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <MaterialCommunityIcons name="close" size={20} color={COLORS.text3} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalCopy}>
              {hasPassword ? t('paymentMethods.destinationModalBody') : t('paymentMethods.destinationModalBodyNoAuth')}
            </Text>
            <Text style={styles.fieldLabel}>{t('paymentMethods.destinationNumberLabel')}</Text>
            <TextInput
              value={destValue}
              onChangeText={(next) => { setDestValue(next); if (destError) setDestError(''); }}
              keyboardType="phone-pad"
              maxLength={16}
              placeholder={t('paymentMethods.destinationNumberPlaceholder')}
              placeholderTextColor={COLORS.text3}
              style={styles.input}
              accessibilityLabel={t('paymentMethods.destinationNumberLabel')}
            />
            {hasPassword ? (
              <>
                <Text style={styles.fieldLabel}>{t('paymentMethods.destinationPasswordLabel')}</Text>
                <TextInput
                  value={destPassword}
                  onChangeText={(next) => { setDestPassword(next); if (destError) setDestError(''); }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={t('dataPrivacy.exportPasswordPlaceholder')}
                  placeholderTextColor={COLORS.text3}
                  style={styles.input}
                  accessibilityLabel={t('paymentMethods.destinationPasswordLabel')}
                />
              </>
            ) : null}
            {destError ? <Text style={styles.modalError}>{destError}</Text> : null}
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={saveDestination}
              disabled={saving || (hasPassword && !destPassword)}
              accessibilityRole="button"
              accessibilityState={{ busy: saving, disabled: saving || (hasPassword && !destPassword) }}
            >
              {saving
                ? <ActivityIndicator color={COLORS.white} />
                : <Text style={styles.primaryButtonText}>{t('paymentMethods.destinationConfirm')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MethodRow({ logo, title, body, alt }: { logo: any; title: string; body: string; alt: string }) {
  return (
    <View style={styles.methodRow}>
      <Image source={logo} style={styles.methodLogo} resizeMode="contain" accessibilityLabel={alt} />
      <View style={styles.headingText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.meta}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xl },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.card, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg, gap: SPACING.md },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface2 },
  iconPurple: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.purpleMuted },
  headingText: { flex: 1, gap: 4 },
  sectionTitle: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  rowTitle: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  meta: { color: COLORS.text2, fontSize: 13, lineHeight: 18 },
  body: { color: COLORS.text2, fontSize: 14, lineHeight: 21 },
  rule: { height: 1, backgroundColor: COLORS.border },
  methodRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, minHeight: 44 },
  methodLogo: { width: 40, height: 40 },
  destinationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md, minHeight: 44 },
  destinationLabel: { color: COLORS.text2, fontSize: 13, fontWeight: '600' },
  destinationText: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  destinationEmptyText: { color: COLORS.text3, fontSize: 13 },
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, minHeight: 44 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  manageLink: { minHeight: 44 },
  footnote: { color: COLORS.text3, fontSize: 12, lineHeight: 18 },

  modalBackdrop: { flex: 1, justifyContent: 'center', padding: SPACING.lg, backgroundColor: 'rgba(0,0,0,0.76)' },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    padding: SPACING.lg,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { color: COLORS.text, fontSize: FONT_SIZES.lg, fontWeight: FONT_WEIGHTS.bold, flex: 1 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -SPACING.sm, marginTop: -SPACING.sm },
  modalCopy: { color: COLORS.text2, fontSize: FONT_SIZES.sm, lineHeight: 20 },
  fieldLabel: { color: COLORS.text2, fontSize: FONT_SIZES.xs, fontWeight: FONT_WEIGHTS.semibold, marginBottom: -SPACING.xs },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.card,
    paddingHorizontal: SPACING.md,
    color: COLORS.text,
    backgroundColor: COLORS.bg,
    fontSize: FONT_SIZES.base,
  },
  modalError: { color: COLORS.coral, fontSize: FONT_SIZES.sm, lineHeight: 18 },
  primaryButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.card, backgroundColor: COLORS.coral, marginTop: SPACING.xs },
  primaryButtonText: { color: COLORS.white, fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.bold },
});
