import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS, TOUCH, FONTS, formatPrice } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
type CheckoutStep = 1 | 2 | 3;
import moncashLogo from '../../assets/MonNatCash/moncash.webp';
import natcashLogo from '../../assets/MonNatCash/natcash.webp';

/* ── Progress Indicator ─────────────────────────────────── */

function StepIndicator({ step }: { step: CheckoutStep }) {
  const { t } = useTranslation();
  const steps = [
    { num: 1, label: t('checkout.stepDelivery') },
    { num: 2, label: t('checkout.stepPayment') },
    { num: 3, label: t('checkout.stepReview') },
  ];
  return (
    <View style={styles.stepIndicator}>
      {steps.map((s, i) => (
        <React.Fragment key={s.num}>
          <View style={styles.stepItem}>
            <View style={[styles.stepCircle, step >= s.num && styles.stepCircleActive]}>
              <Text style={[styles.stepNum, step >= s.num && styles.stepNumActive]}>{s.num}</Text>
            </View>
            <Text style={[styles.stepLabel, step === s.num && styles.stepLabelActive]} numberOfLines={1}>{s.label}</Text>
          </View>
          {i < steps.length - 1 && (
            <View style={[styles.stepLine, step > s.num && styles.stepLineActive]} />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

/* ── Main Component ─────────────────────────────────────── */

export default function CheckoutScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const cart = store.cart;
  const [step, setStep] = useState<CheckoutStep>(1);
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
  const [meetupName, setMeetupName] = useState('');

  // Laser + shimmer animations (preserved from original)
  const laserRotation = useSharedValue(0);
  useEffect(() => {
    laserRotation.value = withRepeat(
      withTiming(360, { duration: 3000, easing: Easing.linear }),
      -1, false,
    );
  }, []);
  const animatedLaserStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${laserRotation.value}deg` }],
  }));

  const shimmerProgress = useSharedValue(0);
  useEffect(() => {
    shimmerProgress.value = withRepeat(
      withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.quad) }),
      -1, false,
    );
  }, []);
  const animatedShimmerStyle = useAnimatedStyle(() => {
    const t = shimmerProgress.value <= 0.45 ? shimmerProgress.value / 0.45 : 1;
    const left = -160 * 1.78 + (160 * 1.78 - -160 * 1.78) * t;
    return { left };
  });

  const fetchAddresses = useCallback(async () => {
    try {
      const res = await getAddresses() as { addresses?: Address[] };
      setSavedAddresses(res.addresses || []);
    } catch { /* silent */ }
  }, []);

  useFocusEffect(useCallback(() => { fetchAddresses(); }, [fetchAddresses]));

  const prevUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    const user = store.user;
    const uid = user?.id || null;
    if (uid !== prevUserIdRef.current) {
      prevUserIdRef.current = uid;
      if (user) {
        setName(user.full_name || '');
        setPhone(user.phone || '');
        setAddress(user.location_address || '');
        setCity(user.location_city || '');
        setNote('');
        setPromoCode('');
        setDiscount(0);
        setSelectedAddressId(null);
      }
    }
  });

  const subtotal = cart.reduce((sum, item) => sum + (item.effective_price ?? item.price) * item.quantity, 0);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

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

  /* ── Step Navigation ── */
  const canAdvanceStep1 = method === 'delivery'
    ? !!(name && phone && address && city)
    : !!(meetupLat && meetupLng);

  const advanceStep = () => {
    if (step === 1) {
      if (!canAdvanceStep1) {
        toast.error(t('checkout.missingInfo'), t('checkout.fillRequired'));
        return;
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  /* ── Handle Checkout (unchanged business logic) ── */
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
        orderData.meetupName = meetupName;
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
        notifySuccess();
        const sellerData = (orderRes as any).sellerInfo;
        const firstSeller = sellerGroups[0];
        const natcashPhone = sellerData?.natcashPhone || sellerData?.phone || '';
        navigation.navigate('NatCashPayment', {
          orderId: orderRes.order.id,
          total: finalTotal,
          sellerName: sellerData?.name || firstSeller?.sellerName || 'Seller',
          sellerPhone: natcashPhone,
        });
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

  /* ── Step Content Renderers ── */

  const renderStep1 = () => (
    <>
      {/* Delivery Method */}
      <Text style={styles.sectionLabel}>{t('checkout.deliveryMethod')}</Text>
      <View style={styles.methodRow}>
        <TouchableOpacity
          style={[styles.methodCard, method === 'delivery' && styles.methodActive]}
          onPress={() => setMethod('delivery')}
          accessibilityLabel="select delivery method"
          accessibilityRole="button"
        >
          <Icon name="delivery" size={24} color={method === 'delivery' ? COLORS.coral : COLORS.text2} />
          <Text style={[styles.methodTitle, method === 'delivery' && styles.methodTextActive]}>{t('checkout.delivery')}</Text>
          <Text style={styles.methodHint}>{method === 'delivery' ? 'We\'ll deliver to your address' : ''}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.methodCard, method === 'meetup' && styles.methodActive]}
          onPress={() => setMethod('meetup')}
          accessibilityLabel="select meetup method"
          accessibilityRole="button"
        >
          <Icon name="location-pin" size={24} color={method === 'meetup' ? COLORS.coral : COLORS.text2} />
          <Text style={[styles.methodTitle, method === 'meetup' && styles.methodTextActive]}>{t('checkout.meetup')}</Text>
          <Text style={styles.methodHint}>{method === 'meetup' ? 'Meet the seller in person' : ''}</Text>
        </TouchableOpacity>
      </View>

      {/* Delivery Details */}
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
          <TextInput style={styles.input} placeholder="Your name for pickup" placeholderTextColor={COLORS.text2} value={meetupName} onChangeText={setMeetupName} accessibilityLabel="meetup name" />
          <TextInput style={styles.input} placeholder={t('checkout.meetupNote')} placeholderTextColor={COLORS.text2} value={note} onChangeText={setNote} multiline accessibilityLabel="meetup note" />
        </View>
      )}
    </>
  );

  const renderStep2 = () => (
    <>
      <Text style={styles.sectionLabel}>{t('checkout.payment')}</Text>
      <View style={styles.payBtnRow}>
        <TouchableOpacity
          style={[styles.payBtnTouch, loading && styles.ctaBtnDisabled]}
          onPress={() => setPaymentMethod('moncash')}
          disabled={loading}
          accessibilityLabel="pay with MonCash"
          accessibilityRole="button"
        >
          <View style={[styles.payOuter, paymentMethod === 'moncash' && styles.moncashGlow]}>
            {paymentMethod === 'moncash' ? (
              <>
                <Animated.View style={[styles.laserBgSquare, animatedLaserStyle]}>
                  <LinearGradient colors={['transparent', 'transparent', '#3b82f6', '#8b5cf6', '#ec4899']} locations={[0, 0.6, 0.75, 0.87, 1]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
                </Animated.View>
                <View style={styles.payLogoWrap}>
                  <Image source={moncashLogo} style={styles.payLogo} resizeMode="cover" />
                  <LinearGradient colors={['transparent', 'rgba(0,0,0,0.25)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.payLogoBottomShadow} pointerEvents="none" />
                </View>
                <View style={styles.glassOverlay} pointerEvents="none">
                  <LinearGradient colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0)']} locations={[0, 0.35, 0.6]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.glassOverlayGradient} />
                </View>
                <View style={styles.glassShimmerClip} pointerEvents="none">
                  <Animated.View style={[styles.glassShimmerBand, animatedShimmerStyle]}>
                    <LinearGradient colors={['transparent', 'rgba(255,255,255,0)', 'rgba(255,255,255,0.65)', 'rgba(255,255,255,0)', 'transparent']} locations={[0, 0.35, 0.5, 0.65, 1]} start={{ x: 0.017, y: 0.629 }} end={{ x: 0.983, y: 0.371 }} style={styles.glassShimmerGradient} />
                  </Animated.View>
                </View>
              </>
            ) : (
              <>
                <View style={styles.inactiveBorder} />
                <View style={styles.payLogoWrap}>
                  <Image source={moncashLogo} style={styles.payLogo} resizeMode="cover" />
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.payBtnTouch, loading && styles.ctaBtnDisabled]}
          onPress={() => setPaymentMethod('natcash')}
          disabled={loading}
          accessibilityLabel="pay with NatCash"
          accessibilityRole="button"
        >
          <View style={[styles.payOuter, paymentMethod === 'natcash' && styles.moncashGlow]}>
            {paymentMethod === 'natcash' ? (
              <>
                <Animated.View style={[styles.laserBgSquare, animatedLaserStyle]}>
                  <LinearGradient colors={['transparent', 'transparent', '#3b82f6', '#8b5cf6', '#ec4899']} locations={[0, 0.6, 0.75, 0.87, 1]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
                </Animated.View>
                <View style={styles.payLogoWrap}>
                  <Image source={natcashLogo} style={styles.payLogo} resizeMode="cover" />
                  <LinearGradient colors={['transparent', 'rgba(0,0,0,0.25)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.payLogoBottomShadow} pointerEvents="none" />
                </View>
                <View style={styles.glassOverlay} pointerEvents="none">
                  <LinearGradient colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0)']} locations={[0, 0.35, 0.6]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.glassOverlayGradient} />
                </View>
                <View style={styles.glassShimmerClip} pointerEvents="none">
                  <Animated.View style={[styles.glassShimmerBand, animatedShimmerStyle]}>
                    <LinearGradient colors={['transparent', 'rgba(255,255,255,0)', 'rgba(255,255,255,0.65)', 'rgba(255,255,255,0)', 'transparent']} locations={[0, 0.35, 0.5, 0.65, 1]} start={{ x: 0.017, y: 0.629 }} end={{ x: 0.983, y: 0.371 }} style={styles.glassShimmerGradient} />
                  </Animated.View>
                </View>
              </>
            ) : (
              <>
                <View style={styles.inactiveBorder} />
                <View style={styles.payLogoWrap}>
                  <Image source={natcashLogo} style={styles.payLogo} resizeMode="cover" />
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* Trust signals */}
      <View style={styles.trustSignals}>
        <View style={styles.trustRow}>
          <MaterialCommunityIcons name="shield-check-outline" size={16} color={COLORS.green} />
          <Text style={styles.trustText}>{t('checkout.securePayment')}</Text>
        </View>
        <View style={styles.trustRow}>
          <MaterialCommunityIcons name="lock-check-outline" size={16} color={COLORS.blue} />
          <Text style={styles.trustText}>{t('checkout.moneyHeld')}</Text>
        </View>
      </View>
    </>
  );

  const renderStep3 = () => (
    <>
      {/* Order Summary */}
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

      {/* Delivery Summary */}
      <Text style={styles.sectionLabel}>{t('checkout.deliverySummary')}</Text>
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Icon name={method === 'delivery' ? 'delivery' : 'location-pin'} size={16} color={COLORS.coral} />
          <Text style={styles.summaryLabel}>{method === 'delivery' ? t('checkout.delivery') : t('checkout.meetup')}</Text>
        </View>
        {method === 'delivery' ? (
          <View style={styles.summaryDetails}>
            <Text style={styles.summaryDetail}>{name}</Text>
            <Text style={styles.summaryDetail}>{address}, {city}</Text>
            <Text style={styles.summaryDetail}>{phone}</Text>
          </View>
        ) : (
          <View style={styles.summaryDetails}>
            <Text style={styles.summaryDetail}>{meetupName || 'Pickup'}</Text>
            {meetupAddress && <Text style={styles.summaryDetail}>{meetupAddress}</Text>}
          </View>
        )}
      </View>

      {/* Payment Summary */}
      <Text style={styles.sectionLabel}>{t('checkout.paymentSummary')}</Text>
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Image source={paymentMethod === 'moncash' ? moncashLogo : natcashLogo} style={styles.summaryPayIcon} resizeMode="cover" />
          <Text style={styles.summaryLabel}>{paymentMethod === 'moncash' ? 'MonCash' : 'NatCash'}</Text>
          <MaterialCommunityIcons name="check-circle" size={16} color={COLORS.green} />
        </View>
      </View>

      {/* Seller Split */}
      {sellerCount > 1 && (
        <>
          <Text style={styles.sectionLabel}>{t('checkout.sellerSplit')}</Text>
          <View style={[styles.sellerSummary, sellerCount > 1 && styles.sellerSummaryMixed]}>
            <View style={styles.sellerSummaryTitleRow}>
              <MaterialCommunityIcons name="store-alert-outline" size={18} color={COLORS.yellow} />
              <Text style={styles.sellerSummaryTitle}>
                {t('checkout.sellersInCheckout', { count: sellerCount, plural: t('checkout.sellers') })}
              </Text>
            </View>
            {sellerGroups.map(group => (
              <View key={group.sellerId} style={styles.sellerGroupRow}>
                <Text style={styles.sellerGroupName} numberOfLines={1}>{group.sellerName}</Text>
                <Text style={styles.sellerGroupMeta}>
                  {group.itemCount} {group.itemCount === 1 ? t('checkout.item') : t('checkout.items')} - {formatPrice(group.total)} G
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Promo Code */}
      <Text style={styles.sectionLabel}>Promo Code</Text>
      <View style={styles.promoRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="Enter promo code"
          placeholderTextColor={COLORS.text2}
          value={promoCode}
          onChangeText={setPromoCode}
          autoCapitalize="characters"
          accessibilityLabel="promo code"
        />
        {discount > 0 && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>-{formatPrice(discount)} G</Text>
          </View>
        )}
      </View>
    </>
  );

  /* ── Bottom Bar Content ── */
  const renderBottomBar = () => {
    if (step < 3) {
      return (
        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={advanceStep}
          accessibilityLabel="continue"
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>{t('checkout.continue')}</Text>
          <MaterialCommunityIcons name="arrow-right" size={18} color={COLORS.white} />
        </TouchableOpacity>
      );
    }

    return (
      <>
        <View style={styles.stickyTotalRow}>
          {discount > 0 && (
            <View style={styles.stickyTotalLine}>
              <Text style={[styles.stickyTotalLabel, { color: COLORS.text2, textDecorationLine: 'line-through' }]}>{formatPrice(subtotal)} G</Text>
              <Text style={[styles.stickyTotalDiscount, { color: COLORS.green }]}>-{formatPrice(discount)} G</Text>
            </View>
          )}
          <View style={styles.stickyTotalLine}>
            <Text style={styles.stickyTotalLabel}>{t('common.total')}</Text>
            <Text style={styles.stickyTotalValue}>{formatPrice(finalTotal)} G</Text>
          </View>
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
            <Text style={styles.ctaText}>Pay {paymentMethod === 'moncash' ? 'MonCash' : 'NatCash'} · {formatPrice(finalTotal)} G</Text>
          )}
        </TouchableOpacity>
      </>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.container}>
        <ScreenHeader
          title={t('checkout.title')}
          onBack={() => step > 1 ? setStep((step - 1) as CheckoutStep) : navigation.goBack()}
        />
        <StepIndicator step={step} />
        <ScrollView contentContainerStyle={styles.content}>
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </ScrollView>
        <View style={[styles.stickyBottom, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {renderBottomBar()}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/* ── Styles ─────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingBottom: 16 },

  /* Step Indicator */
  stepIndicator: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  stepItem: { alignItems: 'center', gap: 4 },
  stepCircle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.surface2, borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepCircleActive: { backgroundColor: COLORS.coral, borderColor: COLORS.coral },
  stepNum: { fontSize: FONT_SIZES.sm, fontWeight: FONT_WEIGHTS.bold, color: COLORS.text2 },
  stepNumActive: { color: COLORS.white },
  stepLabel: { fontSize: 9, color: COLORS.text3, fontWeight: FONT_WEIGHTS.medium, maxWidth: 70, textAlign: 'center' },
  stepLabelActive: { color: COLORS.coral, fontWeight: FONT_WEIGHTS.bold },
  stepLine: { width: 32, height: 1.5, backgroundColor: COLORS.border, marginHorizontal: 4, marginBottom: 16 },
  stepLineActive: { backgroundColor: COLORS.coral },

  /* Section Label */
  sectionLabel: {
    fontSize: FONT_SIZES.xs, color: COLORS.text2, fontWeight: FONT_WEIGHTS.bold,
    textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: SPACING.md,
    marginTop: SPACING.md, marginBottom: 8,
  },

  /* Delivery Method */
  methodRow: { flexDirection: 'row', gap: 10, paddingHorizontal: SPACING.md },
  methodCard: {
    flex: 1, height: 90, alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: RADIUS.card, backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border,
  },
  methodActive: { borderColor: COLORS.coral, backgroundColor: COLORS.coralMuted },
  methodTitle: { fontSize: FONT_SIZES.base, color: COLORS.text2, fontWeight: FONT_WEIGHTS.semibold },
  methodTextActive: { color: COLORS.coral, fontWeight: FONT_WEIGHTS.bold },
  methodHint: { fontSize: FONT_SIZES.xs, color: COLORS.text3 },

  /* Fields */
  fields: { paddingHorizontal: SPACING.md },
  input: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.row,
    padding: 12, color: COLORS.text, fontSize: FONT_SIZES.base, marginBottom: 8, minHeight: TOUCH.min,
  },

  /* Addresses */
  addressList: { gap: 8, marginBottom: 12 },
  addressCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.row, padding: 12,
  },
  addressCardActive: { borderColor: COLORS.coral, backgroundColor: COLORS.coralMuted },
  addressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  addressLabel: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addressLabelText: { fontSize: FONT_SIZES.xs, fontWeight: FONT_WEIGHTS.bold, color: COLORS.blue, textTransform: 'uppercase' },
  defaultBadge: { backgroundColor: COLORS.greenMuted, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  defaultBadgeText: { fontSize: 9, fontWeight: FONT_WEIGHTS.bold, color: COLORS.green },
  addressName: { fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.text },
  addressText: { fontSize: FONT_SIZES.sm, color: COLORS.text2, marginTop: 2 },
  addAddressLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  addAddressText: { fontSize: FONT_SIZES.sm, color: COLORS.coral, fontWeight: FONT_WEIGHTS.semibold },

  /* Meetup */
  meetupAddressPreview: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingHorizontal: 4 },
  meetupAddressText: { flex: 1, fontSize: FONT_SIZES.sm, color: COLORS.text2 },

  /* Payment Buttons */
  payBtnRow: { flexDirection: 'row', gap: 10, paddingHorizontal: SPACING.md, justifyContent: 'center' },
  payBtnTouch: { width: 178, height: 107, alignItems: 'center', justifyContent: 'center' },
  payOuter: {
    position: 'relative', width: 178, height: 107, borderRadius: 14,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#12172a',
  },
  laserBgSquare: { position: 'absolute', top: -62, left: -26, width: 230, height: 230 },
  moncashGlow: {
    shadowColor: '#8b5cf6', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55, shadowRadius: 14, elevation: 10,
  },
  glassOverlay: {
    ...StyleSheet.absoluteFill, borderRadius: 14,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.45)',
  },
  glassOverlayGradient: { ...StyleSheet.absoluteFill, borderRadius: 14 },
  glassShimmerClip: { ...StyleSheet.absoluteFill, borderRadius: 14, overflow: 'hidden' },
  glassShimmerBand: { position: 'absolute', top: -64.2, width: 97.9, height: 235.4 },
  glassShimmerGradient: { flex: 1 },
  inactiveBorder: { ...StyleSheet.absoluteFill, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  payLogoWrap: {
    width: 170, height: 99, borderRadius: 12, backgroundColor: '#0e1322',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  payLogo: { width: '100%', height: '100%' },
  payLogoBottomShadow: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 18 },

  /* Trust Signals */
  trustSignals: {
    gap: 8, paddingHorizontal: SPACING.md, marginTop: SPACING.lg,
    backgroundColor: COLORS.surface, marginHorizontal: SPACING.md, borderRadius: RADIUS.card,
    padding: 14, borderWidth: 1, borderColor: COLORS.border,
  },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trustText: { fontSize: FONT_SIZES.sm, color: COLORS.text2, flex: 1 },

  /* Order Summary (Step 3) */
  orderSummaryContainer: {
    marginHorizontal: SPACING.md, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.card, overflow: 'hidden',
  },
  orderItemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  orderItemThumb: {
    width: 44, height: 44, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface2,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
  orderItemImg: { width: '100%', height: '100%' },
  orderItemInfo: { flex: 1, minWidth: 0, gap: 2 },
  orderItemName: { fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.text },
  orderItemSeller: { fontSize: FONT_SIZES.xs, color: COLORS.text2 },
  orderItemQty: { fontSize: FONT_SIZES.sm, color: COLORS.text2, fontWeight: FONT_WEIGHTS.semibold },
  orderItemPrice: { fontSize: FONT_SIZES.base, color: COLORS.coral, fontWeight: FONT_WEIGHTS.bold },

  /* Summary Cards */
  summaryCard: {
    marginHorizontal: SPACING.md, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.card, padding: 14, gap: 8,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryPayIcon: { width: 20, height: 20, borderRadius: 4 },
  summaryLabel: { flex: 1, fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.text },
  summaryDetails: { gap: 2, paddingLeft: 24 },
  summaryDetail: { fontSize: FONT_SIZES.sm, color: COLORS.text2 },

  /* Seller Summary */
  sellerSummary: {
    marginHorizontal: SPACING.md, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.card, padding: 12, gap: 8,
  },
  sellerSummaryMixed: { borderColor: COLORS.yellow + '66', backgroundColor: COLORS.yellow + '0D' },
  sellerSummaryTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sellerSummaryTitle: { fontSize: FONT_SIZES.base, color: COLORS.text, fontWeight: FONT_WEIGHTS.extrabold },
  sellerGroupRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    paddingTop: 6, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  sellerGroupName: { flex: 1, fontSize: FONT_SIZES.sm, color: COLORS.text, fontWeight: FONT_WEIGHTS.bold },
  sellerGroupMeta: { fontSize: FONT_SIZES.xs, color: COLORS.text2 },

  /* Promo */
  promoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: SPACING.md },
  discountBadge: {
    backgroundColor: COLORS.greenMuted, borderRadius: RADIUS.sm,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  discountText: { fontSize: FONT_SIZES.sm, fontWeight: FONT_WEIGHTS.bold, color: COLORS.green },

  /* Bottom Bar */
  stickyBottom: {
    backgroundColor: COLORS.bg, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 8,
  },
  stickyTotalRow: { paddingHorizontal: SPACING.md },
  stickyTotalLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  stickyTotalLabel: { fontSize: FONT_SIZES.base, color: COLORS.text2 },
  stickyTotalDiscount: { fontSize: FONT_SIZES.sm, fontWeight: FONT_WEIGHTS.semibold },
  stickyTotalValue: { fontSize: 20, color: COLORS.coral, fontWeight: FONT_WEIGHTS.extrabold, fontFamily: FONTS.heading },
  ctaBtn: {
    marginHorizontal: SPACING.md, marginTop: 8, backgroundColor: COLORS.coral,
    borderRadius: RADIUS.button, padding: 14, alignItems: 'center', flexDirection: 'row',
    justifyContent: 'center', gap: 6, minHeight: TOUCH.min,
  },
  ctaBtnDisabled: { opacity: 0.6 },
  ctaText: { fontSize: FONT_SIZES.md, color: COLORS.white, fontWeight: FONT_WEIGHTS.bold },
});
