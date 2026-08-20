import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Linking,
  KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Icon } from '../components/icons/Icon';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SPACING, RADIUS, formatPrice } from '../theme';
import { useTranslation } from '../i18n';
import { validatePromo } from '../api';
import ScreenHeader from '../components/ScreenHeader';
import { store } from '../store';
import { createOrder, createPayment, getAddresses, getImageUrl } from '../api';
import type { RootStackParamList } from '../navigation';
import type { Address } from '../types';
import SalePriceTag from '../components/SalePriceTag';
import { notifySuccess, notifyError } from '../haptics';
import { useToast } from '../components/Toast';
import LocationPicker from '../components/LocationPicker';
import { network } from '../network';

type Props = NativeStackScreenProps<RootStackParamList, 'Checkout'>;
type DeliveryMethod = 'delivery' | 'meetup';
import moncashLogo from '../../assets/MonNatCash/moncash.webp';
import natcashLogo from '../../assets/MonNatCash/natcash.webp';

export default function CheckoutScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const cart = store.cart;
  const [method, setMethod] = useState<DeliveryMethod>('delivery');
  const [paymentMethod, setPaymentMethod] = useState<'moncash' | 'natcash'>('moncash');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [promoCode, setPromoCode] = useState(route.params?.promoCode || '');
  const [discount, setDiscount] = useState(0);
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [meetupLat, setMeetupLat] = useState<number | null>(null);
  const [meetupLng, setMeetupLng] = useState<number | null>(null);
  const [meetupAddress, setMeetupAddress] = useState<string | null>(null);

  // Button 1: Laser Conic Sweep (Clockwise 3s)
  const laserRotation = useSharedValue(0);
  // Button 5: Dual Counter-Flare (CW 2.5s & CCW 3.25s)
  const dualRotationCW = useSharedValue(0);
  const dualRotationCCW = useSharedValue(360);

  useEffect(() => {
    laserRotation.value = withRepeat(
      withTiming(360, { duration: 3000, easing: Easing.linear }),
      -1,
      false,
    );
    dualRotationCW.value = withRepeat(
      withTiming(360, { duration: 2500, easing: Easing.linear }),
      -1,
      false,
    );
    dualRotationCCW.value = withRepeat(
      withTiming(0, { duration: 3250, easing: Easing.linear }),
      -1,
      false,
    );
  }, []);

  const animatedLaserStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${laserRotation.value}deg` }],
  }));

  const animatedDualCWStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${dualRotationCW.value}deg` }],
  }));

  const animatedDualCCWStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${dualRotationCCW.value}deg` }],
  }));

  const fetchAddresses = useCallback(async () => {
    try {
      const res = await getAddresses() as { addresses?: Address[] };
      setSavedAddresses(res.addresses || []);
    } catch { /* silent */ }
  }, []);

  useFocusEffect(useCallback(() => { fetchAddresses(); }, [fetchAddresses]));

  useEffect(() => {
    const user = store.user;
    if (user && !name && !phone) {
      setName(user.full_name || '');
      setPhone(user.phone || '');
    }
    if (user && !address && user.location_address) {
      setAddress(user.location_address);
    }
    if (user && !city && user.location_city) {
      setCity(user.location_city);
    }
  }, []);

  const subtotal = cart.reduce((sum, item) => sum + (item.effective_price ?? item.price) * item.quantity, 0);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Validate promo code when it changes
  useEffect(() => {
    if (!promoCode.trim()) { setDiscount(0); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await validatePromo(promoCode.trim(), subtotal) as any;
        if (res?.discount) setDiscount(Number(res.discount));
        else setDiscount(0);
      } catch { setDiscount(0); }
    }, 500);
    return () => clearTimeout(timer);
  }, [promoCode, subtotal]);

  const selectAddress = (addr: Address) => {
    setSelectedAddressId(addr.id);
    setName(addr.name);
    setPhone(addr.phone);
    setAddress(addr.address);
    setCity(addr.city);
  };

  const finalTotal = Math.max(0, subtotal - discount);
  const itemLabel = itemCount === 1 ? t('checkout.item') : t('checkout.items');
  const sellerGroups = cart.reduce<Array<{ sellerId: string; sellerName: string; itemCount: number; total: number }>>((groups, item) => {
    const sellerName = item.store_name || item.seller_name || `Seller ${item.seller_id.slice(0, 6)}`;
    const existing = groups.find(group => group.sellerId === item.seller_id);
    if (existing) {
      existing.itemCount += item.quantity;
      existing.total += (item.effective_price ?? item.price) * item.quantity;
    } else {
      groups.push({ sellerId: item.seller_id, sellerName, itemCount: item.quantity, total: (item.effective_price ?? item.price) * item.quantity });
    }
    return groups;
  }, []);
  const sellerCount = sellerGroups.length;

  const handleCheckout = async () => {
    if (network.isOffline) {
      toast.info(t('network.offline'), t('checkout.offlinePayment'));
      return;
    }

    if (cart.length === 0) {
      toast.info(t('checkout.cartEmpty'), t('checkout.addBeforeCheckout'));
      navigation.goBack();
      return;
    }

    const ownItems = cart.filter(item => item.seller_id && item.seller_id === store.user?.id);
    if (ownItems.length > 0) {
      for (const item of ownItems) {
        await store.removeFromCart(item.id);
      }
      toast.error(t('checkout.ownItems'), t('checkout.ownItemsRemoved', { count: ownItems.length }));
      if (cart.length - ownItems.length === 0) return;
    }

    if (method === 'delivery' && (!name || !phone || !address || !city)) {
      toast.error(t('checkout.missingInfo'), t('checkout.fillRequired'));
      return;
    }

    if (method === 'meetup' && (!meetupLat || !meetupLng)) {
      toast.error(t('checkout.missingInfo'), t('checkout.selectMeetupLocation'));
      return;
    }

    setLoading(true);
    try {
      const orderData: Record<string, unknown> = {
        items: cart.map(item => ({ productId: item.id, quantity: item.quantity })),
        deliveryMethod: method,
      };
      if (promoCode.trim()) orderData.promoCode = promoCode.trim();
      if (method === 'delivery') {
        orderData.deliveryName = name;
        orderData.deliveryPhone = phone;
        orderData.deliveryAddress = address;
        orderData.deliveryCity = city;
        orderData.deliveryNote = note;
      } else {
        orderData.meetupLat = meetupLat;
        orderData.meetupLng = meetupLng;
        orderData.meetupAddress = meetupAddress;
        orderData.deliveryNote = note;
      }

      orderData.paymentMethod = paymentMethod;
      const orderRes = await createOrder(orderData) as { order: { id: string } };
      await store.clearCart();

      if (paymentMethod === 'moncash') {
        try {
          const payRes = await createPayment(orderRes.order.id, `maurmaket://payment-return?orderId=${orderRes.order.id}`) as { paymentUrl: string };
          if (payRes.paymentUrl) {
            await Linking.openURL(payRes.paymentUrl);
          }
          notifySuccess();
          toast.success(t('checkout.orderCreated'), t('checkout.openingMonCash'));
          navigation.navigate('Orders');
        } catch (paymentErr: unknown) {
          notifyError();
          navigation.navigate('Orders');
          const msg = paymentErr instanceof Error ? paymentErr.message : t('checkout.paymentStartFailed');
          toast.error(t('checkout.orderCreated'), `${msg} ${t('checkout.retryPayment')}`);
        }
      } else {
        // NatCash — placeholder for now
        notifySuccess();
        toast.success(t('checkout.orderCreated'), 'NatCash payment coming soon!');
        navigation.navigate('Orders');
      }
    } catch (e: unknown) {
      notifyError();
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('email_not_verified') || msg.includes('verify your email')) {
        toast.show({ kind: 'error', title: t('checkout.emailNotVerified'), message: t('checkout.verifyEmailToOrder'), actionLabel: t('me.settings'), onAction: () => navigation.navigate('EmailVerification') });
      } else {
        toast.error(t('checkout.finishFailed'), msg || t('checkout.checkoutFailed'), handleCheckout);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={styles.container}>
      <ScreenHeader
        title={t('checkout.title')}
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.content}>

      <Text style={styles.sectionLabel}>{t('checkout.sellerSplit')}</Text>
      <View style={[styles.sellerSummary, sellerCount > 1 && styles.sellerSummaryMixed]}>
        <View style={styles.sellerSummaryTitleRow}>
          <MaterialCommunityIcons
            name={sellerCount > 1 ? 'store-alert-outline' : 'storefront-outline'}
            size={18}
            color={sellerCount > 1 ? COLORS.yellow : COLORS.blue}
          />
          <Text style={styles.sellerSummaryTitle}>
            {t('checkout.sellersInCheckout', { count: sellerCount, plural: sellerCount === 1 ? t('checkout.seller') : t('checkout.sellers') })}
          </Text>
        </View>
        <Text style={styles.sellerSummaryHint}>
          {sellerCount > 1
            ? t('checkout.multiSellerHint')
            : t('checkout.singleSellerHint')}
        </Text>
        {sellerGroups.map(group => (
          <View key={group.sellerId} style={styles.sellerGroupRow}>
            <Text style={styles.sellerGroupName} numberOfLines={1}>{group.sellerName}</Text>
            <Text style={styles.sellerGroupMeta}>
              {group.itemCount} {group.itemCount === 1 ? t('checkout.item') : t('checkout.items')} - {formatPrice(group.total)} G
            </Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionLabel}>{t('checkout.orderSummary')}</Text>
      <View style={styles.orderSummaryContainer}>
        {cart.map((item, idx) => {
          const img = item.images?.find(i => i.is_primary) || item.images?.[0];
          const imgUrl = getImageUrl(img?.image_url);
          const sellerName = item.store_name || item.seller_name || `Seller ${item.seller_id.slice(0, 6)}`;
          return (
            <View key={item.id} style={[styles.orderItemRow, idx === cart.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={styles.orderItemThumb}>
                {imgUrl ? (
                  <Image source={{ uri: imgUrl }} style={styles.orderItemImg} resizeMode="cover" />
                ) : (
                  <Icon name="image-unavailable" size={16} color={COLORS.text2} />
                )}
              </View>
              <View style={styles.orderItemInfo}>
                <Text style={styles.orderItemName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.orderItemSeller} numberOfLines={1}>{sellerName}</Text>
              </View>
              <Text style={styles.orderItemQty}>x{item.quantity}</Text>
              <Text style={styles.orderItemPrice}>{formatPrice((item.effective_price ?? item.price) * item.quantity)} G</Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>Delivery method</Text>
      <View style={styles.methodRow}>
        <TouchableOpacity
          style={[styles.methodCard, method === 'delivery' && styles.methodActive]}
          onPress={() => setMethod('delivery')}
          accessibilityLabel="select delivery method"
          accessibilityRole="button"
        >
          <Icon name="delivery" size={20} color={method === 'delivery' ? COLORS.coral : COLORS.text2} />
          <Text style={[styles.methodText, method === 'delivery' && styles.methodTextActive]}>{t('checkout.delivery')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.methodCard, method === 'meetup' && styles.methodActive]}
          onPress={() => setMethod('meetup')}
          accessibilityLabel="select meetup method"
          accessibilityRole="button"
        >
          <Icon name="location-pin" size={20} color={method === 'meetup' ? COLORS.coral : COLORS.text2} />
          <Text style={[styles.methodText, method === 'meetup' && styles.methodTextActive]}>{t('checkout.meetup')}</Text>
        </TouchableOpacity>
      </View>

      {method === 'delivery' ? (
        <View style={styles.fields}>
          {savedAddresses.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>{t('checkout.savedAddresses')}</Text>
              <View style={styles.addressList}>
                {savedAddresses.map(addr => (
                  <TouchableOpacity
                    key={addr.id}
                    style={[styles.addressCard, selectedAddressId === addr.id && styles.addressCardActive]}
                    onPress={() => selectAddress(addr)}
                    accessibilityLabel={`select ${addr.label} address`}
                    accessibilityRole="button"
                  >
                    <View style={styles.addressHeader}>
                      <View style={styles.addressLabel}>
                        <MaterialCommunityIcons name="home-outline" size={14} color={COLORS.blue} />
                        <Text style={styles.addressLabelText}>{addr.label}</Text>
                      </View>
                      {addr.is_default && (
                        <View style={styles.defaultBadge}>
                          <Text style={styles.defaultBadgeText}>{t('checkout.default')}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.addressName}>{addr.name}</Text>
                    <Text style={styles.addressText}>{addr.address}, {addr.city}</Text>
                    <Text style={styles.addressText}>{addr.phone}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={styles.addAddressLink}
                onPress={() => navigation.navigate('Addresses')}
                accessibilityLabel="manage addresses"
                accessibilityRole="button"
              >
                <MaterialCommunityIcons name="plus-circle-outline" size={16} color={COLORS.coral} />
                <Text style={styles.addAddressText}>{t('checkout.manageAddresses')}</Text>
              </TouchableOpacity>
            </>
          )}

          <Text style={styles.sectionLabel}>{t('checkout.deliveryInfo')}</Text>
          <TextInput style={styles.input} placeholder={t('checkout.fullName')} placeholderTextColor={COLORS.text2} value={name} onChangeText={setName} accessibilityLabel="full name" />
          <TextInput style={styles.input} placeholder={t('checkout.phone')} placeholderTextColor={COLORS.text2} value={phone} onChangeText={setPhone} keyboardType="phone-pad" accessibilityLabel="phone number" />
          <TextInput style={styles.input} placeholder={t('checkout.address')} placeholderTextColor={COLORS.text2} value={address} onChangeText={setAddress} accessibilityLabel="delivery address" />
          <TextInput style={styles.input} placeholder={t('checkout.city')} placeholderTextColor={COLORS.text2} value={city} onChangeText={setCity} accessibilityLabel="city" />
          <TextInput style={styles.input} placeholder={t('checkout.note')} placeholderTextColor={COLORS.text2} value={note} onChangeText={setNote} multiline accessibilityLabel="delivery note" />
        </View>
      ) : (
        <View style={styles.fields}>
          <Text style={styles.sectionLabel}>{t('checkout.meetupLocation')}</Text>
          <LocationPicker
            onLocationSelect={(lat, lng, addr) => {
              setMeetupLat(lat);
              setMeetupLng(lng);
              setMeetupAddress(addr);
            }}
            initialLat={meetupLat}
            initialLng={meetupLng}
            height={220}
          />
          {meetupAddress && (
            <View style={styles.meetupAddressPreview}>
              <MaterialCommunityIcons name="map-marker" size={14} color={COLORS.coral} />
              <Text style={styles.meetupAddressText} numberOfLines={2}>{meetupAddress}</Text>
            </View>
          )}
          <TextInput style={styles.input} placeholder={t('checkout.meetupNote')} placeholderTextColor={COLORS.text2} value={note} onChangeText={setNote} multiline accessibilityLabel="meetup note" />
        </View>
      )}

      <Text style={styles.sectionLabel}>{t('checkout.payment')}</Text>

      {discount > 0 && (
        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { color: COLORS.text2 }]}>{t('cart.subtotal')}</Text>
          <Text style={[styles.totalValue, { color: COLORS.text2, textDecorationLine: 'line-through' }]}>{formatPrice(subtotal)} G</Text>
        </View>
      )}
      {discount > 0 && (
        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { color: COLORS.green }]}>Discount</Text>
          <Text style={[styles.totalValue, { color: COLORS.green }]}>-{formatPrice(discount)} G</Text>
        </View>
      )}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>{t('common.total')}</Text>
        <Text style={styles.totalValue}>{formatPrice(finalTotal)} G</Text>
      </View>

      <View style={styles.payBtnRow}>
        {/* BUTTON 1: Conic Laser Sweep on MonCash */}
        <TouchableOpacity
          style={[styles.payBtnTouch, loading && styles.ctaBtnDisabled]}
          onPress={() => setPaymentMethod('moncash')}
          disabled={loading}
          accessibilityLabel="pay with MonCash"
          accessibilityRole="button"
        >
          <View style={[styles.payBtnOuter, paymentMethod === 'moncash' && styles.payBtnActiveLaser]}>
            {paymentMethod === 'moncash' ? (
              <Animated.View style={[styles.animGradientSquare, animatedLaserStyle]}>
                <LinearGradient
                  colors={['transparent', 'transparent', '#3b82f6', '#8b5cf6', '#ec4899', 'transparent']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
            ) : (
              <View style={styles.inactiveBorder} />
            )}
            <View style={styles.payBtnLogoWrap}>
              <Image
                source={moncashLogo}
                style={styles.payBtnLogo}
                resizeMode="contain"
              />
            </View>
          </View>
        </TouchableOpacity>

        {/* BUTTON 5: Dual Counter-Flare Shimmer on NatCash */}
        <TouchableOpacity
          style={[styles.payBtnTouch, loading && styles.ctaBtnDisabled]}
          onPress={() => setPaymentMethod('natcash')}
          disabled={loading}
          accessibilityLabel="pay with NatCash"
          accessibilityRole="button"
        >
          <View style={[styles.payBtnOuter, paymentMethod === 'natcash' && styles.payBtnActiveDual]}>
            {paymentMethod === 'natcash' ? (
              <>
                {/* Primary Flare (Clockwise) */}
                <Animated.View style={[styles.animGradientSquare, animatedDualCWStyle]}>
                  <LinearGradient
                    colors={['#a855f7', 'transparent', '#ec4899', '#a855f7']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>
                {/* Secondary Counter-Flare (Counter-Clockwise) */}
                <Animated.View style={[styles.animGradientSquare, styles.dualInnerBorder, animatedDualCCWStyle]}>
                  <LinearGradient
                    colors={['transparent', '#06b6d4', '#3b82f6', 'transparent']}
                    start={{ x: 1, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>
              </>
            ) : (
              <View style={styles.inactiveBorder} />
            )}
            <View style={styles.payBtnLogoWrap}>
              <Image
                source={natcashLogo}
                style={styles.payBtnLogo}
                resizeMode="contain"
              />
            </View>
          </View>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.ctaBtn, loading && styles.ctaBtnDisabled]}
        onPress={handleCheckout}
        disabled={loading}
        accessibilityLabel="place order"
        accessibilityRole="button"
      >
        {loading ? (
          <ActivityIndicator color={COLORS.white} />
        ) : (
          <Text style={styles.ctaText}>Pay {paymentMethod === 'moncash' ? 'MonCash' : 'NatCash'}</Text>
        )}
      </TouchableOpacity>
      </ScrollView>
    </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingBottom: 40 },
  subtitle: { fontSize: 11, color: COLORS.text2 },
  sectionLabel: { fontSize: 11, color: COLORS.text2, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0, paddingHorizontal: SPACING.md, marginTop: SPACING.md, marginBottom: 8 },
  sellerSummary: {
    marginHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.card,
    padding: 12,
    gap: 8,
  },
  sellerSummaryMixed: {
    borderColor: COLORS.yellow + '66',
    backgroundColor: COLORS.yellow + '0D',
  },
  sellerSummaryTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sellerSummaryTitle: { fontSize: 13, color: COLORS.text, fontWeight: '800' },
  sellerSummaryHint: { fontSize: 12, color: COLORS.text2, lineHeight: 17 },
  sellerGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  sellerGroupName: { flex: 1, fontSize: 12, color: COLORS.text, fontWeight: '700' },
  sellerGroupMeta: { fontSize: 11, color: COLORS.text2 },
  orderSummaryContainer: {
    marginHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.card,
    overflow: 'hidden',
  },
  orderItemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 10, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  orderItemThumb: {
    width: 44, height: 44, borderRadius: 6,
    backgroundColor: COLORS.surface2, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  orderItemImg: { width: '100%', height: '100%' },
  orderItemInfo: { flex: 1, minWidth: 0, gap: 2 },
  orderItemName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  orderItemSeller: { fontSize: 10, color: COLORS.text2 },
  orderItemQty: { fontSize: 12, color: COLORS.text2, fontWeight: '600' },
  orderItemPrice: { fontSize: 13, color: COLORS.coral, fontWeight: '700' },
  methodRow: { flexDirection: 'row', gap: 10, paddingHorizontal: SPACING.md },
  methodCard: { width: 170, height: 99, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.row, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  methodActive: { borderColor: COLORS.coral, backgroundColor: 'rgba(255,77,106,0.07)' },
  methodText: { fontSize: 11, color: COLORS.text2 },
  methodTextActive: { color: COLORS.coral, fontWeight: '700' },
  fields: { paddingHorizontal: SPACING.md },
  addressList: { gap: 8, marginBottom: 12 },
  addressCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.row, padding: 12,
  },
  addressCardActive: { borderColor: COLORS.coral, backgroundColor: 'rgba(255,77,106,0.07)' },
  addressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  addressLabel: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addressLabelText: { fontSize: 11, fontWeight: '700', color: COLORS.blue, textTransform: 'uppercase' },
  defaultBadge: { backgroundColor: COLORS.green + '20', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  defaultBadgeText: { fontSize: 9, fontWeight: '700', color: COLORS.green },
  addressName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  addressText: { fontSize: 12, color: COLORS.text2, marginTop: 2 },
  addAddressLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  addAddressText: { fontSize: 12, color: COLORS.coral, fontWeight: '600' },
  input: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.row,
    padding: 12, color: COLORS.text, fontSize: 13, marginBottom: 8,
  },
  meetupInfo: { flexDirection: 'row', gap: 8, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.row, padding: 12 },
  meetupInfoText: { flex: 1, fontSize: 12, color: COLORS.text2, lineHeight: 18 },
  meetupAddressPreview: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingHorizontal: 4 },
  meetupAddressText: { flex: 1, fontSize: 12, color: COLORS.text2 },
  moncashBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: SPACING.md, backgroundColor: 'rgba(0,194,255,0.1)', borderWidth: 1, borderColor: 'rgba(0,194,255,0.3)', borderRadius: RADIUS.row, padding: 10 },
  moncashText: { fontSize: 12, color: COLORS.blue },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', padding: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: SPACING.md },
  totalLabel: { fontSize: 14, color: COLORS.text2 },
  totalValue: { fontSize: 18, color: COLORS.coral, fontWeight: '700' },
  payBtnRow: { flexDirection: 'row', gap: 10, paddingHorizontal: SPACING.md, marginTop: 8 },
  payBtnTouch: { width: 178, height: 107, alignItems: 'center', justifyContent: 'center' },
  payBtnOuter: {
    width: 178, height: 107, borderRadius: RADIUS.row, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  payBtnActiveLaser: {
    shadowColor: '#EC4899',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 10,
    elevation: 8,
  },
  payBtnActiveDual: {
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
    elevation: 8,
  },
  animGradientSquare: {
    position: 'absolute', top: -76, left: -41, width: 260, height: 260,
  },
  dualInnerBorder: {
    opacity: 0.85,
  },
  inactiveBorder: {
    ...StyleSheet.absoluteFill, borderRadius: RADIUS.row,
    borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  payBtnLogoWrap: {
    width: 172, height: 101, borderRadius: RADIUS.row - 2,
    backgroundColor: COLORS.surface, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  payBtnLogo: { width: 170, height: 99, borderRadius: RADIUS.row - 2 },
  ctaBtn: { marginHorizontal: SPACING.md, marginTop: 12, backgroundColor: COLORS.coral, borderRadius: RADIUS.button, padding: 14, alignItems: 'center' },
  ctaBtnDisabled: { opacity: 0.6 },
  ctaText: { fontSize: 14, color: COLORS.white, fontWeight: '700' },
});
