import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator, Linking,
  KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SPACING, RADIUS } from '../theme';
import { useTranslation } from '../i18n';
import ScreenHeader from '../components/ScreenHeader';
import { store } from '../store';
import { createOrder, createPayment, getAddresses, getImageUrl } from '../api';
import type { RootStackParamList } from '../navigation';
import type { Address } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Checkout'>;

type DeliveryMethod = 'delivery' | 'meetup';

export default function CheckoutScreen({ route, navigation }: Props) {
  const { t } = useTranslation();

  const cart = store.cart;
  const [method, setMethod] = useState<DeliveryMethod>('delivery');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [promoCode, setPromoCode] = useState(route.params?.promoCode || '');
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);

  const fetchAddresses = useCallback(async () => {
    try {
      const res = await getAddresses() as { addresses?: Address[] };
      setSavedAddresses(res.addresses || []);
    } catch { /* silent */ }
  }, []);

  useFocusEffect(useCallback(() => { fetchAddresses(); }, [fetchAddresses]));

  const selectAddress = (addr: Address) => {
    setSelectedAddressId(addr.id);
    setName(addr.name);
    setPhone(addr.phone);
    setAddress(addr.address);
    setCity(addr.city);
  };

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const itemLabel = itemCount === 1 ? t('checkout.item') : t('checkout.items');
  const sellerGroups = cart.reduce<Array<{ sellerId: string; sellerName: string; itemCount: number; total: number }>>((groups, item) => {
    const sellerName = item.store_name || item.seller_name || `Seller ${item.seller_id.slice(0, 6)}`;
    const existing = groups.find(group => group.sellerId === item.seller_id);
    if (existing) {
      existing.itemCount += item.quantity;
      existing.total += item.price * item.quantity;
    } else {
      groups.push({ sellerId: item.seller_id, sellerName, itemCount: item.quantity, total: item.price * item.quantity });
    }
    return groups;
  }, []);
  const sellerCount = sellerGroups.length;

  const handleCheckout = async () => {
    if (cart.length === 0) {
      Alert.alert(t('checkout.cartEmpty'), t('checkout.addBeforeCheckout'));
      navigation.goBack();
      return;
    }

    if (method === 'delivery' && (!name || !phone || !address)) {
      Alert.alert(t('checkout.missingInfo'), t('checkout.fillRequired'));
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
      }

      const orderRes = await createOrder(orderData) as { order: { id: string } };

      try {
        const payRes = await createPayment(orderRes.order.id, `maurmaket://payment-return?orderId=${orderRes.order.id}`) as { paymentUrl: string };
        if (payRes.paymentUrl) {
          await Linking.openURL(payRes.paymentUrl);
          await store.clearCart();
        }
        navigation.navigate('Orders');
      } catch (paymentErr: unknown) {
        navigation.navigate('Orders');
        const msg = paymentErr instanceof Error ? paymentErr.message : 'Payment could not start.';
        Alert.alert(t('checkout.orderCreated'), `${msg}${t('checkout.retryPayment')}`);
      }
    } catch (e: unknown) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('checkout.checkoutFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader
        title={t('checkout.title')}
        onBack={() => navigation.goBack()}
        right={<Text style={styles.subtitle}>{itemCount} {itemLabel} - Rs {subtotal.toLocaleString()}</Text>}
      />

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
              {group.itemCount} {group.itemCount === 1 ? t('checkout.item') : t('checkout.items')} - Rs {group.total.toLocaleString()}
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
                  <MaterialCommunityIcons name="image-off-outline" size={16} color={COLORS.text2} />
                )}
              </View>
              <View style={styles.orderItemInfo}>
                <Text style={styles.orderItemName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.orderItemSeller} numberOfLines={1}>{sellerName}</Text>
              </View>
              <Text style={styles.orderItemQty}>x{item.quantity}</Text>
              <Text style={styles.orderItemPrice}>Rs {(item.price * item.quantity).toLocaleString()}</Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>Delivery method</Text>
      <View style={styles.methodRow}>
        <TouchableOpacity
          style={[styles.methodCard, method === 'delivery' && styles.methodActive]}
          onPress={() => setMethod('delivery')}
        >
          <MaterialCommunityIcons name="truck-delivery" size={20} color={method === 'delivery' ? COLORS.coral : COLORS.text2} />
          <Text style={[styles.methodText, method === 'delivery' && styles.methodTextActive]}>{t('checkout.delivery')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.methodCard, method === 'meetup' && styles.methodActive]}
          onPress={() => setMethod('meetup')}
        >
          <MaterialCommunityIcons name="map-marker" size={20} color={method === 'meetup' ? COLORS.coral : COLORS.text2} />
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
              >
                <MaterialCommunityIcons name="plus-circle-outline" size={16} color={COLORS.coral} />
                <Text style={styles.addAddressText}>{t('checkout.manageAddresses')}</Text>
              </TouchableOpacity>
            </>
          )}

          <Text style={styles.sectionLabel}>{t('checkout.deliveryInfo')}</Text>
          <TextInput style={styles.input} placeholder={t('checkout.fullName')} placeholderTextColor={COLORS.text2} value={name} onChangeText={setName} />
          <TextInput style={styles.input} placeholder={t('checkout.phone')} placeholderTextColor={COLORS.text2} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <TextInput style={styles.input} placeholder={t('checkout.address')} placeholderTextColor={COLORS.text2} value={address} onChangeText={setAddress} />
          <TextInput style={styles.input} placeholder={t('checkout.city')} placeholderTextColor={COLORS.text2} value={city} onChangeText={setCity} />
          <TextInput style={styles.input} placeholder={t('checkout.note')} placeholderTextColor={COLORS.text2} value={note} onChangeText={setNote} multiline />
        </View>
      ) : (
        <View style={styles.fields}>
          <View style={styles.meetupInfo}>
            <MaterialCommunityIcons name="information-outline" size={16} color={COLORS.blue} />
            <Text style={styles.meetupInfoText}>
              {t('checkout.meetupInfo')}
            </Text>
          </View>
        </View>
      )}

      <Text style={styles.sectionLabel}>{t('checkout.promoCode')}</Text>
      <View style={{ paddingHorizontal: SPACING.md }}>
        <TextInput
          style={styles.input}
          placeholder={t('checkout.enterPromo')}
          placeholderTextColor={COLORS.text2}
          value={promoCode}
          onChangeText={setPromoCode}
          autoCapitalize="characters"
        />
      </View>

      <Text style={styles.sectionLabel}>{t('checkout.payment')}</Text>
      <View style={styles.moncashBadge}>
        <MaterialCommunityIcons name="cellphone" size={18} color={COLORS.blue} />
        <Text style={styles.moncashText}>{t('checkout.moncashNote')}</Text>
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>{t('common.total')}</Text>
        <Text style={styles.totalValue}>Rs {subtotal.toLocaleString()}</Text>
      </View>

      <TouchableOpacity
        style={[styles.ctaBtn, loading && styles.ctaBtnDisabled]}
        onPress={handleCheckout}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.white} />
        ) : (
          <Text style={styles.ctaText}>{t('checkout.confirmPay')}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
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
  methodCard: { flex: 1, alignItems: 'center', gap: 6, padding: 12, borderRadius: RADIUS.row, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
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
  moncashBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: SPACING.md, backgroundColor: 'rgba(0,194,255,0.1)', borderWidth: 1, borderColor: 'rgba(0,194,255,0.3)', borderRadius: RADIUS.row, padding: 10 },
  moncashText: { fontSize: 12, color: COLORS.blue },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', padding: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: SPACING.md },
  totalLabel: { fontSize: 14, color: COLORS.text2 },
  totalValue: { fontSize: 18, color: COLORS.coral, fontWeight: '700' },
  ctaBtn: { marginHorizontal: SPACING.md, backgroundColor: COLORS.coral, borderRadius: RADIUS.button, padding: 14, alignItems: 'center' },
  ctaBtnDisabled: { opacity: 0.6 },
  ctaText: { fontSize: 14, color: COLORS.white, fontWeight: '700' },
});
