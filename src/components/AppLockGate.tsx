// Batch 75 / APP-Q116 — the lock screen itself.
//
// A full-screen Modal, not an overlay View, because RN Modals render above the
// rest of the tree: if the app locks while the date-of-birth confirmation, the
// taste onboarding, or the payment-failure modal is up, those must not stay
// readable on top of the lock. It is mounted last in App.tsx so it presents last.
//
// It deliberately shows nothing about the account — no name, email, avatar, or
// last screen. Whoever is holding the phone should learn nothing from this
// screen. The only content is the app mark, why it is locked, and the two ways
// out: unlock, or sign out. Signing out is what keeps "device cannot authenticate
// right now" from ever being a lockout.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, RADIUS, SPACING, TOUCH } from '../theme';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { useTranslation } from '@/localization';
import { authenticateForAppUnlock } from '../appLock';
import ConfirmModal from './ConfirmModal';

type AppLockGateProps = {
  visible: boolean;
  /** Device authentication succeeded; the session behind it was never replaced. */
  onUnlocked: () => void;
  /** The user chose to sign out instead of unlocking. */
  onSignOut: () => void;
};

export default function AppLockGate({ visible, onUnlocked, onSignOut }: AppLockGateProps) {
  const { t } = useTranslation();
  const reduceMotion = useReduceMotion();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  // Guards the automatic prompt: it belongs to one lock episode, so a re-render
  // or a foreground/background flap must not stack prompts on top of each other.
  const promptedRef = useRef(false);

  const attemptUnlock = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const ok = await authenticateForAppUnlock({
      promptMessage: t('appLock.promptMessage'),
      cancelLabel: t('common.cancel'),
      fallbackLabel: t('appLock.devicePasscode'),
    });
    setBusy(false);
    if (ok) {
      setFailed(false);
      onUnlocked();
    } else {
      setFailed(true);
    }
  }, [busy, onUnlocked, t]);

  useEffect(() => {
    if (!visible) {
      promptedRef.current = false;
      setFailed(false);
      setConfirmSignOut(false);
      return;
    }
    if (promptedRef.current) return;
    promptedRef.current = true;
    void attemptUnlock();
    // Intentionally keyed on `visible` only: the prompt fires once per lock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType={reduceMotion ? 'none' : 'fade'}
      onRequestClose={() => {}}
      supportedOrientations={['portrait', 'landscape']}
    >
      <View style={styles.container} accessibilityViewIsModal>
        <View style={styles.mark}>
          <MaterialCommunityIcons name="shield-lock-outline" size={44} color={COLORS.text2} />
        </View>
        <Text style={styles.title}>{t('appLock.lockedTitle')}</Text>
        <Text style={styles.body}>{failed ? t('appLock.lockedFailed') : t('appLock.lockedBody')}</Text>

        <Pressable
          style={[styles.primary, busy && styles.primaryBusy]}
          onPress={() => void attemptUnlock()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={failed ? t('appLock.retryUnlock') : t('appLock.unlock')}
          accessibilityState={{ busy }}
        >
          {busy
            ? <ActivityIndicator color={COLORS.white} />
            : <Text style={styles.primaryText}>{failed ? t('appLock.retryUnlock') : t('appLock.unlock')}</Text>}
        </Pressable>

        <Pressable
          style={styles.secondary}
          onPress={() => setConfirmSignOut(true)}
          accessibilityRole="button"
          accessibilityLabel={t('appLock.signOutInstead')}
        >
          <Text style={styles.secondaryText}>{t('appLock.signOutInstead')}</Text>
        </Pressable>
      </View>

      <ConfirmModal
        visible={confirmSignOut}
        kind="danger"
        title={t('appLock.signOutTitle')}
        message={t('appLock.signOutBody')}
        confirmLabel={t('appLock.signOutConfirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => { setConfirmSignOut(false); onSignOut(); }}
        onCancel={() => setConfirmSignOut(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xxl,
    gap: SPACING.md,
  },
  mark: {
    width: 84,
    height: 84,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
    textAlign: 'center',
  },
  body: {
    fontSize: FONT_SIZES.base,
    color: COLORS.text2,
    textAlign: 'center',
    lineHeight: FONT_SIZES.base * 1.4,
    marginBottom: SPACING.lg,
  },
  primary: {
    minHeight: TOUCH.recommended,
    minWidth: 220,
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.coral,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  primaryBusy: { opacity: 0.8 },
  primaryText: {
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
  },
  secondary: {
    minHeight: TOUCH.recommended,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  secondaryText: {
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.text2,
  },
});
