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
import { COLORS, SPACING, RADIUS, formatPrice } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../i18n';
import { validatePromo } from '../api';
import ScreenHeader from '../components/ScreenHeader';
import { store } from '../store';
import { createPendingCheckout, getPendingSellerInfo, getAddresses, getImageUrl } from '../api';
import type { RootStackParamList } from '../navigation';
import type { Address } from '../types';
import SalePriceTag from '../components/SalePriceTag';
import { notifySuccess, notifyError } from '../haptics';
import { useToast } from '../components/Toast';
import LocationPicker from '../components/LocationPicker';
import { network } from '../network';

type Props = NativeStackScreenProps<RootStackParamList, 'Checkout'>;
type DeliveryMethod = 'delivery' | 'meetup';
type Step = 1 | 2 | 3;
import moncashLogo from '../../assets/MonNatCash/moncash.webp';
import natcashLogo from '../../assets/MonNatCash/natcash.webp';

function Stepper({current}:{current:Step}){const{t}=useTranslation();const l=[t("checkout.step1Title"),t("checkout.step2Title"),t("checkout.step3Title")];return(<View style={st.container}>{[1,2,3].map((s,i)=>(<React.Fragment key={s}>{i>0&&<View style={[st.line,s<=current&&st.lineActive]}/>}<View style={st.stepWrap}><View style={[st.circle,s<=current&&st.circleActive,s===current&&st.circleCurrent]}>{s<current?<MaterialCommunityIcons name="check" size={14} color={COLORS.white}/>:<Text style={[st.circleText,s<=current&&st.circleTextActive]}>{s}</Text>}</View><Text style={[st.label,s===current&&st.labelActive]} numberOfLines={1}>{l[i]}</Text></View></React.Fragment>))}</View>);}
const st=StyleSheet.create({container:{flexDirection:"row",alignItems:"flex-start",justifyContent:"center",paddingHorizontal:SPACING.lg,paddingVertical:SPACING.md},stepWrap:{alignItems:"center",gap:6,minWidth:80},line:{flex:1,height:2,backgroundColor:COLORS.border,marginTop:13,marginHorizontal:-4},lineActive:{backgroundColor:COLORS.coral},circle:{width:28,height:28,borderRadius:14,borderWidth:2,borderColor:COLORS.border,alignItems:"center",justifyContent:"center",backgroundColor:COLORS.bg},circleActive:{borderColor:COLORS.coral,backgroundColor:COLORS.coral+"20"},circleCurrent:{borderColor:COLORS.coral,backgroundColor:COLORS.coral},circleText:{fontSize:12,fontWeight:"700",color:COLORS.text2},circleTextActive:{color:COLORS.white},label:{fontSize:10,color:COLORS.text2,textAlign:"center",fontWeight:"500"},labelActive:{color:COLORS.text,fontWeight:"700"}});

