import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Linking, Platform, ScrollView, PermissionsAndroid, Alert, AppState,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING, RADIUS } from '../theme';
import { useTranslation } from '../i18n';
import { getOrder } from '../api';
import type { RootStackParamList } from '../navigation';
import ScreenHeader from '../components/ScreenHeader';
import { dialUssd } from '../ussd';
import { onNatCashSms, onSmsReceived } from '../sms-listener';
import type { NatCashSms } from '../sms-listener';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Props = RouteProp<RootStackParamList, 'NatCashPayment'>;

// ─── SMS Parsing (kept for server-side verification) ─────────────
const SEND_REGEX = /Ou transfere ([\d,.]+) HTG a (.+?) (\d{8,}) nan (\d{2}:\d{2}) (\d{2}\/\d{2}\/\d{4}), fre: ([\d,.]+) HTG\. Balans ou: ([\d,.]+) HTG\. Transcode: (\d+)\./;

interface ParsedSms {
  amount: number;
  recipientName: string;
  recipientNumber: string;
  time: string;
  date: string;
  fee: number;
  balance: number;
  transcode: string;
}

function parseNatCashSms(body: string): ParsedSms | null {
  const m = body.match(SEND_REGEX);
  if (!m) return null;
  return {
    amount: parseFloat(m[1].replace(/,/g, '')),
    recipientName: m[2].trim(),
    recipientNumber: m[3],
    time: m[4],
    date: m[5],
    fee: parseFloat(m[6].replace(/,/g, '')),
    balance: parseFloat(m[7].replace(/,/g, '')),
    transcode: m[8],
  };
}

// ─── Step indicator ───────────────────────────────────────────
function StepDot({ active, done }: { active?: boolean; done?: boolean }) {
  return (
    <View style={[
      styles.stepDot,
      done && styles.stepDotDone,
      active && styles.stepDotActive,
    ]}>
      {done && <MaterialCommunityIcons name="check" size={10} color={COLORS.white} />}
    </View>
  );
}

function StepLine({ done }: { done?: boolean }) {
  return <View style={[styles.stepLine, done && styles.stepLineDone]} />;
}

