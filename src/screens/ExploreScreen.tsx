import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, Image, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, Pressable, FlatList, Dimensions, Alert, RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, getDisplayName } from '../theme';
import { getProducts, getCategories, getImageUrl } from '../api';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import type { Product, Category } from '../types';
import { useTranslation } from '../i18n';

type Props = NativeStackScreenProps<RootStackParamList>;
type CategoryFilter = Pick<Category, 'id' | 'name'>;
type SortOption = { label: string; value: string };

const SORT_OPTIONS: SortOption[] = [
  { label: 'explore.sortNewest', value: 'newest' },
  { label: 'explore.sortPriceLow', value: 'price_asc' },
  { label: 'explore.sortPriceHigh', value: 'price_desc' },
  { label: 'explore.sortOldest', value: 'oldest' },
];

const CAT_ICONS: Record<string, string> = {
  electronics: 'cellphone',
  food: 'food',
  fashion: 'hanger',
  clothing: 'hanger',
  home: 'sofa',
  'home & garden': 'sofa',
  beauty: 'face-man-shimmer',
  sports: 'basketball',
  books: 'book-open-variant',
  other: 'dots-horizontal',
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const NUM_COLS = 2;
const COL_GAP = 6;
const SIDE_PAD = 8;
const CARD_W = (SCREEN_W - SIDE_PAD * 2 - COL_GAP) / NUM_COLS;
const CARD_RADIUS = 10;
const DEFAULT_IMG_H = Math.round(CARD_W * 1.25);
const MIN_H = CARD_W * 0.6;
const MAX_H = SCREEN_H * 0.52;
const FOOTER_H = 40;

export default function ExploreScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCat, setSelectedCat] = useState<string>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [catModal, setCatModal] = useState(false);
  const [imageSizes, setImageSizes] = useState<Record<string, { w: number; h: number }>>({});
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const categoryListRef = useRef<FlatList<CategoryFilter>>(null);
  const [sortBy, setSortBy] = useState('newest');
  const [sortModal, setSortModal] = useState(false);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [showPriceFilter, setShowPriceFilter] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    getCategories().then((res: unknown) => {
      const data = res as { categories: Category[] };
      setCategories(data.categories || []);
    }).catch(() => {});
  }, []);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setImageSizes({});
    setFailedImages(new Set());
    try {
      const params: Record<string, string> = { limit: '50' };
      if (selectedCat) params.category = selectedCat;
      if (search.trim()) params.search = search.trim();
      if (sortBy) params.sort = sortBy;
      if (minPrice.trim()) params.minPrice = minPrice.trim();
      if (maxPrice.trim()) params.maxPrice = maxPrice.trim();
      const res = await getProducts(params) as { products: Product[] };
      setProducts(res.products || []);

      (res.products || []).forEach((p: Product) => {
        const url = getImageUrl(p.images?.find(i => i.is_primary)?.image_url || p.images?.[0]?.image_url);
        if (!url) return;
        Image.getSize(url, (w, h) => {
          if (mountedRef.current) {
            setImageSizes(prev => ({ ...prev, [p.id]: { w, h } }));
          }
        }, () => {});
      });
    } catch { Alert.alert(t('common.error'), 'Could not load products.'); }
    setLoading(false);
  }, [selectedCat, search, sortBy, minPrice, maxPrice]);

  useFocusEffect(useCallback(() => { fetchProducts(); }, [fetchProducts]));

  const getItemImageUrl = (p: Product) => {
    const img = p.images?.find(i => i.is_primary) || p.images?.[0];
    return getImageUrl(img?.image_url);
  };

  const selectCategory = (categoryName: string) => {
    setSelectedCat(categoryName);
    if (!categoryName) {
      requestAnimationFrame(() => {
        categoryListRef.current?.scrollToOffset({ offset: 0, animated: true });
      });
    }
  };

  const getCardHeight = (p: Product) => {
    const size = imageSizes[p.id];
    if (size && size.w > 0) {
      const ratio = size.h / size.w;
      return Math.max(MIN_H, Math.min(MAX_H, CARD_W * ratio));
    }
    return DEFAULT_IMG_H;
  };

  const [leftCol, rightCol] = (() => {
    const cols: [Product[], Product[]] = [[], []];
    const heights = [0, 0];
    for (const item of products) {
      const target = heights[0] <= heights[1] ? 0 : 1;
      cols[target].push(item);
      heights[target] += getCardHeight(item) + COL_GAP;
    }
    return cols;
  })();

  const renderCard = (item: Product) => {
    const imgUrl = getItemImageUrl(item);
    const cardH = getCardHeight(item);
    const imgFailed = failedImages.has(item.id);
    return (
      <TouchableOpacity
        key={item.id}
        style={styles.card}
        activeOpacity={0.82}
        onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
      >
        <View style={[styles.cardImgWrap, { height: cardH }]}>
          {imgUrl && !imgFailed ? (
            <Image
              source={{ uri: imgUrl }}
              style={styles.cardImg}
              resizeMode="cover"
              onError={() => setFailedImages(prev => new Set(prev).add(item.id))}
            />
          ) : (
            <View style={styles.cardPlaceholder}>
              <MaterialCommunityIcons name="image-off-outline" size={24} color={COLORS.text2} />
            </View>
          )}
          <View style={styles.cardOverlay}>
            <View style={styles.cardOverlayTop}>
              <View style={styles.priceBadge}>
                <Text style={styles.priceBadgeText}>Rs {item.price.toLocaleString()}</Text>
              </View>
            </View>
            <View style={styles.cardOverlayBottom}>
              <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
              {item.seller && (
                <Text style={styles.cardSeller} numberOfLines={1}>
                  {getDisplayName(item.seller)}
                </Text>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.fixedHeader}>
        <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
          <Text style={styles.logo}>Maur<Text style={styles.logoAccent}>Maket</Text></Text>
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchWrap}>
            <MaterialCommunityIcons name="magnify" size={22} color={COLORS.text2} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search..."
              placeholderTextColor={COLORS.text2}
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={fetchProducts}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <MaterialCommunityIcons name="close-circle" size={20} color={COLORS.text2} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={styles.filterBtn} onPress={() => setSortModal(true)}>
            <MaterialCommunityIcons name="tune-variant" size={18} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.filterBar}>
          {(sortBy !== 'newest' || minPrice || maxPrice) && (
            <TouchableOpacity
              style={styles.clearFilterBtn}
              onPress={() => { setSortBy('newest'); setMinPrice(''); setMaxPrice(''); }}
            >
              <MaterialCommunityIcons name="close" size={12} color={COLORS.coral} />
              <Text style={styles.clearFilterText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.chipsWrapper}>
          <FlatList
            ref={categoryListRef}
            horizontal
            data={[{ id: '', name: t('explore.all') }, ...categories]}
            keyExtractor={c => String(c.id || 'all')}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
            renderItem={({ item: cat }) => {
              const categoryName = cat.name;
              const isActive = cat.id === '' ? !selectedCat : selectedCat === categoryName;
              return (
                <TouchableOpacity
                  style={[styles.chip, isActive && styles.chipActive]}
                  onPress={() => selectCategory(cat.id === '' ? '' : categoryName === selectedCat ? '' : categoryName)}
                >
                  {cat.id !== '' && (
                    <MaterialCommunityIcons
                      name={(CAT_ICONS[cat.name.toLowerCase()] as any) || 'tag-outline'}
                      size={14}
                      color={isActive ? COLORS.white : COLORS.text2}
                    />
                  )}
                  <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
          <LinearGradient
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            colors={[COLORS.bg, 'transparent']}
            style={styles.chipFadeLeft}
            pointerEvents="none"
          />
          <LinearGradient
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 0 }}
            colors={[COLORS.bg, 'transparent']}
            style={styles.chipFadeRight}
            pointerEvents="none"
          />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={COLORS.coral} style={{ marginTop: 40 }} />
      ) : products.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <MaterialCommunityIcons name="magnify-close" size={28} color={COLORS.text2} />
          </View>
          <Text style={styles.emptyText}>{t('explore.noProducts')}</Text>
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={[{ id: '__cols__' }]}
          keyExtractor={() => '__cols__'}
          renderItem={() => (
            <View style={styles.grid}>
              <View style={styles.column}>
                {leftCol.map(renderCard)}
              </View>
              <View style={styles.column}>
                {rightCol.map(renderCard)}
              </View>
            </View>
          )}
          contentContainerStyle={[styles.gridContainer, { paddingBottom: insets.bottom + 80 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await fetchProducts(); setRefreshing(false); }} tintColor={COLORS.coral} />}
        />
      )}

      <Modal visible={catModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setCatModal(false)}>
          <Pressable style={styles.modalContent} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Categories</Text>
              <TouchableOpacity onPress={() => setCatModal(false)}>
                <MaterialCommunityIcons name="close" size={18} color={COLORS.text2} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.modalItem, !selectedCat && styles.modalItemActive]}
              onPress={() => { selectCategory(''); setCatModal(false); }}
            >
              <MaterialCommunityIcons name="apps" size={18} color={!selectedCat ? COLORS.coral : COLORS.text2} />
              <Text style={[styles.modalItemText, !selectedCat && styles.modalItemTextActive]}>{t('explore.all')}</Text>
            </TouchableOpacity>
            {categories.map(cat => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.modalItem, selectedCat === cat.name && styles.modalItemActive]}
                onPress={() => { selectCategory(cat.name); setCatModal(false); }}
              >
                <MaterialCommunityIcons
                  name={(CAT_ICONS[cat.name.toLowerCase()] as any) || 'tag-outline'}
                  size={18}
                  color={selectedCat === cat.name ? COLORS.coral : COLORS.text2}
                />
                <Text style={[styles.modalItemText, selectedCat === cat.name && styles.modalItemTextActive]}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={sortModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setSortModal(false)}>
          <Pressable style={styles.modalContent} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sort by</Text>
              <TouchableOpacity onPress={() => setSortModal(false)}>
                <MaterialCommunityIcons name="close" size={18} color={COLORS.text2} />
              </TouchableOpacity>
            </View>
            {SORT_OPTIONS.map(option => (
              <TouchableOpacity
                key={option.value}
                style={[styles.modalItem, sortBy === option.value && styles.modalItemActive]}
                onPress={() => setSortBy(option.value)}
              >
                <MaterialCommunityIcons
                  name={sortBy === option.value ? 'radiobox-marked' : 'radiobox-blank'}
                  size={18}
                  color={sortBy === option.value ? COLORS.coral : COLORS.text2}
                />
                <Text style={[styles.modalItemText, sortBy === option.value && styles.modalItemTextActive]}>
                  {t(option.label)}
                </Text>
              </TouchableOpacity>
            ))}
            <View style={styles.modalDivider} />
            <Text style={[styles.modalTitle, { marginBottom: 6 }]}>Price range</Text>
            <View style={styles.priceRow}>
              <TextInput
                style={styles.priceInputModal}
                placeholder="Min"
                placeholderTextColor={COLORS.text2}
                value={minPrice}
                onChangeText={setMinPrice}
                keyboardType="numeric"
              />
              <Text style={styles.priceDashModal}>-</Text>
              <TextInput
                style={styles.priceInputModal}
                placeholder="Max"
                placeholderTextColor={COLORS.text2}
                value={maxPrice}
                onChangeText={setMaxPrice}
                keyboardType="numeric"
              />
            </View>
            <TouchableOpacity
              style={styles.modalApplyBtn}
              onPress={() => { setSortModal(false); fetchProducts(); }}
            >
              <Text style={styles.modalApplyText}>Apply</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  fixedHeader: {
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },

  topBar: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 4 },
  logo: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  logoAccent: { color: COLORS.coral },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, gap: 8, paddingBottom: 6,
  },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.surface, borderRadius: 24,
    paddingHorizontal: 14, height: 44,
  },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 15, paddingVertical: 0 },
  catBtn: {
    width: 38, height: 38, borderRadius: 6,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },

  chipsWrapper: { position: 'relative', backgroundColor: COLORS.bg },
  chipsRow: { paddingHorizontal: 12, gap: 8, paddingVertical: 8 },
  chipFadeLeft: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 28, zIndex: 2 },
  chipFadeRight: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 28, zIndex: 2 },
  filterBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingBottom: 6,
  },
  filterBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  clearFilterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  clearFilterText: { fontSize: 11, color: COLORS.coral, fontWeight: '600' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.coral, borderColor: COLORS.coral },
  chipText: { color: COLORS.text2, fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: COLORS.white, fontWeight: '700' },

  gridContainer: {},
  grid: {
    flexDirection: 'row',
    paddingHorizontal: SIDE_PAD,
    paddingTop: SIDE_PAD,
    gap: COL_GAP,
  },
  column: {
    flex: 1,
    gap: COL_GAP,
  },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardImgWrap: {
    width: '100%',
    backgroundColor: COLORS.surface2,
    position: 'relative',
  },
  cardImg: { width: '100%', height: '100%' },
  cardPlaceholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.surface2,
  },
  cardOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    padding: 8,
  },
  cardOverlayTop: {
    alignItems: 'flex-end',
  },
  cardOverlayBottom: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 8,
    padding: 8,
    gap: 2,
  },
  priceBadge: {
    backgroundColor: COLORS.coral,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  priceBadgeText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '700',
  },
  cardName: { fontSize: 12, fontWeight: '600', color: '#fff', lineHeight: 16 },
  cardSeller: { fontSize: 10, color: 'rgba(255,255,255,0.7)' },

  empty: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center',
  },
  emptyText: { color: COLORS.text2, fontSize: 14, fontWeight: '500' },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalContent: {
    width: 240, backgroundColor: COLORS.surface, borderRadius: 12, padding: 10, gap: 2, overflow: 'hidden',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, marginLeft: 4 },
  modalTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  modalItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: 8, borderRadius: 6,
  },
  modalItemActive: { backgroundColor: COLORS.surface2 },
  modalItemText: { fontSize: 12, color: COLORS.text2, fontWeight: '500' },
  modalItemTextActive: { color: COLORS.coral, fontWeight: '700' },
  modalDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 10 },
  priceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, width: '100%',
  },
  priceInputModal: {
    flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: COLORS.text,
    height: 38, minWidth: 0,
  },
  priceDashModal: { fontSize: 14, color: COLORS.text2 },
  modalApplyBtn: {
    backgroundColor: COLORS.coral, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
    alignItems: 'center', marginTop: 12,
  },
  modalApplyText: { fontSize: 13, color: COLORS.white, fontWeight: '700' },
});
