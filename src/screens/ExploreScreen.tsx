import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, Image, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, Pressable, FlatList, Dimensions, Alert, RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, getDisplayName } from '../theme';
import { getProducts, getCategories, getImageUrl } from '../api';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import type { Product, Category } from '../types';

type Props = NativeStackScreenProps<RootStackParamList>;
type CategoryFilter = Pick<Category, 'id' | 'name'>;
type SortOption = { label: string; value: string };

const SORT_OPTIONS: SortOption[] = [
  { label: 'Newest', value: 'newest' },
  { label: 'Price: Low to High', value: 'price_asc' },
  { label: 'Price: High to Low', value: 'price_desc' },
  { label: 'Oldest', value: 'oldest' },
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
const MIN_H = CARD_W * 0.7;
const MAX_H = SCREEN_H * 0.42;
const FOOTER_H = 40;

export default function ExploreScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCat, setSelectedCat] = useState<string>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [catModal, setCatModal] = useState(false);
  const [imageSizes, setImageSizes] = useState<Record<string, { w: number; h: number }>>({});
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
    } catch { Alert.alert('Error', 'Could not load products.'); }
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
    return CARD_W;
  };

  const [leftCol, rightCol] = products.reduce<[Product[], Product[]]>(
    (acc, item, idx) => {
      acc[idx % 2 === 0 ? 0 : 1].push(item);
      return acc;
    },
    [[], []]
  );

  const renderCard = (item: Product) => {
    const imgUrl = getItemImageUrl(item);
    const cardH = getCardHeight(item);
    return (
      <TouchableOpacity
        key={item.id}
        style={styles.card}
        activeOpacity={0.82}
        onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
      >
        <View style={[styles.cardImgWrap, { height: cardH }]}>
          {imgUrl ? (
            <Image source={{ uri: imgUrl }} style={styles.cardImg} resizeMode="cover" />
          ) : (
            <View style={styles.cardPlaceholder}>
              <MaterialCommunityIcons name="image-off-outline" size={24} color={COLORS.text2} />
            </View>
          )}
          <View style={styles.priceOverlay}>
            <Text style={styles.priceText}>Rs {item.price.toLocaleString()}</Text>
          </View>
        </View>
        <View style={styles.cardFooter}>
          <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
          {item.seller && (
            <Text style={styles.cardSeller} numberOfLines={1}>
              {getDisplayName(item.seller)}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Fixed top: logo + search + chips */}
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
          <TouchableOpacity style={styles.catBtn} onPress={() => setCatModal(true)}>
            <MaterialCommunityIcons
              name={selectedCat ? 'tag-text' : 'tag-outline'}
              size={22}
              color={selectedCat ? COLORS.coral : COLORS.text}
            />
          </TouchableOpacity>
        </View>

        {/* Sort + Price filter bar */}
        <View style={styles.filterBar}>
          <TouchableOpacity style={styles.filterBtn} onPress={() => setSortModal(true)}>
            <MaterialCommunityIcons name="sort" size={14} color={COLORS.text2} />
            <Text style={styles.filterBtnText}>{SORT_OPTIONS.find(o => o.value === sortBy)?.label || 'Sort'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterBtn, showPriceFilter && styles.filterBtnActive]}
            onPress={() => setShowPriceFilter(!showPriceFilter)}
          >
            <MaterialCommunityIcons name="currency-usd" size={14} color={showPriceFilter ? COLORS.coral : COLORS.text2} />
            <Text style={[styles.filterBtnText, showPriceFilter && styles.filterBtnTextActive]}>Price</Text>
          </TouchableOpacity>
          {(minPrice || maxPrice) && (
            <TouchableOpacity
              style={styles.clearFilterBtn}
              onPress={() => { setMinPrice(''); setMaxPrice(''); }}
            >
              <MaterialCommunityIcons name="close" size={12} color={COLORS.coral} />
              <Text style={styles.clearFilterText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {showPriceFilter && (
          <View style={styles.priceFilterRow}>
            <TextInput
              style={styles.priceInput}
              placeholder="Min"
              placeholderTextColor={COLORS.text2}
              value={minPrice}
              onChangeText={setMinPrice}
              keyboardType="numeric"
              onSubmitEditing={fetchProducts}
            />
            <Text style={styles.priceDash}>-</Text>
            <TextInput
              style={styles.priceInput}
              placeholder="Max"
              placeholderTextColor={COLORS.text2}
              value={maxPrice}
              onChangeText={setMaxPrice}
              keyboardType="numeric"
              onSubmitEditing={fetchProducts}
            />
            <TouchableOpacity style={styles.applyPriceBtn} onPress={fetchProducts}>
              <Text style={styles.applyPriceText}>Apply</Text>
            </TouchableOpacity>
          </View>
        )}

        <FlatList
          ref={categoryListRef}
          horizontal
          data={[{ id: '', name: 'All' }, ...categories]}
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
                    size={12}
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
      </View>

      {/* Pinterest masonry grid — variable height cards */}
      {loading ? (
        <ActivityIndicator size="small" color={COLORS.coral} style={{ marginTop: 40 }} />
      ) : products.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <MaterialCommunityIcons name="magnify-close" size={28} color={COLORS.text2} />
          </View>
          <Text style={styles.emptyText}>No products found</Text>
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
          contentContainerStyle={styles.gridContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await fetchProducts(); setRefreshing(false); }} tintColor={COLORS.coral} />}
        />
      )}

      {/* Category modal */}
      <Modal visible={catModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setCatModal(false)}>
          <Pressable style={styles.modalContent} onPress={e => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Categories</Text>
            <TouchableOpacity
              style={[styles.modalItem, !selectedCat && styles.modalItemActive]}
              onPress={() => { selectCategory(''); setCatModal(false); }}
            >
              <MaterialCommunityIcons name="apps" size={18} color={!selectedCat ? COLORS.coral : COLORS.text2} />
              <Text style={[styles.modalItemText, !selectedCat && styles.modalItemTextActive]}>All</Text>
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

      {/* Sort modal */}
      <Modal visible={sortModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setSortModal(false)}>
          <Pressable style={styles.modalContent} onPress={e => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Sort by</Text>
            {SORT_OPTIONS.map(option => (
              <TouchableOpacity
                key={option.value}
                style={[styles.modalItem, sortBy === option.value && styles.modalItemActive]}
                onPress={() => { setSortBy(option.value); setSortModal(false); }}
              >
                <MaterialCommunityIcons
                  name={sortBy === option.value ? 'radiobox-marked' : 'radiobox-blank'}
                  size={18}
                  color={sortBy === option.value ? COLORS.coral : COLORS.text2}
                />
                <Text style={[styles.modalItemText, sortBy === option.value && styles.modalItemTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
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
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center',
  },

  chipsRow: { paddingHorizontal: 8, gap: 6, paddingVertical: 6 },
  filterBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 8, paddingBottom: 6,
  },
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  filterBtnActive: { borderColor: COLORS.coral, backgroundColor: 'rgba(255,77,106,0.07)' },
  filterBtnText: { fontSize: 11, color: COLORS.text2, fontWeight: '500' },
  filterBtnTextActive: { color: COLORS.coral },
  clearFilterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  clearFilterText: { fontSize: 11, color: COLORS.coral, fontWeight: '600' },
  priceFilterRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 8, paddingBottom: 8,
  },
  priceInput: {
    flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, color: COLORS.text,
  },
  priceDash: { fontSize: 14, color: COLORS.text2 },
  applyPriceBtn: { backgroundColor: COLORS.coral, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  applyPriceText: { fontSize: 11, color: COLORS.white, fontWeight: '700' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.coral, borderColor: COLORS.coral },
  chipText: { color: COLORS.text2, fontSize: 12, fontWeight: '500' },
  chipTextActive: { color: COLORS.white, fontWeight: '700' },

  /* Pinterest grid */
  gridContainer: { paddingBottom: 80 },
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

  /* Card */
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
  priceOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 6, paddingVertical: 4,
  },
  priceText: {
    color: COLORS.white, fontSize: 11, fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.85)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  cardFooter: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 8, paddingVertical: 7, gap: 2,
  },
  cardName: { fontSize: 12, fontWeight: '600', color: COLORS.text, lineHeight: 16 },
  cardSeller: { fontSize: 10, color: COLORS.text2 },

  /* Empty */
  empty: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center',
  },
  emptyText: { color: COLORS.text2, fontSize: 14, fontWeight: '500' },

  /* Category modal */
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalContent: {
    width: 240, backgroundColor: COLORS.surface, borderRadius: 12, padding: 10, gap: 2,
  },
  modalTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 6, marginLeft: 4 },
  modalItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: 8, borderRadius: 6,
  },
  modalItemActive: { backgroundColor: COLORS.surface2 },
  modalItemText: { fontSize: 12, color: COLORS.text2, fontWeight: '500' },
  modalItemTextActive: { color: COLORS.coral, fontWeight: '700' },
});
