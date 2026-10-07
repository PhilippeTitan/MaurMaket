import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Modal, Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { COLORS, RADIUS, SPACING, FONT_SIZES, FONT_WEIGHTS } from '../theme';
import { ONBOARDING_COLORS as C } from './onboarding/theme';
import { useUser } from '../hooks';
import ScreenHeader from '../components/ScreenHeader';
import { useTranslation } from '@/localization';
import { useToast } from '../components/Toast';
import {
  addAccountPasskey, deleteAccountPasskey, disableAuthenticator, enableAuthenticator,
  freezeAccount, getAccountFreeze, getSecurityEvents, getSecuritySnapshot, linkGoogleAccount,
  revokeAuthSession, unfreezeAccount, verifyAuthenticator,
  type BetterAuthSecuritySession,
} from '../api';
import type { AccountFreezeState, SecurityEvent } from '../types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'SecuritySettings'>;
type SetupStep = 'password' | 'authenticator' | 'backup-codes' | 'disable';
type Passkey = { id: string; name?: string | null; deviceType?: string; createdAt?: string };
type Account = { id: string; providerId?: string; accountId?: string };
type BetterAuthUser = { id: string; emailVerified?: boolean; twoFactorEnabled?: boolean };

function getAuthenticatorSecret(uri: string) {
  try { return new URL(uri).searchParams.get('secret') || ''; } catch { return ''; }
}

