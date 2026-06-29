import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Linking,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '../theme';
import { useTranslation } from '../i18n';
import { createSubscription, renewSubscription, getCurrentSubscription } from '../api';
import { store } from '../store';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Subscription {
  status: string;
  expires_at: string;
  grace_period_days: number;
}

export default function BusinessSubscriptionScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  const fetchSubscription = useCallback(async () => {
    try {
      const res = await getCurrentSubscription() as { subscription: Subscription | null };
      setSubscription(res.subscription);
    } catch { /* ignore */ }
    setFetching(false);
  }, []);

  useEffect(() => { fetchSubscription(); }, []);

  const isActive = subscription?.status === 'active' && new Date(subscription.expires_at) > new Date();
  const isPastDue = subscription?.status === 'past_due';
  const expiresAt = subscription ? new Date(subscription.expires_at) : null;
  const daysLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000)) : 0;

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const res = await createSubscription() as { paymentUrl: string };
      if (res.paymentUrl) {
        await Linking.openURL(res.paymentUrl);
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || 'Payment failed');
    }
    setLoading(false);
  };

  const handleRenew = async () => {
    setLoading(true);
    try {
      const res = await renewSubscription() as { paymentUrl: string };
      if (res.paymentUrl) {
        await Linking.openURL(res.paymentUrl);
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || 'Renewal failed');
    }
    setLoading(false);
  };

  if (fetching) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => nav.goBack()}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.text2} />
          </TouchableOpacity>
          <Text style={styles.title}>Business Subscription</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.coral} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => nav.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.text2} />
        </TouchableOpacity>
        <Text style={styles.title}>Business Subscription</Text>
      </View>

      {isActive ? (
        <View style={styles.content}>
          <View style={styles.activeCard}>
            <MaterialCommunityIcons name="check-circle" size={48} color={COLORS.green} />
            <Text style={styles.activeTitle}>You're a Business Seller!</Text>
            <Text style={styles.activeExpiry}>
              Your subscription is active until {expiresAt?.toLocaleDateString('en-HT', { day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
            <Text style={styles.daysLeft}>{daysLeft} days remaining</Text>
          </View>

          {daysLeft <= 7 && (
            <TouchableOpacity style={styles.primaryBtn} onPress={handleRenew} disabled={loading}>
              {loading ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Text style={styles.primaryBtnText}>Renew Now — Rs 2,500</Text>
              )}
            </TouchableOpacity>
          )}

          <View style={styles.benefitsCard}>
            <Text style={styles.benefitsTitle}>Your Benefits</Text>
            <BenefitRow icon="percent" text="5% commission rate" />
            <BenefitRow icon="storefront-outline" text="Custom store name" />
            <BenefitRow icon="tag-outline" text="Promo codes" />
            <BenefitRow icon="chart-line" text="Advanced analytics" />
          </View>
        </View>
      ) : isPastDue ? (
        <View style={styles.content}>
          <View style={styles.pastDueCard}>
            <MaterialCommunityIcons name="clock-alert-outline" size={48} color={COLORS.yellow} />
            <Text style={styles.pastDueTitle}>Subscription Expired</Text>
            <Text style={styles.pastDueDesc}>
              Your Business subscription has expired. You have been moved to Verified tier. Renew to regain Business benefits.
            </Text>
          </View>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleRenew} disabled={loading}>
            {loading ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <Text style={styles.primaryBtnText}>Renew — Rs 2,500/month</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.heroCard}>
            <View style={styles.heroIcon}>
              <MaterialCommunityIcons name="storefront-outline" size={48} color={COLORS.coral} />
            </View>
            <Text style={styles.heroTitle}>Go Business</Text>
            <Text style={styles.heroPrice}>Rs 2,500/month</Text>
            <Text style={styles.heroDesc}>
              Unlock the full seller experience. Lower commission, store branding, promo codes, and advanced analytics.
            </Text>
          </View>

          <View style={styles.benefitsCard}>
            <Text style={styles.benefitsTitle}>What You Get</Text>
            <BenefitRow icon="percent" text="5% commission (down from 8%)" />
            <BenefitRow icon="storefront-outline" text="Custom store name & logo" />
            <BenefitRow icon="tag-outline" text="Create promo codes" />
            <BenefitRow icon="chart-line" text="Advanced analytics + top products" />
            <BenefitRow icon="shield-check" text="Business trust badge" />
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={handleSubscribe} disabled={loading}>
            {loading ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <Text style={styles.primaryBtnText}>Subscribe Now — Rs 2,500</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            You will be redirected to MonCash to complete payment. Your subscription starts immediately and renews monthly. Cancel anytime from Settings.
          </Text>
        </View>
      )}
    </View>
  );
}

function BenefitRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={benefitStyles.row}>
      <MaterialCommunityIcons name={icon as any} size={18} color={COLORS.green} />
      <Text style={benefitStyles.text}>{text}</Text>
    </View>
  );
}

const benefitStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  text: { fontSize: 13, color: COLORS.text, flex: 1 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { fontSize: 16, color: COLORS.text, fontWeight: '700' },
  content: { flex: 1, padding: SPACING.md, gap: 16 },
  heroCard: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  heroIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.coral + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  heroTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text },
  heroPrice: { fontSize: 20, fontWeight: '700', color: COLORS.coral },
  heroDesc: { fontSize: 14, color: COLORS.text2, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
  benefitsCard: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  benefitsTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  primaryBtn: { backgroundColor: COLORS.coral, padding: 16, borderRadius: 12, alignItems: 'center' },
  primaryBtnText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  disclaimer: { fontSize: 11, color: COLORS.text2, textAlign: 'center', lineHeight: 16 },
  activeCard: { alignItems: 'center', paddingVertical: 32, gap: 8, backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  activeTitle: { fontSize: 20, fontWeight: '800', color: COLORS.green },
  activeExpiry: { fontSize: 14, color: COLORS.text2, textAlign: 'center' },
  daysLeft: { fontSize: 13, fontWeight: '700', color: COLORS.coral },
  pastDueCard: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  pastDueTitle: { fontSize: 20, fontWeight: '800', color: COLORS.yellow },
  pastDueDesc: { fontSize: 14, color: COLORS.text2, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
});
