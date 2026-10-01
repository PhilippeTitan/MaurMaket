import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Modal, Image, ActivityIndicator, TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, formatPrice } from '../theme';
import { getSellerItems, getImageUrl } from '../api';
import StockBadge from './StockBadge';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '@/localization';

type SellerItem = { id: string; name: string; price: number; stock: number; description?: string; image_url?: string | null };

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
  const [selected, setSelected] = useState<SellerItem | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!visible || !sellerId) return;
    setSelected(null);
    setSearch('');
    setLoading(true);
    getSellerItems(sellerId)
      .then((res: any) => setItems(res?.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [visible, sellerId]);

  const renderItem = ({ item }: { item: SellerItem }) => (
    <TouchableOpacity style={styles.card} onPress={() => setSelected(item)} activeOpacity={0.7} accessibilityLabel={`${item.name}, ${formatPrice(item.price)} G`} accessibilityRole="button">
      {item.image_url ? (
        <Image source={{ uri: getImageUrl(item.image_url) ?? undefined }} style={styles.cardImage} />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
          <MaterialCommunityIcons name="image-off-outline" size={28} color={COLORS.text2} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.cardPrice}>{formatPrice(item.price)} G</Text>
      </View>
      <View style={styles.cardFooter}><StockBadge stock={item.stock} size="sm" /><MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text2} /></View>
    </TouchableOpacity>
  );

  const filteredItems = items.filter(item => item.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} accessibilityLabel="close" accessibilityRole="button" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.md }]}>
        <View style={styles.handle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle} numberOfLines={1}>{selected ? selected.name : t('chat.shareListingTitle', { name: sellerName })}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="close" accessibilityRole="button">
            <MaterialCommunityIcons name="close" size={22} color={COLORS.text2} />
          </TouchableOpacity>
        </View>
        <Text style={styles.sheetSubtitle}>{selected ? t('chat.shareListingReview') : t('chat.shareListingHint')}</Text>
        {loading ? (
          <ActivityIndicator size="large" color={COLORS.coral} style={{ marginVertical: 40 }} />
        ) : selected ? (
          <View style={styles.preview}>
            {selected.image_url ? <Image source={{ uri: getImageUrl(selected.image_url) ?? undefined }} style={styles.previewImage} /> : <View style={[styles.previewImage, styles.cardImagePlaceholder]}><MaterialCommunityIcons name="package-variant" size={32} color={COLORS.text2} /></View>}
            <Text style={styles.previewPrice}>{formatPrice(selected.price)} G</Text>
            <Text style={styles.previewDescription} numberOfLines={3}>{selected.description || t('chat.noListingDescription')}</Text>
            <View style={styles.previewFooter}><StockBadge stock={selected.stock} size="sm" /></View>
            <View style={styles.previewActions}>
              <TouchableOpacity style={styles.backAction} onPress={() => setSelected(null)} accessibilityRole="button"><Text style={styles.backActionText}>{t('common.back')}</Text></TouchableOpacity>
              <TouchableOpacity style={styles.shareAction} onPress={() => onSelectItem(selected)} accessibilityRole="button"><MaterialCommunityIcons name="share-outline" size={17} color={COLORS.white} /><Text style={styles.shareActionText}>{t('chat.shareInChat')}</Text></TouchableOpacity>
            </View>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.emptyWrap}>
            <MaterialCommunityIcons name="package-variant" size={40} color={COLORS.text2} />
            <Text style={styles.emptyText}>{t('chat.noShareableListings')}</Text>
          </View>
        ) : (
          <>
          <View style={styles.searchWrap}><MaterialCommunityIcons name="magnify" size={18} color={COLORS.text2} /><TextInput value={search} onChangeText={setSearch} placeholder={t('chat.searchListings')} placeholderTextColor={COLORS.text2} style={styles.searchInput} accessibilityLabel={t('chat.searchListings')} /></View>
          <FlatList
            data={filteredItems}
            renderItem={renderItem}
            keyExtractor={(i) => i.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={<Text style={styles.emptyText}>{t('chat.noMatchingListings')}</Text>}
          />
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.media,
    borderTopRightRadius: RADIUS.media,
    paddingTop: SPACING.sm,
    maxHeight: '82%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.sm },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, flex: 1 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sheetSubtitle: { fontSize: 12, color: COLORS.text2, paddingHorizontal: SPACING.md, marginTop: 2, marginBottom: SPACING.sm },
  searchWrap: { marginHorizontal: SPACING.md, marginBottom: SPACING.sm, height: 42, borderRadius: RADIUS.pill, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.surface2 },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 14, paddingVertical: 8 },
  listContent: { paddingHorizontal: SPACING.md, gap: 8, paddingBottom: SPACING.md },
  card: {
    width: '100%',
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.card,
    padding: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardImage: { width: 68, height: 68, borderRadius: RADIUS.row, backgroundColor: COLORS.surface },
  cardImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cardName: { flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.text },
  cardPrice: { fontSize: 13, fontWeight: '700', color: COLORS.coral, marginTop: 3 },
  cardStock: { fontSize: 10, color: COLORS.text2, marginTop: 2 },
  cardFooter: { alignItems: 'flex-end', gap: 4 },
  preview: { padding: SPACING.md },
  previewImage: { width: '100%', height: 180, borderRadius: RADIUS.card, backgroundColor: COLORS.surface2 },
  previewPrice: { fontSize: 20, fontWeight: '800', color: COLORS.coral, marginTop: 12 },
  previewDescription: { fontSize: 13, lineHeight: 19, color: COLORS.text2, marginTop: 6 },
  previewFooter: { marginTop: 10 },
  previewActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  backAction: { minHeight: 44, paddingHorizontal: 16, borderRadius: RADIUS.pill, backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center' },
  backActionText: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  shareAction: { flex: 1, minHeight: 44, borderRadius: RADIUS.pill, backgroundColor: COLORS.coral, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  shareActionText: { color: COLORS.white, fontSize: 13, fontWeight: '700' },
  emptyWrap: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 13, color: COLORS.text2, marginTop: 8 },
});