function deviceName(userAgent?: string | null) {
  if (!userAgent) return 'Unknown device';
  if (/android/i.test(userAgent)) return 'Android';
  if (/iphone|ipad|ios/i.test(userAgent)) return 'iPhone or iPad';
  if (/edg\//i.test(userAgent)) return 'Microsoft Edge';
  if (/chrome\//i.test(userAgent)) return 'Chrome';
  if (/firefox\//i.test(userAgent)) return 'Firefox';
  if (/safari\//i.test(userAgent)) return 'Safari';
  return 'Web browser';
}

export default function SecuritySettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { user, refetch: refetchUser } = useUser();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [securityDataLoaded, setSecurityDataLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [authEmailVerified, setAuthEmailVerified] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [sessions, setSessions] = useState<BetterAuthSecuritySession[]>([]);
  const [sessionsRequireFreshAuth, setSessionsRequireFreshAuth] = useState(false);
  const [currentSessionToken, setCurrentSessionToken] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [setupVisible, setSetupVisible] = useState(false);
  const [setupStep, setSetupStep] = useState<SetupStep>('password');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [revokeTarget, setRevokeTarget] = useState<BetterAuthSecuritySession | null>(null);
  const [deletePasskeyTarget, setDeletePasskeyTarget] = useState<Passkey | null>(null);
  // Batch 76 / APP-Q390 — removing a sign-in factor re-confirms the password.
  const [deletePasskeyPassword, setDeletePasskeyPassword] = useState('');
  // Batch 73 / APP-Q369 — private security activity history.
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [eventsRetentionDays, setEventsRetentionDays] = useState(365);
  const [eventsLoading, setEventsLoading] = useState(true);
  // Batch 73/74/75 — fast account freeze for suspected compromise (APP-Q371).
  const [freezeState, setFreezeState] = useState<AccountFreezeState | null>(null);
  const [freezeBusy, setFreezeBusy] = useState(false);
  const [freezeModal, setFreezeModal] = useState<'freeze' | 'unfreeze' | null>(null);
  const [freezeReason, setFreezeReason] = useState('');
  const [unfreezePassword, setUnfreezePassword] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setSecurityDataLoaded(false);
    try {
      const snapshot = await getSecuritySnapshot();
      const authUser = snapshot.user as BetterAuthUser;
      if (user?.id && authUser.id !== user.id) {
        throw new Error('The app profile and Better Auth session belong to different accounts.');
      }
      if (typeof authUser.emailVerified !== 'boolean') {
        throw new Error('Better Auth did not return the email verification status.');
      }
      setAuthEmailVerified(authUser.emailVerified);
      setTwoFactorEnabled(Boolean(authUser.twoFactorEnabled));
      setGoogleConnected((snapshot.accounts as Account[]).some(account => account.providerId === 'google'));
      setHasPassword((snapshot.accounts as Account[]).some(account =>
        account.providerId === 'credential' && account.accountId === authUser.id
      ));
      const activeSessions = [...snapshot.sessions];
      setSessionsRequireFreshAuth(Boolean(snapshot.sessionsRequireFreshAuth));
      if (!activeSessions.some(session => session.id === snapshot.currentSession.id)) {
        activeSessions.unshift(snapshot.currentSession);
      }
      setSessions(activeSessions);
      setCurrentSessionToken(snapshot.currentSession?.token || null);
      setCurrentSessionId(snapshot.currentSession?.id || null);
      setPasskeys(snapshot.passkeys as Passkey[]);
      setSecurityDataLoaded(true);
      void refetchUser();
    } catch (error: any) {
      toast.show({ kind: 'error', title: error?.message || t('security.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [refetchUser, t, toast, user?.id]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  // Loaded independently of the Better Auth snapshot: the history is
  // supplemental, so it still appears when session listing needs a fresh
  // sign-in (the state sessionsNeedFreshSignIn describes).
  const loadSecurityEvents = useCallback(async () => {
    setEventsLoading(true);
    // Loaded separately so one failing call cannot blank the other section.
    try {
      const response = await getSecurityEvents();
      setSecurityEvents(response.events || []);
      setEventsRetentionDays(response.retention_days ?? 365);
    } catch {
      // Keep whatever was last shown rather than blanking the section.
    }
    try {
      setFreezeState(await getAccountFreeze());
    } catch {
      // A freeze status failure must not hide the rest of the security screen.
    }
    setEventsLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { void loadSecurityEvents(); }, [loadSecurityEvents]));

  const closeSetup = () => {
    setSetupVisible(false);
    setSetupStep('password');
    setPassword('');
    setTotpCode('');
    setTotpSecret('');
    setBackupCodes([]);
  };

  const startAuthenticatorSetup = async () => {
    if (!password) return;
    setBusy(true);
    try {
      const enrollment = await enableAuthenticator(password);
      setTotpSecret(getAuthenticatorSecret(enrollment.totpURI));
      setBackupCodes(enrollment.backupCodes || []);
      setPassword('');
      setSetupStep('authenticator');
    } catch (error: any) {
      toast.show({ kind: 'error', title: error?.message || t('security.setupFailed') });
    } finally { setBusy(false); }
  };

  const finishAuthenticatorSetup = async () => {
    if (!/^\d{6}$/.test(totpCode)) return;
    setBusy(true);
    try {
      await verifyAuthenticator(totpCode);
      setTwoFactorEnabled(true);
      setTotpCode('');
      setSetupStep('backup-codes');
      await refresh();
    } catch (error: any) {
      toast.show({ kind: 'error', title: error?.message || t('security.invalidCode') });
    } finally { setBusy(false); }
  };

  // APP-Q390 — the server returns stable codes for the second-factor gates so
  // the copy stays localized and never says more than the user needs to know.
  const secondFactorErrorMessage = (error: any, fallback: string) => {
    switch (error?.code) {
      case 'PASSWORD_REQUIRED': return t('security.secondFactorPasswordRequired');
      case 'INVALID_PASSWORD': return t('security.secondFactorInvalidPassword');
      case 'LAST_RECOVERY_PATH': return t('security.secondFactorLastPath');
      default: return error?.message || fallback;
    }
  };

  const turnOffAuthenticator = async () => {
    if (!password) return;
    setBusy(true);
    try {
      await disableAuthenticator(password);
      setTwoFactorEnabled(false);
      closeSetup();
      toast.show({ kind: 'success', title: t('security.twoFactorDisabled') });
      await refresh();
    } catch (error: any) {
      toast.show({ kind: 'error', title: secondFactorErrorMessage(error, t('security.twoFactorUpdateFailed')) });
    } finally { setBusy(false); }
  };

  const handleAddPasskey = async () => {
    if (Platform.OS !== 'web') {
      toast.show({ kind: 'info', title: t('security.passkeysWebOnly') });
      return;
    }
    setBusy(true);
    try {
      await addAccountPasskey(t('security.thisDevice'));
      toast.show({ kind: 'success', title: t('security.passkeyRegistered') });
      await refresh();
    } catch (error: any) {
      toast.show({ kind: 'error', title: error?.message || t('security.passkeyRegisterFailed') });
    } finally { setBusy(false); }
  };

  const handleLinkGoogle = async () => {
    setBusy(true);
    try {
      await linkGoogleAccount();
      if (Platform.OS !== 'web') {
        toast.show({ kind: 'success', title: t('security.googleConnected') });
        await refresh();
      }
    } catch (error: any) {
      toast.show({ kind: 'error', title: error?.message || t('security.googleLinkFailed') });
    } finally { setBusy(false); }
  };

  const handleRevokeSession = async () => {
    if (!revokeTarget) return;
    setBusy(true);
    try {
      await revokeAuthSession(revokeTarget.token);
      setRevokeTarget(null);
      toast.show({ kind: 'success', title: t('security.deviceRemoved') });
      await refresh();
    } catch (error: any) {
      toast.show({ kind: 'error', title: error?.message || t('security.deviceRemoveFailed') });
    } finally { setBusy(false); }
  };

  const handleDeletePasskey = async () => {
    if (!deletePasskeyTarget) return;
    setBusy(true);
    try {
      await deleteAccountPasskey(
        deletePasskeyTarget.id,
        hasPassword ? deletePasskeyPassword : undefined
      );
      setDeletePasskeyTarget(null);
      setDeletePasskeyPassword('');
      toast.show({ kind: 'success', title: t('security.passkeyRemoved') });
      await refresh();
    } catch (error: any) {
      toast.show({ kind: 'error', title: secondFactorErrorMessage(error, t('security.passkeyRemoveFailed')) });
    } finally { setBusy(false); }
  };

  const handleFreeze = async () => {
    setFreezeBusy(true);
    try {
      const next = await freezeAccount(freezeReason.trim() || undefined);
      setFreezeState(next);
      setFreezeModal(null);
      setFreezeReason('');
      toast.show({ kind: 'success', title: t('security.freezeFrozenToast'), message: t('security.freezeFrozenBody') });
      await loadSecurityEvents();
    } catch (error: any) {
      toast.show({ kind: 'error', title: error?.message || t('security.freezeFailed') });
    } finally { setFreezeBusy(false); }
  };

  const handleUnfreeze = async () => {
    setFreezeBusy(true);
    try {
      const next = await unfreezeAccount(freezeState?.has_password ? unfreezePassword : undefined);
      setFreezeState(next);
      setFreezeModal(null);
      setUnfreezePassword('');
      toast.show({ kind: 'success', title: t('security.freezeRestoredToast') });
      await loadSecurityEvents();
    } catch (error: any) {
      toast.show({ kind: 'error', title: error?.message || t('security.freezeFailed') });
    } finally { setFreezeBusy(false); }
  };

  // Freeze, sign-in, and second-factor events share one history; only the
  // wording differs.
  const eventLabel = (type: SecurityEvent['event_type']) => type === 'account_frozen'
    ? t('security.eventFrozen')
    : type === 'account_unfrozen'
      ? t('security.eventUnfrozen')
      : type === 'two_factor_disabled'
        ? t('security.eventTwoFactorDisabled')
        : type === 'passkey_removed'
          ? t('security.eventPasskeyRemoved')
          : t('security.eventSignIn');

  const emailVerified = securityDataLoaded && authEmailVerified;
  const checksPassed = Number(emailVerified) + Number(securityDataLoaded && twoFactorEnabled);
  const passwordStatus = !securityDataLoaded ? (loading ? t('common.loading') : '—')
    : hasPassword ? t('security.active') : t('security.notSet');

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('security.title')} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.summary}>
          <View style={styles.summaryTop}>
            <MaterialCommunityIcons name="shield-check-outline" size={23} color={C.mint} />
            <Text style={styles.summaryTitle}>{t('security.checksPassed', { passed: checksPassed, total: 2 })}</Text>
            {loading && <ActivityIndicator size="small" color={C.mint} />}
          </View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${checksPassed * 50}%` }]} /></View>
          <View style={styles.summaryChecks}>
            <View style={styles.checkItem}>
              <MaterialCommunityIcons name={emailVerified ? 'check-circle' : 'circle-outline'} size={16} color={emailVerified ? C.mint : C.sub} />
              <Text style={styles.checkLabel}>{t('security.emailVerified')}</Text>
            </View>
            <View style={styles.checkItem}>
              <MaterialCommunityIcons name={twoFactorEnabled ? 'check-circle' : 'circle-outline'} size={16} color={twoFactorEnabled ? C.mint : C.sub} />
              <Text style={styles.checkLabel}>{t('security.authenticator')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('security.freezeTitle')}</Text>
          {freezeState?.frozen ? (
            <View style={styles.freezeBanner}>
              <View style={styles.freezeBannerHeader}>
                <MaterialCommunityIcons name="alert-decagram-outline" size={18} color={C.coral} />
                <Text style={styles.freezeBannerTitle}>{t('security.freezeStatusFrozen')}</Text>
              </View>
              <Text style={styles.freezeBannerText}>{t('security.freezeFrozenBody')}</Text>
              {freezeState.listings_paused > 0 && (
                <Text style={styles.freezeBannerMeta}>
                  {t('security.freezeListingsPaused', { count: freezeState.listings_paused })}
                </Text>
              )}
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => { setUnfreezePassword(''); setFreezeModal('unfreeze'); }}
                accessibilityRole="button"
              >
                <Text style={styles.primaryButtonText}>{t('security.freezeRestore')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.sectionHint}>{t('security.freezeDesc')}</Text>
              <View style={styles.card}>
                <TouchableOpacity
                  style={styles.row}
                  activeOpacity={0.72}
                  onPress={() => { setFreezeReason(''); setFreezeModal('freeze'); }}
                  accessibilityRole="button"
                >
                  <View style={styles.rowIcon}><MaterialCommunityIcons name="shield-lock-outline" size={19} color={C.text} /></View>
                  <View style={styles.sessionCopy}>
                    <Text style={styles.rowTitle}>{t('security.freezeAction')}</Text>
                    <Text style={styles.sessionDate}>{t('security.freezeStatusActive')}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={19} color={C.faint} />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('security.accountProtection')}</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.row} activeOpacity={0.72} disabled={!securityDataLoaded || !hasPassword} onPress={() => navigation.navigate('SettingsEdit', { field: 'password', title: t('settings.changePassword') })} accessibilityRole="button" accessibilityState={{ disabled: !securityDataLoaded || !hasPassword }}>
              <View style={styles.rowIcon}><MaterialCommunityIcons name="lock-outline" size={19} color={C.text} /></View>
              <Text style={styles.rowTitle}>{t('settings.changePassword')}</Text>
              <Text style={styles.rowMeta}>{passwordStatus}</Text>
              <MaterialCommunityIcons name="chevron-right" size={19} color={C.faint} />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.row} activeOpacity={0.72} disabled={!securityDataLoaded || (!hasPassword && !twoFactorEnabled)} onPress={() => { setSetupStep(twoFactorEnabled ? 'disable' : 'password'); setSetupVisible(true); }} accessibilityRole="button" accessibilityState={{ disabled: !securityDataLoaded || (!hasPassword && !twoFactorEnabled) }}>
              <View style={[styles.rowIcon, twoFactorEnabled && styles.rowIconActive]}><MaterialCommunityIcons name="cellphone-key" size={19} color={twoFactorEnabled ? C.mint : C.text} /></View>
              <Text style={styles.rowTitle}>{t('security.authenticator')}</Text>
              <Text style={[styles.rowMeta, twoFactorEnabled && styles.rowMetaActive]}>{twoFactorEnabled ? t('security.enabled') : hasPassword ? t('security.off') : t('security.passwordRequired')}</Text>
              <MaterialCommunityIcons name="chevron-right" size={19} color={C.faint} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('security.signInMethods')}</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowIcon}><MaterialCommunityIcons name="email-outline" size={19} color={C.text} /></View>
              <Text style={styles.rowTitle}>{t('security.emailPassword')}</Text>
              <Text style={styles.rowMeta}>{passwordStatus}</Text>
            </View>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.row} activeOpacity={0.72} onPress={() => { void handleLinkGoogle(); }} disabled={busy || googleConnected} accessibilityRole="button">
              <View style={styles.rowIcon}><MaterialCommunityIcons name="google" size={19} color={C.text} /></View>
              <Text style={styles.rowTitle}>Google</Text>
              <Text style={[styles.rowMeta, googleConnected && styles.rowMetaActive]}>{googleConnected ? t('security.connected') : t('security.connect')}</Text>
              {!googleConnected && <MaterialCommunityIcons name="arrow-top-right" size={16} color={C.faint} />}
            </TouchableOpacity>
            {Platform.OS === 'web' && <>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.row} activeOpacity={0.72} onPress={() => { void handleAddPasskey(); }} disabled={busy} accessibilityRole="button">
                <View style={styles.rowIcon}><MaterialCommunityIcons name="fingerprint" size={19} color={C.text} /></View>
                <Text style={styles.rowTitle}>{t('security.passkeys')}</Text>
                <Text style={styles.rowMeta}>{passkeys.length ? t('security.passkeyCount', { count: passkeys.length }) : t('security.add')}</Text>
                <MaterialCommunityIcons name="chevron-right" size={19} color={C.faint} />
              </TouchableOpacity>
              {passkeys.map((passkey, index) => <React.Fragment key={passkey.id}>
                {index > 0 && <View style={styles.divider} />}
                <View style={styles.row}>
                  <View style={styles.rowIcon}><MaterialCommunityIcons name="key-outline" size={18} color={C.sub} /></View>
                  <Text style={styles.rowTitle} numberOfLines={1}>{passkey.name || t('security.passkey')}</Text>
                  <TouchableOpacity style={styles.smallAction} onPress={() => { setDeletePasskeyPassword(''); setDeletePasskeyTarget(passkey); }} accessibilityRole="button" accessibilityLabel={`${t('security.remove')} ${passkey.name || t('security.passkey')}`}>
                    <Text style={styles.removeText}>{t('security.remove')}</Text>
                  </TouchableOpacity>
                </View>
              </React.Fragment>)}
            </>}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('security.signedInDevices')}</Text>
          {sessionsRequireFreshAuth && <View style={styles.emptyCard}><Text style={styles.emptyText}>{t('security.sessionsNeedFreshSignIn')}</Text></View>}
          {sessions.length === 0 && !loading ? (
            <View style={styles.emptyCard}><Text style={styles.emptyText}>{t('security.noSessions')}</Text></View>
          ) : (
            <View style={styles.card}>
              {sessions.map((session, index) => {
                const isCurrent = session.token === currentSessionToken || session.id === currentSessionId;
                return <React.Fragment key={session.id}>
                  {index > 0 && <View style={styles.divider} />}
                  <View style={styles.row}>
                    <View style={styles.rowIcon}><MaterialCommunityIcons name={/android|iphone|ipad/i.test(session.userAgent || '') ? 'cellphone' : 'monitor'} size={19} color={C.text} /></View>
                    <View style={styles.sessionCopy}>
                      <Text style={styles.rowTitle}>{deviceName(session.userAgent)}{isCurrent ? ` · ${t('security.current')}` : ''}</Text>
                      <Text style={styles.sessionDate}>{new Date(session.createdAt).toLocaleDateString()}</Text>
                    </View>
                    {!isCurrent && <TouchableOpacity style={styles.smallAction} onPress={() => setRevokeTarget(session)} accessibilityRole="button">
                      <Text style={styles.removeText}>{t('security.revoke')}</Text>
                    </TouchableOpacity>}
                  </View>
                </React.Fragment>;
              })}
            </View>
          )}
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('security.recentSignInActivity')}</Text>
          <Text style={styles.sectionHint}>{t('security.recentSignInDesc')}</Text>
          {securityEvents.length === 0 && !eventsLoading ? (
            <View style={styles.emptyCard}><Text style={styles.emptyText}>{t('security.noSecurityEvents')}</Text></View>
          ) : (
            <View style={styles.card}>
              {securityEvents.map((event, index) => (
                <React.Fragment key={event.id}>
                  {index > 0 && <View style={styles.divider} />}
                  <View style={styles.row}>
                    <View style={styles.rowIcon}><MaterialCommunityIcons name="shield-lock-outline" size={19} color={C.text} /></View>
                    <View style={styles.sessionCopy}>
                      <Text style={styles.rowTitle}>{eventLabel(event.event_type)}</Text>
                      <Text style={styles.sessionDate}>
                        {[event.user_agent ? deviceName(event.user_agent) : event.reason, new Date(event.created_at).toLocaleString()]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                  </View>
                </React.Fragment>
              ))}
            </View>
          )}
          <Text style={styles.sectionHint}>{t('security.securityEventsRetention', { days: eventsRetentionDays })}</Text>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{t('security.notYouBody')}</Text>
            <View style={styles.eventsActions}>
              <TouchableOpacity
                style={styles.secondaryAction}
                onPress={() => navigation.navigate('SettingsEdit', { field: 'password', title: t('settings.changePassword') })}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryButtonText}>{t('settings.changePassword')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryAction}
                onPress={() => navigation.navigate('HelpSupport')}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryButtonText}>{t('settings.helpSupport')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <View style={styles.bottomSpacer} />
      </ScrollView>

      <Modal visible={setupVisible} transparent animationType="fade" onRequestClose={closeSetup}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{setupStep === 'disable' ? t('security.disableAuthenticator') : setupStep === 'backup-codes' ? t('security.recoveryCodes') : t('security.setupAuthenticator')}</Text>
              <TouchableOpacity onPress={closeSetup} style={styles.closeButton} accessibilityRole="button" accessibilityLabel={t('common.close')}><MaterialCommunityIcons name="close" size={20} color={C.sub} /></TouchableOpacity>
            </View>

            {setupStep === 'password' && <>
              <Text style={styles.modalCopy}>{t('security.passwordConfirm')}</Text>
              <TextInput value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder={t('security.currentPassword')} placeholderTextColor={C.faint} style={styles.input} />
              <TouchableOpacity style={styles.primaryButton} onPress={() => { void startAuthenticatorSetup(); }} disabled={!password || busy} accessibilityRole="button">
                {busy ? <ActivityIndicator color={C.white} /> : <Text style={styles.primaryButtonText}>{t('security.continue')}</Text>}
              </TouchableOpacity>
            </>}

            {setupStep === 'authenticator' && <>
              <Text style={styles.modalCopy}>{t('security.scanOrEnter')}</Text>
              <View style={styles.secretRow}>
                <Text selectable style={styles.secretText}>{totpSecret || t('security.setupFailed')}</Text>
                <TouchableOpacity style={styles.copyButton} onPress={() => { void Clipboard.setStringAsync(totpSecret); toast.show({ kind: 'success', title: t('security.keyCopied') }); }} disabled={!totpSecret} accessibilityRole="button" accessibilityLabel={t('security.copyKey')}>
                  <MaterialCommunityIcons name="content-copy" size={17} color={C.mint} />
                </TouchableOpacity>
              </View>
              <TextInput value={totpCode} onChangeText={value => setTotpCode(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" textContentType="oneTimeCode" placeholder="000000" placeholderTextColor={C.faint} style={[styles.input, styles.codeInput]} accessibilityLabel={t('security.authenticatorCode')} />
              <TouchableOpacity style={styles.primaryButton} onPress={() => { void finishAuthenticatorSetup(); }} disabled={!/^\d{6}$/.test(totpCode) || busy} accessibilityRole="button">
                {busy ? <ActivityIndicator color={C.white} /> : <Text style={styles.primaryButtonText}>{t('security.verifyAndEnable')}</Text>}
              </TouchableOpacity>
            </>}

            {setupStep === 'backup-codes' && <>
              <Text style={styles.modalCopy}>{t('security.saveRecoveryCodes')}</Text>
              <View style={styles.codesGrid}>{backupCodes.map(code => <Text key={code} selectable style={styles.backupCode}>{code}</Text>)}</View>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => { void Clipboard.setStringAsync(backupCodes.join('\n')); toast.show({ kind: 'success', title: t('security.codesCopied') }); }} accessibilityRole="button">
                <MaterialCommunityIcons name="content-copy" size={17} color={C.mint} /><Text style={styles.secondaryButtonText}>{t('security.copyRecoveryCodes')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={closeSetup} accessibilityRole="button"><Text style={styles.primaryButtonText}>{t('security.done')}</Text></TouchableOpacity>
            </>}

            {setupStep === 'disable' && <>
              <Text style={styles.modalCopy}>{t('security.disableConfirmCopy')}</Text>
              <TextInput value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder={t('security.currentPassword')} placeholderTextColor={C.faint} style={styles.input} />
              <TouchableOpacity style={[styles.primaryButton, styles.dangerButton]} onPress={() => { void turnOffAuthenticator(); }} disabled={!password || busy} accessibilityRole="button">
                {busy ? <ActivityIndicator color={C.white} /> : <Text style={styles.primaryButtonText}>{t('security.turnOff')}</Text>}
              </TouchableOpacity>
            </>}
          </View>
        </View>
      </Modal>

      <Modal visible={freezeModal === 'freeze'} transparent animationType="fade" onRequestClose={() => setFreezeModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('security.freezeConfirmTitle')}</Text>
              <TouchableOpacity onPress={() => setFreezeModal(null)} style={styles.closeButton} accessibilityRole="button" accessibilityLabel={t('common.close')}>
                <MaterialCommunityIcons name="close" size={20} color={C.sub} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalCopy}>{t('security.freezeConfirmBody')}</Text>
            <Text style={styles.fieldLabel}>{t('security.freezeReasonLabel')}</Text>
            <TextInput
              value={freezeReason}
              onChangeText={setFreezeReason}
              placeholder={t('security.freezeReasonPlaceholder')}
              placeholderTextColor={C.faint}
              style={styles.input}
              maxLength={200}
              accessibilityLabel={t('security.freezeReasonLabel')}
            />
            <TouchableOpacity
              style={[styles.primaryButton, styles.dangerButton]}
              onPress={() => { void handleFreeze(); }}
              disabled={freezeBusy}
              accessibilityRole="button"
            >
              {freezeBusy ? <ActivityIndicator color={C.white} /> : <Text style={styles.primaryButtonText}>{t('security.freezeConfirmButton')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={freezeModal === 'unfreeze'} transparent animationType="fade" onRequestClose={() => setFreezeModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('security.freezeRestoreTitle')}</Text>
              <TouchableOpacity onPress={() => setFreezeModal(null)} style={styles.closeButton} accessibilityRole="button" accessibilityLabel={t('common.close')}>
                <MaterialCommunityIcons name="close" size={20} color={C.sub} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalCopy}>
              {freezeState?.has_password ? t('security.freezeRestoreBody') : t('security.freezeRestoreNoPassword')}
            </Text>
            {Boolean(freezeState?.has_password) && (
              <>
                <Text style={styles.fieldLabel}>{t('security.freezePasswordLabel')}</Text>
                <TextInput
                  value={unfreezePassword}
                  onChangeText={setUnfreezePassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={t('security.currentPassword')}
                  placeholderTextColor={C.faint}
                  style={styles.input}
                  accessibilityLabel={t('security.freezePasswordLabel')}
                />
              </>
            )}
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => { void handleUnfreeze(); }}
              disabled={freezeBusy || (Boolean(freezeState?.has_password) && !unfreezePassword)}
              accessibilityRole="button"
            >
              {freezeBusy ? <ActivityIndicator color={C.white} /> : <Text style={styles.primaryButtonText}>{t('security.freezeRestoreButton')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!revokeTarget} transparent animationType="fade" onRequestClose={() => setRevokeTarget(null)}>
        <ConfirmDialog title={t('security.revokeDeviceTitle')} message={t('security.revokeDeviceCopy')} cancelLabel={t('common.cancel')} confirmLabel={t('security.revoke')} busy={busy} onCancel={() => setRevokeTarget(null)} onConfirm={() => { void handleRevokeSession(); }} />
      </Modal>
      <Modal visible={!!deletePasskeyTarget} transparent animationType="fade" onRequestClose={() => setDeletePasskeyTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('security.removePasskeyTitle')}</Text>
            <Text style={styles.modalCopy}>{t('security.removePasskeyCopy')}</Text>
            <Text style={styles.modalCopy}>{t('security.removePasskeyRecovery')}</Text>
            {hasPassword && <>
              <Text style={styles.fieldLabel}>{t('security.removePasskeyPasswordLabel')}</Text>
              <TextInput
                value={deletePasskeyPassword}
                onChangeText={setDeletePasskeyPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={t('security.currentPassword')}
                placeholderTextColor={C.faint}
                style={styles.input}
                accessibilityLabel={t('security.removePasskeyPasswordLabel')}
              />
            </>}
            <View style={styles.dialogActions}>
              <TouchableOpacity style={styles.secondaryAction} onPress={() => setDeletePasskeyTarget(null)} accessibilityRole="button">
                <Text style={styles.secondaryButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, styles.dangerButton, styles.dialogConfirm]}
                onPress={() => { void handleDeletePasskey(); }}
                disabled={busy || (hasPassword && !deletePasskeyPassword)}
                accessibilityRole="button"
              >
                {busy ? <ActivityIndicator color={C.white} /> : <Text style={styles.primaryButtonText}>{t('security.remove')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ConfirmDialog({ title, message, cancelLabel, confirmLabel, busy, onCancel, onConfirm }: {
  title: string; message: string; cancelLabel: string; confirmLabel: string; busy: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  return <View style={styles.modalBackdrop}><View style={styles.modalCard}>
    <Text style={styles.modalTitle}>{title}</Text>
    <Text style={styles.modalCopy}>{message}</Text>
    <View style={styles.dialogActions}>
      <TouchableOpacity style={styles.secondaryAction} onPress={onCancel} accessibilityRole="button"><Text style={styles.secondaryButtonText}>{cancelLabel}</Text></TouchableOpacity>
      <TouchableOpacity style={[styles.primaryButton, styles.dangerButton, styles.dialogConfirm]} onPress={onConfirm} disabled={busy} accessibilityRole="button">
        {busy ? <ActivityIndicator color={C.white} /> : <Text style={styles.primaryButtonText}>{confirmLabel}</Text>}
      </TouchableOpacity>
    </View>
  </View></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg0 },
  scroll: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.xl },
  summary: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.md, borderRadius: 0, backgroundColor: 'transparent', borderWidth: 0, marginBottom: SPACING.lg },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  summaryTitle: { flex: 1, color: C.text, fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.semibold },
  progressTrack: { height: 4, backgroundColor: C.border, borderRadius: 2, marginTop: SPACING.md, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: C.mint, borderRadius: 2 },
  summaryChecks: { flexDirection: 'row', gap: SPACING.xl, marginTop: SPACING.md },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkLabel: { color: C.sub, fontSize: FONT_SIZES.xs },
  section: { marginBottom: SPACING.md },
  sectionTitle: { color: C.faint, fontSize: FONT_SIZES.xs, fontWeight: FONT_WEIGHTS.semibold, letterSpacing: 0.8, marginBottom: SPACING.xs, textTransform: 'uppercase' },
  sectionHint: { color: C.sub, fontSize: FONT_SIZES.xs, lineHeight: 18, marginBottom: SPACING.sm, paddingHorizontal: SPACING.sm },
  eventsActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  freezeBanner: { borderRadius: RADIUS.card, borderWidth: 1, borderColor: C.coral, padding: SPACING.md, gap: SPACING.xs },
  freezeBannerHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  freezeBannerTitle: { color: C.coral, fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.bold },
  freezeBannerText: { color: C.sub, fontSize: FONT_SIZES.sm, lineHeight: 20 },
  freezeBannerMeta: { color: C.sub, fontSize: FONT_SIZES.xs },
  fieldLabel: { color: C.sub, fontSize: FONT_SIZES.xs, fontWeight: FONT_WEIGHTS.semibold, marginBottom: 6 },
  card: { backgroundColor: 'transparent', borderWidth: 0, borderRadius: 0, overflow: 'hidden' },
  row: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
  rowIcon: { width: 28, height: 32, borderRadius: 0, borderWidth: 0, alignItems: 'center', justifyContent: 'center' },
  rowIconActive: { backgroundColor: 'transparent', borderColor: 'transparent' },
  rowTitle: { flex: 1, color: C.text, fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.medium },
  rowMeta: { color: C.sub, fontSize: FONT_SIZES.xs },
  rowMetaActive: { color: C.mint },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginLeft: SPACING.sm + 28 + SPACING.md },
  sessionCopy: { flex: 1 },
  sessionDate: { color: C.sub, fontSize: FONT_SIZES.xs, marginTop: 3 },
  smallAction: { minHeight: 44, minWidth: 50, justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 4 },
  removeText: { color: C.coral, fontSize: FONT_SIZES.xs, fontWeight: FONT_WEIGHTS.semibold },
  emptyCard: { minHeight: 54, justifyContent: 'center', paddingHorizontal: SPACING.sm, borderRadius: 0, backgroundColor: 'transparent', borderWidth: 0 },
  emptyText: { color: C.sub, fontSize: FONT_SIZES.sm },
  bottomSpacer: { height: SPACING.xl },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: SPACING.lg, backgroundColor: 'rgba(0,0,0,0.76)' },
  // C.surface is intentionally translucent for in-page cards; dialogs need an
  // opaque layer so the screen beneath cannot bleed through the form.
  modalCard: {
    width: '100%', maxWidth: 440, alignSelf: 'center', borderRadius: RADIUS.media,
    borderWidth: 1, borderColor: C.borderHi, backgroundColor: C.bg1,
    padding: SPACING.xl, gap: SPACING.lg,
    shadowColor: '#000', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.42,
    shadowRadius: 28, elevation: 24,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { color: C.text, fontSize: FONT_SIZES.lg, fontWeight: FONT_WEIGHTS.bold, flex: 1 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -SPACING.sm, marginTop: -SPACING.sm },
  modalCopy: { color: C.sub, fontSize: FONT_SIZES.sm, lineHeight: 22 },
  input: { minHeight: 52, borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.card, paddingHorizontal: SPACING.md, color: C.text, backgroundColor: C.bg0, fontSize: FONT_SIZES.base },
  codeInput: { fontSize: 24, fontWeight: FONT_WEIGHTS.bold, letterSpacing: 8, textAlign: 'center' },
  secretRow: { minHeight: 58, paddingLeft: SPACING.md, paddingRight: SPACING.xs, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.card, backgroundColor: C.bg0 },
  secretText: { flex: 1, color: C.text, fontSize: FONT_SIZES.sm, fontWeight: FONT_WEIGHTS.semibold, letterSpacing: 1.4 },
  copyButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  primaryButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.card, backgroundColor: C.mint, marginTop: SPACING.xs },
  primaryButtonText: { color: C.bg0, fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.bold },
  dangerButton: { backgroundColor: C.coral },
  codesGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: SPACING.sm },
  backupCode: { width: '47%', paddingVertical: 9, paddingHorizontal: SPACING.sm, textAlign: 'center', color: C.text, backgroundColor: C.bg0, borderRadius: RADIUS.sm, fontVariant: ['tabular-nums'], fontSize: FONT_SIZES.sm },
  secondaryButton: { minHeight: 48, flexDirection: 'row', gap: SPACING.sm, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.card, borderWidth: 1, borderColor: C.border },
  secondaryButtonText: { color: C.mint, fontSize: FONT_SIZES.sm, fontWeight: FONT_WEIGHTS.semibold },
  dialogActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  secondaryAction: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.card, borderWidth: 1, borderColor: C.border },
  dialogConfirm: { flex: 1, marginTop: 0 },
});
