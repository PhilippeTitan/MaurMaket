import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { Icon } from '../components/icons/Icon';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme';
import { useTranslation } from '@/localization';
import { checkPaymentStatus, checkPendingStatus, checkSellerDebtPayment } from '../api';
import { subscribeToUserEvents } from '../realtime';
import type { RootStackParamList } from '../navigation';
import { store } from '../store';
import { CheckoutSection, CheckoutSurface } from '../components/CheckoutPrimitives';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function PaymentReturnScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'PaymentReturn'>>();
  const orderId = route.params?.orderId;
  const pendingId = route.params?.pendingId;
  const debtPaymentId = route.params?.debtPaymentId;

  const [status, setStatus] = useState<'polling' | 'confirmed' | 'timeout' | 'failed'>('polling');
  const [elapsed, setElapsed] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const targetId = orderId || pendingId || debtPaymentId;
    if (!targetId) {
      setStatus('timeout');
      return;
    }

    elapsedRef.current = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);

    let active = true;
    let checking = false;
    const checkStatus = async () => {
      if (!active || checking) return;
      checking = true;
      try {
        if (debtPaymentId) {
          const res = await checkSellerDebtPayment(debtPaymentId) as { status: string };
          if (res.status === 'completed' || res.status === 'failed') {
            if (!active) return;
            setStatus(res.status === 'completed' ? 'confirmed' : 'failed');
            if (pollRef.current) clearInterval(pollRef.current);
            if (elapsedRef.current) clearInterval(elapsedRef.current);
          }
        } else if (pendingId) {
          // Deferred checkout flow — poll pending checkout status
          const res = await checkPendingStatus(pendingId) as { status: string; orderId?: string };
          if (res.status === 'completed') {
            if (!active) return;
            setStatus('confirmed');
            if (pollRef.current) clearInterval(pollRef.current);
            if (elapsedRef.current) clearInterval(elapsedRef.current);
            try { const A = (await import('@react-native-async-storage/async-storage')).default; await A.removeItem('mm_pending_payment'); } catch {}
            // Cart was NOT cleared during checkout — clear it now that payment is confirmed
            try { await store.clearCart(); } catch { /* best effort */ }
            setTimeout(() => {
              nav.replace('OrderDetail', { orderId: res.orderId || '' });
            }, 2000);
          } else if (res.status === 'expired') {
            if (!active) return;
            setStatus('timeout');
            if (pollRef.current) clearInterval(pollRef.current);
            if (elapsedRef.current) clearInterval(elapsedRef.current);
            try { const A = (await import('@react-native-async-storage/async-storage')).default; await A.removeItem('mm_pending_payment'); } catch {}
          }
        } else {
          // Legacy flow — poll order status directly
          const res = await checkPaymentStatus(orderId!) as { status: string };
          if (res.status === 'paid' || res.status === 'processing' || res.status === 'shipped' || res.status === 'completed') {
            if (!active) return;
            setStatus('confirmed');
            if (pollRef.current) clearInterval(pollRef.current);
            if (elapsedRef.current) clearInterval(elapsedRef.current);
            setTimeout(() => {
              nav.replace('OrderDetail', { orderId: orderId! });
            }, 2000);
          } else if (res.status === 'failed' || res.status === 'cancelled') {
            if (!active) return;
            setStatus(res.status === 'failed' ? 'failed' : 'timeout');
            if (pollRef.current) clearInterval(pollRef.current);
            if (elapsedRef.current) clearInterval(elapsedRef.current);
            try { const A = (await import('@react-native-async-storage/async-storage')).default; await A.removeItem('mm_pending_payment'); } catch {}
          }
        }
      } catch { /* keep polling */ }
      finally { checking = false; }
    };

    const startPolling = (intervalMs: number) => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => { void checkStatus(); }, intervalMs);
    };
    startPolling(3000);
    const unsubscribe = subscribeToUserEvents(
      () => { void checkStatus(); },
      connected => startPolling(connected ? 12000 : 3000),
    );

    const timeout = setTimeout(() => {
      setStatus('timeout');
      if (pollRef.current) clearInterval(pollRef.current);
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      (async () => { try { const A = (await import('@react-native-async-storage/async-storage')).default; await A.removeItem('mm_pending_payment'); } catch {} })();
    }, 90000);

    return () => {
      active = false;
      unsubscribe();
      if (pollRef.current) clearInterval(pollRef.current);
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      clearTimeout(timeout);
    };
  }, [orderId, pendingId, debtPaymentId]);

  if (status === 'confirmed') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <CheckoutSurface tone="success" style={styles.stateCard}>
          <View style={styles.iconCircle}>
            <Icon name="check-circle" size={64} color={COLORS.green} />
          </View>
          <Text style={styles.title}>{t('paymentReturn.confirmed')}</Text>
          <Text style={styles.subtitle}>{debtPaymentId ? t('payments.debtPaymentConfirmedBody') : t('paymentReturn.confirmedSubtitle')}</Text>
          {!debtPaymentId && <Text style={styles.hint}>{t('paymentReturn.redirecting')}</Text>}
          {debtPaymentId && <TouchableOpacity style={styles.secondaryBtn} onPress={() => nav.popToTop()} accessibilityRole="button"><Text style={styles.secondaryBtnText}>{t('paymentReturn.backToHome')}</Text></TouchableOpacity>}
        </CheckoutSurface>
      </View>
    );
  }

  if (status === 'timeout' || status === 'failed' || (!orderId && !pendingId && !debtPaymentId)) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <CheckoutSurface tone="warning" style={styles.stateCard}>
          <View style={[styles.iconCircle, { borderColor: COLORS.yellow }]}>
            <Icon name="time" size={56} color={COLORS.yellow} />
          </View>
          <Text style={styles.title}>{status === 'failed' ? t('paymentReturn.failedTitle') : t('paymentReturn.processing')}</Text>
          <Text style={styles.subtitle}>
            {status === 'failed' ? (debtPaymentId ? t('payments.debtPaymentRetryHint') : t('paymentReturn.failedHint')) : debtPaymentId ? t('payments.debtPaymentCheckStatus') : orderId ? t('paymentReturn.processingHint') : t('paymentReturn.noOrderId')}
          </Text>
          <View style={styles.actions}>
            {orderId && !debtPaymentId && (
              <TouchableOpacity style={styles.primaryBtn} onPress={() => nav.replace('OrderDetail', { orderId })} accessibilityLabel="view order" accessibilityRole="button">
                <Text style={styles.primaryBtnText}>{t('paymentReturn.viewOrder')}</Text>
              </TouchableOpacity>
            )}
            {pendingId && !orderId && !debtPaymentId && (
              <TouchableOpacity style={styles.primaryBtn} onPress={() => nav.popToTop()} accessibilityLabel="back to checkout" accessibilityRole="button">
                <Text style={styles.primaryBtnText}>{t('paymentReturn.backToCheckout')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => nav.popToTop()} accessibilityLabel="back to home" accessibilityRole="button">
              <Text style={styles.secondaryBtnText}>{t('paymentReturn.backToHome')}</Text>
            </TouchableOpacity>
          </View>
        </CheckoutSurface>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <CheckoutSurface tone="info" style={styles.stateCard}>
        <View style={styles.iconCircle}>
          <ActivityIndicator size="large" color={COLORS.coral} />
        </View>
        <Text style={styles.title}>{t('paymentReturn.confirming')}</Text>
        <Text style={styles.subtitle}>
          {elapsed < 5 ? t('paymentReturn.connecting') : elapsed < 20 ? t('paymentReturn.fewSeconds') : elapsed < 60 ? t('paymentReturn.fewMinutes') : t('paymentReturn.stillProcessing')}
        </Text>
        <CheckoutSection icon="shield-check-outline" title={pendingId || debtPaymentId ? t('paymentReturn.waitingMoncash') : t('paymentReturn.secureCheck')} />
        {orderId && <View style={styles.orderBadge}><Text style={styles.orderBadgeText}>{t('paymentReturn.orderLabel', { id: orderId.slice(0, 8) })}</Text></View>}
      </CheckoutSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: COLORS.bg,
    justifyContent: 'center', alignItems: 'center', padding: SPACING.xl,
  },
  stateCard: { width: '100%', maxWidth: 420, alignItems: 'center' },
  iconCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: COLORS.surface, borderWidth: 2, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  title: {
    fontSize: 22, fontWeight: '800', color: COLORS.text,
    textAlign: 'center', marginBottom: 8,
  },
  subtitle: {
    fontSize: 14, color: COLORS.text2, textAlign: 'center',
    lineHeight: 20, paddingHorizontal: 10,
  },
  hint: {
    fontSize: 12, color: COLORS.green, marginTop: 12, fontWeight: '600',
  },
  orderBadge: {
    marginTop: 20, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.pill,
    borderWidth: 1, borderColor: COLORS.border,
  },
  orderBadgeText: {
    fontSize: 13, color: COLORS.text2, fontWeight: '600',
  },
  actions: {
    marginTop: 24, gap: 12, width: '100%',
  },
  primaryBtn: {
    paddingVertical: 14, borderRadius: RADIUS.button,
    backgroundColor: COLORS.coral, alignItems: 'center',
  },
  primaryBtnText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  secondaryBtn: {
    paddingVertical: 14, borderRadius: RADIUS.button,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, alignItems: 'center',
  },
  secondaryBtnText: { color: COLORS.text2, fontSize: 14, fontWeight: '600' },
});
