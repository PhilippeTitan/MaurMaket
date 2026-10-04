import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, RADIUS, SPACING, formatPrice } from '../../theme';
import { useTranslation } from '@/localization';
import { CONDITION_I18N_KEYS } from '../../utils/listingConstants';

export interface FeaturedProduct {
  id: string;
  name: string;
  price: number;
  effective_price?: number | null;
  is_on_sale?: boolean;
  discount_pct?: number | null;
  condition?: string | null;
}

interface Props {
  product: FeaturedProduct;
  imageUrl?: string | null;
  onPress: () => void;
  /** Owner-only controls rendered in the card header. */
  onUnpin?: () => void;
  onEdit?: () => void;
}

/**
 * The single pinned listing, presented as a compact Featured card above the
 * catalog: enough presence to stand out, not enough to push the grid off the
 * first screen. Tapping opens the listing; editing stays owner-only.
 */
export default function FeaturedListingCard({ product, imageUrl, onPress, onUnpin, onEdit }: Props) {
  const { t } = useTranslation();
  const price = product.effective_price ?? product.price;
  const onSale = !!product.is_on_sale && typeof product.effective_price === 'number' && product.effective_price < product.price;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.labelWrap}>
          <MaterialCommunityIcons name="pin" size={13} color={COLORS.coral} />
          <Text style={styles.label}>{t('profile.featured')}</Text>
        </View>
        {onUnpin || onEdit ? (
          <View style={styles.headerActions}>
            {onEdit ? (
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={onEdit}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('profile.editListing')}
              >
                <MaterialCommunityIcons name="pencil-outline" size={16} color={COLORS.text2} />
              </TouchableOpacity>
            ) : null}
            {onUnpin ? (
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={onUnpin}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('profile.unpin')}
              >
                <MaterialCommunityIcons name="pin-off-outline" size={16} color={COLORS.text2} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>

      <TouchableOpacity
        style={styles.body}
        onPress={onPress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={product.name}
      >
        {imageUrl ? (
          <ExpoImage source={{ uri: imageUrl }} style={styles.image} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
          <View style={styles.imagePlaceholder}>
            <MaterialCommunityIcons name="image-outline" size={22} color={COLORS.text3} />
          </View>
        )}

        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
          <View style={styles.metaRow}>
            {onSale ? <Text style={styles.priceStrike}>{formatPrice(product.price)}</Text> : null}
            <Text style={styles.price}>{formatPrice(price)}</Text>
            {product.condition ? (
              <Text style={styles.condition} numberOfLines={1}>· {t(CONDITION_I18N_KEYS[product.condition] ?? product.condition)}</Text>
            ) : null}
          </View>
        </View>

        <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.text3} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.coral + '3D',
    paddingHorizontal: SPACING.md,
    paddingTop: 10,
    paddingBottom: SPACING.sm,
    marginBottom: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 26,
  },
  labelWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  label: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.coral,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.full,
  },
  body: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, minHeight: 56 },
  image: { width: 64, height: 64, borderRadius: RADIUS.row, backgroundColor: COLORS.surface2 },
  imagePlaceholder: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.row,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: 5 },
  name: { fontSize: FONT_SIZES.md, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  price: { fontSize: FONT_SIZES.md, fontWeight: FONT_WEIGHTS.bold, color: COLORS.coral },
  priceStrike: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text3,
    textDecorationLine: 'line-through',
  },
  condition: { flexShrink: 1, fontSize: FONT_SIZES.sm, color: COLORS.text2 },
});