// ─── Main Component ──────────────────────────────────────────
export default function NatCashPaymentScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const route = useRoute<Props>();

  const { orderId, total, sellerName, sellerPhone } = route.params;

  const [step, setStep] = useState<'dial' | 'sent' | 'detecting' | 'confirmed' | 'failed'>('dial');
  const [parsed, setParsed] = useState<ParsedSms | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [ussdLoading, setUssdLoading] = useState(false);
  const [smsDetected, setSmsDetected] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const confirmedRef = useRef(false);

  // ── Confirm payment (shared logic — prevents double-fire) ──
  const confirmPayment = useCallback(async (source: string, smsData?: NatCashSms) => {
    if (confirmedRef.current) return; // already confirmed
    confirmedRef.current = true;

    console.log(`[NatCash] Payment confirmed via ${source}`, smsData ? JSON.stringify(smsData) : '');
    setSmsDetected(true);

    // Stop polling and timer immediately
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);

    // If we got SMS data, show it briefly before confirming
    if (smsData) {
      setParsed({
        amount: parseFloat(smsData.amount),
        recipientName: smsData.recipientName,
        recipientNumber: smsData.recipientNumber,
        time: smsData.time,
        date: smsData.date,
        fee: parseFloat(smsData.fee),
        balance: parseFloat(smsData.balance),
        transcode: smsData.transcode,
      });
    }

    setStep('confirmed');
    setTimeout(() => nav.replace('OrderDetail', { orderId }), 2500);
  }, [orderId, nav]);

  // ── Poll server for order status (backup method) ──
  const pollOrderStatus = useCallback(async () => {
    if (confirmedRef.current) return;
    try {
      const res = await getOrder(orderId) as { order: { status: string } };
      if (res.order?.status === 'paid') {
        confirmPayment('server-poll');
      }
    } catch { /* keep polling */ }
  }, [orderId, confirmPayment]);

  // ── Start polling + SMS listener when "detecting" ──
  useEffect(() => {
    if (step === 'detecting') {
      timerRef.current = setInterval(() => setElapsed(p => p + 1), 1000);
      pollRef.current = setInterval(pollOrderStatus, 4000);

      // ── Listen for NatCash SMS (instant confirmation!) ──
      const unsubNatCash = onNatCashSms((sms) => {
        console.log('[NatCash] SMS received:', sms.transcode);
        confirmPayment('sms-listener', sms);
      });

      // ── Also listen for raw SMS (for logging/debugging) ──
      const unsubRaw = onSmsReceived((sms) => {
        console.log('[NatCash] Raw SMS from:', sms.sender);
      });

      // Timeout after 10 minutes
      const timeout = setTimeout(() => {
        if (!confirmedRef.current) {
          setStep('failed');
          if (pollRef.current) clearInterval(pollRef.current);
          if (timerRef.current) clearInterval(timerRef.current);
        }
      }, 600_000);

      return () => {
        unsubNatCash();
        unsubRaw();
        if (pollRef.current) clearInterval(pollRef.current);
        if (timerRef.current) clearInterval(timerRef.current);
        clearTimeout(timeout);
      };
    }
  }, [step, pollOrderStatus, confirmPayment]);

  // ── Detect when user returns from USSD dialog ──
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/background|inactive/) && nextState === 'active') {
        if (step === 'dial') {
          // Auto-advance: user just returned from the USSD dialog
          setStep('sent');
        }
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [step]);

  // ── Reset confirmedRef when going back to dial ──
  useEffect(() => {
    if (step === 'dial') {
      confirmedRef.current = false;
      setSmsDetected(false);
      setParsed(null);
      setElapsed(0);
    }
  }, [step]);

  // ── Dial USSD via system intent ──
  const handleDial = async () => {
    setUssdLoading(true);
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CALL_PHONE,
          {
            title: 'Phone Permission',
            message: 'MaurMaket needs phone access to dial the NatCash USSD code.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          },
        );

        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          const result = await dialUssd('*202#');
          if (!result.success) {
            Alert.alert('Error', 'Could not open dialer. Please dial *202# manually.');
            setUssdLoading(false);
            return;
          }
          setUssdLoading(false);
          return;
        }
      }

      const result = await dialUssd('*202#');
      if (!result.success) {
        Alert.alert('Error', result.errorMessage || 'Could not dial USSD code');
      }
    } catch {
      Alert.alert('Error', 'Could not dial USSD code. Please dial *202# manually.');
    } finally {
      setUssdLoading(false);
    }
  };

  const handleSent = async () => {
    // Request SMS permissions on Android (needed for BroadcastReceiver to read message body)
    if (Platform.OS === 'android') {
      try {
        const smsPerms = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
          PermissionsAndroid.PERMISSIONS.READ_SMS,
        ]);
        const granted = [
          smsPerms['android.permission.RECEIVE_SMS'],
          smsPerms['android.permission.READ_SMS'],
        ].every(p => p === PermissionsAndroid.RESULTS.GRANTED);
        if (!granted) {
          console.log('[NatCash] SMS permissions not granted — falling back to server polling only');
        }
      } catch {
        // User denied — continue with server polling only
      }
    }
    setStep('detecting');
  };

  // ── Step progress bar ──
  const stepIndex = step === 'dial' ? 0 : step === 'sent' || step === 'detecting' ? 1 : step === 'confirmed' ? 2 : 1;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenHeader title="NatCash Payment" onBack={() => nav.goBack()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Step Progress ── */}
        <View style={styles.progressRow}>
          <StepDot done={stepIndex >= 1} active={stepIndex === 0} />
          <StepLine done={stepIndex >= 1} />
          <StepDot done={stepIndex >= 2} active={stepIndex === 1} />
          <StepLine done={stepIndex >= 2} />
          <StepDot done={stepIndex >= 3} active={stepIndex === 2} />
        </View>
        <View style={styles.progressLabels}>
          <Text style={[styles.progressLabel, stepIndex === 0 && styles.progressLabelActive]}>Dial</Text>
          <Text style={[styles.progressLabel, stepIndex === 1 && styles.progressLabelActive]}>Send</Text>
          <Text style={[styles.progressLabel, stepIndex === 2 && styles.progressLabelActive]}>Confirm</Text>
        </View>

        {/* ── Order Summary Card ── */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <MaterialCommunityIcons name="receipt-text-outline" size={18} color={COLORS.coral} />
            <Text style={styles.cardLabel}>Order Total</Text>
          </View>
          <Text style={styles.cardAmount}>G {total.toFixed(0)}</Text>
          <View style={styles.cardDivider} />
          <View style={styles.cardRow}>
            <MaterialCommunityIcons name="account-outline" size={16} color={COLORS.text2} />
            <Text style={styles.cardSeller}>{sellerName}</Text>
          </View>
        </View>

        {/* ── Step Content ── */}
        {step === 'dial' && (
          <View style={styles.stepContent}>
            <View style={styles.infoCard}>
              <MaterialCommunityIcons name="cellphone" size={28} color={COLORS.blue} />
              <Text style={styles.infoTitle}>Dial *202#</Text>
              <Text style={styles.infoBody}>
                Tap below to open the NatCash menu. Then:
              </Text>
              <View style={styles.stepsList}>
                <View style={styles.stepItem}>
                  <View style={styles.stepNum}><Text style={styles.stepNumText}>1</Text></View>
                  <Text style={styles.stepItemText}>Select <Text style={styles.bold}>Send Money</Text></Text>
                </View>
                <View style={styles.stepItem}>
                  <View style={styles.stepNum}><Text style={styles.stepNumText}>2</Text></View>
                  <Text style={styles.stepItemText}>Enter <Text style={styles.bold}>{sellerPhone}</Text></Text>
                </View>
                <View style={styles.stepItem}>
                  <View style={styles.stepNum}><Text style={styles.stepNumText}>3</Text></View>
                  <Text style={styles.stepItemText}>Enter amount: <Text style={styles.bold}>G {total.toFixed(0)}</Text></Text>
                </View>
                <View style={styles.stepItem}>
                  <View style={styles.stepNum}><Text style={styles.stepNumText}>4</Text></View>
                  <Text style={styles.stepItemText}>Confirm with your PIN</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity style={styles.dialBtn} onPress={handleDial} disabled={ussdLoading} accessibilityLabel="dial USSD code" accessibilityRole="button">
              {ussdLoading ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <MaterialCommunityIcons name="phone-dial" size={22} color={COLORS.white} />
              )}
              <Text style={styles.dialBtnText}>{ussdLoading ? 'Connecting…' : 'Open NatCash Menu'}</Text>
            </TouchableOpacity>

            <Text style={styles.hintText}>
              The NatCash menu will open on top of this screen. Complete the transfer, then come back here.
            </Text>

            <TouchableOpacity style={styles.secondaryBtn} onPress={handleSent} accessibilityLabel="I sent the payment" accessibilityRole="button">
              <Text style={styles.secondaryBtnText}>I've Sent the Payment</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'sent' && (
          <View style={styles.stepContent}>
            <View style={styles.infoCard}>
              <MaterialCommunityIcons name="cellphone-check" size={28} color={COLORS.green} />
              <Text style={[styles.infoTitle, { color: COLORS.green }]}>Payment Sent?</Text>
              <Text style={styles.infoBody}>
                Tap below once you've completed the NatCash transfer. We'll detect your confirmation instantly.
              </Text>
            </View>

            <TouchableOpacity style={styles.dialBtn} onPress={handleSent} accessibilityLabel="confirm payment sent" accessibilityRole="button">
              <MaterialCommunityIcons name="check-circle" size={22} color={COLORS.white} />
              <Text style={styles.dialBtnText}>Yes, I've Sent It</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep('dial')} accessibilityLabel="go back" accessibilityRole="button">
              <Text style={styles.secondaryBtnText}>← Back to Dial</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'detecting' && (
          <View style={styles.stepContent}>
            <View style={[styles.spinnerCircle, smsDetected && { borderColor: COLORS.green + '44' }]}>
              {smsDetected ? (
                <MaterialCommunityIcons name="check-circle" size={32} color={COLORS.green} />
              ) : (
                <ActivityIndicator size="large" color={COLORS.coral} />
              )}
            </View>
            <Text style={styles.detectingTitle}>
              {smsDetected ? 'SMS Detected!' : 'Waiting for payment…'}
            </Text>
            <Text style={styles.detectingBody}>
              {smsDetected
                ? 'Your NatCash confirmation was received instantly. Confirming payment…'
                : 'We\'re listening for your NatCash confirmation SMS. This is detected instantly — no internet needed.'}
            </Text>
            {parsed && (
              <View style={styles.smsCard}>
                <View style={styles.smsRow}>
                  <Text style={styles.smsLabel}>Amount</Text>
                  <Text style={styles.smsValue}>G {parsed.amount.toFixed(0)}</Text>
                </View>
                <View style={styles.smsRow}>
                  <Text style={styles.smsLabel}>To</Text>
                  <Text style={styles.smsValue}>{parsed.recipientName}</Text>
                </View>
                <View style={styles.smsRow}>
                  <Text style={styles.smsLabel}>Transcode</Text>
                  <Text style={styles.smsValue}>{parsed.transcode}</Text>
                </View>
              </View>
            )}
            {elapsed > 0 && !smsDetected && (
              <Text style={styles.elapsed}>{elapsed}s</Text>
            )}
            <View style={styles.orderBadge}>
              <Text style={styles.orderBadgeText}>Order {orderId.slice(0, 8)}</Text>
            </View>
          </View>
        )}

        {step === 'confirmed' && (
          <View style={styles.stepContent}>
            <View style={styles.successCircle}>
              <MaterialCommunityIcons name="check-circle" size={56} color={COLORS.green} />
            </View>
            <Text style={styles.confirmedTitle}>Payment Detected!</Text>
            <Text style={styles.confirmedBody}>
              {smsDetected
                ? `NatCash transfer confirmed (${parsed?.transcode || 'SMS detected'}). Redirecting to your order…`
                : 'Payment confirmed. Redirecting to your order…'}
            </Text>
          </View>
        )}

        {step === 'failed' && (
          <View style={styles.stepContent}>
            <View style={[styles.spinnerCircle, { borderColor: COLORS.yellow }]}>
              <MaterialCommunityIcons name="clock-alert-outline" size={40} color={COLORS.yellow} />
            </View>
            <Text style={styles.failedTitle}>Payment Not Detected</Text>
            <Text style={styles.failedBody}>
              We couldn't detect a NatCash confirmation SMS. This can happen if the SMS was delayed by the carrier. You can retry or check your orders.
            </Text>
            <TouchableOpacity style={styles.dialBtn} onPress={() => { setStep('dial'); setElapsed(0); }} accessibilityLabel="retry" accessibilityRole="button">
              <MaterialCommunityIcons name="refresh" size={20} color={COLORS.white} />
              <Text style={styles.dialBtnText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => nav.navigate('Orders')} accessibilityLabel="go to orders" accessibilityRole="button">
              <Text style={styles.secondaryBtnText}>View Orders</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Disclaimer ── */}
        <View style={styles.disclaimer}>
          <MaterialCommunityIcons name="information-outline" size={14} color={COLORS.text2} />
          <Text style={styles.disclaimerText}>
            NatCash payments are processed directly between you and the seller. SMS detection is automatic — no internet needed during the transfer.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingBottom: 40, paddingHorizontal: SPACING.lg },

  // Progress
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: SPACING.xl, marginBottom: SPACING.xs },
  stepDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  stepDotDone: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  stepDotActive: { borderColor: COLORS.coral },
  stepLine: { width: 48, height: 2, backgroundColor: COLORS.border, marginHorizontal: 4 },
  stepLineDone: { backgroundColor: COLORS.green },
  progressLabels: { flexDirection: 'row', justifyContent: 'center', gap: 56, marginBottom: SPACING.xl },
  progressLabel: { fontSize: 11, color: COLORS.text2, fontWeight: '600' },
  progressLabelActive: { color: COLORS.coral },

  // Card
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.card, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg, marginBottom: SPACING.xl },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardLabel: { fontSize: 12, color: COLORS.text2, fontWeight: '600', textTransform: 'uppercase' },
  cardAmount: { fontSize: 28, fontWeight: '800', color: COLORS.coral, marginTop: 6, marginBottom: 10 },
  cardDivider: { height: 1, backgroundColor: COLORS.border, marginBottom: 10 },
  cardSeller: { fontSize: 14, color: COLORS.text, fontWeight: '600' },

  // Step content
  stepContent: { alignItems: 'center', gap: SPACING.md },

  // Info card (dial step)
  infoCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.card, borderWidth: 1, borderColor: COLORS.blue + '33', padding: SPACING.lg, alignItems: 'center', gap: 8, width: '100%' },
  infoTitle: { fontSize: 18, fontWeight: '800', color: COLORS.blue },
  infoBody: { fontSize: 13, color: COLORS.text2, textAlign: 'center', lineHeight: 20 },
  bold: { color: COLORS.text, fontWeight: '700' },

  // Steps list
  stepsList: { width: '100%', marginTop: 8 },
  stepItem: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.coral + '20', alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontSize: 11, fontWeight: '800', color: COLORS.coral },
  stepItemText: { fontSize: 13, color: COLORS.text2, flex: 1 },

  // Hint
  hintText: { fontSize: 11, color: COLORS.text2, textAlign: 'center', fontStyle: 'italic', paddingHorizontal: 10 },

  // Buttons
  dialBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.coral, borderRadius: RADIUS.button, paddingVertical: 14, paddingHorizontal: 24, width: '100%' },
  dialBtnText: { fontSize: 15, color: COLORS.white, fontWeight: '700' },
  secondaryBtn: { paddingVertical: 14, borderRadius: RADIUS.button, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, alignItems: 'center', width: '100%' },
  secondaryBtnText: { fontSize: 14, color: COLORS.text2, fontWeight: '600' },

  // Detecting
  spinnerCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.surface, borderWidth: 2, borderColor: COLORS.coral + '44', alignItems: 'center', justifyContent: 'center', marginTop: SPACING.md },
  detectingTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  detectingBody: { fontSize: 13, color: COLORS.text2, textAlign: 'center', lineHeight: 20, paddingHorizontal: 10 },
  elapsed: { fontSize: 12, color: COLORS.text2, fontWeight: '600', marginTop: 4 },
  orderBadge: { marginTop: SPACING.sm, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: COLORS.surface, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border },
  orderBadgeText: { fontSize: 12, color: COLORS.text2, fontWeight: '600' },

  // SMS card (shown when SMS is detected)
  smsCard: { width: '100%', backgroundColor: COLORS.green + '10', borderRadius: RADIUS.card, borderWidth: 1, borderColor: COLORS.green + '33', padding: SPACING.md, marginTop: SPACING.sm },
  smsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  smsLabel: { fontSize: 12, color: COLORS.text2, fontWeight: '600' },
  smsValue: { fontSize: 13, color: COLORS.text, fontWeight: '700' },

  // Confirmed
  successCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.green + '15', alignItems: 'center', justifyContent: 'center', marginTop: SPACING.md },
  confirmedTitle: { fontSize: 20, fontWeight: '800', color: COLORS.green },
  confirmedBody: { fontSize: 13, color: COLORS.text2, textAlign: 'center' },

  // Failed
  failedTitle: { fontSize: 18, fontWeight: '800', color: COLORS.yellow },
  failedBody: { fontSize: 13, color: COLORS.text2, textAlign: 'center', lineHeight: 20, paddingHorizontal: 10 },

  // Disclaimer
  disclaimer: { flexDirection: 'row', gap: 6, marginTop: SPACING.xl, paddingHorizontal: 4, alignItems: 'flex-start' },
  disclaimerText: { flex: 1, fontSize: 11, color: COLORS.text2, lineHeight: 16 },
});
