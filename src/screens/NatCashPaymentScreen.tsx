import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Linking, Platform, ScrollView, Alert, TextInput, KeyboardAvoidingView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING, RADIUS } from '../theme';
import { useTranslation } from '../i18n';
import {
  createNatCashSessions, verifyNatCashSession, getNatCashSessions,
  confirmAllNatCashSessions,
} from '../api';
import type { RootStackParamList } from '../navigation';
import ScreenHeader from '../components/ScreenHeader';
import { dialUssd } from '../ussd';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Props = RouteProp<RootStackParamList, 'NatCashPayment'>;

// ─── Session type ──────────────────────────────────────────────
interface NatCashSession {
  id: string;
  seller_id: string;
  amount: number;
  recipient_phone: string;
  status: 'pending' | 'verified' | 'expired';
  sms_transcode: string | null;
  verified_at: string | null;
  expires_at: string;
  seller_name: string;
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
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const route = useRoute<Props>();

  const { pendingId, total, sellerName, sellerPhone, sellers: routeSellers } = route.params;
  const isMultiSeller = !!(routeSellers && routeSellers.length > 1);

  const [step, setStep] = useState<'dial' | 'paste' | 'verifying' | 'confirmed' | 'failed'>('dial');
  const [sessions, setSessions] = useState<NatCashSession[]>([]);
  const [currentSellerIdx, setCurrentSellerIdx] = useState(0);
  const [pastedText, setPastedText] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [ussdLoading, setUssdLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentSeller = isMultiSeller ? routeSellers![currentSellerIdx] : null;
  const currentSession = sessions.find(s =>
    currentSeller ? s.seller_id === currentSeller.sellerId : true
  );

  // ── Create sessions on mount ──
  useEffect(() => {
    if (!pendingId || !routeSellers?.length) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await createNatCashSessions(pendingId, routeSellers) as { sessions: NatCashSession[] };
        setSessions(res.sessions || []);
      } catch (err) {
        console.error('[NatCash] Failed to create sessions:', err);
        Alert.alert('Error', 'Failed to initialize payment sessions. Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, [pendingId]);

  // ── Session expiry timer (polls every 30s) ──
  useEffect(() => {
    if (!pendingId) return;
    timerRef.current = setInterval(async () => {
      try {
        const res = await getNatCashSessions(pendingId) as { sessions: NatCashSession[] };
        setSessions(res.sessions || []);
      } catch { /* keep trying */ }
    }, 30_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [pendingId]);

  // ── Session expiry countdown ──
  useEffect(() => {
    if (step !== 'dial' && step !== 'paste') return;
    const countdown = setInterval(() => setElapsed(p => p + 1), 1000);
    return () => clearInterval(countdown);
  }, [step]);

  // ── Dial USSD ──
  const handleDial = async () => {
    setUssdLoading(true);
    try {
      const result = await dialUssd('*202#');
      if (!result.success) {
        Alert.alert('Error', result.errorMessage || 'Could not open dialer. Please dial *202# manually.');
      }
    } catch {
      Alert.alert('Error', 'Could not dial USSD code. Please dial *202# manually.');
    } finally {
      setUssdLoading(false);
    }
  };

  // ── Verify pasted SMS ──
  const handleVerify = async () => {
    if (!pastedText.trim() || !currentSession) return;
    setStep('verifying');
    setVerifyError('');

    try {
      const res = await verifyNatCashSession(currentSession.id, pastedText.trim()) as { verified?: boolean; error?: string };
      if (res.verified) {
        // Refresh sessions to get updated status
        const refreshRes = await getNatCashSessions(pendingId!) as { sessions: NatCashSession[] };
        setSessions(refreshRes.sessions || []);

        // Check if all sessions are now verified
        const allVerified = refreshRes.sessions?.every((s: NatCashSession) => s.status === 'verified');

        if (allVerified) {
          // All sellers paid — create order
          setStep('confirmed');
          try {
            const orderRes = await confirmAllNatCashSessions(pendingId!) as { orderId: string };
            setTimeout(() => {
              nav.replace('OrderDetail', { orderId: orderRes.orderId });
            }, 2500);
          } catch (err) {
            console.error('[NatCash] confirm-all failed:', err);
            // Show confirmed anyway — sessions are verified, order can be retried
          }
        } else {
          // More sellers to pay
          if (isMultiSeller && currentSellerIdx < routeSellers!.length - 1) {
            setCurrentSellerIdx(prev => prev + 1);
            setPastedText('');
            setStep('dial');
          }
        }
      } else {
        setVerifyError(res.error || 'Verification failed. Check the SMS and try again.');
        setStep('paste');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Verification failed';
      setVerifyError(msg);
      setStep('paste');
    }
  };

  // ── Check session expiry ──
  const isExpired = !!(currentSession?.status === 'expired' ||
    (currentSession?.expires_at && new Date(currentSession.expires_at) < new Date()));

  // ── Step progress bar ──
  const stepIndex = step === 'dial' ? 0 : step === 'paste' || step === 'verifying' ? 1 : step === 'confirmed' ? 2 : 1;

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ScreenHeader title="NatCash Payment" onBack={() => nav.goBack()} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.coral} />
          <Text style={styles.loadingText}>Setting up payment…</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={[styles.container, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
          <Text style={[styles.progressLabel, stepIndex === 1 && styles.progressLabelActive]}>Paste SMS</Text>
          <Text style={[styles.progressLabel, stepIndex === 2 && styles.progressLabelActive]}>Confirm</Text>
        </View>

        {/* ── Order Summary Card ── */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <MaterialCommunityIcons name="receipt-text-outline" size={18} color={COLORS.coral} />
            <Text style={styles.cardLabel}>Order Total</Text>
          </View>
          <Text style={styles.cardAmount}>G {total.toFixed(0)}</Text>
          {isMultiSeller && routeSellers ? (
            <>
              <View style={styles.cardDivider} />
              {routeSellers.map((s, idx) => {
                const sess = sessions.find(ss => ss.seller_id === s.sellerId);
                const isVerified = sess?.status === 'verified';
                const isCurrent = idx === currentSellerIdx;
                return (
                  <View key={s.sellerId} style={[styles.sellerRow, isCurrent && styles.sellerRowActive]}>
                    <View style={[styles.sellerStatus, isVerified && styles.sellerStatusDone, isCurrent && !isVerified && styles.sellerStatusActive]}>
                      {isVerified ? <MaterialCommunityIcons name="check" size={12} color={COLORS.white} /> : <Text style={styles.sellerIdx}>{idx + 1}</Text>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sellerName} numberOfLines={1}>{s.name}</Text>
                      {s.items.map((item, i) => (
                        <Text key={i} style={styles.sellerItem} numberOfLines={1}>{item.quantity}x {item.name} — G {item.price.toFixed(0)}</Text>
                      ))}
                    </View>
                    <Text style={styles.sellerTotal}>G {s.total.toFixed(0)}</Text>
                    {isCurrent && step === 'verifying' && <ActivityIndicator size="small" color={COLORS.coral} style={{ marginLeft: 8 }} />}
                  </View>
                );
              })}
            </>
          ) : (
            <>
              <View style={styles.cardDivider} />
              <View style={styles.cardRow}>
                <MaterialCommunityIcons name="account-outline" size={16} color={COLORS.text2} />
                <Text style={styles.cardSeller}>{sellerName}</Text>
              </View>
            </>
          )}
        </View>

        {/* ── Step Content ── */}
        {step === 'dial' && (
          <View style={styles.stepContent}>
            <View style={styles.infoCard}>
              <MaterialCommunityIcons name="cellphone" size={28} color={COLORS.blue} />
              <Text style={styles.infoTitle}>Dial *202#</Text>
              <Text style={styles.infoBody}>
                {isMultiSeller && currentSeller
                  ? `Pay ${currentSeller.name} (seller ${currentSellerIdx + 1} of ${routeSellers!.length}). Tap below to open the NatCash menu. Then:`
                  : 'Tap below to open the NatCash menu. Then:'}
              </Text>
              <View style={styles.stepsList}>
                <View style={styles.stepItem}>
                  <View style={styles.stepNum}><Text style={styles.stepNumText}>1</Text></View>
                  <Text style={styles.stepItemText}>Select <Text style={styles.bold}>Send Money</Text></Text>
                </View>
                <View style={styles.stepItem}>
                  <View style={styles.stepNum}><Text style={styles.stepNumText}>2</Text></View>
                  <Text style={styles.stepItemText}>Enter <Text style={styles.bold}>{isMultiSeller && currentSeller ? currentSeller.phone : sellerPhone}</Text></Text>
                </View>
                <View style={styles.stepItem}>
                  <View style={styles.stepNum}><Text style={styles.stepNumText}>3</Text></View>
                  <Text style={styles.stepItemText}>Enter amount: <Text style={styles.bold}>G {(isMultiSeller && currentSeller ? currentSeller.total : total).toFixed(0)}</Text></Text>
                </View>
                <View style={styles.stepItem}>
                  <View style={styles.stepNum}><Text style={styles.stepNumText}>4</Text></View>
                  <Text style={styles.stepItemText}>Confirm with your PIN</Text>
                </View>
              </View>
            </View>

            {isExpired && (
              <View style={[styles.infoCard, { borderColor: COLORS.coral + '33' }]}>
                <MaterialCommunityIcons name="clock-alert-outline" size={20} color={COLORS.coral} />
                <Text style={[styles.infoBody, { color: COLORS.coral }]}>Payment window expired for this seller. Go back and retry.</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.dialBtn, isExpired && styles.dialBtnDisabled]}
              onPress={handleDial}
              disabled={ussdLoading || isExpired}
              accessibilityLabel="dial USSD code"
              accessibilityRole="button"
            >
              {ussdLoading ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <MaterialCommunityIcons name="phone-dial" size={22} color={COLORS.white} />
              )}
              <Text style={styles.dialBtnText}>{ussdLoading ? 'Connecting…' : 'Open NatCash Menu'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.pasteBtn}
              onPress={() => { setStep('paste'); setPastedText(''); setVerifyError(''); }}
              disabled={isExpired}
              accessibilityLabel="I have sent the payment"
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="content-paste" size={20} color={COLORS.coral} />
              <Text style={styles.pasteBtnText}>I've Sent — Paste SMS</Text>
            </TouchableOpacity>

            <Text style={styles.hintText}>
              After completing the transfer, copy the confirmation SMS and paste it here.
            </Text>
          </View>
        )}

        {step === 'paste' && (
          <View style={styles.stepContent}>
            <View style={styles.infoCard}>
              <MaterialCommunityIcons name="clipboard-text-outline" size={28} color={COLORS.blue} />
              <Text style={styles.infoTitle}>Paste Confirmation SMS</Text>
              <Text style={styles.infoBody}>
                Copy the full NatCash confirmation SMS you received, then paste it below.
              </Text>
            </View>

            <View style={styles.pasteInputContainer}>
              <TextInput
                style={styles.pasteInput}
                placeholder="Paste NatCash SMS here…"
                placeholderTextColor={COLORS.text2}
                value={pastedText}
                onChangeText={setPastedText}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {pastedText.length > 0 && (
                <TouchableOpacity style={styles.clearBtn} onPress={() => setPastedText('')} accessibilityLabel="clear">
                  <MaterialCommunityIcons name="close-circle" size={18} color={COLORS.text2} />
                </TouchableOpacity>
              )}
            </View>

            {verifyError ? (
              <View style={styles.errorCard}>
                <MaterialCommunityIcons name="alert-circle-outline" size={16} color={COLORS.coral} />
                <Text style={styles.errorText}>{verifyError}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.dialBtn, !pastedText.trim() && styles.dialBtnDisabled]}
              onPress={handleVerify}
              disabled={!pastedText.trim()}
              accessibilityLabel="verify payment"
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="check-circle-outline" size={22} color={COLORS.white} />
              <Text style={styles.dialBtnText}>Verify Payment</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => { setStep('dial'); setVerifyError(''); }}
              accessibilityLabel="go back"
              accessibilityRole="button"
            >
              <Text style={styles.secondaryBtnText}>Back to Dial</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'verifying' && (
          <View style={styles.stepContent}>
            <View style={styles.spinnerCircle}>
              <ActivityIndicator size="large" color={COLORS.coral} />
            </View>
            <Text style={styles.detectingTitle}>Verifying Payment…</Text>
            <Text style={styles.detectingBody}>
              Checking your NatCash confirmation with the server.
            </Text>
          </View>
        )}

        {step === 'confirmed' && (
          <View style={styles.stepContent}>
            <View style={styles.successCircle}>
              <MaterialCommunityIcons name="check-circle" size={56} color={COLORS.green} />
            </View>
            <Text style={styles.confirmedTitle}>Payment Verified!</Text>
            <Text style={styles.confirmedBody}>
              {isMultiSeller
                ? 'All seller payments confirmed. Creating your order…'
                : 'NatCash transfer confirmed. Creating your order…'}
            </Text>
          </View>
        )}

        {step === 'failed' && (
          <View style={styles.stepContent}>
            <View style={[styles.spinnerCircle, { borderColor: COLORS.yellow }]}>
              <MaterialCommunityIcons name="clock-alert-outline" size={40} color={COLORS.yellow} />
            </View>
            <Text style={styles.failedTitle}>Verification Failed</Text>
            <Text style={styles.failedBody}>
              We couldn't verify your payment. Please check the SMS and try again.
            </Text>
            <TouchableOpacity style={styles.dialBtn} onPress={() => { setStep('paste'); setPastedText(''); setVerifyError(''); }} accessibilityLabel="retry" accessibilityRole="button">
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
            NatCash payments are sent directly from you to the seller. MaurMaket does not hold or process your money — we only verify the confirmation.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingBottom: 40, paddingHorizontal: SPACING.lg },

  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md },
  loadingText: { fontSize: 14, color: COLORS.text2 },

  // Progress
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: SPACING.xl, marginBottom: SPACING.xs },
  stepDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  stepDotDone: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  stepDotActive: { borderColor: COLORS.coral },
  stepLine: { width: 48, height: 2, backgroundColor: COLORS.border, marginHorizontal: 4 },
  stepLineDone: { backgroundColor: COLORS.green },
  progressLabels: { flexDirection: 'row', justifyContent: 'center', gap: 40, marginBottom: SPACING.xl },
  progressLabel: { fontSize: 11, color: COLORS.text2, fontWeight: '600' },
  progressLabelActive: { color: COLORS.coral },

  // Card
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.card, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg, marginBottom: SPACING.xl },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardLabel: { fontSize: 12, color: COLORS.text2, fontWeight: '600', textTransform: 'uppercase' },
  cardAmount: { fontSize: 28, fontWeight: '800', color: COLORS.coral, marginTop: 6, marginBottom: 10 },
  cardDivider: { height: 1, backgroundColor: COLORS.border, marginBottom: 10 },
  cardSeller: { fontSize: 14, color: COLORS.text, fontWeight: '600' },

  // Multi-seller rows
  sellerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border + '44' },
  sellerRowActive: { backgroundColor: COLORS.coral + '08', marginHorizontal: -SPACING.lg, paddingHorizontal: SPACING.lg, borderRadius: 8 },
  sellerStatus: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  sellerStatusDone: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  sellerStatusActive: { borderColor: COLORS.coral, backgroundColor: COLORS.coral + '20' },
  sellerIdx: { fontSize: 10, fontWeight: '800', color: COLORS.text2 },
  sellerName: { fontSize: 13, color: COLORS.text, fontWeight: '700' },
  sellerItem: { fontSize: 11, color: COLORS.text2, lineHeight: 16 },
  sellerTotal: { fontSize: 14, fontWeight: '800', color: COLORS.coral },

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

  // Paste input
  pasteInputContainer: { width: '100%', position: 'relative' },
  pasteInput: {
    width: '100%', minHeight: 120, backgroundColor: COLORS.surface, borderRadius: RADIUS.card,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, fontSize: 13, color: COLORS.text,
    lineHeight: 20,
  },
  clearBtn: { position: 'absolute', top: 10, right: 10 },

  // Error card
  errorCard: { flexDirection: 'row', gap: 6, backgroundColor: COLORS.coral + '10', borderRadius: RADIUS.card, borderWidth: 1, borderColor: COLORS.coral + '33', padding: SPACING.md, width: '100%' },
  errorText: { flex: 1, fontSize: 12, color: COLORS.coral, lineHeight: 18 },

  // Hint
  hintText: { fontSize: 11, color: COLORS.text2, textAlign: 'center', fontStyle: 'italic', paddingHorizontal: 10 },

  // Buttons
  dialBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.coral, borderRadius: RADIUS.button, paddingVertical: 14, paddingHorizontal: 24, width: '100%' },
  dialBtnDisabled: { opacity: 0.5 },
  dialBtnText: { fontSize: 15, color: COLORS.white, fontWeight: '700' },
  pasteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.surface, borderRadius: RADIUS.button, paddingVertical: 14, paddingHorizontal: 24, width: '100%', borderWidth: 1, borderColor: COLORS.coral + '33' },
  pasteBtnText: { fontSize: 14, color: COLORS.coral, fontWeight: '700' },
  secondaryBtn: { paddingVertical: 14, borderRadius: RADIUS.button, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, alignItems: 'center', width: '100%' },
  secondaryBtnText: { fontSize: 14, color: COLORS.text2, fontWeight: '600' },

  // Detecting / Verifying
  spinnerCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.surface, borderWidth: 2, borderColor: COLORS.coral + '44', alignItems: 'center', justifyContent: 'center', marginTop: SPACING.md },
  detectingTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  detectingBody: { fontSize: 13, color: COLORS.text2, textAlign: 'center', lineHeight: 20, paddingHorizontal: 10 },

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
