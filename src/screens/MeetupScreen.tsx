import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform,
  ScrollView, Modal, TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import MapView, { Marker, Circle } from 'react-native-maps';
import * as Location from 'expo-location';
import { COLORS, SPACING } from '../theme';
import { store } from '../store';
import { getOrder, meetupCheckin, meetupScan, getMeetupStatus, releaseEscrow, refundEscrow } from '../api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../i18n';
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
  const mapRef = useRef<MapView>(null);

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [otherCheckedIn, setOtherCheckedIn] = useState(false);
  const [myCheckedIn, setMyCheckedIn] = useState(false);
  const [proximityConfirmed, setProximityConfirmed] = useState(false);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [scanModalVisible, setScanModalVisible] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [scanLoading, setScanLoading] = useState(false);
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  const [releaseLoading, setReleaseLoading] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [timeLeft, setTimeLeft] = useState(MEETUP_TIMEOUT_MS);
  const [checkins, setCheckins] = useState<any[]>([]);
  const locationWatcher = useRef<Location.LocationSubscription | null>(null);

  const isBuyer = order ? store.user?.id === order.buyer_id : false;
  const isSeller = order ? order.items?.some((i: any) => i.seller_id === store.user?.id) : false;
  const meetupLng = order?.meetup_lng ? parseFloat(String(order.meetup_lng)) : null;
  const meetupLat = order?.meetup_lat ? parseFloat(String(order.meetup_lat)) : null;

  const fetchData = useCallback(async () => {
    try {
      const [orderRes, statusRes] = await Promise.all([
        getOrder(orderId) as Promise<{ order: Order }>,
        getMeetupStatus(orderId) as Promise<{ checkins: any[] }>,
      ]);
      setOrder(orderRes.order);
      setCheckins(statusRes.checkins || []);

      const myCheckin = statusRes.checkins?.find((c: any) => c.user_id === store.user?.id);
      const otherCheckin = statusRes.checkins?.find((c: any) => c.user_id !== store.user?.id);

      setMyCheckedIn(!!myCheckin);
      setOtherCheckedIn(!!otherCheckin);

      if (myCheckin?.qr_token) {
        setQrToken(myCheckin.qr_token);
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
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 0) return 0;
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location needed', 'Please enable location services to check in at the meetup.');
        return;
      }
      locationWatcher.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5000 },
        (pos) => {
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
      if (res.qrToken) {
        setQrToken(res.qrToken);
        setProximityConfirmed(true);
      }
      if (res.proximityConfirmed && isSeller) {
        Alert.alert('You\'re close!', 'You are within range. Ask the buyer to show their QR code.');
      }
      if (res.proximityConfirmed && isBuyer && res.qrToken) {
        Alert.alert('Ready!', 'You are within range. Your QR code is ready. Show it to the seller.');
      }
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || 'Check-in failed');
    }
    setCheckinLoading(false);
  };

  const handleScan = async () => {
    if (!scanInput.trim()) {
      Alert.alert('Enter code', 'Please enter or paste the buyer\'s QR code.');
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

  const handleEmergencyExit = () => {
    Alert.alert('Emergency Exit?', 'This will freeze the meetup and start a 48-hour resolution. No penalty.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Exit', style: 'destructive',
        onPress: async () => {
          try {
            await refundEscrow(orderId);
            Alert.alert('Meetup frozen', 'Refund processed. Support will review within 48 hours.', [
              { text: 'OK', onPress: () => navigation.goBack() },
            ]);
          } catch (err: any) {
            Alert.alert(t('common.error'), err.message || 'Emergency exit failed');
          }
        },
      },
    ]);
  };

  const formatTime = (ms: number) => {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loading || !order) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.coral} /></View>;
  }

  const region = meetupLat && meetupLng ? {
    latitude: meetupLat,
    longitude: meetupLng,
    latitudeDelta: 0.005,
    longitudeDelta: 0.005,
  } : undefined;

  return (
    <View style={styles.container}>
      <View style={[styles.topbar, { paddingTop: insets.top + SPACING.md }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.text2} />
        </TouchableOpacity>
        <Text style={styles.title}>Meetup</Text>
        <View style={{ width: 20 }} />
      </View>

      {region && (
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={region}
            showsUserLocation
          >
            <Marker coordinate={{ latitude: meetupLat!, longitude: meetupLng! }} title="Meetup spot">
              <View style={styles.meetupPin}>
                <MaterialCommunityIcons name="map-marker" size={28} color={COLORS.coral} />
              </View>
            </Marker>
            {myCheckedIn && (
              <Circle
                center={{ latitude: meetupLat!, longitude: meetupLng! }}
                radius={PROXIMITY_THRESHOLD}
                fillColor="rgba(0,229,160,0.12)"
                strokeColor={COLORS.green}
                strokeWidth={2}
              />
            )}
          </MapView>

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
        {timeLeft > 0 && (
          <View style={styles.timerRow}>
            <MaterialCommunityIcons name="timer-outline" size={16} color={timeLeft < 600000 ? COLORS.coral : COLORS.yellow} />
            <Text style={[styles.timerText, timeLeft < 600000 && { color: COLORS.coral }]}>
              {formatTime(timeLeft)} remaining
            </Text>
          </View>
        )}

        {/* Status cards */}
        <View style={styles.statusGrid}>
          <View style={[styles.statusCard, myCheckedIn && styles.statusCardActive]}>
            <MaterialCommunityIcons
              name={myCheckedIn ? 'check-circle' : 'clock-outline'}
              size={18}
              color={myCheckedIn ? COLORS.green : COLORS.text2}
            />
            <Text style={[styles.statusLabel, myCheckedIn && { color: COLORS.green }]}>You</Text>
            <Text style={styles.statusSub}>{myCheckedIn ? 'Checked in' : 'Not here yet'}</Text>
          </View>
          <View style={[styles.statusCard, otherCheckedIn && styles.statusCardActive]}>
            <MaterialCommunityIcons
              name={otherCheckedIn ? 'check-circle' : 'clock-outline'}
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
        {isBuyer && myCheckedIn && otherCheckedIn && proximityConfirmed && qrToken && (
          <TouchableOpacity style={styles.qrButton} onPress={() => setQrModalVisible(true)}>
            <MaterialCommunityIcons name="qrcode" size={20} color={COLORS.white} />
            <Text style={styles.qrButtonText}>Show QR Code</Text>
          </TouchableOpacity>
        )}

        {/* Scan section for seller */}
        {isSeller && myCheckedIn && otherCheckedIn && proximityConfirmed && (
          <TouchableOpacity style={styles.scanButton} onPress={() => setScanModalVisible(true)}>
            <MaterialCommunityIcons name="qrcode-scan" size={20} color={COLORS.white} />
            <Text style={styles.scanButtonText}>Scan Buyer's QR</Text>
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
        {isBuyer && qrToken && checkins.some((c: any) => c.qr_scanned) && order.status === 'paid' && (
          <TouchableOpacity
            style={styles.receiptBtn}
            onPress={() => setReceiptModalVisible(true)}
          >
            <MaterialCommunityIcons name="hand-coin-outline" size={18} color={COLORS.white} />
            <Text style={styles.receiptBtnText}>Confirm receipt</Text>
          </TouchableOpacity>
        )}

        {/* Cancel / Emergency */}
        {order.status === 'paid' && (
          <View style={styles.emergencyRow}>
            <TouchableOpacity style={styles.emergencyBtn} onPress={handleRefund} disabled={refunding}>
              {refunding ? (
                <ActivityIndicator size="small" color={COLORS.coral} />
              ) : (
                <>
                  <MaterialCommunityIcons name="cancel" size={16} color={COLORS.coral} />
                  <Text style={styles.emergencyBtnText}>Cancel meetup</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.emergencyBtn, { borderColor: '#FF2D2D' }]} onPress={handleEmergencyExit}>
              <MaterialCommunityIcons name="shield-alert" size={16} color="#FF2D2D" />
              <Text style={[styles.emergencyBtnText, { color: '#FF2D2D' }]}>Emergency exit</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* QR Modal */}
      <Modal visible={qrModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Show this QR code</Text>
              <TouchableOpacity onPress={() => setQrModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={20} color={COLORS.text2} />
              </TouchableOpacity>
            </View>
            <View style={styles.qrContainer}>
              <MaterialCommunityIcons name="qrcode" size={180} color={COLORS.text} />
            </View>
            <Text style={styles.qrHint}>Seller will scan this to confirm the exchange.</Text>
            {qrToken && (
              <TouchableOpacity
                style={styles.copyTokenBtn}
                onPress={() => {
                  if (Platform.OS !== 'web') {
                    const Clipboard = require('expo-clipboard');
                    Clipboard.setString(qrToken);
                    Alert.alert('Copied', 'QR token copied to clipboard.');
                  }
                }}
              >
                <Text style={styles.copyTokenText}>Copy code</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Scan Modal */}
      <Modal visible={scanModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Scan buyer's QR</Text>
              <TouchableOpacity onPress={() => setScanModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={20} color={COLORS.text2} />
              </TouchableOpacity>
            </View>
            <Text style={styles.scanHint}>
              Ask the buyer to show their QR code, or paste the code below.
            </Text>
            <View style={styles.scanInputRow}>
              <TextInput
                style={styles.scanInput}
                placeholder="Paste QR code here..."
                placeholderTextColor={COLORS.text2}
                value={scanInput}
                onChangeText={setScanInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <TouchableOpacity
              style={[styles.scanConfirmBtn, scanLoading && { opacity: 0.5 }]}
              onPress={handleScan}
              disabled={scanLoading}
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
              <TouchableOpacity onPress={() => setReceiptModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={20} color={COLORS.text2} />
              </TouchableOpacity>
            </View>
            <View style={styles.receiptIcon}>
              <MaterialCommunityIcons name="hand-coin-outline" size={48} color={COLORS.green} />
            </View>
            <Text style={styles.receiptText}>
              Did you receive your item in good condition?
            </Text>
            <Text style={styles.receiptSubtext}>
              Confirming will release Rs {Number(order.total_amount).toLocaleString()} to the seller.
            </Text>
            <TouchableOpacity
              style={[styles.receiptConfirmBtn, releaseLoading && { opacity: 0.5 }]}
              onPress={handleConfirmReceipt}
              disabled={releaseLoading}
            >
              {releaseLoading ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <>
                  <MaterialCommunityIcons name="check-circle" size={18} color={COLORS.white} />
                  <Text style={styles.receiptConfirmBtnText}>Yes, I received it</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.receiptDisputeBtn}
              onPress={() => {
                setReceiptModalVisible(false);
                Alert.alert('Dispute opened', 'Support will review this order. Your payment is held securely.');
              }}
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
  topbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm,
  },
  title: { fontFamily: 'Syne', fontSize: 18, fontWeight: '800', color: COLORS.text },
  mapContainer: { height: 260, marginHorizontal: SPACING.lg, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  map: { flex: 1 },
  meetupPin: { alignItems: 'center' },
  distanceBadge: {
    position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.surface, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
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
    borderRadius: 14, padding: 12, alignItems: 'center',
  },
  statusCardActive: { borderColor: COLORS.green },
  statusLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginTop: 6 },
  statusSub: { fontSize: 11, color: COLORS.text2, marginTop: 2 },
  qrButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 14, borderRadius: 16, backgroundColor: COLORS.blue, marginBottom: 10,
  },
  qrButtonText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  scanButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 14, borderRadius: 16, backgroundColor: COLORS.green, marginBottom: 10,
  },
  scanButtonText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  waitingCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 14, borderRadius: 14, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 10,
  },
  waitingText: { fontSize: 13, color: COLORS.text2, fontWeight: '600' },
  checkinBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 16, borderRadius: 20, backgroundColor: COLORS.coral, marginBottom: 10,
  },
  checkinBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 16 },
  receiptBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 16, borderRadius: 20, backgroundColor: COLORS.green, marginBottom: 10,
  },
  receiptBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 16 },
  emergencyRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  emergencyBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.coral,
  },
  emergencyBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.coral },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: SPACING.lg,
  },
  modalContent: {
    backgroundColor: COLORS.surface, borderRadius: 20, padding: SPACING.lg, width: '100%', maxWidth: 380,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg,
  },
  modalTitle: { fontFamily: 'Syne', fontSize: 18, fontWeight: '800', color: COLORS.text },
  qrContainer: { alignItems: 'center', paddingVertical: 24, backgroundColor: COLORS.bg, borderRadius: 16, marginBottom: 14 },
  qrHint: { fontSize: 13, color: COLORS.text2, textAlign: 'center', marginBottom: 12 },
  copyTokenBtn: { alignItems: 'center', padding: 10 },
  copyTokenText: { fontSize: 13, color: COLORS.blue, fontWeight: '600' },
  scanHint: { fontSize: 13, color: COLORS.text2, marginBottom: 14, lineHeight: 18 },
  scanInputRow: { marginBottom: 14 },
  scanInput: {
    backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, padding: 12, fontSize: 14, color: COLORS.text, minHeight: 44,
  },
  scanConfirmBtn: {
    padding: 14, borderRadius: 20, backgroundColor: COLORS.green, alignItems: 'center',
  },
  scanConfirmBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  receiptIcon: { alignItems: 'center', marginBottom: 14 },
  receiptText: { fontSize: 16, fontWeight: '700', color: COLORS.text, textAlign: 'center', marginBottom: 6 },
  receiptSubtext: { fontSize: 13, color: COLORS.text2, textAlign: 'center', marginBottom: 18, lineHeight: 18 },
  receiptConfirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 14, borderRadius: 20, backgroundColor: COLORS.green, marginBottom: 10,
  },
  receiptConfirmBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  receiptDisputeBtn: { alignItems: 'center', padding: 10 },
  receiptDisputeBtnText: { fontSize: 13, color: COLORS.coral, fontWeight: '600' },
});
