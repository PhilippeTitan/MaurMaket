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
import { useTranslation } from '../i18n';
import { checkPaymentStatus } from '../api';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function PaymentReturnScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'PaymentReturn'>>();
  const orderId = route.params?.orderId;

  const [status, setStatus] = useState<'polling' | 'confirmed' | 'timeout'>('polling');
  const [elapsed, setElapsed] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!orderId) {
      setStatus('timeout');
      return;
    }

    elapsedRef.current = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);

    pollRef.current = setInterval(async () => {
      try {
        const res = await checkPaymentStatus(orderId) as { status: string };
        if (res.status === 'paid' || res.status === 'processing' || res.status === 'shipped' || res.status === 'completed') {
          setStatus('confirmed');
          if (pollRef.current) clearInterval(pollRef.current);
          if (elapsedRef.current) clearInterval(elapsedRef.current);
          setTimeout(() => {
            nav.replace('OrderDetail', { orderId: orderId! });
          }, 2000);
        } else if (res.status === 'cancelled') {
          setStatus('timeout');
          if (pollRef.current) clearInterval(pollRef.current);
          if (elapsedRef.current) clearInterval(elapsedRef.current);
        }
      } catch { /* keep polling */ }
    }, 3000);

    const timeout = setTimeout(() => {
      setStatus('timeout');
      if (pollRef.current) clearInterval(pollRef.current);
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    }, 30000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      clearTimeout(timeout);
    };
  }, [orderId]);

  if (status === 'confirmed') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.iconCircle}>
          <Icon name="check-circle" size={64} color={COLORS.green} />
        </View>
        <Text style={styles.title}>{t('paymentReturn.confirmed')}</Text>
        <Text style={styles.subtitle}>{t('paymentReturn.confirmedSubtitle')}</Text>
        <Text style={styles.hint}>{t('paymentReturn.redirecting')}</Text>
      </View>
    );
  }

  if (status === 'timeout' || !orderId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={[styles.iconCircle, { borderColor: COLORS.yellow }]}>
          <Icon name="time" size={56} color={COLORS.yellow} />
        </View>
        <Text style={styles.title}>{t('paymentReturn.processing')}</Text>
        <Text style={styles.subtitle}>
          {orderId
            ? t('paymentReturn.processingHint')
            : t('paymentReturn.noOrderId')}
        </Text>
        <View style={styles.actions}>
          {orderId && (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => nav.replace('OrderDetail', { orderId })}
              accessibilityLabel="view order"
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>{t('paymentReturn.viewOrder')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => nav.popToTop()}
            accessibilityLabel="back to home"
            accessibilityRole="button"
          >
            <Text style={styles.secondaryBtnText}>{t('paymentReturn.backToHome')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.iconCircle}>
        <ActivityIndicator size="large" color={COLORS.coral} />
      </View>
      <Text style={styles.title}>{t('paymentReturn.confirming')}</Text>
      <Text style={styles.subtitle}>
        {elapsed < 5
          ? t('paymentReturn.connecting')
          : elapsed < 15
            ? t('paymentReturn.fewSeconds')
            : t('paymentReturn.fewMinutes')}
      </Text>
      {orderId && (
        <View style={styles.orderBadge}>
          <Text style={styles.orderBadgeText}>{t('paymentReturn.orderLabel', { id: orderId.slice(0, 8) })}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: COLORS.bg,
    justifyContent: 'center', alignItems: 'center', padding: SPACING.xl,
  },
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
    marginTop: 32, gap: 12, width: '100%', paddingHorizontal: 20,
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
