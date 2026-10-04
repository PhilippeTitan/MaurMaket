import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Icon } from './icons/Icon';
import { COLORS, RADIUS, getDisplayName } from '../theme';
import { store, cartLineKey } from '../store';
import { createConversation } from '../api';
import { useTranslation } from '@/localization';
import { useToast } from './Toast';
import type { Product, ProductVariant } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import { tapLight, tapMedium } from '../haptics';

interface BuyRowProps {
  product: Product;
  navigation: NativeStackNavigationProp<RootStackParamList>;
  variant?: ProductVariant | null;
}

export default function BuyRow({ product, navigation, variant }: BuyRowProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const variantStock = variant ? Math.max(0, Number(variant.stock) || 0) : null;
  const lineKey = variant ? cartLineKey({ id: product.id, variantId: variant.id }) : product.id;
  const stockLimit = variantStock ?? Math.max(0, Number(product.stock) || 0);
  const [cartQty, setCartQty] = useState(store.cart.find(c => cartLineKey(c) === lineKey)?.quantity || 0);
  const [cartCount, setCartCount] = useState(store.cartCount);
  const isOwnProduct = store.user?.id === product.seller_id;
  const isSoldOut = stockLimit <= 0;

  useEffect(() => {
    const unsub = store.onChange(() => {
      setCartQty(store.cart.find(c => cartLineKey(c) === lineKey)?.quantity || 0);
      setCartCount(store.cartCount);
    });
    return unsub;
  }, [lineKey]);

  const handleMakeOffer = async () => {
    tapLight();
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
        otherUserStoreLogoUrl: (product.seller as any).store_logo_url,
        otherUserUseStoreIdentity: (product.seller as any).use_store_identity,
        otherUserTier: product.seller.seller_tier,
        draftOffer: {
          productId: product.id,
          productName: product.name,
          listPrice: variant ? Number(variant.price) : (product.effective_price ?? product.price),
        },
      });
    } catch {
      toast.error(t('feedback.offerUnavailable'), t('feedback.negotiationUnavailable'));
    }
  };

  const addToCart = async () => {
    const result = await store.addToCart({
      id: product.id,
      name: product.name,
      price: variant ? Number(variant.price) : (product.effective_price ?? product.price),
      effective_price: variant ? undefined : product.effective_price,
      is_on_sale: variant ? false : product.is_on_sale,
      discount_pct: variant ? 0 : product.discount_pct,
      quantity: 1,
      images: product.images,
      seller_id: product.seller_id,
      seller_name: getDisplayName(product.seller) || null,
      store_name: product.seller?.store_name || null,
      stock: variantStock ?? product.stock,
      variantId: variant?.id ?? null,
      variantLabel: variant?.option_label ?? null,
      variantOptions: variant?.options ?? null,
    });
    return result;
  };

  const handleBuy = async () => {
    tapMedium();
    const result = await addToCart();
    if (!result.added) {
      navigation.navigate('Cart');
      return;
    }
    navigation.navigate('Cart');
  };

  const handleAddCart = async () => {
    tapMedium();
    const result = await addToCart();
    if (!result.added) {
      toast.warning(t('cart.stockLimit'), result.reason === 'out-of-stock' ? t('cart.soldOut') : t('cart.onlyAvailable', { count: result.stock }));
      return;
    }
    toast.success(t('cart.added'), t('cart.addedDetail', { name: product.name }));
  };

  const handleIncrementCart = async () => {
    if (cartQty === 0) {
      await handleAddCart();
      return;
    }
    tapLight();
    if (cartQty >= stockLimit) {
      toast.warning(t('cart.stockLimit'), t('cart.onlyAvailable', { count: stockLimit }));
      return;
    }
    await store.updateQuantity(lineKey, cartQty + 1);
  };

  const handleDecrementCart = async () => {
    tapLight();
    if (cartQty <= 1) {
      await store.removeFromCart(lineKey);
      return;
    }
    await store.updateQuantity(lineKey, cartQty - 1);
  };

  if (product.paused_reason === 'tier_cap' || (!product.is_available && !isOwnProduct)) {
    return (
      <View style={styles.unavailableRow}>
        <View style={styles.unavailableBadge}>
          <MaterialCommunityIcons name="clock-alert-outline" size={16} color={COLORS.yellow} />
          <Text style={styles.unavailableBadgeText}>Temporarily Unavailable</Text>
        </View>
        <TouchableOpacity
          style={styles.visitSellerBtn}
          onPress={() => navigation.navigate('Storefront', { sellerId: product.seller_id, preloadedSeller: product.seller })}
          accessibilityRole="button"
          accessibilityLabel="view seller store"
        >
          <Text style={styles.visitSellerText}>Visit Store</Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color={COLORS.white} />
        </TouchableOpacity>
      </View>
    );
  }

  if (isOwnProduct) {
    return (
      <TouchableOpacity
        style={styles.ownListingBtn}
        onPress={() => navigation.navigate('ProductDetail', { productId: product.id })}
      >
        <Icon name="storefront" size={16} color={COLORS.white} />
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
        <Icon name="sale-tag" size={28} color={COLORS.white} />
      </TouchableOpacity>

      {cartQty > 0 ? (
        <View style={styles.cartStepper}>
          <TouchableOpacity
            style={styles.cartStepperBtn}
            onPress={handleDecrementCart}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="minus" size={16} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.cartStepperQty}>{cartQty}</Text>
          <TouchableOpacity
            style={styles.cartStepperBtn}
            onPress={handleIncrementCart}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="plus" size={16} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.iconCircle, isSoldOut && styles.actionDisabled]}
          onPress={handleIncrementCart}
          disabled={isSoldOut}
        >
          <MaterialCommunityIcons name="cart-plus" size={28} color={COLORS.white} />
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.buyBtn, isSoldOut && styles.actionDisabled]}
        onPress={handleBuy}
        disabled={isSoldOut}
      >
            <Text style={styles.buyBtnText}>{isSoldOut ? t('productDetail.outOfStock') : t('feed.buyNow')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cartCircle}
              onPress={() => navigation.navigate('Cart')}
            >
              <Icon name="cart" size={35} color={COLORS.white} />
              {cartCount > 0 && (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>{cartCount > 9 ? '9+' : cartCount}</Text>
                </View>
              )}
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
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cartStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    paddingHorizontal: 4,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.30)',
    flexShrink: 0,
  },
  cartStepperBtn: {
    width: 36,
    height: 36,
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
  cartCircle: {
    width: 35,
    height: 35,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cartBadge: {
    position: 'absolute', top: -2, right: -2,
    backgroundColor: COLORS.coral,
    borderRadius: 8,
    minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    fontSize: 9, fontWeight: '700', color: COLORS.white,
  },
  ownListingBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: RADIUS.card,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  unavailableRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  unavailableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: RADIUS.card,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  unavailableBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.white,
  },
  visitSellerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.coral,
    minHeight: 44,
  },
  visitSellerText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.white,
  },
  ownListingText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.white,
  },
});
