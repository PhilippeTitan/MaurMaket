import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform,
  ScrollView, Modal, TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Icon } from '../components/icons/Icon';
import { COLORS, SPACING, RADIUS, formatPrice } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import NativeMap from '../components/NativeMap';

let ExpoLocation: any = null;
if (Platform.OS !== 'web') {
  ExpoLocation = require('expo-location');
}
import { store } from '../store';
import { getOrder, meetupCheckin, meetupScan, getMeetupStatus, releaseEscrow, refundEscrow, extendMeetup, createDispute } from '../api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../i18n';
import { SkeletonBlock } from '../components/Skeleton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import type { Order } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Meetup'>;

const CHECKIN_INTERVAL = 10000;
const PROXIMITY_THRESHOLD = 150;
const MEETUP_TIMEOUT_MS = 90 * 60 * 1000;

export default function MeetupScreen({ route, navigation }: Props) {
  const { orderId } = route.params;
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const mapRef = useRef<any>(null);

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [otherCheckedIn, setOtherCheckedIn] = useState(false);
  const [myCheckedIn, setMyCheckedIn] = useState(false);
  const [proximityConfirmed, setProximityConfirmed] = useState(false);
  const [meetupCode, setMeetupCode] = useState<string | null>(null);
  const [codeModalVisible, setCodeModalVisible] = useState(false);
  const [scanModalVisible, setScanModalVisible] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [scanLoading, setScanLoading] = useState(false);
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  const [releaseLoading, setReleaseLoading] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [timeLeft, setTimeLeft] = useState(MEETUP_TIMEOUT_MS);
  const [meetupStartedAt, setMeetupStartedAt] = useState<string | null>(null);
  const [meetupExpiresAt, setMeetupExpiresAt] = useState<string | null>(null);
  const [checkins, setCheckins] = useState<any[]>([]);
  const locationWatcher = useRef<any>(null);

  const isBuyer = order ? store.user?.id === order.buyer_id : false;
  const isSeller = order ? order.items?.some((i: any) => i.seller_id === store.user?.id) : false;
  const meetupLng = order?.meetup_lng ? parseFloat(String(order.meetup_lng)) : null;
  const meetupLat = order?.meetup_lat ? parseFloat(String(order.meetup_lat)) : null;

  const fetchData = useCallback(async () => {
    try {
      const [orderRes, statusRes] = await Promise.all([
        getOrder(orderId) as Promise<{ order: Order }>,
        getMeetupStatus(orderId) as Promise<{ checkins: any[]; meetupStartedAt: string | null; meetupExpiresAt: string | null }>,
      ]);
      setOrder(orderRes.order);
      setCheckins(statusRes.checkins || []);

      const myCheckin = statusRes.checkins?.find((c: any) => c.user_id === store.user?.id);
      const otherCheckin = statusRes.checkins?.find((c: any) => c.user_id !== store.user?.id);

      setMyCheckedIn(!!myCheckin);
      setOtherCheckedIn(!!otherCheckin);

      // Use meetupStartedAt from server, or from order, or from checkins response
      const startedAt = statusRes.meetupStartedAt || orderRes.order.meetup_started_at || null;
      if (startedAt) {
        setMeetupStartedAt(startedAt);
      }
      setMeetupExpiresAt(statusRes.meetupExpiresAt || orderRes.order.meetup_expires_at || null);

      if (myCheckin?.meetup_code) {
        setMeetupCode(myCheckin.meetup_code);
        if (myCheckin.qr_scanned) {
          setReceiptModalVisible(true);
        }
      }
    } catch {
      Alert.alert(t('common.error'), 'Could not load meetup details');
      navigation.goBack();
    }
    setLoading(false);
  }, [orderId, t, navigation]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!meetupStartedAt) return;
    const startedMs = new Date(meetupStartedAt).getTime();
    const endMs = meetupExpiresAt ? new Date(meetupExpiresAt).getTime() : startedMs + MEETUP_TIMEOUT_MS;
    // Calculate initial remaining time
    const initial = Math.max(0, endMs - Date.now());
    setTimeLeft(initial);
    if (initial <= 0) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, endMs - Date.now());
      setTimeLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [meetupStartedAt, meetupExpiresAt]);

  useEffect(() => {
    if (Platform.OS === 'web' || !ExpoLocation) return;
    let active = true;
    (async () => {
      const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location needed', 'Please enable location services to check in at the meetup.');
        return;
      }
      locationWatcher.current = await ExpoLocation.watchPositionAsync(
        { accuracy: ExpoLocation.Accuracy.High, distanceInterval: 10, timeInterval: 5000 },
        (pos: any) => {
          if (!active) return;
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setMyLocation({ lat, lng });
          if (meetupLat && meetupLng) {
            const d = haversine(lat, lng, meetupLat, meetupLng);
            setDistance(Math.round(d));
          }
        }
      );
    })();
    return () => { active = false; locationWatcher.current?.remove(); };
  }, [meetupLat, meetupLng]);

  useEffect(() => {
    if (!myCheckedIn || order?.status !== 'paid') return;
    const interval = setInterval(fetchData, CHECKIN_INTERVAL);
    return () => clearInterval(interval);
  }, [myCheckedIn, order?.status, fetchData]);

  const handleCheckin = async () => {
    if (!myLocation) {
      Alert.alert('Location unavailable', 'Waiting for GPS signal. Please try again.');
      return;
    }
    setCheckinLoading(true);
    try {
      const res = await meetupCheckin(orderId, myLocation.lat, myLocation.lng) as any;
      setMyCheckedIn(true);
      setOtherCheckedIn(res.otherPartyCheckedIn);
      setProximityConfirmed(res.proximityConfirmed);
      if (res.distance) setDistance(res.distance);
      if (res.meetupStartedAt) setMeetupStartedAt(res.meetupStartedAt);
      if (res.meetupExpiresAt) setMeetupExpiresAt(res.meetupExpiresAt);
      if (res.meetupCode) {
        setMeetupCode(res.meetupCode);
        setProximityConfirmed(true);
      }
      if (res.proximityConfirmed && isSeller) {
        Alert.alert('You\'re close!', 'You are within range. Ask the buyer for their delivery code.');
      }
      if (res.proximityConfirmed && isBuyer && res.meetupCode) {
        Alert.alert('Ready!', 'You are within range. Show the delivery code to the seller.');
      }
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || 'Check-in failed');
    }
    setCheckinLoading(false);
  };

  const handleScan = async () => {
    if (!scanInput.trim()) {
      Alert.alert('Enter code', 'Please enter the buyer\'s 4-digit delivery code.');
      return;
    }
    setScanLoading(true);
    try {
      await meetupScan(orderId, scanInput.trim());
      setScanModalVisible(false);
      setScanInput('');
      Alert.alert('Exchange confirmed!', 'The buyer will be asked to confirm receipt.', [
        { text: 'OK', onPress: fetchData },
      ]);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || 'Scan failed');
    }
    setScanLoading(false);
  };

  const handleConfirmReceipt = async () => {
    setReleaseLoading(true);
    try {
      await releaseEscrow(orderId);
      setReceiptModalVisible(false);
      Alert.alert('Payment released!', 'The seller has been paid. Thank you!', [
        { text: 'Done', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || 'Could not release payment');
    }
    setReleaseLoading(false);
  };

  const handleRefund = async () => {
    Alert.alert('Cancel meetup?', 'You will receive a full refund.', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, refund', style: 'destructive',
        onPress: async () => {
          setRefunding(true);
          try {
            await refundEscrow(orderId);
            Alert.alert('Refunded', 'Your payment has been refunded.', [
              { text: 'OK', onPress: () => navigation.goBack() },
            ]);
          } catch (err: any) {
            Alert.alert(t('common.error'), err.message || 'Refund failed');
          }
          setRefunding(false);
        },
      },
    ]);
  };

  const handleDispute = async () => {
    try {
      await createDispute({ orderId, reason: 'item_issue', description: 'Buyer did not confirm receiving the item in good condition.' });
      setReceiptModalVisible(false);
      Alert.alert('Dispute opened', 'Support will review this order. Your payment is held securely.');
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || 'Could not open dispute');
    }
  };

  const handleEmergencyExit = () => {
    Alert.alert('Emergency Exit?', 'This will freeze the meetup and start a 48-hour resolution. No penalty.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Exit', style: 'destructive',
        onPress: async () => {
          try {
            // Emergency exit is deliberately a dispute, not an irreversible
            // refund.  The open dispute freezes escrow server-side.
            await createDispute({ orderId, reason: 'meetup_emergency', description: 'Emergency exit requested during meetup. Please freeze this fulfillment for review.' });
            Alert.alert('Meetup frozen', 'Your payment remains protected while support reviews the situation.', [
              { text: 'OK', onPress: () => navigation.goBack() },
            ]);
          } catch (err: any) {
            Alert.alert(t('common.error'), err.message || 'Emergency exit failed');
          }
        },
      },
    ]);
  };

  const handleExtend = async () => {
    try {
      const result = await extendMeetup(orderId) as { meetupExpiresAt?: string };
      if (result.meetupExpiresAt) setMeetupExpiresAt(result.meetupExpiresAt);
      setTimeLeft(prev => prev + 30 * 60 * 1000);
      Alert.alert('Extended', 'Timer extended by 30 minutes.');
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || 'Could not extend');
    }
  };

  const formatTime = (ms: number) => {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loading || !order) {
    return (
      <View style={styles.container}>
        <View style={styles.meetupSkeletonHeader}><SkeletonBlock width={38} height={38} radius={19} /><SkeletonBlock width="30%" height={16} /></View>
        <View style={styles.meetupSkeleton}>
          <SkeletonBlock height={260} radius={RADIUS.media} />
          <SkeletonBlock height={110} radius={RADIUS.card} />
          <SkeletonBlock height={54} radius={RADIUS.button} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Meetup" onBack={() => navigation.goBack()} variant="branded" bordered={false} />

      {meetupLat && meetupLng && (
        <View style={styles.mapContainer}>
          {Platform.OS !== 'web' ? (
            <NativeMap
              style={styles.map}
              center={[meetupLng, meetupLat]}
              zoom={16}
              showUserLocation={true}
              selectedLat={meetupLat}
              selectedLng={meetupLng}
              selectedColor={COLORS.coral}
            />
          ) : (
            <View style={[styles.map, { backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
              <Icon name="map" size={48} color={COLORS.coral} />
              <Text style={{ color: COLORS.text, fontWeight: '700', marginTop: 10, textAlign: 'center' }}>
                {order.meetup_address || 'Meetup location'}
              </Text>
              {distance !== null && (
                <Text style={{ color: COLORS.text2, fontSize: 13, marginTop: 6 }}>
                  {distance}m from meetup point
                </Text>
              )}
            </View>
          )}

          {myCheckedIn && distance !== null && (
            <View style={[styles.distanceBadge, distance <= PROXIMITY_THRESHOLD && styles.distanceBadgeClose]}>
              <MaterialCommunityIcons
                name={distance <= PROXIMITY_THRESHOLD ? 'check-circle' : 'map-marker-distance'}
                size={14}
                color={distance <= PROXIMITY_THRESHOLD ? COLORS.white : COLORS.text}
              />
              <Text style={[styles.distanceText, distance <= PROXIMITY_THRESHOLD && styles.distanceTextClose]}>
                {distance}m away
              </Text>
            </View>
          )}
        </View>
      )}

      <ScrollView style={styles.bottomSheet} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <View style={styles.handle} />

        {/* Timer */}
        {meetupStartedAt ? (
          timeLeft > 0 ? (
            <View style={styles.timerRow}>
              <MaterialCommunityIcons name="timer-outline" size={16} color={timeLeft < 600000 ? COLORS.coral : COLORS.yellow} />
              <Text style={[styles.timerText, timeLeft < 600000 && { color: COLORS.coral }]}>
                {formatTime(timeLeft)} remaining
              </Text>
            </View>
          ) : (
            <View style={styles.timerRow}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color={COLORS.coral} />
              <Text style={[styles.timerText, { color: COLORS.coral }]}>Time expired</Text>
            </View>
          )
        ) : (
          <View style={styles.timerRow}>
            <MaterialCommunityIcons name="map-marker-distance" size={16} color={COLORS.text2} />
            <Text style={[styles.timerText, { color: COLORS.text2 }]}>
              {myCheckedIn && otherCheckedIn ? 'Both arrived — starting...' : 'Waiting for both parties to arrive...'}
            </Text>
          </View>
        )}

        {/* Status cards */}
        <View style={styles.statusGrid}>
          <View style={[styles.statusCard, myCheckedIn && styles.statusCardActive]}>
            <Icon
              name={myCheckedIn ? 'check-circle' : 'time'}
              size={18}
              color={myCheckedIn ? COLORS.green : COLORS.text2}
            />
            <Text style={[styles.statusLabel, myCheckedIn && { color: COLORS.green }]}>You</Text>
            <Text style={styles.statusSub}>{myCheckedIn ? 'Checked in' : 'Not here yet'}</Text>
          </View>
          <View style={[styles.statusCard, otherCheckedIn && styles.statusCardActive]}>
            <Icon
              name={otherCheckedIn ? 'check-circle' : 'time'}
              size={18}
              color={otherCheckedIn ? COLORS.green : COLORS.text2}
            />
            <Text style={[styles.statusLabel, otherCheckedIn && { color: COLORS.green }]}>
              {isBuyer ? 'Seller' : 'Buyer'}
            </Text>
            <Text style={styles.statusSub}>{otherCheckedIn ? 'Checked in' : 'Not here yet'}</Text>
          </View>
        </View>

        {/* QR section for buyer */}
        {isBuyer && myCheckedIn && otherCheckedIn && proximityConfirmed && meetupCode && (
          <TouchableOpacity style={styles.qrButton} onPress={() => setCodeModalVisible(true)} accessibilityLabel="show delivery code" accessibilityRole="button">
            <MaterialCommunityIcons name="numeric" size={20} color={COLORS.white} />
            <Text style={styles.qrButtonText}>Show delivery code</Text>
          </TouchableOpacity>
        )}

        {/* Scan section for seller */}
        {isSeller && myCheckedIn && otherCheckedIn && proximityConfirmed && (
          <TouchableOpacity style={styles.scanButton} onPress={() => setScanModalVisible(true)} accessibilityLabel="enter delivery code" accessibilityRole="button">
            <MaterialCommunityIcons name="form-textbox-password" size={20} color={COLORS.white} />
            <Text style={styles.scanButtonText}>Enter delivery code</Text>
          </TouchableOpacity>
        )}

        {/* Waiting states */}
        {myCheckedIn && !otherCheckedIn && (
          <View style={styles.waitingCard}>
            <ActivityIndicator size="small" color={COLORS.blue} />
            <Text style={styles.waitingText}>Waiting for {isBuyer ? 'seller' : 'buyer'} to arrive...</Text>
          </View>
        )}

        {myCheckedIn && otherCheckedIn && !proximityConfirmed && (
          <View style={styles.waitingCard}>
            <MaterialCommunityIcons name="map-marker-distance" size={18} color={COLORS.yellow} />
            <Text style={[styles.waitingText, { color: COLORS.yellow }]}>
              Both checked in — move closer ({distance !== null ? `${distance}m` : '...'})
            </Text>
          </View>
        )}

        {/* Check in button */}
        {!myCheckedIn && (
          <TouchableOpacity
            style={[styles.checkinBtn, checkinLoading && { opacity: 0.5 }]}
            onPress={handleCheckin}
            disabled={checkinLoading}
            accessibilityLabel="i'm here"
            accessibilityRole="button"
          >
            {checkinLoading ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <>
                <MaterialCommunityIcons name="map-marker-check" size={18} color={COLORS.white} />
                <Text style={styles.checkinBtnText}>I'm here</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Confirm receipt for buyer */}
        {isBuyer && meetupCode && checkins.some((c: any) => c.qr_scanned) && order.status === 'paid' && (
          <TouchableOpacity
            style={styles.receiptBtn}
            onPress={() => setReceiptModalVisible(true)}
            accessibilityLabel="confirm receipt"
            accessibilityRole="button"
          >
            <Icon name="offer-coin" size={18} color={COLORS.white} />
            <Text style={styles.receiptBtnText}>Confirm receipt</Text>
          </TouchableOpacity>
        )}

        {/* Cancel / Emergency */}
        {order.status === 'paid' && (
          <View style={styles.emergencyRow}>
            <TouchableOpacity style={[styles.emergencyBtn, { borderColor: COLORS.blue }]} onPress={handleExtend} accessibilityLabel="extend time 30 minutes" accessibilityRole="button">
              <MaterialCommunityIcons name="clock-plus" size={16} color={COLORS.blue} />
              <Text style={[styles.emergencyBtnText, { color: COLORS.blue }]}>Extend +30m</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.emergencyBtn} onPress={handleRefund} disabled={refunding} accessibilityLabel="cancel meetup" accessibilityRole="button">
              {refunding ? (
                <ActivityIndicator size="small" color={COLORS.coral} />
              ) : (
                <>
                  <MaterialCommunityIcons name="cancel" size={16} color={COLORS.coral} />
                  <Text style={styles.emergencyBtnText}>Cancel</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.emergencyBtn, { borderColor: '#FF2D2D' }]} onPress={handleEmergencyExit} accessibilityLabel="emergency exit" accessibilityRole="button">
              <MaterialCommunityIcons name="shield-alert" size={16} color="#FF2D2D" />
              <Text style={[styles.emergencyBtnText, { color: '#FF2D2D' }]}>Emergency</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Delivery code modal */}
      <Modal visible={codeModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Your delivery code</Text>
                <TouchableOpacity onPress={() => setCodeModalVisible(false)} accessibilityLabel="close" accessibilityRole="button">
                <Icon name="close" size={20} color={COLORS.text2} />
              </TouchableOpacity>
            </View>
            <View style={styles.qrContainer}>
              <Text style={styles.meetupCodeText}>{meetupCode}</Text>
            </View>
            <Text style={styles.qrHint}>Tell this code to the seller when you receive your item.</Text>
          </View>
        </View>
      </Modal>

      {/* Scan Modal */}
      <Modal visible={scanModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Enter delivery code</Text>
              <TouchableOpacity onPress={() => setScanModalVisible(false)} accessibilityLabel="close" accessibilityRole="button">
                <Icon name="close" size={20} color={COLORS.text2} />
              </TouchableOpacity>
            </View>
            <Text style={styles.scanHint}>
              Ask the buyer for the 4-digit code shown in their app.
            </Text>
            <View style={styles.scanInputRow}>
              <TextInput
                style={styles.scanInput}
                placeholder="4-digit code"
                placeholderTextColor={COLORS.text2}
                value={scanInput}
                onChangeText={setScanInput}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="number-pad"
                maxLength={4}
                accessibilityLabel="delivery code input"
               
              />
            </View>
            <TouchableOpacity
              style={[styles.scanConfirmBtn, scanLoading && { opacity: 0.5 }]}
              onPress={handleScan}
              disabled={scanLoading}
              accessibilityLabel="confirm exchange"
              accessibilityRole="button"
            >
              {scanLoading ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Text style={styles.scanConfirmBtnText}>Confirm exchange</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Receipt Modal */}
      <Modal visible={receiptModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Confirm receipt</Text>
              <TouchableOpacity onPress={() => setReceiptModalVisible(false)} accessibilityLabel="close" accessibilityRole="button">
                <Icon name="close" size={20} color={COLORS.text2} />
              </TouchableOpacity>
            </View>
            <View style={styles.receiptIcon}>
              <Icon name="offer-coin" size={48} color={COLORS.green} />
            </View>
            <Text style={styles.receiptText}>
              Did you receive your item in good condition?
            </Text>
            <Text style={styles.receiptSubtext}>
              Confirming will release {formatPrice(Number(order.total_amount))} G to the seller.
            </Text>
            <TouchableOpacity
              style={[styles.receiptConfirmBtn, releaseLoading && { opacity: 0.5 }]}
              onPress={handleConfirmReceipt}
              disabled={releaseLoading}
              accessibilityLabel="yes, i received it"
              accessibilityRole="button"
            >
              {releaseLoading ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <>
                  <Icon name="check-circle" size={18} color={COLORS.white} />
                  <Text style={styles.receiptConfirmBtnText}>Yes, I received it</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.receiptDisputeBtn}
              onPress={handleDispute}
              accessibilityLabel="open dispute"
              accessibilityRole="button"
            >
              <Text style={styles.receiptDisputeBtnText}>No, open a dispute</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loading: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' },
  meetupSkeletonHeader: { height: 62, paddingHorizontal: SPACING.lg, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: COLORS.surface },
  meetupSkeleton: { padding: SPACING.lg, gap: SPACING.lg },

  mapContainer: { height: 260, marginHorizontal: SPACING.lg, borderRadius: RADIUS.media, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  map: { flex: 1 },
  meetupPin: { alignItems: 'center' },
  distanceBadge: {
    position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.surface, paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.card,
    borderWidth: 1, borderColor: COLORS.border,
  },
  distanceBadgeClose: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  distanceText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  distanceTextClose: { color: COLORS.white },
  bottomSheet: {
    flex: 1, marginTop: SPACING.md,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
  },
  handle: {
    alignSelf: 'center', width: 42, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border, marginVertical: SPACING.md,
  },
  timerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, marginBottom: SPACING.md,
  },
  timerText: { fontSize: 15, fontWeight: '700', color: COLORS.yellow },
  statusGrid: { flexDirection: 'row', gap: 10, marginBottom: SPACING.lg },
  statusCard: {
    flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.media, padding: 12, alignItems: 'center',
  },
  statusCardActive: { borderColor: COLORS.green },
  statusLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginTop: 6 },
  statusSub: { fontSize: 11, color: COLORS.text2, marginTop: 2 },
  qrButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 14, borderRadius: RADIUS.media, backgroundColor: COLORS.blue, marginBottom: 10,
  },
  qrButtonText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  scanButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 14, borderRadius: RADIUS.media, backgroundColor: COLORS.green, marginBottom: 10,
  },
  scanButtonText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  waitingCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 14, borderRadius: RADIUS.media, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 10,
  },
  waitingText: { fontSize: 13, color: COLORS.text2, fontWeight: '600' },
  checkinBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 16, borderRadius: RADIUS.pill, backgroundColor: COLORS.coral, marginBottom: 10,
  },
  checkinBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 16 },
  receiptBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 16, borderRadius: RADIUS.pill, backgroundColor: COLORS.green, marginBottom: 10,
  },
  receiptBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 16 },
  emergencyRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  emergencyBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: 12, borderRadius: RADIUS.card, borderWidth: 1.5, borderColor: COLORS.coral,
  },
  emergencyBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.coral },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: SPACING.lg,
  },
  modalContent: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.pill, padding: SPACING.lg, width: '100%', maxWidth: 380,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg,
  },
  modalTitle: { fontFamily: 'Syne', fontSize: 18, fontWeight: '800', color: COLORS.text },
  qrContainer: { alignItems: 'center', paddingVertical: 24, backgroundColor: COLORS.bg, borderRadius: RADIUS.media, marginBottom: 14 },
  meetupCodeText: { color: COLORS.text, fontSize: 48, fontWeight: '800', letterSpacing: 10 },
  qrHint: { fontSize: 13, color: COLORS.text2, textAlign: 'center', marginBottom: 12 },
  copyTokenBtn: { alignItems: 'center', padding: 10 },
  copyTokenText: { fontSize: 13, color: COLORS.blue, fontWeight: '600' },
  scanHint: { fontSize: 13, color: COLORS.text2, marginBottom: 14, lineHeight: 18 },
  scanInputRow: { marginBottom: 14 },
  scanInput: {
    backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.card, padding: 12, fontSize: 14, color: COLORS.text, minHeight: 44,
  },
  scanConfirmBtn: {
    padding: 14, borderRadius: RADIUS.pill, backgroundColor: COLORS.green, alignItems: 'center',
  },
  scanConfirmBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  receiptIcon: { alignItems: 'center', marginBottom: 14 },
  receiptText: { fontSize: 16, fontWeight: '700', color: COLORS.text, textAlign: 'center', marginBottom: 6 },
  receiptSubtext: { fontSize: 13, color: COLORS.text2, textAlign: 'center', marginBottom: 18, lineHeight: 18 },
  receiptConfirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 14, borderRadius: RADIUS.pill, backgroundColor: COLORS.green, marginBottom: 10,
  },
  receiptConfirmBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  receiptDisputeBtn: { alignItems: 'center', padding: 10 },
  receiptDisputeBtnText: { fontSize: 13, color: COLORS.coral, fontWeight: '600' },
});
