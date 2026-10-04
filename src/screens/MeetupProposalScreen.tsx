import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import ScreenHeader from '../components/ScreenHeader';
import LocationPicker from '../components/LocationPicker';
import { COLORS, RADIUS, SPACING } from '../theme';
import { decideBuyerFulfillment, getPendingAgreements, beginPendingPayment } from '../api';
import { useToast } from '../components/Toast';
import { useTranslation } from '@/localization';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'MeetupProposal'>;
type Agreement = { id: string; seller_id: string; seller_name: string; status: string; last_proposed_by: string; response_expires_at: string; terms: { method: string; deliveryFee?: number; meetupAt?: string; location?: { lat: number; lng: number; address?: string; note?: string } } };
type Snapshot = { checkout: { status: string; payment_method: string; expires_at: string }; agreements: Agreement[]; history: Array<{ seller_id: string; action: string; version: number; terms: Agreement['terms']; created_at: string }> };

const asLocalInput = (value?: string) => {
  const date = value ? new Date(value) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function MeetupProposalScreen({ route, navigation }: Props) {
  const { pendingId } = route.params;
  const toast = useToast();
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [counterSeller, setCounterSeller] = useState<string | null>(null);
  const [counterLocation, setCounterLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [counterAt, setCounterAt] = useState('');
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  }, [entrance]);

  const refresh = useCallback(async () => {
    try { setSnapshot(await getPendingAgreements(pendingId) as Snapshot); }
    catch (error) { toast.error(t('meetupProposal.refreshFailed'), error instanceof Error ? error.message : t('common.tryAgain')); }
  }, [pendingId, t]);
  useFocusEffect(useCallback(() => { void refresh(); const timer = setInterval(() => { void refresh(); }, 15000); return () => clearInterval(timer); }, [refresh]));

  const act = async (agreement: Agreement, decision: 'accept' | 'cancel') => {
    setBusy(true);
    try {
      await decideBuyerFulfillment(pendingId, agreement.seller_id, decision);
      await refresh();
      if (decision === 'cancel') navigation.goBack();
    } catch (error) { toast.error(t('meetupProposal.updateFailed'), error instanceof Error ? error.message : t('common.tryAgain')); }
    finally { setBusy(false); }
  };

  const counter = async (agreement: Agreement) => {
    if (!counterLocation) { toast.error(t('meetupProposal.counterTitle'), t('meetupProposal.mapConfirm')); return; }
    const date = new Date(counterAt);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) { toast.error(t('meetupProposal.dateLabel'), t('meetupProposal.futureTime')); return; }
    setBusy(true);
    try {
      await decideBuyerFulfillment(pendingId, agreement.seller_id, 'counter', {
        location: { ...counterLocation, note: agreement.terms.location?.note || null },
        meetupAt: date.toISOString(),
      });
      setCounterSeller(null); setCounterLocation(null); await refresh();
    } catch (error) { toast.error(t('meetupProposal.counterFailed'), error instanceof Error ? error.message : t('common.tryAgain')); }
    finally { setBusy(false); }
  };

  const paySeller = async (agreement: Agreement) => {
    setBusy(true);
    try {
      const result = await beginPendingPayment(pendingId, agreement.seller_id) as { paymentUrl?: string; paymentMethod?: string; orderId?: string };
      if (result.paymentUrl) {
        await Linking.openURL(result.paymentUrl);
        navigation.navigate('PaymentReturn', { pendingId });
      } else if (result.paymentMethod === 'natcash' || snapshot?.checkout.payment_method === 'natcash') {
        navigation.navigate('Orders');
      }
    } catch (error) { toast.error(t('meetupProposal.paymentFailed'), error instanceof Error ? error.message : t('common.tryAgain')); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (counterSeller) {
      const selected = snapshot?.agreements.find(item => item.seller_id === counterSeller);
      setCounterAt(asLocalInput(selected?.terms.meetupAt));
      setCounterLocation(null);
    }
  }, [counterSeller]);

  const allAccepted = !!snapshot?.agreements.length && snapshot.agreements.every(item => item.status === 'accepted');
  const expired = snapshot?.checkout.status === 'expired' || snapshot?.checkout.status === 'cancelled';

  return <View style={styles.container}>
    <ScreenHeader title={t('meetupProposal.title')} onBack={() => navigation.goBack()} />
    {!snapshot ? <ActivityIndicator style={{ marginTop: 48 }} color={COLORS.coral} /> : <ScrollView contentContainerStyle={styles.content}>
      <Animated.View style={[styles.intro, { opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
        <View style={styles.icon}><MaterialCommunityIcons name={expired ? 'clock-alert-outline' : 'map-marker-check-outline'} size={24} color={expired ? COLORS.yellow : COLORS.coral} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{expired ? t('meetupProposal.expiredTitle') : allAccepted ? t('meetupProposal.agreedTitle') : t('meetupProposal.confirmTitle')}</Text>
          <Text style={styles.subtitle}>{expired ? t('meetupProposal.expiredBody') : snapshot.checkout.payment_method === 'natcash' ? allAccepted ? t('meetupProposal.natcashReady') : t('meetupProposal.natcashBody') : allAccepted ? t('meetupProposal.moncashReady') : t('meetupProposal.moncashWaiting')}</Text>
        </View>
      </Animated.View>

      {snapshot.agreements.map(agreement => {
        const term = agreement.terms || {};
        const awaitingBuyer = agreement.status === 'proposed' && agreement.last_proposed_by === agreement.seller_id && term.method === 'meetup';
        const sellerDeclined = agreement.status === 'rejected';
        const location = term.location?.address || t('meetupProposal.meetupPoint');
        return <View key={agreement.seller_id} style={styles.card}>
          <View style={styles.cardTop}><Text style={styles.seller}>{agreement.seller_name}</Text><Text style={[styles.status, agreement.status === 'accepted' ? styles.good : awaitingBuyer ? styles.action : styles.waiting]}>{agreement.status === 'accepted' ? t('meetupProposal.agreed') : awaitingBuyer ? t('meetupProposal.yourResponse') : sellerDeclined ? t('meetupProposal.spotDeclined') : t('meetupProposal.waiting')}</Text></View>
          <View style={styles.planRow}><MaterialCommunityIcons name={term.method === 'meetup' ? 'map-marker-outline' : 'truck-delivery-outline'} size={18} color={COLORS.coral}/><Text style={styles.planText}>{term.method === 'meetup' ? (location || t('meetupProposal.meetupPoint')) : t('checkout.deliveryInfo')}</Text></View>
          {term.method === 'meetup' && <View style={styles.planRow}><MaterialCommunityIcons name="clock-outline" size={18} color={COLORS.text2}/><Text style={styles.planText}>{term.meetupAt ? new Date(term.meetupAt).toLocaleString() : t('meetupProposal.timeNotSet')}</Text></View>}
          {allAccepted && agreement.status === 'accepted' && snapshot.checkout.payment_method === 'moncash' && <TouchableOpacity style={styles.primary} disabled={busy || expired} onPress={() => void paySeller(agreement)} accessibilityRole="button"><Text style={styles.primaryText}>{t('meetupProposal.paySeller')}</Text></TouchableOpacity>}
          {awaitingBuyer && <View style={styles.actions}>
            <TouchableOpacity style={styles.secondary} disabled={busy} onPress={() => void act(agreement, 'accept')} accessibilityRole="button"><Text style={styles.secondaryText}>{t('meetupProposal.acceptPlan')}</Text></TouchableOpacity>
            <TouchableOpacity style={styles.secondary} disabled={busy} onPress={() => setCounterSeller(counterSeller === agreement.seller_id ? null : agreement.seller_id)} accessibilityRole="button"><Text style={styles.secondaryText}>{t('meetupProposal.suggestChange')}</Text></TouchableOpacity>
          </View>}
          {(awaitingBuyer || sellerDeclined || (agreement.status === 'accepted' && snapshot.checkout.status === 'pending')) && term.method === 'meetup' && <TouchableOpacity onPress={() => setCounterSeller(counterSeller === agreement.seller_id ? null : agreement.seller_id)} accessibilityRole="button"><Text style={styles.link}>{sellerDeclined ? t('meetupProposal.chooseOtherSpot') : agreement.status === 'accepted' ? t('meetupProposal.proposeChange') : t('meetupProposal.openMapCounter')}</Text></TouchableOpacity>}
          {counterSeller === agreement.seller_id && <View style={styles.counterBox}>
            <Text style={styles.counterTitle}>{t('meetupProposal.counterTitle')}</Text>
            <LocationPicker onLocationSelect={(lat, lng, address) => setCounterLocation({ lat, lng, address })} initialLat={term.location?.lat} initialLng={term.location?.lng} height={190}/>
            {counterLocation && <Text style={styles.selectedLocation}>{counterLocation.address}</Text>}
            <TextInput style={styles.input} value={counterAt} onChangeText={setCounterAt} placeholder={t('meetupProposal.datePlaceholder')} placeholderTextColor={COLORS.text2} accessibilityLabel={t('meetupProposal.dateLabel')}/>
            <TouchableOpacity style={styles.primary} disabled={busy} onPress={() => void counter(agreement)} accessibilityRole="button"><Text style={styles.primaryText}>{t('meetupProposal.sendCounter')}</Text></TouchableOpacity>
          </View>}
        </View>;
      })}

      {allAccepted && snapshot.checkout.payment_method === 'natcash' && <TouchableOpacity style={styles.primary} onPress={() => navigation.navigate('Orders')} accessibilityRole="button"><Text style={styles.primaryText}>{t('meetupProposal.viewOrder')}</Text></TouchableOpacity>}
      {snapshot.checkout.status === 'pending' && !expired && <TouchableOpacity style={styles.cancel} disabled={busy} onPress={() => {
        const open = snapshot.agreements.find(item => item.status !== 'accepted') || snapshot.agreements[0];
        if (open) void act(open, 'cancel');
      }} accessibilityRole="button"><Text style={styles.cancelText}>{t('meetupProposal.cancel')}</Text></TouchableOpacity>}
      {busy && <ActivityIndicator style={{ marginTop: 12 }} color={COLORS.coral}/>}
    </ScrollView>}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg }, content: { padding: SPACING.lg, paddingBottom: 36, gap: 14 },
  intro: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.card, borderWidth: 1, borderColor: COLORS.border, padding: 16 },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.coral + '18', alignItems: 'center', justifyContent: 'center' },
  title: { color: COLORS.text, fontSize: 17, fontWeight: '700' }, subtitle: { color: COLORS.text2, fontSize: 12, lineHeight: 17, marginTop: 4 },
  card: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.card, padding: 16, gap: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, seller: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  status: { fontSize: 11, fontWeight: '700' }, good: { color: COLORS.green }, action: { color: COLORS.coral }, waiting: { color: COLORS.text2 },
  planRow: { flexDirection: 'row', gap: 8, alignItems: 'center' }, planText: { flex: 1, color: COLORS.text2, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 }, secondary: { flex: 1, minHeight: 44, borderRadius: RADIUS.button, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  secondaryText: { color: COLORS.text, fontSize: 12, fontWeight: '700', textAlign: 'center' }, link: { color: COLORS.coral, fontWeight: '700', fontSize: 13, paddingVertical: 8 },
  counterBox: { gap: 10, marginTop: 4 }, counterTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700' }, selectedLocation: { color: COLORS.text2, fontSize: 12 },
  input: { minHeight: 46, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.row, color: COLORS.text, paddingHorizontal: 12 },
  primary: { minHeight: 46, borderRadius: RADIUS.button, backgroundColor: COLORS.coral, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, marginTop: 4 }, primaryText: { color: COLORS.white, fontWeight: '700', fontSize: 13 },
  cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, cancelText: { color: COLORS.text2, fontSize: 13, fontWeight: '600' },
});
