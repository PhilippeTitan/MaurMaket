import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, ActivityIndicator, Animated, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, RADIUS, SPACING, TOUCH } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import SettingsGroup from '../components/SettingsGroup';
import { useTranslation } from '@/localization';
import { useToast } from '../components/Toast';
import {
  cancelDataExport, downloadDataExport, getDataExportJob, getDataExportJobs, getDataExportSummary,
  retryDataExport, startDataExport,
} from '../api';
import type { DataExportSummary, ExportJob } from '../types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'DataPrivacy'>;

type PasswordMode = 'start' | 'retry' | null;

/** Data categories the app stores, with the purpose and whether they are required or optional. */
const CATEGORIES: { icon: string; titleKey: string; bodyKey: string; optional?: boolean }[] = [
  { icon: 'account-outline', titleKey: 'dataPrivacy.catAccountTitle', bodyKey: 'dataPrivacy.catAccountBody' },
  { icon: 'shopping-outline', titleKey: 'dataPrivacy.catOrdersTitle', bodyKey: 'dataPrivacy.catOrdersBody' },
  { icon: 'message', titleKey: 'dataPrivacy.catMessagesTitle', bodyKey: 'dataPrivacy.catMessagesBody' },
  { icon: 'shield-lock-outline', titleKey: 'dataPrivacy.catSafetyTitle', bodyKey: 'dataPrivacy.catSafetyBody' },
  { icon: 'bug-outline', titleKey: 'dataPrivacy.catDiagnosticsTitle', bodyKey: 'dataPrivacy.catDiagnosticsBody' },
  { icon: 'star-four-points', titleKey: 'dataPrivacy.catPersonalizationTitle', bodyKey: 'dataPrivacy.catPersonalizationBody', optional: true },
  { icon: 'bell-outline', titleKey: 'dataPrivacy.catPromotionsTitle', bodyKey: 'dataPrivacy.catPromotionsBody', optional: true },
];

/** Retention trigger per category — a plain-language trigger, never a promised deletion date. */
const RETENTION: { icon: string; titleKey: string; bodyKey: string }[] = [
  { icon: 'account-outline', titleKey: 'dataPrivacy.retAccountTitle', bodyKey: 'dataPrivacy.retAccountBody' },
  { icon: 'cash-multiple', titleKey: 'dataPrivacy.retOrdersTitle', bodyKey: 'dataPrivacy.retOrdersBody' },
  { icon: 'message', titleKey: 'dataPrivacy.retMessagesTitle', bodyKey: 'dataPrivacy.retMessagesBody' },
  { icon: 'bug-outline', titleKey: 'dataPrivacy.retDiagnosticsTitle', bodyKey: 'dataPrivacy.retDiagnosticsBody' },
];

/** Service-provider categories and what they process on MaurMaket's behalf. */
const PROVIDERS: { icon: string; titleKey: string; bodyKey: string }[] = [
  { icon: 'cash-multiple', titleKey: 'dataPrivacy.provPaymentsTitle', bodyKey: 'dataPrivacy.provPaymentsBody' },
  { icon: 'office-building', titleKey: 'dataPrivacy.provHostingTitle', bodyKey: 'dataPrivacy.provHostingBody' },
  { icon: 'bell-ring-outline', titleKey: 'dataPrivacy.provMessagingTitle', bodyKey: 'dataPrivacy.provMessagingBody' },
  { icon: 'map-marker-outline', titleKey: 'dataPrivacy.provMapsTitle', bodyKey: 'dataPrivacy.provMapsBody' },
];

/** Finished states that can be replaced by a fresh export attempt. */
const RESTARTABLE: ExportJob['status'][] = ['failed', 'expired', 'cancelled', 'superseded'];

/** Poll a preparing export until it finishes or the bounded window runs out. */
const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 40;

function formatExpiry(value: string | null): string {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  } catch {
    return '';
  }
}

