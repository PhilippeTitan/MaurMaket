import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, Animated, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, RADIUS, SPACING, TOUCH } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import SettingsGroup from '../components/SettingsGroup';
import { useTranslation } from '@/localization';
import { useToast } from '../components/Toast';
import { getPolicies, acceptPolicy, dismissPolicyNotice, OfflineError } from '../api';
import type { PolicyDocumentState, PolicyState } from '../types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'LegalPrivacy'>;

function formatDate(value?: string | null): string {
  if (!value) return '';
  try { return new Date(value).toLocaleDateString(); } catch { return ''; }
}

export default function LegalPrivacyScreen({ navigation }: Props) {
  const { t, language } = useTranslation();
  const toast = useToast();

  const [state, setState] = useState<PolicyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKind, setBusyKind] = useState<string | null>(null);
  const [declineKind, setDeclineKind] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    let subscription: { remove?: () => void } | undefined;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(reduce => { if (active) { if (reduce) entrance.setValue(1); else Animated.timing(entrance, { toValue: 1, duration: 280, useNativeDriver: true }).start(); } })
      .catch(() => { if (active) Animated.timing(entrance, { toValue: 1, duration: 280, useNativeDriver: true }).start(); });
    subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (reduce: boolean) => { if (reduce) entrance.setValue(1); });
    return () => { active = false; subscription?.remove?.(); entrance.stopAnimation(); };
  }, [entrance]);

  // Load on open, when the app language changes, and after a confirmed change.
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const next = await getPolicies(language);
        if (active) setState(next);
      } catch {
        if (active) toast.error(t('legal.title'), t('legal.loadFailed'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, reloadKey]);

  const handleAccept = useCallback(async (doc: PolicyDocumentState) => {
    if (busyKind) return;
    setBusyKind(doc.kind);
    try {
      await acceptPolicy(doc.kind, doc.version);
      setDeclineKind(null);
      setReloadKey(k => k + 1);
      toast.success(t('legal.title'), t('legal.acceptedToast'));
    } catch (err: any) {
      if (err instanceof OfflineError) {
        // APP-Q365: acceptance is only recorded once the server confirms it.
        toast.error(t('legal.title'), t('legal.offlineAccept'));
      } else if (err?.code === 'POLICY_VERSION_STALE') {
        setReloadKey(k => k + 1);
        toast.error(t('legal.title'), t('legal.staleVersion'));
      } else {
        toast.error(t('legal.title'), t('legal.acceptFailed'));
      }
    } finally {
      setBusyKind(null);
    }
  }, [busyKind, t, toast]);

  const handleDismiss = useCallback(async (doc: PolicyDocumentState) => {
    if (busyKind) return;
    setBusyKind(doc.kind);
    try {
      await dismissPolicyNotice(doc.kind, doc.version);
      setReloadKey(k => k + 1);
    } catch {
      toast.error(t('legal.title'), t('legal.loadFailed'));
    } finally {
      setBusyKind(null);
    }
  }, [busyKind, t, toast]);

  const animStyle = {
    opacity: entrance,
    transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  };

  const needsAcceptance = state?.needs_acceptance?.length ? state.needs_acceptance : [];
  const documents = state?.documents || [];
  const retainedNotices = documents.filter(d => d.notice_dismissed);
  const history = state?.history || [];

  const kindLabel = (kind: string) => (kind === 'privacy' ? t('legal.historyPrivacy') : t('legal.historyTerms'));

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('legal.title')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={animStyle}>
          <Text style={styles.intro}>{t('legal.intro')}</Text>
        </Animated.View>

        {/* Material-change notice (APP-Q356, APP-Q357) */}
        {needsAcceptance.length > 0 ? (
          <Animated.View style={animStyle}>
            <View style={styles.noticeCard}>
              <View style={styles.noticeHeader}>
                <MaterialCommunityIcons name="alert-decagram-outline" size={20} color={COLORS.coral} />
                <Text style={styles.noticeTitle}>{t('legal.noticeTitle')}</Text>
              </View>
              <Text style={styles.noticeBody}>{t('legal.noticeBody')}</Text>
            </View>
          </Animated.View>
        ) : null}

        {loading && documents.length === 0 ? (
          <Animated.View style={animStyle}>
            <View style={styles.loadingRow}>
              <MaterialCommunityIcons name="loading" size={18} color={COLORS.text3} />
              <Text style={styles.rowBody}>{t('legal.subtitle')}</Text>
            </View>
          </Animated.View>
        ) : null}

        {/* Current documents (APP-Q359, APP-Q361, APP-Q362) */}
        {documents.map(doc => {
          const pending = needsAcceptance.includes(doc.kind);
          const newerThanAccepted = Boolean(doc.accepted && doc.accepted.version !== doc.version);
          const isNotice = pending || newerThanAccepted;
          const declining = declineKind === doc.kind;
          return (
            <Animated.View key={doc.kind} style={animStyle}>
              <SettingsGroup
                header={doc.title || kindLabel(doc.kind)}
                footer={doc.locale_available ? undefined : t('legal.translationPending')}
              >
                <View style={styles.docMetaRow}>
                  <Text style={styles.docMeta}>
                    {t('legal.documentVersion')} {doc.version}
                  </Text>
                  <Text style={styles.docMeta}>
                    {t('legal.documentUpdated')} {formatDate(doc.effective_at)}
                  </Text>
                </View>

                <View style={styles.docBody}>
                  <Text style={styles.sectionLabel}>{t('legal.whatChanged')}</Text>
                  <Text style={styles.infoBody}>{doc.summary || doc.title || ''}</Text>
                </View>

                <TouchableOpacity
                  style={styles.actionRow}
                  activeOpacity={0.65}
                  onPress={() => { if (doc.url) void Linking.openURL(doc.url); }}
                  disabled={!doc.url}
                  accessibilityRole="button"
                  accessibilityLabel={t('legal.readFull')}
                >
                  <View style={styles.iconContainer}>
                    <MaterialCommunityIcons name="open-in-new" size={20} color={COLORS.coral} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.actionTitle}>{t('legal.readFull')}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text3} />
                </TouchableOpacity>

                <View style={styles.divider} />

                {/* Acceptance state (APP-Q358) */}
                <View style={styles.statusBlock}>
                  {doc.acceptance_current ? (
                    <View style={styles.statusRow}>
                      <MaterialCommunityIcons name="check-circle-outline" size={16} color={COLORS.green} />
                      <Text style={[styles.statusText, { color: COLORS.green }]}>
                        {doc.accepted && doc.accepted.version === doc.version
                          ? `${t('legal.acceptedOn')} ${formatDate(doc.accepted.accepted_at)}`
                          : t('legal.inEffectSinceJoin')}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.statusRow}>
                      <MaterialCommunityIcons name="information-outline" size={16} color={COLORS.yellow} />
                      <Text style={[styles.statusText, { color: COLORS.yellow }]}>{t('legal.acceptanceNeeded')}</Text>
                    </View>
                  )}

                  {pending || newerThanAccepted ? (
                    <View style={styles.buttonRow}>
                      {pending ? (
                        <TouchableOpacity
                          style={[styles.primaryButton, busyKind === doc.kind && styles.buttonDisabled]}
                          activeOpacity={0.7}
                          onPress={() => void handleAccept(doc)}
                          disabled={busyKind === doc.kind}
                          accessibilityRole="button"
                          accessibilityLabel={t('legal.accept')}
                          accessibilityState={{ busy: busyKind === doc.kind, disabled: busyKind === doc.kind }}
                        >
                          <Text style={styles.primaryButtonText}>
                            {busyKind === doc.kind ? t('legal.accepting') : t('legal.accept')}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                      {pending ? (
                        <TouchableOpacity
                          style={styles.secondaryButton}
                          activeOpacity={0.7}
                          onPress={() => setDeclineKind(declining ? null : doc.kind)}
                          accessibilityRole="button"
                          accessibilityLabel={t('legal.decline')}
                        >
                          <Text style={styles.secondaryButtonText}>{t('legal.decline')}</Text>
                        </TouchableOpacity>
                      ) : null}
                      {!doc.notice_dismissed ? (
                        <TouchableOpacity
                          style={styles.secondaryButton}
                          activeOpacity={0.7}
                          onPress={() => void handleDismiss(doc)}
                          disabled={busyKind === doc.kind}
                          accessibilityRole="button"
                          accessibilityLabel={t('legal.dismissNotice')}
                        >
                          <Text style={styles.secondaryButtonText}>{t('legal.dismissNotice')}</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.dismissedChip}>
                          <Text style={styles.dismissedChipText}>{t('legal.dismissed')}</Text>
                        </View>
                      )}
                    </View>
                  ) : null}
                </View>

                {/* Decline explanation (APP-Q360) */}
                {declining ? (
                  <View style={styles.declinePanel}>
                    <Text style={styles.sectionLabel}>{t('legal.declineTitle')}</Text>
                    <Text style={styles.infoBody}>{t('legal.declineBody')}</Text>
                    <TouchableOpacity
                      style={styles.declineLink}
                      activeOpacity={0.65}
                      onPress={() => navigation.navigate('DataPrivacy')}
                      accessibilityRole="button"
                      accessibilityLabel={t('legal.declineExport')}
                    >
                      <MaterialCommunityIcons name="file-document-outline" size={18} color={COLORS.coral} />
                      <Text style={styles.declineLinkText}>{t('legal.declineExport')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.declineLink}
                      activeOpacity={0.65}
                      onPress={() => navigation.navigate('AccountDashboard')}
                      accessibilityRole="button"
                      accessibilityLabel={t('legal.declineAccount')}
                    >
                      <MaterialCommunityIcons name="account-cog-outline" size={18} color={COLORS.coral} />
                      <Text style={styles.declineLinkText}>{t('legal.declineAccount')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.declineLink}
                      activeOpacity={0.65}
                      onPress={() => navigation.navigate('HelpSupport')}
                      accessibilityRole="button"
                      accessibilityLabel={t('legal.declineHelp')}
                    >
                      <MaterialCommunityIcons name="help-circle-outline" size={18} color={COLORS.coral} />
                      <Text style={styles.declineLinkText}>{t('legal.declineHelp')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </SettingsGroup>
            </Animated.View>
          );
        })}

        {/* Acceptance history (APP-Q362) */}
        <Animated.View style={animStyle}>
          <SettingsGroup header={t('legal.historyTitle')}>
            {history.length === 0 ? (
              <View style={styles.noteWrap}>
                <Text style={styles.rowBody}>{t('legal.historyEmpty')}</Text>
              </View>
            ) : (
              history.map((entry, index) => (
                <View key={`${entry.kind}-${entry.version}-${entry.accepted_at}`} style={[styles.actionRow, index < history.length - 1 && styles.listDivider]}>
                  <View style={styles.iconContainer}>
                    <MaterialCommunityIcons name="check-circle-outline" size={20} color={COLORS.text2} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>{kindLabel(entry.kind)}</Text>
                    <Text style={styles.rowBody}>
                      {t('legal.documentVersion')} {entry.version} · {formatDate(entry.accepted_at)}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </SettingsGroup>
        </Animated.View>

        {/* Retained notices (APP-Q363) */}
        {retainedNotices.length > 0 ? (
          <Animated.View style={animStyle}>
            <SettingsGroup header={t('legal.noticesTitle')}>
              <View style={styles.noteWrap}>
                <Text style={styles.rowBody}>{t('legal.noticesBody')}</Text>
              </View>
              {retainedNotices.map((doc, index) => (
                <View key={`notice-${doc.kind}`} style={[styles.actionRow, index < retainedNotices.length - 1 && styles.listDivider]}>
                  <View style={styles.iconContainer}>
                    <MaterialCommunityIcons name="file-document-outline" size={20} color={COLORS.text2} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>{doc.title || kindLabel(doc.kind)}</Text>
                    <Text style={styles.rowBody}>
                      {t('legal.documentVersion')} {doc.version} · {t('legal.dismissed')}
                    </Text>
                  </View>
                </View>
              ))}
            </SettingsGroup>
          </Animated.View>
        ) : null}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingBottom: SPACING.xxxl },
  intro: { fontSize: FONT_SIZES.md, color: COLORS.text2, lineHeight: 20, marginHorizontal: SPACING.lg, marginTop: SPACING.md },

  noticeCard: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    padding: SPACING.lg,
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.coralMuted,
    borderWidth: 1,
    borderColor: COLORS.coral,
    gap: SPACING.xs,
  },
  noticeHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  noticeTitle: { fontSize: FONT_SIZES.md, fontWeight: FONT_WEIGHTS.bold, color: COLORS.text },
  noticeBody: { fontSize: FONT_SIZES.sm, color: COLORS.text2, lineHeight: 18 },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.lg, marginTop: SPACING.lg },

  docMetaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm },
  docMeta: { fontSize: FONT_SIZES.sm, color: COLORS.text3 },
  docBody: { paddingHorizontal: SPACING.sm, paddingBottom: SPACING.sm },
  sectionLabel: { fontSize: FONT_SIZES.sm, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.text2, marginBottom: SPACING.xxs },

  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    minHeight: TOUCH.min,
  },
  iconContainer: { width: 28, height: 32, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowTitle: { fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.medium, color: COLORS.text },
  rowBody: { fontSize: FONT_SIZES.sm, color: COLORS.text2, marginTop: 2, lineHeight: 18 },
  infoBody: { fontSize: FONT_SIZES.sm, color: COLORS.text2, lineHeight: 18 },
  actionTitle: { fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.coral },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginLeft: SPACING.sm + 28 + SPACING.md },
  listDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },

  statusBlock: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm, gap: SPACING.sm },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  statusText: { fontSize: FONT_SIZES.sm, fontWeight: FONT_WEIGHTS.semibold },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  primaryButton: {
    minHeight: TOUCH.min,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: COLORS.white, fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.bold },
  buttonDisabled: { opacity: 0.6 },
  secondaryButton: {
    minHeight: TOUCH.min,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { color: COLORS.text2, fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.semibold },
  dismissedChip: {
    minHeight: TOUCH.min,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissedChipText: { color: COLORS.text3, fontSize: FONT_SIZES.sm, fontWeight: FONT_WEIGHTS.semibold },

  declinePanel: { paddingHorizontal: SPACING.sm, paddingBottom: SPACING.md, gap: SPACING.xs },
  declineLink: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, minHeight: TOUCH.min },
  declineLinkText: { fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.coral },

  noteWrap: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm },
  bottomSpacer: { height: 60 },
});
