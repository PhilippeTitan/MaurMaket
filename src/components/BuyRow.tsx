import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, getDisplayName } from '../theme';
import { store } from '../store';
import { createConversation } from '../api';
import { useTranslation } from '../i18n';
import type { Product } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

interface BuyRowProps {
  product: Product;
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

export default function BuyRow({ product, navigation }: BuyRowProps) {
  const { t } = useTranslation();
  const [cartQty, setCartQty] = useState(store.cart.find(c => c.id === product.id)?.quantity || 0);
  const isOwnProduct = store.user?.id === product.seller_id;
  const isSoldOut = product.stock <= 0;

  useEffect(() => {
    const unsub = store.onChange(() => {
      setCartQty(store.cart.find(c => c.id === product.id)?.quantity || 0);
    });
    return unsub;
  }, [product.id]);

  const handleMakeOffer = async () => {
    if (!product.seller) return;
    try {
      const res = await createConversation({
        sellerId: product.seller_id,
        productId: product.id,
      }) as { conversationId: string };
      navigation.navigate('Chat', {
        conversationId: res.conversationId,
        otherUserName: getDisplayName(product.seller),
        otherUserId: product.seller_id,
        otherUserAvatar: product.seller.avatar_url,
        draftOffer: {
          productId: product.id,
          productName: product.name,
          listPrice: product.effective_price ?? product.price,
        },
      });
    } catch {
      Alert.alert('Offer unavailable', 'Could not start this negotiation right now.');
    }
  };

  const addToCart = async () => {
    const result = await store.addToCart({
      id: product.id,
      name: product.name,
      price: product.effective_price ?? product.price,
      effective_price: product.effective_price,
      is_on_sale: product.is_on_sale,
      discount_pct: product.discount_pct,
      quantity: 1,
      images: product.images,
      seller_id: product.seller_id,
      seller_name: product.seller?.full_name || null,
      store_name: product.seller?.store_name || null,
      stock: product.stock,
    });
    return result;
  };

  const handleBuy = async () => {
    const result = await addToCart();
    if (!result.added) {
      Alert.alert('Stock limit', result.reason === 'out-of-stock' ? 'This item is sold out.' : `Only ${result.stock} available.`);
      return;
    }
    navigation.navigate('Cart');
  };

  const handleAddCart = async () => {
    const result = await addToCart();
    if (!result.added) {
      Alert.alert('Stock limit', result.reason === 'out-of-stock' ? 'This item is sold out.' : `Only ${result.stock} available.`);
    }
  };

  const handleIncrementCart = async () => {
    if (cartQty === 0) {
      await handleAddCart();
      return;
    }
    if (cartQty >= product.stock) {
      Alert.alert('Stock limit', `Only ${product.stock} available.`);
      return;
    }
    await store.updateQuantity(product.id, cartQty + 1);
  };

  const handleDecrementCart = async () => {
    if (cartQty <= 1) {
      await store.removeFromCart(product.id);
      return;
    }
    await store.updateQuantity(product.id, cartQty - 1);
  };

  if (isOwnProduct) {
    return (
      <TouchableOpacity
        style={styles.ownListingBtn}
        onPress={() => navigation.navigate('ProductDetail', { productId: product.id })}
      >
        <MaterialCommunityIcons name="storefront-outline" size={16} color={COLORS.white} />
        <Text style={styles.ownListingText}>View Your Listing</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.buyRow}>
      <TouchableOpacity
        style={[styles.iconCircle, isSoldOut && styles.actionDisabled]}
        onPress={handleMakeOffer}
        disabled={isSoldOut}
      >
        <MaterialCommunityIcons name="tag-outline" size={18} color={COLORS.white} />
      </TouchableOpacity>

      {cartQty > 0 ? (
        <View style={styles.cartStepper}>
          <TouchableOpacity
            style={styles.cartStepperBtn}
            onPress={handleDecrementCart}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons name="minus" size={16} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.cartStepperQty}>{cartQty}</Text>
          <TouchableOpacity
            style={styles.cartStepperBtn}
            onPress={handleIncrementCart}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons name="plus" size={16} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.iconCircle, isSoldOut && styles.actionDisabled]}
          onPress={handleIncrementCart}
          disabled={isSoldOut}
        >
          <MaterialCommunityIcons name="cart-plus" size={18} color={COLORS.white} />
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.buyBtn, isSoldOut && styles.actionDisabled]}
        onPress={handleBuy}
        disabled={isSoldOut}
      >
        <Text style={styles.buyBtnText}>{isSoldOut ? t('productDetail.outOfStock') : t('feed.buyNow')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  buyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cartStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: 4,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    flexShrink: 0,
  },
  cartStepperBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartStepperQty: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.white,
    minWidth: 18,
    textAlign: 'center',
  },
  buyBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 22,
    backgroundColor: COLORS.coral,
    alignItems: 'center',
  },
  buyBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.white,
  },
  actionDisabled: { opacity: 0.45 },
  ownListingBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: RADIUS.card,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
  },
  ownListingText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.white,
  },
});
