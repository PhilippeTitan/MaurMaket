import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Modal, Image, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, formatPrice } from '../theme';
import { getSellerItems, getImageUrl } from '../api';
import StockBadge from './StockBadge';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../i18n';

type SellerItem = { id: string; name: string; price: number; stock: number; image_url?: string | null };

type Props = {
  visible: boolean;
  sellerId: string;
  sellerName: string;
  onClose: () => void;
  onSelectItem: (item: SellerItem) => void;
};

export default function SellerItemsSheet({ visible, sellerId, sellerName, onClose, onSelectItem }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [items, setItems] = useState<SellerItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible || !sellerId) return;
    setLoading(true);
    getSellerItems(sellerId)
      .then((res: any) => setItems(res?.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [visible, sellerId]);

  const renderItem = ({ item }: { item: SellerItem }) => (
    <TouchableOpacity style={styles.card} onPress={() => onSelectItem(item)} activeOpacity={0.7} accessibilityLabel={`${item.name}, ${formatPrice(item.price)} G`} accessibilityRole="button">
      {item.image_url ? (
        <Image source={{ uri: getImageUrl(item.image_url) }} style={styles.cardImage} />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
          <MaterialCommunityIcons name="image-off-outline" size={28} color={COLORS.text2} />
        </View>
      )}
      <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
      <Text style={styles.cardPrice}>{formatPrice(item.price)} G</Text>
      <StockBadge stock={item.stock} size="sm" />
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} accessibilityLabel="close" accessibilityRole="button" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.md }]}>
        <View style={styles.handle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle} numberOfLines={1}>{sellerName}'s items</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="close" accessibilityRole="button">
            <MaterialCommunityIcons name="close" size={22} color={COLORS.text2} />
          </TouchableOpacity>
        </View>
        <Text style={styles.sheetSubtitle}>Pick an item to make an offer</Text>
        {loading ? (
          <ActivityIndicator size="large" color={COLORS.coral} style={{ marginVertical: 40 }} />
        ) : items.length === 0 ? (
          <View style={styles.emptyWrap}>
            <MaterialCommunityIcons name="package-variant" size={40} color={COLORS.text2} />
            <Text style={styles.emptyText}>No items available</Text>
          </View>
        ) : (
          <FlatList
            data={items}
            renderItem={renderItem}
            keyExtractor={(i) => i.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            snapToInterval={152}
            decelerationRate="fast"
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingTop: SPACING.sm,
    maxHeight: '50%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.sm },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, flex: 1 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sheetSubtitle: { fontSize: 12, color: COLORS.text2, paddingHorizontal: SPACING.md, marginTop: 2, marginBottom: SPACING.sm },
  listContent: { paddingHorizontal: SPACING.md, gap: 10 },
  card: {
    width: 142,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardImage: { width: '100%', height: 100, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface2 },
  cardImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cardName: { fontSize: 12, fontWeight: '600', color: COLORS.text, marginTop: 6 },
  cardPrice: { fontSize: 14, fontWeight: '700', color: COLORS.coral, marginTop: 2 },
  cardStock: { fontSize: 10, color: COLORS.text2, marginTop: 2 },
  emptyWrap: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 13, color: COLORS.text2, marginTop: 8 },
});
