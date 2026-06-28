import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { store } from '../store';
import { validatePromo, getImageUrl } from '../api';
import { useTranslation } from '../i18n';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import type { CartItem } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Cart'>;

type SectionItem =
  | { type: 'sellerHeader'; sellerId: string; sellerName: string; itemCount: number; total: number; key: string }
  | { type: 'item'; item: CartItem; key: string };

export default function CartScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [cart, setCart] = useState<CartItem[]>(store.cart);
  const [promoCode, setPromoCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [promoLoading, setPromoLoading] = useState(false);

  useEffect(() => {
    const unsub = store.onChange(() => setCart([...store.cart]));
    return unsub;
  }, []);

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const finalTotal = Math.max(0, total - discount);
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

  const sectionedData: SectionItem[] = (() => {
    const grouped = new Map<string, CartItem[]>();
    for (const item of cart) {
      const arr = grouped.get(item.seller_id) || [];
      arr.push(item);
      grouped.set(item.seller_id, arr);
    }
    const result: SectionItem[] = [];
    for (const group of sellerGroups) {
      const items = grouped.get(group.sellerId) || [];
      result.push({ type: 'sellerHeader', ...group, key: `header-${group.sellerId}` });
      for (const item of items) {
        result.push({ type: 'item', item, key: item.id });
      }
    }
    return result;
  })();

  useEffect(() => {
    if (discount > 0) setDiscount(0);
  }, [total]);

  const handleQuantity = async (id: string, delta: number) => {
    const item = cart.find(c => c.id === id);
    if (item) {
      const newQty = item.quantity + delta;
      if (newQty <= 0) {
        await store.removeFromCart(id);
      } else {
        await store.updateQuantity(id, newQty);
        const stock = Math.max(0, Number(item.stock) || 0);
        if (stock > 0 && newQty > stock) {
          Alert.alert(t('cart.stockLimit'), t('cart.onlyAvailable', { count: String(stock) }));
        }
      }
    }
  };

  const handleRemove = async (id: string) => {
    await store.removeFromCart(id);
  };

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    setPromoLoading(true);
    try {
      const res = await validatePromo(promoCode.trim(), total) as { discount: number };
      setDiscount(res.discount);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid promo';
      Alert.alert(t('common.error'), msg);
      setDiscount(0);
    }
    setPromoLoading(false);
  };

  const getItemImageUrl = (item: CartItem) => {
    const img = item.images?.find(i => i.is_primary) || item.images?.[0];
    return getImageUrl(img?.image_url);
  };

  const renderItem = ({ item }: { item: SectionItem }) => {
    if (item.type === 'sellerHeader') {
      return (
        <View style={styles.sellerSectionHeader}>
          <MaterialCommunityIcons name="storefront-outline" size={14} color={COLORS.coral} />
          <Text style={styles.sellerSectionName} numberOfLines={1}>{item.sellerName}</Text>
          <Text style={styles.sellerSectionMeta}>
            {item.itemCount} {item.itemCount === 1 ? t('common.item') : t('common.items')} · Rs {item.total.toLocaleString()}
          </Text>
        </View>
      );
    }
    const cartItem = item.item;
    const imgUrl = getItemImageUrl(cartItem);
    const stock = Math.max(0, Number(cartItem.stock) || 0);
    const atStockLimit = stock > 0 && cartItem.quantity >= stock;
    return (
      <View style={styles.item}>
        <View style={styles.thumb}>
          {imgUrl ? (
            <Image source={{ uri: imgUrl }} style={styles.thumbImg} resizeMode="cover" />
          ) : (
            <MaterialCommunityIcons name="image-off-outline" size={24} color={COLORS.text2} />
          )}
        </View>
        <View style={styles.info}>
          <Text style={styles.itemName} numberOfLines={1}>{cartItem.name}</Text>
          <Text style={styles.itemPrice}>Rs {cartItem.price.toLocaleString()}</Text>
          <View style={styles.qtyRow}>
            <TouchableOpacity style={styles.qtyBtn} onPress={() => handleQuantity(cartItem.id, -1)}>
              <MaterialCommunityIcons name="minus" size={14} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.qtyVal}>{cartItem.quantity}</Text>
            <TouchableOpacity
              style={[styles.qtyBtn, atStockLimit && styles.qtyBtnDisabled]}
              onPress={() => handleQuantity(cartItem.id, 1)}
              disabled={atStockLimit}
            >
              <MaterialCommunityIcons name="plus" size={14} color={atStockLimit ? COLORS.text2 : COLORS.text} />
            </TouchableOpacity>
          </View>
          {atStockLimit && <Text style={styles.stockLimit}>{t('cart.onlyAvailable', { count: String(stock) })}</Text>}
        </View>
        <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemove(cartItem.id)}>
          <MaterialCommunityIcons name="close" size={18} color={COLORS.text2} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.topbar, { paddingTop: insets.top + SPACING.md }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.text2} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('cart.title')} ({itemCount})</Text>
      </View>

      {cart.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <MaterialCommunityIcons name="cart-outline" size={36} color={COLORS.text2} />
          </View>
          <Text style={styles.emptyText}>{t('cart.empty')}</Text>
          <Text style={styles.emptyHint}>{t('cart.browseHint')}</Text>
        </View>
      ) : (
        <View style={styles.cartBody}>
          <FlatList
            data={sectionedData}
            renderItem={renderItem}
            keyExtractor={item => item.key}
            contentContainerStyle={styles.list}
          />
          <View style={styles.footer}>
            <View style={styles.promoRow}>
              <TextInput
                style={styles.promoInput}
                placeholder={t('cart.promoCode')}
                placeholderTextColor={COLORS.text2}
                value={promoCode}
                onChangeText={setPromoCode}
                autoCapitalize="characters"
              />
              <TouchableOpacity
                style={styles.promoBtn}
                onPress={handleApplyPromo}
                disabled={promoLoading}
              >
                <Text style={styles.promoBtnText}>{promoLoading ? '...' : t('cart.apply')}</Text>
              </TouchableOpacity>
            </View>
            {discount > 0 && (
              <Text style={styles.discountText}>-Rs {discount.toLocaleString()} {t('cart.off')}</Text>
            )}
            {promoCode.trim() && discount === 0 && (
              <Text style={styles.discountHint}>{t('cart.promoHint')}</Text>
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t('cart.total')}</Text>
              <Text style={styles.totalValue}>Rs {finalTotal.toLocaleString()}</Text>
            </View>
            <TouchableOpacity
              style={styles.checkoutBtn}
              onPress={() => navigation.navigate('Checkout', promoCode.trim() ? { promoCode: promoCode.trim() } : undefined)}
            >
              <Text style={styles.checkoutBtnText}>{t('cart.proceedCheckout')}</Text>
              <MaterialCommunityIcons name="arrow-right" size={18} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  cartBody: { flex: 1 },
  topbar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  title: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  list: { padding: SPACING.md, paddingBottom: 220 },
  item: {
    flexDirection: 'row', backgroundColor: COLORS.surface, borderWidth: 1,
    borderColor: COLORS.border, borderRadius: 12, padding: 10, marginBottom: 8, alignItems: 'center', gap: 10,
  },
  thumb: {
    width: 52, height: 52, borderRadius: 10, backgroundColor: COLORS.surface2,
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  thumbImg: { width: '100%', height: '100%' },
  info: { flex: 1 },
  itemName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  itemPrice: { fontSize: 12, color: COLORS.coral, fontWeight: '700', marginTop: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  qtyBtn: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.surface2,
    borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center',
  },
  qtyBtnDisabled: { opacity: 0.45 },
  qtyVal: { fontSize: 13, fontWeight: '600', color: COLORS.text, minWidth: 16, textAlign: 'center' },
  stockLimit: { fontSize: 11, color: COLORS.yellow, marginTop: 3 },
  removeBtn: { padding: 4 },
  sellerSectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 4, marginTop: 4, marginBottom: 2,
  },
  sellerSectionName: { flex: 1, fontSize: 12, fontWeight: '700', color: COLORS.text },
  sellerSectionMeta: { fontSize: 11, color: COLORS.text2 },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0, padding: SPACING.md,
    paddingBottom: SPACING.xxl + 20, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.bg,
  },
  promoRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 },
  promoInput: {
    flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, color: COLORS.text, fontSize: 13,
  },
  promoBtn: {
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
  },
  promoBtnText: { color: COLORS.text2, fontSize: 13, fontWeight: '500' },
  discountText: { fontSize: 12, color: COLORS.green, fontWeight: '600', marginBottom: 4 },
  discountHint: { fontSize: 12, color: COLORS.text2, marginBottom: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  totalLabel: { fontSize: 14, color: COLORS.text2 },
  totalValue: { fontSize: 18, color: COLORS.coral, fontWeight: '700' },
  checkoutBtn: {
    backgroundColor: COLORS.coral, padding: 14, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  checkoutBtnText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: COLORS.text2, fontSize: 15, fontWeight: '600' },
  emptyHint: { color: COLORS.text2, fontSize: 12, opacity: 0.7, textAlign: 'center', paddingHorizontal: 40 },
});