export default function DataPrivacyScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const toast = useToast();

  const [summary, setSummary] = useState<DataExportSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [job, setJob] = useState<ExportJob | null>(null);
  const [hasPassword, setHasPassword] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [passwordMode, setPasswordMode] = useState<PasswordMode>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollAttempts = useRef(0);
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    let subscription: { remove?: () => void } | undefined;
    const show = () => entrance.setValue(1);
    AccessibilityInfo.isReduceMotionEnabled()
      .then(reduce => { if (active && !reduce) Animated.timing(entrance, { toValue: 1, duration: 280, useNativeDriver: true }).start(); })
      .catch(() => { if (active) Animated.timing(entrance, { toValue: 1, duration: 280, useNativeDriver: true }).start(); });
    subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (reduce: boolean) => { if (reduce) show(); });
    return () => { active = false; subscription?.remove?.(); entrance.stopAnimation(); };
  }, [entrance]);

  // ── Data summary (counts only, so no re-authentication is needed) ──
  const loadSummary = useCallback(async () => {
    if (summaryLoading) return;
    setSummaryLoading(true);
    try {
      const data = await getDataExportSummary();
      setSummary(data);
    } catch {
      toast.error(t('dataPrivacy.summaryTitle'), t('dataPrivacy.summaryFailed'));
    } finally {
      setSummaryLoading(false);
    }
  }, [summaryLoading, t, toast]);

  // ── Export job state (private to this account) ──
  const loadExportState = useCallback(async () => {
    try {
      const data = await getDataExportJobs();
      setJob(data.jobs[0] || null);
      setHasPassword(data.has_password);
    } catch {
      // Leave the section usable; actions will surface their own errors.
    }
  }, []);

  useEffect(() => { void loadExportState(); }, [loadExportState]);

  // Poll while an export is being prepared, bounded so a stuck job cannot poll forever.
  useEffect(() => {
    if (job?.status !== 'pending') {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      pollAttempts.current = 0;
      return;
    }
    if (pollRef.current) return;
    pollAttempts.current = 0;
    const jobId = job.id;
    pollRef.current = setInterval(() => {
      pollAttempts.current += 1;
      if (pollAttempts.current > POLL_MAX_ATTEMPTS) {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        return;
      }
      getDataExportJob(jobId)
        .then(({ job: next }) => {
          setJob(next);
          if (next.status !== 'pending' && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        })
        .catch(() => { /* transient; keep polling */ });
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [job?.status, job?.id]);

  const closePasswordModal = useCallback(() => {
    setPasswordMode(null);
    setPassword('');
    setPasswordError('');
  }, []);

  const applyStartedJob = useCallback((next: ExportJob, nextHasPassword: boolean) => {
    setJob(next);
    setHasPassword(nextHasPassword);
    closePasswordModal();
    toast.success(t('dataPrivacy.exportStartedTitle'), t('dataPrivacy.exportStartedBody'));
  }, [closePasswordModal, t, toast]);

  const handleStartFailure = useCallback((err: any, fromModal: boolean) => {
    if (err?.code === 'INVALID_PASSWORD') {
      setPasswordError(t('dataPrivacy.exportPasswordWrong'));
      return;
    }
    if (err?.code === 'PASSWORD_REQUIRED') {
      setPasswordError(t('dataPrivacy.exportPasswordRequired'));
      return;
    }
    if (fromModal) {
      setPasswordError(t('dataPrivacy.exportGenericError'));
      return;
    }
    toast.error(t('dataPrivacy.exportFailedTitle'), t('dataPrivacy.exportFailed'));
  }, [t, toast]);

  const runStartExport = useCallback(async (pw: string | undefined, fromModal: boolean) => {
    if (exportBusy) return;
    setExportBusy(true);
    try {
      const res = await startDataExport(pw);
      applyStartedJob(res.job, res.has_password);
    } catch (err: any) {
      handleStartFailure(err, fromModal);
    } finally {
      setExportBusy(false);
    }
  }, [applyStartedJob, exportBusy, handleStartFailure]);

  const runRetryExport = useCallback(async (pw: string | undefined, fromModal: boolean) => {
    if (!job || exportBusy) return;
    setExportBusy(true);
    try {
      const res = await retryDataExport(job.id, pw);
      applyStartedJob(res.job, res.has_password);
    } catch (err: any) {
      handleStartFailure(err, fromModal);
    } finally {
      setExportBusy(false);
    }
  }, [applyStartedJob, exportBusy, handleStartFailure, job]);

  /** Ask for a password first when the account has one; otherwise start directly. */
  const beginPrepare = useCallback(() => {
    const isRetry = job != null && RESTARTABLE.includes(job.status);
    if (hasPassword) {
      setPassword('');
      setPasswordError('');
      setPasswordMode(isRetry ? 'retry' : 'start');
      return;
    }
    if (isRetry) void runRetryExport(undefined, false);
    else void runStartExport(undefined, false);
  }, [hasPassword, job, runRetryExport, runStartExport]);

  const confirmPassword = useCallback(() => {
    if (passwordMode === 'retry') void runRetryExport(password, true);
    else void runStartExport(password, true);
  }, [password, passwordMode, runRetryExport, runStartExport]);

  const handleCancelExport = useCallback(async () => {
    if (!job || exportBusy) return;
    setExportBusy(true);
    try {
      const res = await cancelDataExport(job.id);
      setJob(res.job);
      toast.info(t('dataPrivacy.exportCancelledTitle'), t('dataPrivacy.exportCancelled'));
    } catch {
      toast.error(t('dataPrivacy.exportCancelFailedTitle'), t('dataPrivacy.exportCancelFailed'));
      void loadExportState();
    } finally {
      setExportBusy(false);
    }
  }, [exportBusy, job, loadExportState, t, toast]);

  const handleDownload = useCallback(async () => {
    if (!job || downloadBusy) return;
    setDownloadBusy(true);
    try {
      const res = await downloadDataExport(job.id);
      const payload = JSON.stringify(res.data, null, 2);
      await Clipboard.setStringAsync(payload);
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const blob = new Blob([payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `maurmaket-data-${Date.now()}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      }
      toast.success(t('dataPrivacy.copyTitle'), t('dataPrivacy.copied'));
    } catch (err: any) {
      // The archive may have expired (or just finished) since we last checked.
      if (err?.code === 'EXPORT_UNAVAILABLE' || err?.code === 'EXPORT_NOT_READY') void loadExportState();
      toast.error(t('dataPrivacy.copyTitle'), t('dataPrivacy.copyFailed'));
    } finally {
      setDownloadBusy(false);
    }
  }, [downloadBusy, job, loadExportState, t, toast]);

  const isPending = job?.status === 'pending';
  const isReady = job?.status === 'ready';
  const canPrepare = job == null || RESTARTABLE.includes(job.status);
  const prepareLabel = job?.status === 'failed' ? t('dataPrivacy.exportRetry') : job ? t('dataPrivacy.exportStartAgain') : t('dataPrivacy.exportStart');

  const animStyle = {
    opacity: entrance,
    transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('dataPrivacy.title')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={animStyle}>
          <Text style={styles.intro}>{t('dataPrivacy.intro')}</Text>
          <Text style={styles.footerNote}>{t('dataPrivacy.footer')}</Text>
        </Animated.View>

        {/* ── What we store and why ── */}
        <Animated.View style={animStyle}>
          <SettingsGroup header={t('dataPrivacy.categoriesTitle')}>
            {CATEGORIES.map((item, index) => (
              <View key={item.titleKey} style={[styles.infoRow, index < CATEGORIES.length - 1 && styles.divider]}>
                <View style={styles.iconContainer}>
                  <MaterialCommunityIcons name={item.icon as any} size={20} color={COLORS.text2} />
                </View>
                <View style={styles.infoText}>
                  <View style={styles.titleLine}>
                    <Text style={styles.infoTitle}>{t(item.titleKey)}</Text>
                    <View style={[styles.tag, item.optional ? styles.tagOptional : styles.tagRequired]}>
                      <Text style={[styles.tagText, item.optional ? styles.tagTextOptional : styles.tagTextRequired]}>
                        {item.optional ? t('dataPrivacy.optionalTag') : t('dataPrivacy.requiredTag')}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.infoBody}>{t(item.bodyKey)}</Text>
                </View>
              </View>
            ))}
          </SettingsGroup>
        </Animated.View>

        {/* ── Retention ── */}
        <Animated.View style={animStyle}>
          <SettingsGroup header={t('dataPrivacy.retentionTitle')} footer={t('dataPrivacy.retentionCaveat')}>
            <View style={styles.paddedNote}>
              <Text style={styles.noteText}>{t('dataPrivacy.retentionIntro')}</Text>
            </View>
            {RETENTION.map((item, index) => (
              <View key={item.titleKey} style={[styles.infoRow, index < RETENTION.length - 1 && styles.divider]}>
                <View style={styles.iconContainer}>
                  <MaterialCommunityIcons name={item.icon as any} size={20} color={COLORS.text2} />
                </View>
                <View style={styles.infoText}>
                  <Text style={styles.infoTitle}>{t(item.titleKey)}</Text>
                  <Text style={styles.infoBody}>{t(item.bodyKey)}</Text>
                </View>
              </View>
            ))}
          </SettingsGroup>
        </Animated.View>

        {/* ── Providers ── */}
        <Animated.View style={animStyle}>
          <SettingsGroup header={t('dataPrivacy.providersTitle')}>
            <View style={styles.paddedNote}>
              <Text style={styles.noteText}>{t('dataPrivacy.providersIntro')}</Text>
            </View>
            {PROVIDERS.map((item, index) => (
              <View key={item.titleKey} style={[styles.infoRow, index < PROVIDERS.length - 1 && styles.divider]}>
                <View style={styles.iconContainer}>
                  <MaterialCommunityIcons name={item.icon as any} size={20} color={COLORS.text2} />
                </View>
                <View style={styles.infoText}>
                  <Text style={styles.infoTitle}>{t(item.titleKey)}</Text>
                  <Text style={styles.infoBody}>{t(item.bodyKey)}</Text>
                </View>
              </View>
            ))}
          </SettingsGroup>
        </Animated.View>

        {/* ── Optional vs essential ── */}
        <Animated.View style={animStyle}>
          <SettingsGroup header={t('dataPrivacy.consentTitle')}>
            <View style={styles.paddedNote}>
              <Text style={styles.noteText}>{t('dataPrivacy.consentBody')}</Text>
            </View>
          </SettingsGroup>
        </Animated.View>

        {/* ── Your controls ── */}
        <Animated.View style={animStyle}>
          <SettingsGroup header={t('dataPrivacy.controlsTitle')}>
            {/* Correct */}
            <ActionRow
              icon="pencil-outline"
              title={t('dataPrivacy.correctTitle')}
              body={t('dataPrivacy.correctBody')}
              onPress={() => navigation.navigate('EditProfile')}
            />
            <View style={styles.divider} />
            {/* Privacy requests → real in-app Help & Support (Support API seam stays disconnected) */}
            <ActionRow
              icon="message-plus-outline"
              title={t('dataPrivacy.requestsTitle')}
              body={t('dataPrivacy.requestsBody')}
              onPress={() => navigation.navigate('HelpSupport')}
            />
            <View style={styles.divider} />
            {/* Your data summary — counts only, no export copy is produced */}
            <View style={styles.infoRow}>
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="clipboard-text-outline" size={20} color={COLORS.text2} />
              </View>
              <View style={styles.infoText}>
                <Text style={styles.infoTitle}>{t('dataPrivacy.summaryTitle')}</Text>
                <Text style={styles.infoBody}>{t('dataPrivacy.summaryBody')}</Text>
                {summary ? (
                  <View style={styles.countRow}>
                    <Count label={t('dataPrivacy.summaryOrders')} value={summary.orders} />
                    <Count label={t('dataPrivacy.summaryMessages')} value={summary.messages} />
                    <Count label={t('dataPrivacy.summaryReviews')} value={summary.reviews} />
                    <Count label={t('dataPrivacy.summaryNotifications')} value={summary.notifications} />
                    <Count label={t('dataPrivacy.summarySecurity')} value={summary.security_events} />
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.inlineAction}
                    onPress={() => void loadSummary()}
                    disabled={summaryLoading}
                    accessibilityRole="button"
                    accessibilityState={{ busy: summaryLoading, disabled: summaryLoading }}
                    accessibilityLabel={t('dataPrivacy.summaryLoad')}
                  >
                    {summaryLoading
                      ? <MaterialCommunityIcons name="loading" size={16} color={COLORS.coral} />
                      : <MaterialCommunityIcons name="content-paste" size={16} color={COLORS.coral} />}
                    <Text style={styles.inlineActionText}>
                      {summaryLoading ? t('dataPrivacy.summaryLoading') : t('dataPrivacy.summaryLoad')}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <View style={styles.divider} />
            {/* Structured export — identity-confirmed job with private status,
                expiry, cancellation while generating, and safe retry. */}
            <View style={styles.infoRow}>
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="content-copy" size={20} color={COLORS.text2} />
              </View>
              <View style={styles.infoText}>
                <Text style={styles.infoTitle}>{t('dataPrivacy.copyTitle')}</Text>
                <Text style={styles.infoBody}>{t('dataPrivacy.copyBody')}</Text>

                {isPending ? (
                  <>
                    <View style={styles.statusRow}>
                      <ActivityIndicator size="small" color={COLORS.coral} />
                      <Text style={styles.statusBusyText}>{t('dataPrivacy.exportPreparing')}</Text>
                    </View>
                    <Text style={styles.noteText}>{t('dataPrivacy.exportPreparingNote')}</Text>
                    <TouchableOpacity
                      style={styles.inlineAction}
                      onPress={() => { void handleCancelExport(); }}
                      disabled={exportBusy}
                      accessibilityRole="button"
                      accessibilityState={{ busy: exportBusy, disabled: exportBusy }}
                      accessibilityLabel={t('dataPrivacy.exportCancel')}
                    >
                      <MaterialCommunityIcons name="close" size={16} color={COLORS.coral} />
                      <Text style={styles.inlineActionText}>{t('dataPrivacy.exportCancel')}</Text>
                    </TouchableOpacity>
                  </>
                ) : null}

                {isReady ? (
                  <>
                    <Text style={styles.statusReadyText}>{t('dataPrivacy.exportReady')}</Text>
                    {job?.expires_at ? (
                      <Text style={styles.noteText}>{t('dataPrivacy.exportExpires', { date: formatExpiry(job.expires_at) })}</Text>
                    ) : null}
                    <TouchableOpacity
                      style={styles.inlineAction}
                      onPress={() => { void handleDownload(); }}
                      disabled={downloadBusy}
                      accessibilityRole="button"
                      accessibilityState={{ busy: downloadBusy, disabled: downloadBusy }}
                      accessibilityLabel={t('dataPrivacy.copyAction')}
                    >
                      {downloadBusy
                        ? <ActivityIndicator size="small" color={COLORS.coral} />
                        : <MaterialCommunityIcons name="content-copy" size={16} color={COLORS.coral} />}
                      <Text style={styles.inlineActionText}>{t('dataPrivacy.copyAction')}</Text>
                    </TouchableOpacity>
                    <Text style={styles.noteText}>{t('dataPrivacy.exportOutsideControl')}</Text>
                  </>
                ) : null}

                {canPrepare ? (
                  <>
                    {job?.status === 'failed' ? <Text style={styles.noteText}>{t('dataPrivacy.exportFailed')}</Text> : null}
                    {job?.status === 'expired' ? <Text style={styles.noteText}>{t('dataPrivacy.exportExpired')}</Text> : null}
                    {job?.status === 'cancelled' || job?.status === 'superseded' ? (
                      <Text style={styles.noteText}>{t('dataPrivacy.exportCancelled')}</Text>
                    ) : null}
                    <TouchableOpacity
                      style={styles.inlineAction}
                      onPress={beginPrepare}
                      disabled={exportBusy}
                      accessibilityRole="button"
                      accessibilityState={{ busy: exportBusy, disabled: exportBusy }}
                      accessibilityLabel={prepareLabel}
                    >
                      {exportBusy
                        ? <ActivityIndicator size="small" color={COLORS.coral} />
                        : <MaterialCommunityIcons name="lock-outline" size={16} color={COLORS.coral} />}
                      <Text style={styles.inlineActionText}>{prepareLabel}</Text>
                    </TouchableOpacity>
                    <Text style={styles.noteText}>{t('dataPrivacy.exportNote')}</Text>
                  </>
                ) : null}
              </View>
            </View>
            <View style={styles.divider} />
            {/* Full policy */}
            <ActionRow
              icon="file-document-outline"
              title={t('dataPrivacy.policyAction')}
              body=""
              onPress={() => { void Linking.openURL('https://maurmaket.com/privacy'); }}
            />
            <View style={styles.paddedNote}>
              <Text style={styles.noteText}>{t('dataPrivacy.requestsNotice')}</Text>
            </View>
          </SettingsGroup>
        </Animated.View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* ── Re-authentication before preparing an export (Batch 74/75) ── */}
      <Modal visible={!!passwordMode} transparent animationType="fade" onRequestClose={closePasswordModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('dataPrivacy.exportConfirmTitle')}</Text>
              <TouchableOpacity
                onPress={closePasswordModal}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <MaterialCommunityIcons name="close" size={20} color={COLORS.text3} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalCopy}>
              {hasPassword ? t('dataPrivacy.exportConfirmBody') : t('dataPrivacy.exportConfirmNoPassword')}
            </Text>
            {hasPassword ? (
              <>
                <Text style={styles.fieldLabel}>{t('dataPrivacy.exportPasswordLabel')}</Text>
                <TextInput
                  value={password}
                  onChangeText={(next) => { setPassword(next); if (passwordError) setPasswordError(''); }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={t('dataPrivacy.exportPasswordPlaceholder')}
                  placeholderTextColor={COLORS.text3}
                  style={styles.input}
                  accessibilityLabel={t('dataPrivacy.exportPasswordLabel')}
                />
              </>
            ) : null}
            {passwordError ? <Text style={styles.modalError}>{passwordError}</Text> : null}
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={confirmPassword}
              disabled={exportBusy || (hasPassword && !password)}
              accessibilityRole="button"
              accessibilityState={{ busy: exportBusy, disabled: exportBusy || (hasPassword && !password) }}
            >
              {exportBusy
                ? <ActivityIndicator color={COLORS.white} />
                : <Text style={styles.primaryButtonText}>{t('dataPrivacy.exportConfirmButton')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ActionRow({ icon, title, body, onPress }: { icon: string; title: string; body: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.infoRow}
      activeOpacity={0.65}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.iconContainer}>
        <MaterialCommunityIcons name={icon as any} size={20} color={COLORS.text2} />
      </View>
      <View style={styles.infoText}>
        <Text style={styles.infoTitle}>{title}</Text>
        {body ? <Text style={styles.infoBody}>{body}</Text> : null}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text3} />
    </TouchableOpacity>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.countCell}>
      <Text style={styles.countValue}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingBottom: SPACING.xxxl },
  intro: { fontSize: FONT_SIZES.md, color: COLORS.text2, lineHeight: 20, marginHorizontal: SPACING.lg, marginTop: SPACING.md },
  footerNote: { fontSize: FONT_SIZES.sm, color: COLORS.text3, lineHeight: 18, marginHorizontal: SPACING.lg, marginTop: SPACING.sm },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    minHeight: TOUCH.min,
  },
  iconContainer: {
    width: 28,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  infoText: { flex: 1 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  infoTitle: { fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.medium, color: COLORS.text },
  infoBody: { fontSize: FONT_SIZES.sm, color: COLORS.text2, marginTop: 2, lineHeight: 18 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginLeft: SPACING.sm + 28 + SPACING.md },
  paddedNote: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm },
  noteText: { fontSize: FONT_SIZES.sm, color: COLORS.text3, lineHeight: 18, marginTop: SPACING.xs },

  tag: { paddingHorizontal: SPACING.sm, paddingVertical: 1, borderRadius: RADIUS.pill, borderWidth: 1 },
  tagRequired: { borderColor: COLORS.borderLight },
  tagOptional: { borderColor: COLORS.coral },
  tagText: { fontSize: FONT_SIZES.xs, fontWeight: FONT_WEIGHTS.semibold },
  tagTextRequired: { color: COLORS.text3 },
  tagTextOptional: { color: COLORS.coral },

  inlineAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    minHeight: TOUCH.min,
    marginTop: SPACING.xs,
  },
  inlineActionText: { fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.coral },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.sm },
  statusBusyText: { fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.medium, color: COLORS.text },
  statusReadyText: { fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.green, marginTop: SPACING.sm },

  countRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
  countCell: { minWidth: 72, paddingVertical: SPACING.xs, paddingHorizontal: SPACING.sm, borderRadius: RADIUS.row, backgroundColor: COLORS.surface2 },
  countValue: { fontSize: FONT_SIZES.lg, fontWeight: FONT_WEIGHTS.bold, color: COLORS.text },
  countLabel: { fontSize: FONT_SIZES.xs, color: COLORS.text3, marginTop: 1 },

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

  bottomSpacer: { height: 60 },
});