export default function CheckoutScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const cart = store.cart;
  const [method, setMethod] = useState<DeliveryMethod>('delivery');
  const [step, setStep] = useState<Step>(1);
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
  const [fulfillmentMethods, setFulfillmentMethods] = useState<Record<string, DeliveryMethod>>({});

  // ---- "Laser Conic Sweep" (bar-for-bar port of the HTML mockup) ----
  // CSS: .laser-bg { conic-gradient(from var(--angle-a), transparent 60%,
  //   #3b82f6, #8b5cf6, #ec4899); animation: spin-a 3s linear infinite; }
  // RN has no conic-gradient, so this is faked with a square LinearGradient
  // large enough to cover the button at any angle, rotated continuously.
  // Both MonCash and NatCash use this exact same animation — the mockup
  // has ONE shared laser-bg style applied to both buttons, not two.
  const laserRotation = useSharedValue(0);
  useEffect(() => {
    laserRotation.value = withRepeat(
      withTiming(360, { duration: 3000, easing: Easing.linear }),
      -1,
      false,
    );
  }, []);
  const animatedLaserStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${laserRotation.value}deg` }],
  }));

  // ---- Glass shimmer sweep (bar-for-bar port of .glass-shimmer::before) ----
  // CSS: left -160% -> 160% over 0%-45% of a 3.4s cycle, ease-in-out, then
  // holds at 160% (off-canvas) for the remaining 45%-100% before looping.
  const shimmerProgress = useSharedValue(0);
  useEffect(() => {
    shimmerProgress.value = withRepeat(
      withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
  }, []);
  const animatedShimmerStyle = useAnimatedStyle(() => {
    // Map the 0-1 driver onto the CSS keyframe: 0%->45% sweeps, 45%->100% holds.
    const t = shimmerProgress.value <= 0.45 ? shimmerProgress.value / 0.45 : 1;
    // Button width is 178px; -160%/160% of that width, per the CSS.
    const left = -160 * 1.78 + (160 * 1.78 - -160 * 1.78) * t;
    return { left };
  });

  const fetchAddresses = useCallback(async () => {
    try {
      const res = await getAddresses() as { addresses?: Address[] };
      setSavedAddresses(res.addresses || []);
    } catch { /* silent */ }
  }, []);

  useFocusEffect(useCallback(() => {
    fetchAddresses();
    // Re-sync delivery fields from store.user when screen gains focus
    const user = store.user;
    if (user) {
      setName(user.full_name || '');
      setPhone(user.phone || '');
      setAddress(user.location_address || '');
      setCity(user.location_city || '');
    }
  }, [fetchAddresses]));

  const prevUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    const user = store.user;
    const uid = user?.id || null;
    if (uid !== prevUserIdRef.current) {
      // User changed (login/switch) — reset checkout fields
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

  // Auto-select default saved address if no delivery fields are filled
  useEffect(() => {
    if (savedAddresses.length > 0 && !selectedAddressId && !address && !city) {
      const defaultAddr = savedAddresses.find(a => a.is_default) || savedAddresses[0];
      selectAddress(defaultAddr);
    }
  }, [savedAddresses]);

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

  useEffect(() => {
    setFulfillmentMethods(current => {
      const next = { ...current };
      for (const seller of sellerGroups) if (!next[seller.sellerId]) next[seller.sellerId] = method;
      return next;
    });
  }, [sellerGroups.map(group => group.sellerId).join(','), method]);

  const setAllFulfillmentMethods = (nextMethod: DeliveryMethod) => {
    setMethod(nextMethod);
    setFulfillmentMethods(Object.fromEntries(sellerGroups.map(seller => [seller.sellerId, nextMethod])));
  };

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

    const selectedMethods = sellerGroups.map(seller => fulfillmentMethods[seller.sellerId] || method);
    if (selectedMethods.includes('delivery') && (!name || !phone || !address || !city)) {
      toast.error(t('checkout.missingInfo'), t('checkout.fillRequired'));
      return;
    }

    if (selectedMethods.includes('meetup') && (!meetupLat || !meetupLng)) {
      toast.error(t('checkout.missingInfo'), t('checkout.selectMeetupLocation'));
      return;
    }
    const buyerLat = Number(store.user?.location_lat);
    const buyerLng = Number(store.user?.location_lng);
    if (selectedMethods.includes('delivery') && (!Number.isFinite(buyerLat) || !Number.isFinite(buyerLng))) {
      toast.error('Location needed', 'Set your precise delivery location in Settings before choosing delivery.');
      return;
    }

    setLoading(true);
    try {
      // Build cart data for deferred checkout — no order created yet
      const cartData = cart.map(item => ({
        id: item.id, productId: item.id, quantity: item.quantity,
        name: item.name, price: item.effective_price ?? item.price,
        seller_id: item.seller_id, store_name: item.store_name,
        seller_name: item.seller_name, images: item.images
      }));
      const checkoutData: Record<string, unknown> = {
        cart: cartData, deliveryMethod: method, paymentMethod,
        totalAmount: finalTotal, promoCode: promoCode.trim() || undefined,
        fulfillmentSelections: sellerGroups.map(seller => {
          const sellerMethod = fulfillmentMethods[seller.sellerId] || method;
          return sellerMethod === 'delivery'
            ? { sellerId: seller.sellerId, method: 'delivery', location: { lat: buyerLat, lng: buyerLng, address, note } }
            : { sellerId: seller.sellerId, method: 'meetup', location: { lat: meetupLat, lng: meetupLng, address: meetupAddress, note } };
        }),
      };
      if (method === 'delivery') {
        checkoutData.deliveryName = name; checkoutData.deliveryPhone = phone;
        checkoutData.deliveryAddress = address; checkoutData.deliveryCity = city;
        checkoutData.deliveryNote = note;
      } else {
        checkoutData.meetupLat = meetupLat; checkoutData.meetupLng = meetupLng;
        checkoutData.meetupAddress = meetupAddress; checkoutData.meetupName = meetupName;
        checkoutData.deliveryNote = note;
      }
      // Save pending checkout server-side (no order created yet)
      const res = await createPendingCheckout(checkoutData) as { paymentUrl?: string; pendingId: string; paymentMethod?: string; fulfillmentFee?: number };
      const payableTotal = finalTotal + Number(res.fulfillmentFee || 0);
      if (paymentMethod === 'moncash' && res.paymentUrl) {
        // Store pending ID so we can detect abandonment when user returns
        try {
          const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
          await AsyncStorage.setItem('mm_pending_payment', JSON.stringify({ pendingId: res.pendingId, createdAt: Date.now() }));
        } catch {}
        // Redirect to MonCash — cart stays intact until payment confirmed
        await Linking.openURL(res.paymentUrl);
        navigation.replace('PaymentReturn', { pendingId: res.pendingId });
      } else {
        // NatCash: fetch seller info, then navigate to NatCashPayment screen
        const sellerInfo = await getPendingSellerInfo(res.pendingId) as { sellers?: Array<{ sellerId: string; name: string; phone: string; total: number; items: Array<{ name: string; price: number; quantity: number }> }>; sellerName?: string; sellerPhone?: string; sellerCount?: number };
        const sellers = sellerInfo.sellers || [];
        if (sellers.length > 1) {
          // Multi-seller: pass all seller data
          navigation.replace('NatCashPayment', {
            pendingId: res.pendingId,
            total: payableTotal,
            sellers: sellers.map(s => ({
              sellerId: s.sellerId,
              name: s.name || 'Seller',
              phone: s.phone || '',
              total: s.total,
              items: s.items,
            })),
          });
        } else {
          // Single seller: legacy format
          navigation.replace('NatCashPayment', {
            pendingId: res.pendingId,
            total: payableTotal,
            sellerName: sellerInfo.sellerName || sellers[0]?.name || 'Seller',
            sellerPhone: sellerInfo.sellerPhone || sellers[0]?.phone || '',
          });
        }
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

  const canContinue = (): boolean => {
    if (step === 1) {
      const methods = sellerGroups.map(seller => fulfillmentMethods[seller.sellerId] || method);
      const deliveryReady = !methods.includes('delivery') || !!(name && phone && address && city && Number.isFinite(Number(store.user?.location_lat)) && Number.isFinite(Number(store.user?.location_lng)));
      const meetupReady = !methods.includes('meetup') || !!(meetupLat && meetupLng);
      return deliveryReady && meetupReady;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 3) { handleCheckout(); return; }
    if (canContinue()) setStep((step + 1) as Step);
  };
  const renderStep1 = () => (<ScrollView contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
    <Text style={styles.stepLabel}>{t("checkout.delivery")}</Text>
    <View style={styles.methodRow}>
      <TouchableOpacity style={[styles.methodCard, method==="delivery"&&styles.methodActive]} onPress={()=>setAllFulfillmentMethods("delivery")} accessibilityRole="button"><Icon name="delivery" size={22} color={method==="delivery"?COLORS.coral:COLORS.text2}/><Text style={[styles.methodTitle,method==="delivery"&&styles.methodTitleActive]}>{t("checkout.delivery")}</Text><Text style={styles.methodSub}>{t("checkout.deliverySubtitle")}</Text></TouchableOpacity>
      <TouchableOpacity style={[styles.methodCard, method==="meetup"&&styles.methodActive]} onPress={()=>setAllFulfillmentMethods("meetup")} accessibilityRole="button"><Icon name="location-pin" size={22} color={method==="meetup"?COLORS.coral:COLORS.text2}/><Text style={[styles.methodTitle,method==="meetup"&&styles.methodTitleActive]}>{t("checkout.meetup")}</Text><Text style={styles.methodSub}>{t("checkout.meetupSubtitle")}</Text></TouchableOpacity>
    </View>
    {sellerCount > 1 && <><Text style={styles.stepLabel}>Choose for each seller</Text><View style={styles.fulfillmentCard}>{sellerGroups.map((seller, index) => { const sellerMethod = fulfillmentMethods[seller.sellerId] || method; return <View key={seller.sellerId} style={[styles.sellerFulfillmentRow, index < sellerGroups.length - 1 && styles.reviewItemBorder]}><View style={styles.sellerFulfillmentCopy}><Text style={styles.sellerFulfillmentName} numberOfLines={1}>{seller.sellerName}</Text><Text style={styles.sellerFulfillmentMeta}>{seller.itemCount} {seller.itemCount === 1 ? t('checkout.item') : t('checkout.items')}</Text></View><View style={styles.fulfillmentChoices}><TouchableOpacity style={[styles.choiceChip, sellerMethod === 'delivery' && styles.choiceChipActive]} onPress={() => setFulfillmentMethods(current => ({ ...current, [seller.sellerId]: 'delivery' }))} accessibilityRole="button"><Text style={[styles.choiceChipText, sellerMethod === 'delivery' && styles.choiceChipTextActive]}>Delivery</Text></TouchableOpacity><TouchableOpacity style={[styles.choiceChip, sellerMethod === 'meetup' && styles.choiceChipActive]} onPress={() => setFulfillmentMethods(current => ({ ...current, [seller.sellerId]: 'meetup' }))} accessibilityRole="button"><Text style={[styles.choiceChipText, sellerMethod === 'meetup' && styles.choiceChipTextActive]}>Meetup</Text></TouchableOpacity></View></View>; })}</View></>}
    {sellerGroups.some(seller => (fulfillmentMethods[seller.sellerId] || method) === 'delivery') && <><Text style={styles.stepLabel}>{t("checkout.deliveryInfo")}</Text>
      <TextInput style={styles.input} placeholder={t("checkout.fullName")} placeholderTextColor={COLORS.text2} value={name} onChangeText={setName}/>
      <TextInput style={styles.input} placeholder={t("checkout.phone")} placeholderTextColor={COLORS.text2} value={phone} onChangeText={setPhone} keyboardType="phone-pad"/>
      <TextInput style={styles.input} placeholder={t("checkout.address")} placeholderTextColor={COLORS.text2} value={address} onChangeText={setAddress}/>
      <TextInput style={styles.input} placeholder={t("checkout.city")} placeholderTextColor={COLORS.text2} value={city} onChangeText={setCity}/>
      <TextInput style={styles.input} placeholder={t("checkout.note")} placeholderTextColor={COLORS.text2} value={note} onChangeText={setNote} multiline/>
    </>}
    {sellerGroups.some(seller => (fulfillmentMethods[seller.sellerId] || method) === 'meetup') && <><Text style={styles.stepLabel}>{t("checkout.meetupLocation")}</Text>
      <LocationPicker onLocationSelect={(la,lo,a)=>{setMeetupLat(la);setMeetupLng(lo);setMeetupAddress(a);}} initialLat={meetupLat} initialLng={meetupLng} height={220}/>
      {meetupAddress&&<View style={styles.meetupPreview}><MaterialCommunityIcons name="map-marker" size={14} color={COLORS.coral}/><Text style={styles.meetupPreviewText} numberOfLines={2}>{meetupAddress}</Text></View>}
      <TextInput style={styles.input} placeholder="Your name for pickup" placeholderTextColor={COLORS.text2} value={meetupName} onChangeText={setMeetupName}/>
      <TextInput style={styles.input} placeholder={t("checkout.meetupNote")} placeholderTextColor={COLORS.text2} value={note} onChangeText={setNote} multiline/>
    </>}
  </ScrollView>);
  const renderStep2 = () => (<ScrollView contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
    <Text style={styles.stepLabel}>{t("checkout.payment")}</Text>
    <View style={styles.paymentOptions}>
      <TouchableOpacity style={[styles.paymentCard,paymentMethod==="moncash"&&styles.paymentCardActive]} onPress={()=>setPaymentMethod("moncash")} accessibilityRole="button"><View style={styles.paymentCardLeft}><Image source={moncashLogo} style={styles.paymentLogo} resizeMode="cover"/><View style={styles.paymentInfo}><Text style={styles.paymentName}>MonCash</Text><Text style={styles.paymentSub}>{t("checkout.securePayment")}</Text></View></View><View style={[styles.radio,paymentMethod==="moncash"&&styles.radioActive]}>{paymentMethod==="moncash"&&<View style={styles.radioDot}/>}</View></TouchableOpacity>
      <TouchableOpacity style={[styles.paymentCard,paymentMethod==="natcash"&&styles.paymentCardActive]} onPress={()=>setPaymentMethod("natcash")} accessibilityRole="button"><View style={styles.paymentCardLeft}><Image source={natcashLogo} style={styles.paymentLogo} resizeMode="cover"/><View style={styles.paymentInfo}><Text style={styles.paymentName}>NatCash</Text><Text style={styles.paymentSub}>Pay directly via NatCash</Text></View></View><View style={[styles.radio,paymentMethod==="natcash"&&styles.radioActive]}>{paymentMethod==="natcash"&&<View style={styles.radioDot}/>}</View></TouchableOpacity>
    </View>
    <View style={styles.trustBox}><MaterialCommunityIcons name="information-outline" size={16} color={COLORS.blue}/><Text style={styles.trustText}>{t("checkout.secureNote")}</Text></View>
    <View style={styles.trustRow}><MaterialCommunityIcons name="shield-check" size={16} color={COLORS.green}/><Text style={styles.trustItem}>{t("checkout.trustProtected")}</Text></View>
    {paymentMethod==="moncash"&&<View style={styles.trustRow}><MaterialCommunityIcons name="lock-check" size={16} color={COLORS.green}/><Text style={styles.trustItem}>{t("checkout.trustHeld")}</Text></View>}
    {paymentMethod==="natcash"&&<View style={styles.trustRow}><MaterialCommunityIcons name="swap-horizontal" size={16} color={COLORS.blue}/><Text style={styles.trustItem}>NatCash sends payment directly from you to the seller</Text></View>}
  </ScrollView>);
  const renderStep3 = () => (<ScrollView contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
    <Text style={styles.stepLabel}>{t("checkout.orderSummary")}</Text>
    <View style={styles.reviewCard}>{cart.map((item,idx)=>{const img=item.images?.find(i=>i.is_primary)||item.images?.[0];const url=getImageUrl(img?.image_url);return(<View key={item.id} style={[styles.reviewItem,idx<cart.length-1&&styles.reviewItemBorder]}><View style={styles.reviewThumb}>{url?<Image source={{uri:url}} style={styles.reviewThumbImg} resizeMode="cover"/>:<Icon name="image-unavailable" size={16} color={COLORS.text2}/>}</View><View style={styles.reviewItemInfo}><Text style={styles.reviewItemName} numberOfLines={1}>{item.name}</Text><Text style={styles.reviewItemQty}>x{item.quantity}</Text></View><Text style={styles.reviewItemPrice}>{formatPrice((item.effective_price??item.price)*item.quantity)} G</Text></View>);})}</View>
    <View style={styles.totalsCard}>
      <View style={styles.totalLine}><Text style={styles.totalLabel}>{t("checkout.items")} ({itemCount})</Text><Text style={styles.totalValue}>{formatPrice(subtotal)} G</Text></View>
      {discount>0&&<View style={styles.totalLine}><Text style={[styles.totalLabel,{color:COLORS.green}]}>{t("checkout.promoDiscount")} ({promoCode})</Text><Text style={[styles.totalValue,{color:COLORS.green}]}>-{formatPrice(discount)} G</Text></View>}
      <View style={[styles.totalLine,styles.totalLineFinal]}><Text style={styles.totalLabelFinal}>{t("common.total")}</Text><Text style={styles.totalValueFinal}>{formatPrice(finalTotal)} G</Text></View>
    </View>
    <Text style={styles.stepLabel}>{t("checkout.payment")}</Text>
    <View style={styles.paySummary}><Image source={paymentMethod==="moncash"?moncashLogo:natcashLogo} style={styles.paySummaryLogo} resizeMode="cover"/><View style={styles.paySummaryInfo}><Text style={styles.paySummaryName}>{paymentMethod==="moncash"?"MonCash":"NatCash"}</Text><Text style={styles.paySummarySub}>{t("checkout.securePayment")}</Text></View><TouchableOpacity onPress={()=>setStep(2)}><Text style={styles.changeLink}>{t("checkout.change")}</Text></TouchableOpacity></View>
    <View style={styles.trustBadges}><View style={styles.trustBadge}><MaterialCommunityIcons name="shield-lock" size={18} color={COLORS.green}/><Text style={styles.trustBadgeText}>{t("checkout.trustProtected")}</Text></View>{paymentMethod==="moncash"?<View style={styles.trustBadge}><MaterialCommunityIcons name="clock-check" size={18} color={COLORS.blue}/><Text style={styles.trustBadgeText}>{t("checkout.trustHeld")}</Text></View>:<View style={styles.trustBadge}><MaterialCommunityIcons name="swap-horizontal" size={18} color={COLORS.blue}/><Text style={styles.trustBadgeText}>Direct peer-to-peer transfer</Text></View>}</View>
  </ScrollView>);
  return (<KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==="ios"?"padding":"height"}><View style={styles.container}>
    <ScreenHeader title={step===1?t("checkout.step1Title"):step===2?t("checkout.step2Title"):t("checkout.step3Title")} onBack={()=>step>1?setStep((step-1)as Step):navigation.goBack()}/>
    <Stepper current={step}/>
    {step===1&&renderStep1()}{step===2&&renderStep2()}{step===3&&renderStep3()}
    <View style={[styles.bottomBar,{paddingBottom:Math.max(insets.bottom,12)}]}>
      {step<3&&<View style={styles.bottomTotalRow}><Text style={styles.bottomTotalLabel}>{t("common.total")}</Text><Text style={styles.bottomTotalValue}>{formatPrice(finalTotal)} G</Text></View>}
      <TouchableOpacity style={[styles.ctaBtn,(!canContinue()||loading)&&styles.ctaBtnDisabled]} onPress={handleNext} disabled={!canContinue()||loading} accessibilityRole="button">
        {loading?<ActivityIndicator color={COLORS.white}/>:<View style={styles.ctaRow}><Text style={styles.ctaText}>{step===3?t("checkout.payButton",{amount:formatPrice(finalTotal)+" G"}):t("checkout.continue")}</Text><MaterialCommunityIcons name={step===3?"lock":"arrow-right"} size={18} color={COLORS.white}/></View>}
      </TouchableOpacity>
    </View>
  </View></KeyboardAvoidingView>);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  stepContent: { paddingBottom: 24 },
  stepLabel: { fontSize: 11, color: COLORS.text2, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, paddingHorizontal: SPACING.lg, marginTop: SPACING.lg, marginBottom: 8 },
  methodRow: { flexDirection: "row", gap: 10, paddingHorizontal: SPACING.lg },
  methodCard: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 16, borderRadius: RADIUS.card, backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border },
  methodActive: { borderColor: COLORS.coral, backgroundColor: COLORS.coral + "08" },
  methodTitle: { fontSize: 14, fontWeight: "700", color: COLORS.text2 },
  methodTitleActive: { color: COLORS.coral },
  methodSub: { fontSize: 11, color: COLORS.text2, textAlign: "center" },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.row, padding: 12, color: COLORS.text, fontSize: 13, marginBottom: 8, marginHorizontal: SPACING.lg },
  meetupPreview: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, paddingHorizontal: SPACING.lg },
  meetupPreviewText: { flex: 1, fontSize: 12, color: COLORS.text2 },
  fulfillmentCard: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.card, overflow: 'hidden' },
  sellerFulfillmentRow: { padding: 12, gap: 10 },
  sellerFulfillmentCopy: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  sellerFulfillmentName: { flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.text },
  sellerFulfillmentMeta: { fontSize: 11, color: COLORS.text2 },
  fulfillmentChoices: { flexDirection: 'row', gap: 8 },
  choiceChip: { flex: 1, minHeight: 44, borderRadius: RADIUS.row, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  choiceChipActive: { backgroundColor: COLORS.coral + '16', borderColor: COLORS.coral },
  choiceChipText: { fontSize: 12, fontWeight: '700', color: COLORS.text2 },
  choiceChipTextActive: { color: COLORS.coral },
  paymentOptions: { gap: 10, paddingHorizontal: SPACING.lg },
  paymentCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.card, padding: 14 },
  paymentCardActive: { borderColor: COLORS.coral, backgroundColor: COLORS.coral + "08" },
  paymentCardLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  paymentLogo: { width: 44, height: 44, borderRadius: 10 },
  paymentInfo: { gap: 2 },
  paymentName: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  paymentSub: { fontSize: 12, color: COLORS.text2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: COLORS.coral },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.coral },
  trustBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginHorizontal: SPACING.lg, marginTop: SPACING.lg, padding: 12, backgroundColor: COLORS.blue + "10", borderRadius: RADIUS.row, borderWidth: 1, borderColor: COLORS.blue + "30" },
  trustText: { flex: 1, fontSize: 12, color: COLORS.text2, lineHeight: 18 },
  trustRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: SPACING.lg, marginTop: 8 },
  trustItem: { fontSize: 12, color: COLORS.text2 },
  reviewCard: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.card, overflow: "hidden" },
  reviewItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  reviewItemBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  reviewThumb: { width: 44, height: 44, borderRadius: 6, backgroundColor: COLORS.surface2, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  reviewThumbImg: { width: "100%", height: "100%" },
  reviewItemInfo: { flex: 1, minWidth: 0, gap: 2 },
  reviewItemName: { fontSize: 13, fontWeight: "600", color: COLORS.text },
  reviewItemQty: { fontSize: 11, color: COLORS.text2 },
  reviewItemPrice: { fontSize: 13, color: COLORS.coral, fontWeight: "700" },
  totalsCard: { marginHorizontal: SPACING.lg, marginTop: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.card, padding: 14, gap: 8 },
  totalLine: { flexDirection: "row", justifyContent: "space-between" },
  totalLabel: { fontSize: 13, color: COLORS.text2 },
  totalValue: { fontSize: 13, color: COLORS.text, fontWeight: "600" },
  totalLineFinal: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 8, marginTop: 4 },
  totalLabelFinal: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  totalValueFinal: { fontSize: 18, fontWeight: "800", color: COLORS.coral },
  paySummary: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: SPACING.lg, padding: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.card },
  paySummaryLogo: { width: 36, height: 36, borderRadius: 8 },
  paySummaryInfo: { flex: 1, gap: 2 },
  paySummaryName: { fontSize: 13, fontWeight: "700", color: COLORS.text },
  paySummarySub: { fontSize: 11, color: COLORS.text2 },
  changeLink: { fontSize: 13, fontWeight: "700", color: COLORS.coral },
  trustBadges: { gap: 8, paddingHorizontal: SPACING.lg, marginTop: 16 },
  trustBadge: { flexDirection: "row", alignItems: "center", gap: 8 },
  trustBadgeText: { fontSize: 12, color: COLORS.text2 },
  bottomBar: { backgroundColor: COLORS.bg, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 8, paddingHorizontal: SPACING.lg },
  bottomTotalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  bottomTotalLabel: { fontSize: 13, color: COLORS.text2 },
  bottomTotalValue: { fontSize: 18, fontWeight: "800", color: COLORS.coral },
  ctaBtn: { backgroundColor: COLORS.coral, borderRadius: RADIUS.button, padding: 15, alignItems: "center" },
  ctaBtnDisabled: { opacity: 0.5 },
  ctaRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  ctaText: { fontSize: 15, color: COLORS.white, fontWeight: "700" },
});
