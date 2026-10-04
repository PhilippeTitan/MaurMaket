import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useTranslation } from '@/localization';
import ScreenContainer from '../components/ScreenContainer';
import ScreenHeader from '../components/ScreenHeader';
import {
  approveAdminMonCashRefund,
  confirmAdminMonCashLegacyTransfer,
  getAdminMonCashLegacyTransfers,
  getAdminMonCashProcessing,
  getAdminMonCashRefunds,
  reconcileAdminMonCashTransfer,
} from '../api';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'MonCashSupport'>;
type ViewMode = 'refunds' | 'processing' | 'legacy';
type Form = { phone: string; reason: string; reference: string; note: string };
const emptyForm = (): Form => ({ phone: '', reason: '', reference: '', note: '' });

export default function MonCashSupportScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ViewMode>('refunds');
  const [refunds, setRefunds] = useState<any[]>([]);
  const [processing, setProcessing] = useState<any[]>([]);
  const [legacy, setLegacy] = useState<any[]>([]);
  const [forms, setForms] = useState<Record<string, Form>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [refundResult, processingResult, legacyResult] = await Promise.all([
        getAdminMonCashRefunds() as Promise<{ refunds: any[] }>,
        getAdminMonCashProcessing() as Promise<{ transfers: any[] }>,
        getAdminMonCashLegacyTransfers() as Promise<{ transfers: any[] }>,
      ]);
      setRefunds(refundResult.refunds || []);
      setProcessing(processingResult.transfers || []);
      setLegacy(legacyResult.transfers || []);
    } catch (error: any) {
      Alert.alert(t('common.error'), error?.message || t('moncashSupport.loadFailed'));
    } finally {
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const formFor = (id: string) => forms[id] || emptyForm();
  const updateForm = (id: string, key: keyof Form, value: string) => {
    setForms(current => ({ ...current, [id]: { ...emptyForm(), ...current[id], [key]: value } }));
  };
  const runAction = async (id: string, action: () => Promise<unknown>, success: string) => {
    setBusyId(id);
    try {
      await action();
      Alert.alert(t('common.success'), success);
      await load();
    } catch (error: any) {
      Alert.alert(t('common.error'), error?.message || t('moncashSupport.actionFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const renderInput = (id: string, key: keyof Form, placeholder: string, multiline = false) => (
    <TextInput
      value={formFor(id)[key]}
      onChangeText={value => updateForm(id, key, value)}
      placeholder={placeholder}
      placeholderTextColor={COLORS.text2}
      style={[styles.input, multiline && styles.multiline]}
      multiline={multiline}
      accessibilityLabel={placeholder}
    />
  );

  const renderButton = (id: string, label: string, onPress: () => void, tone: 'primary' | 'neutral' = 'primary') => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busyId === id}
      onPress={onPress}
      style={[styles.actionButton, tone === 'neutral' && styles.neutralButton, busyId === id && styles.disabled]}
    >
      {busyId === id ? <ActivityIndicator color={tone === 'primary' ? COLORS.bg : COLORS.text} /> : <Text style={[styles.actionText, tone === 'neutral' && styles.neutralText]}>{label}</Text>}
    </TouchableOpacity>
  );

  const renderRefund = (refund: any) => {
    const form = formFor(refund.id);
    const unresolved = refund.status === 'processing';
    return (
      <View key={refund.id} style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.amount}>G {Number(refund.amount).toFixed(2)}</Text>
          <Text style={styles.status}>{refund.status}</Text>
        </View>
        <Text style={styles.meta}>{refund.buyer_name} · {t('moncashSupport.order')} {String(refund.order_id).slice(0, 8)}</Text>
        {refund.refunded_seller_name ? <Text style={styles.meta}>{t('moncashSupport.refundForSeller', { seller: refund.refunded_seller_name })}</Text> : null}
        <Text style={styles.meta}>{t('moncashSupport.withdrawalFee')}: G {Number(refund.fee_amount || 0).toFixed(2)} · {t('moncashSupport.destination')}: {refund.destination_verified ? refund.receiver_phone : t('moncashSupport.unverified')}</Text>
        {refund.reason ? <Text style={styles.reason}>{refund.reason}</Text> : null}
        {refund.status === 'completed' ? (
          <Text style={styles.confirmed}>{t('moncashSupport.providerConfirmed')} · {refund.provider_reference || refund.moncash_reference || '—'}</Text>
        ) : unresolved ? (
          <>
            <Text style={styles.fieldLabel}>{t('moncashSupport.confirmedReference')}</Text>
            {renderInput(refund.id, 'reference', t('moncashSupport.referencePlaceholder'))}
            {renderInput(refund.id, 'note', t('moncashSupport.reconciliationNote'), true)}
            <View style={styles.buttonRow}>
              {renderButton(refund.id, t('moncashSupport.confirmPaid'), () => void runAction(refund.id, () => reconcileAdminMonCashTransfer('refund', refund.id, form.reference, 'completed', form.note), t('moncashSupport.refundReconciled')))}
              {renderButton(refund.id, t('moncashSupport.confirmFailed'), () => void runAction(refund.id, () => reconcileAdminMonCashTransfer('refund', refund.id, form.reference, 'failed', form.note), t('moncashSupport.refundReconciled')), 'neutral')}
            </View>
          </>
        ) : (
          <>
            {renderInput(refund.id, 'phone', t('moncashSupport.phonePlaceholder'))}
            {renderInput(refund.id, 'reason', t('moncashSupport.reasonPlaceholder'), true)}
            {renderButton(refund.id, refund.status === 'failed' ? t('moncashSupport.retryRefund') : t('moncashSupport.approveRefund'), () => void runAction(refund.id, () => approveAdminMonCashRefund(refund.id, form.phone, form.reason), t('moncashSupport.refundStarted')))}
          </>
        )}
      </View>
    );
  };

  const renderTransfer = (transfer: any) => {
    const form = formFor(transfer.id);
    return (
      <View key={`${transfer.kind}:${transfer.id}`} style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.amount}>G {Number(transfer.amount).toFixed(2)}</Text>
          <Text style={styles.status}>{transfer.kind.replaceAll('_', ' ')} · {transfer.status}</Text>
        </View>
        <Text style={styles.meta}>{t('moncashSupport.fee')}: G {Number(transfer.fee_amount || 0).toFixed(2)} · {t('moncashSupport.totalDebit')}: G {Number(transfer.total_debit || transfer.amount).toFixed(2)}</Text>
        {transfer.error_message ? <Text style={styles.reason}>{transfer.error_message}</Text> : null}
        {renderInput(transfer.id, 'reference', t('moncashSupport.referencePlaceholder'))}
        {renderInput(transfer.id, 'note', t('moncashSupport.reconciliationNote'), true)}
        <View style={styles.buttonRow}>
          {renderButton(transfer.id, t('moncashSupport.confirmPaid'), () => void runAction(transfer.id, () => reconcileAdminMonCashTransfer(transfer.kind, transfer.id, form.reference, 'completed', form.note), t('moncashSupport.transferReconciled')))}
          {renderButton(transfer.id, t('moncashSupport.confirmFailed'), () => void runAction(transfer.id, () => reconcileAdminMonCashTransfer(transfer.kind, transfer.id, form.reference, 'failed', form.note), t('moncashSupport.transferReconciled')), 'neutral')}
        </View>
      </View>
    );
  };

  const renderLegacy = (transfer: any) => {
    const form = formFor(transfer.id);
    return (
      <View key={`${transfer.kind}:${transfer.id}`} style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.amount}>G {Number(transfer.amount).toFixed(2)}</Text>
          <Text style={styles.status}>{transfer.kind.replaceAll('_', ' ')}</Text>
        </View>
        <Text style={styles.reason}>{t('moncashSupport.legacyWarning')}</Text>
        {renderInput(transfer.id, 'reference', t('moncashSupport.referencePlaceholder'))}
        {renderInput(transfer.id, 'note', t('moncashSupport.reconciliationNote'), true)}
        {renderButton(transfer.id, t('moncashSupport.confirmLegacy'), () => void runAction(transfer.id, () => confirmAdminMonCashLegacyTransfer(transfer.kind, transfer.id, form.reference, form.note), t('moncashSupport.legacyConfirmed')))}
      </View>
    );
  };

  const items = mode === 'refunds' ? refunds : mode === 'processing' ? processing : legacy;
  return (
    <ScreenContainer>
      <ScreenHeader title={t('moncashSupport.title')} onBack={() => navigation.goBack()} />
      <View style={styles.body}>
        <Text style={styles.intro}>{t('moncashSupport.description')}</Text>
        <View style={styles.tabs}>
          {(['refunds', 'processing', 'legacy'] as ViewMode[]).map(tab => (
            <TouchableOpacity key={tab} onPress={() => setMode(tab)} style={[styles.tab, mode === tab && styles.activeTab]} accessibilityRole="button">
              <Text style={[styles.tabText, mode === tab && styles.activeTabText]}>{t(`moncashSupport.tab.${tab}`)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={COLORS.coral} />}
          keyboardShouldPersistTaps="handled"
        >
          {items.length ? items.map(item => mode === 'refunds' ? renderRefund(item) : mode === 'legacy' ? renderLegacy(item) : renderTransfer(item)) : (
            <View style={styles.empty}><Text style={styles.emptyText}>{t('moncashSupport.empty')}</Text></View>
          )}
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  intro: { color: COLORS.text2, fontSize: 12, lineHeight: 18, paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  tabs: { flexDirection: 'row', margin: SPACING.md, padding: 4, borderRadius: RADIUS.row, backgroundColor: COLORS.surface },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.row },
  activeTab: { backgroundColor: COLORS.coral },
  tabText: { color: COLORS.text2, fontSize: 11, fontWeight: '600' },
  activeTabText: { color: COLORS.bg },
  list: { padding: SPACING.md, paddingTop: 0, gap: SPACING.md },
  card: { padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.card, backgroundColor: COLORS.surface, gap: SPACING.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  amount: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  status: { color: COLORS.coral, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  meta: { color: COLORS.text2, fontSize: 11, lineHeight: 16 },
  reason: { color: COLORS.text, fontSize: 12, lineHeight: 17 },
  confirmed: { color: COLORS.green, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  fieldLabel: { color: COLORS.text2, fontSize: 11, fontWeight: '700', marginTop: SPACING.xs },
  input: { minHeight: 46, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.row, color: COLORS.text, paddingHorizontal: SPACING.md, backgroundColor: COLORS.bg, fontSize: 13 },
  multiline: { minHeight: 70, paddingTop: SPACING.sm, textAlignVertical: 'top' },
  buttonRow: { flexDirection: 'row', gap: SPACING.sm },
  actionButton: { minHeight: 46, flex: 1, borderRadius: RADIUS.row, backgroundColor: COLORS.coral, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.md },
  neutralButton: { backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border },
  actionText: { color: COLORS.bg, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  neutralText: { color: COLORS.text },
  disabled: { opacity: 0.55 },
  empty: { padding: SPACING.xl, alignItems: 'center' },
  emptyText: { color: COLORS.text2, fontSize: 13 },
});
