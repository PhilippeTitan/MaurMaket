import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, Pressable, FlatList, RefreshControl, ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '../components/icons/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, RADIUS } from '../theme';
import { getProducts, getCategories, trackFeedEvent } from '../api';
import { store } from '../store';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '../hooks';
import { cacheKeys, readSnapshot, writeSnapshot } from '../offlineCache';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import type { Product, Category } from '../types';
import { useTranslation } from '@/localization';
import { useReduceMotion } from '../hooks/useReduceMotion';
import EmptyState from '../components/EmptyState';
import { ProductGridSkeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import MasonryGrid from '../components/MasonryGrid';
import SaveChip from '../components/profile/SaveChip';
import { useSavedListings } from '../hooks/useSavedListings';

type Props = NativeStackScreenProps<RootStackParamList>;
type CategoryFilter = Pick<Category, 'id' | 'name'>;
type SortOption = { label: string; value: string };

const SORT_OPTIONS: SortOption[] = [
  { label: 'explore.sortForYou', value: 'foryou' },
  { label: 'explore.sortNewest', value: 'newest' },
  { label: 'explore.sortPriceLow', value: 'price_asc' },
  { label: 'explore.sortPriceHigh', value: 'price_desc' },
  { label: 'explore.sortOldest', value: 'oldest' },
];

const DEFAULT_SORT = 'foryou';
const CONDITION_OPTIONS = ['new', 'like_new', 'good', 'fair', 'for_parts'] as const;
const CONDITION_LABEL_KEYS: Record<(typeof CONDITION_OPTIONS)[number], string> = {
  new: 'addListing.cond.new',
  like_new: 'addListing.cond.likeNew',
  good: 'addListing.cond.good',
  fair: 'addListing.cond.fair',
  for_parts: 'addListing.cond.forParts',
};

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

const COL_GAP = 6;
const SIDE_PAD = 8;

export default function ExploreScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const reduceMotion = useReduceMotion();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [selectedCat, setSelectedCat] = useState<string>('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [catModal, setCatModal] = useState(false);
  const categoryListRef = useRef<FlatList<CategoryFilter>>(null);  const [sortBy, setSortBy] = useState(DEFAULT_SORT);
  const [sortModal, setSortModal] = useState(false);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [condition, setCondition] = useState('');
  // Staging state — only committed on Apply
  const [pendingSortBy, setPendingSortBy] = useState(DEFAULT_SORT);
  const [pendingMinPrice, setPendingMinPrice] = useState('');
  const [pendingMaxPrice, setPendingMaxPrice] = useState('');
  const [pendingCondition, setPendingCondition] = useState('');
  const filtersRestored = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [quickProduct, setQuickProduct] = useState<Product | null>(null);
  const [quickDismissable, setQuickDismissable] = useState(false);
  const [, setStoreRevision] = useState(0);

  useEffect(() => {
    if (!quickProduct) { setQuickDismissable(false); return; }
    const timer = setTimeout(() => setQuickDismissable(true), 180);
    return () => clearTimeout(timer);
  }, [quickProduct]);

  useEffect(() => store.onChange(() => setStoreRevision((revision) => revision + 1)), []);

  useFocusEffect(useCallback(() => () => {
    setSearch('');
    setDebouncedSearch('');
  }, []));

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => ((await getCategories()) as { categories?: Category[] }).categories || [],
    staleTime: 10 * 60_000,
  });

  // Debounce the raw `search` value so the TextInput stays instantly
  // responsive while network requests only fire ~350ms after the user
  // stops typing, instead of on every keystroke.
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(search);
    }, 350);
    return () => clearTimeout(handle);
  }, [search]);

  // Restore persisted filters on mount
  useEffect(() => {
    if (filtersRestored.current) return;
    filtersRestored.current = true;
    (async () => {
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const raw = await AsyncStorage.getItem('mm_explore_filters');
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved.sortBy) setSortBy(saved.sortBy);
          if (saved.selectedCat) setSelectedCat(saved.selectedCat);
          if (saved.minPrice) setMinPrice(saved.minPrice);
          if (saved.maxPrice) setMaxPrice(saved.maxPrice);
          if (saved.condition) setCondition(saved.condition);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  // Persist filters when they change
  useEffect(() => {
    if (!filtersRestored.current) return;
    (async () => {
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        await AsyncStorage.setItem('mm_explore_filters', JSON.stringify({ sortBy, selectedCat, minPrice, maxPrice, condition }));
      } catch { /* ignore */ }
    })();
  }, [sortBy, selectedCat, minPrice, maxPrice, condition]);

  const productParams = useMemo(() => {
    const params: Record<string, string> = { limit: '50' };
    if (store.isLoggedIn) params.personalized = 'true';
    if (selectedCat) params.category = selectedCat;
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    if (sortBy && sortBy !== DEFAULT_SORT) params.sort = sortBy;
    if (minPrice.trim()) params.minPrice = minPrice.trim();
    if (maxPrice.trim()) params.maxPrice = maxPrice.trim();
    if (condition) params.condition = condition;
    return params;
  }, [selectedCat, debouncedSearch, sortBy, minPrice, maxPrice, condition]);

  const { data: products = [], isLoading: loading, refetch } = useQuery<Product[]>({
    queryKey: ['explore-products', productParams],
    queryFn: async () => ((await getProducts(productParams)) as { products?: Product[] }).products || [],
    placeholderData: previousData => previousData,
  });

  const productCacheKey = cacheKeys.explore(productParams, store.user?.id);
  const productIds = useMemo(() => products.map((product) => product.id), [products]);
  const savedListings = useSavedListings(store.isLoggedIn ? productIds : []);
  const handleSave = useCallback((productId: string) => {
    if (!store.isLoggedIn) {
      navigation.navigate('Auth', { screen: 'Login' });
      return;
    }
    void savedListings.toggle(productId);
  }, [navigation, savedListings.toggle]);
  useEffect(() => {
    let active = true;
    void readSnapshot<Product[]>(productCacheKey).then(snapshot => {
      if (active && snapshot?.value?.length && !queryClient.getQueryData(['explore-products', productParams])) {
        queryClient.setQueryData(['explore-products', productParams], snapshot.value);
      }
    });
    return () => { active = false; };
  }, [productCacheKey]);

  useEffect(() => {
    if (products.length) void writeSnapshot(productCacheKey, products);
  }, [productCacheKey, products]);

  const refreshProducts = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const applyQuickFeedback = async (eventType: 'relevant' | 'not_relevant') => {
    const product = quickProduct;
    if (!product) return;
    setQuickProduct(null);
    if (eventType === 'not_relevant') {
      queryClient.setQueryData<Product[]>(['explore-products', productParams], prev => (prev || []).filter(p => p.id !== product.id));
    }
    try {
      await trackFeedEvent(product.id, eventType);
      await queryClient.invalidateQueries({ queryKey: ['explore-products'] });
      await queryClient.invalidateQueries({ queryKey: ['feed-products', 'forYou'] });
      await refetch();
    } catch {
      toast.error(t('common.error'), t('feedback.feedPreferenceSaveFailed'));
    }
  };

  const selectCategory = (categoryName: string) => {
    setSelectedCat(categoryName);
    if (!categoryName) {
      requestAnimationFrame(() => {
        categoryListRef.current?.scrollToOffset({ offset: 0, animated: true });
      });
    }
  };

  const renderExploreCardBottom = useCallback((item: Product) => (
    <TouchableOpacity style={styles.cardNameRow} activeOpacity={0.6} onPress={() => navigation.navigate('ProductDetail', { productId: item.id })} accessibilityRole="button" accessibilityLabel={t('accessibility.viewProduct')}>
      <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
    </TouchableOpacity>
  ), [navigation, t]);

  const renderExploreCardOverlay = useCallback((item: Product) => (
    <SaveChip
      saved={savedListings.isSaved(item.id)}
      onPress={() => handleSave(item.id)}
      label={t(savedListings.isSaved(item.id) ? 'profile.unsaveListing' : 'profile.saveListing')}
    />
  ), [handleSave, savedListings.isSaved, t]);

  const hasAppliedFilters = sortBy !== DEFAULT_SORT || !!selectedCat || !!minPrice || !!maxPrice || !!condition;
  const hasAnySearchOrFilter = hasAppliedFilters || !!search.trim();
  const clearAllFilters = useCallback(() => {
    setSearch('');
    setDebouncedSearch('');
    setSelectedCat('');
    setSortBy(DEFAULT_SORT);
    setMinPrice('');
    setMaxPrice('');
    setCondition('');
    setPendingSortBy(DEFAULT_SORT);
    setPendingMinPrice('');
    setPendingMaxPrice('');
    setPendingCondition('');
  }, []);

  const activeFilters = [
    selectedCat ? { key: 'category', label: selectedCat, clear: () => setSelectedCat('') } : null,
    sortBy !== DEFAULT_SORT ? { key: 'sort', label: t(SORT_OPTIONS.find((option) => option.value === sortBy)?.label || 'explore.sortForYou'), clear: () => setSortBy(DEFAULT_SORT) } : null,
    minPrice || maxPrice ? { key: 'price', label: `${minPrice || '0'}–${maxPrice || '∞'} G`, clear: () => { setMinPrice(''); setMaxPrice(''); } } : null,
    condition ? { key: 'condition', label: t(CONDITION_LABEL_KEYS[condition as (typeof CONDITION_OPTIONS)[number]]), clear: () => setCondition('') } : null,
  ].filter((filter): filter is { key: string; label: string; clear: () => void } => filter !== null);

  const broadenSearch = useCallback(() => {
    setSearch('');
    setDebouncedSearch('');
    setSelectedCat('');
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.fixedHeader}>
        <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
          <Text style={styles.logo}>Maur<Text style={styles.logoAccent}>Maket</Text></Text>
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchWrap}>
            <Icon name="search" size={22} color={COLORS.text2} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('explore.search')}
              placeholderTextColor={COLORS.text2}
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={() => refetch()}
              accessibilityRole="search"
              accessibilityLabel={t('accessibility.searchProducts')}
            />
            {search.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearch('')}
                accessibilityRole="button"
                accessibilityLabel={t('accessibility.clearSearch')}
              >
                <Icon name="close-circle" size={20} color={COLORS.text2} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={styles.filterBtn}
            onPress={() => { setPendingSortBy(sortBy); setPendingMinPrice(minPrice); setPendingMaxPrice(maxPrice); setPendingCondition(condition); setSortModal(true); }}
            accessibilityRole="button"
            accessibilityLabel={t('accessibility.sortFilter')}
          >
            <MaterialCommunityIcons name="tune-variant" size={28} color={hasAppliedFilters ? COLORS.coral : COLORS.text} />
          </TouchableOpacity>
        </View>
      </View>

      {hasAnySearchOrFilter ? (
        <View style={styles.activeFiltersRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeFiltersContent}>
            {search.trim() ? <View style={styles.activeFilterChip}><Text style={styles.activeFilterText} numberOfLines={1}>{t('explore.searchActive', { query: search.trim() })}</Text></View> : null}
            {activeFilters.map((filter) => (
              <TouchableOpacity
                key={filter.key}
                style={styles.activeFilterChip}
                onPress={filter.clear}
                accessibilityRole="button"
                accessibilityLabel={t('explore.removeFilter', { filter: filter.label })}
              >
                <Text style={styles.activeFilterText} numberOfLines={1}>{filter.label}</Text>
                <Icon name="close" size={14} color={COLORS.text} />
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity onPress={clearAllFilters} style={styles.clearAllBtn} accessibilityRole="button" accessibilityLabel={t('accessibility.clearFilters')}>
            <Text style={styles.clearAllText}>{t('explore.clearAll')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.chipsWrapper}>
          <View style={styles.chipFadeLeftWrap} pointerEvents="none">
            {[1,.93,.86,.79,.72,.65,.58,.51,.44,.37,.30,.23,.16,.09,.02].map((op, i) => (
              <View key={i} style={{ flex: 1, backgroundColor: `rgba(13,17,23,${op})` }} />
            ))}
          </View>
          <View style={styles.chipFadeRightWrap} pointerEvents="none">
            {[.02,.09,.16,.23,.30,.37,.44,.51,.58,.65,.72,.79,.86,.93,1].map((op, i) => (
              <View key={i} style={{ flex: 1, backgroundColor: `rgba(13,17,23,${op})` }} />
            ))}
          </View>
          <FlatList
            ref={categoryListRef}
            horizontal
            overScrollMode="never"
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
                  accessibilityRole="button"
                  accessibilityLabel={cat.id === '' ? t('accessibility.selectCategory') : cat.name}
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
        </View>

      {loading ? (
        <View style={{ marginTop: 12 }}>
          <ProductGridSkeleton count={6} />
        </View>
      ) : products.length === 0 ? (
        <View style={styles.emptyResults}>
          <EmptyState
            icon="magnify-close"
            title={t('explore.noProducts')}
            hint={t('explore.tryAdjust')}
            size={64}
          />
          {hasAnySearchOrFilter ? (
            <View style={styles.emptyActions}>
              <TouchableOpacity style={styles.emptyActionPrimary} onPress={clearAllFilters} accessibilityRole="button">
                <Text style={styles.emptyActionPrimaryText}>{t('explore.clearAll')}</Text>
              </TouchableOpacity>
              {search.trim() || selectedCat ? (
                <TouchableOpacity style={styles.emptyActionSecondary} onPress={broadenSearch} accessibilityRole="button">
                  <Text style={styles.emptyActionSecondaryText}>{t('explore.broadenSearch')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : (
        <MasonryGrid
          products={products}
          columnGap={COL_GAP}
          sidePad={SIDE_PAD}
          animateLayoutChanges
          renderCardBottom={renderExploreCardBottom}
          renderCardOverlay={renderExploreCardOverlay}
          onPress={(item) => navigation.navigate('ProductDetail', { productId: item.id })}
          onLongPress={(item) => setQuickProduct(item)}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshProducts} tintColor={COLORS.coral} />}
        />
      )}

      <Modal visible={Boolean(quickProduct)} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={() => setQuickProduct(null)}>
        <Pressable style={styles.quickOverlay} onPress={() => { if (quickDismissable) setQuickProduct(null); }}>
          <Pressable style={styles.quickFan} onPress={e => e.stopPropagation()}>
            <Text style={styles.quickTitle} numberOfLines={1}>{quickProduct?.name}</Text>
            <View style={styles.quickActions}>
              <TouchableOpacity style={[styles.quickAction, styles.quickActionLeft]} onPress={() => { if (quickProduct) navigation.navigate('ProductDetail', { productId: quickProduct.id }); setQuickProduct(null); }} accessibilityRole="button" accessibilityLabel={t('accessibility.viewProduct')}>
                <MaterialCommunityIcons name="eye-outline" size={22} color={COLORS.text} /><Text style={styles.quickLabel}>{t('accessibility.viewProduct')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.quickAction, styles.quickActionTop]} onPress={() => applyQuickFeedback('relevant')} accessibilityRole="button" accessibilityLabel={t('feed.showMoreLike')}>
                <MaterialCommunityIcons name="thumb-up-outline" size={22} color={COLORS.coral} /><Text style={styles.quickLabel}>{t('feed.showMoreLike')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.quickAction, styles.quickActionRight]} onPress={() => applyQuickFeedback('not_relevant')} accessibilityRole="button" accessibilityLabel={t('feed.notInterested')}>
                <MaterialCommunityIcons name="thumb-down-outline" size={22} color={COLORS.coral} /><Text style={styles.quickLabel}>{t('feed.notInterested')}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.quickHint}>{t('explore.quickFeedbackHint')}</Text>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={catModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setCatModal(false)}>
          <Pressable style={styles.modalSheet} onPress={e => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Categories</Text>
              <TouchableOpacity
                onPress={() => setCatModal(false)}
                accessibilityRole="button"
                accessibilityLabel={t('accessibility.close')}
              >
                <Icon name="close" size={18} color={COLORS.text2} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.modalItem, !selectedCat && styles.modalItemActive]}
              onPress={() => { selectCategory(''); setCatModal(false); }}
              accessibilityRole="button"
              accessibilityLabel={t('accessibility.selectCategory')}
            >
              <MaterialCommunityIcons name="apps" size={18} color={!selectedCat ? COLORS.coral : COLORS.text2} />
              <Text style={[styles.modalItemText, !selectedCat && styles.modalItemTextActive]}>{t('explore.all')}</Text>
            </TouchableOpacity>
            {categories.map(cat => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.modalItem, selectedCat === cat.name && styles.modalItemActive]}
                onPress={() => { selectCategory(cat.name); setCatModal(false); }}
                accessibilityRole="button"
                accessibilityLabel={cat.name}
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
          <Pressable style={styles.modalSheet} onPress={e => e.stopPropagation()}>
            {/* Header */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('explore.filters')}</Text>
              <TouchableOpacity
                onPress={() => setSortModal(false)}
                accessibilityRole="button"
                accessibilityLabel={t('accessibility.close')}
              >
                <Icon name="close" size={20} color={COLORS.text2} />
              </TouchableOpacity>
            </View>

            {/* Sort section */}
            <Text style={styles.sheetSectionTitle}>Sort by</Text>
            <View style={styles.sortGrid}>
              {SORT_OPTIONS.map(option => (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.sortPill, pendingSortBy === option.value && styles.sortPillActive]}
                  onPress={() => setPendingSortBy(option.value)}
                  accessibilityRole="button"
                  accessibilityLabel={t(option.label)}
                >
                  <Text style={[styles.sortPillText, pendingSortBy === option.value && styles.sortPillTextActive]}>
                    {t(option.label)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Price section */}
            <Text style={styles.sheetSectionTitle}>{t('explore.priceRange')}</Text>
            <View style={styles.priceRow}>
              <TextInput
                style={styles.priceInputModal}
                placeholder={t('explore.priceMin')}
                placeholderTextColor={COLORS.text2}
                value={pendingMinPrice}
                onChangeText={setPendingMinPrice}
                keyboardType="numeric"
                accessibilityLabel={t('explore.priceMin')}
              />
              <Text style={styles.priceDashModal}>–</Text>
              <TextInput
                style={styles.priceInputModal}
                placeholder={t('explore.priceMax')}
                placeholderTextColor={COLORS.text2}
                value={pendingMaxPrice}
                onChangeText={setPendingMaxPrice}
                keyboardType="numeric"
                accessibilityLabel={t('explore.priceMax')}
              />
            </View>

            <Text style={styles.sheetSectionTitle}>{t('explore.condition')}</Text>
            <View style={styles.sortGrid}>
              <TouchableOpacity
                style={[styles.sortPill, !pendingCondition && styles.sortPillActive]}
                onPress={() => setPendingCondition('')}
                accessibilityRole="button"
                accessibilityLabel={t('explore.allConditions')}
              >
                <Text style={[styles.sortPillText, !pendingCondition && styles.sortPillTextActive]}>{t('explore.allConditions')}</Text>
              </TouchableOpacity>
              {CONDITION_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[styles.sortPill, pendingCondition === option && styles.sortPillActive]}
                  onPress={() => setPendingCondition(pendingCondition === option ? '' : option)}
                  accessibilityRole="button"
                  accessibilityLabel={t(CONDITION_LABEL_KEYS[option])}
                  accessibilityState={{ selected: pendingCondition === option }}
                >
                  <Text style={[styles.sortPillText, pendingCondition === option && styles.sortPillTextActive]}>{t(CONDITION_LABEL_KEYS[option])}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Apply */}
            <TouchableOpacity
              style={styles.modalApplyBtn}
              onPress={() => {
                setSortBy(pendingSortBy);
                setMinPrice(pendingMinPrice);
                setMaxPrice(pendingMaxPrice);
                setCondition(pendingCondition);
                setSortModal(false);
                refetch();
              }}
              accessibilityRole="button"
              accessibilityLabel={t('accessibility.apply')}
            >
              <Text style={styles.modalApplyText}>{t('explore.apply')}</Text>
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
    backgroundColor: COLORS.surface, borderRadius: RADIUS.pill,
    paddingHorizontal: 14, height: 44,
  },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 15, paddingVertical: 0 },
  catBtn: {
    width: 38, height: 38, borderRadius: 6,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },

  chipsWrapper: { position: 'relative', backgroundColor: COLORS.bg },
  activeFiltersRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  activeFiltersContent: { alignItems: 'center', gap: 6, paddingRight: 4 },
  activeFilterChip: {
    maxWidth: 180, minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  activeFilterText: { color: COLORS.text, fontSize: 11, fontWeight: '600', flexShrink: 1 },
  clearAllBtn: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 4 },
  clearAllText: { color: COLORS.coral, fontSize: 12, fontWeight: '700' },
  chipsRow: { paddingHorizontal: 12, gap: 8, paddingVertical: 8 },
  chipFadeLeftWrap: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 28, zIndex: 3,
    flexDirection: 'row',
  },
  chipFadeRightWrap: {
    position: 'absolute', right: 0, top: 0, bottom: 0, width: 28, zIndex: 3,
    flexDirection: 'row',
  },

  filterBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  clearFilterBtn: {
    width: 38, height: 38, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill,
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
    borderRadius: RADIUS.row,
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
  cardPriceTop: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  imgDots: {
    position: 'absolute', bottom: 8, alignSelf: 'center',
    flexDirection: 'row', gap: 4,
  },
  cardStockBadge: {
    position: 'absolute', bottom: 6, left: 6,
  },
  imgDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  imgDotActive: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#fff',
    transform: [{ scale: 1.25 }],
  },
  cardNameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 6, paddingTop: 8, paddingBottom: 4,
  },
  cardName: {
    fontSize: 14, fontWeight: '700', color: COLORS.text,
    flex: 1,
  },
  stackedCard: {
    position: 'absolute',
    top: 2, right: -3,
    width: '100%',
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.row,
    borderWidth: 1,
    borderColor: COLORS.border,
    zIndex: -1,
  },

  empty: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyResults: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  emptyActions: { alignItems: 'center', gap: 10, marginTop: 12 },
  emptyActionPrimary: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 18, borderRadius: RADIUS.pill, backgroundColor: COLORS.coral },
  emptyActionPrimaryText: { color: COLORS.white, fontSize: 13, fontWeight: '700' },
  emptyActionSecondary: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14 },
  emptyActionSecondaryText: { color: COLORS.text2, fontSize: 13, fontWeight: '600' },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center',
  },
  emptyText: { color: COLORS.text2, fontSize: 14, fontWeight: '500' },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  quickOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center', justifyContent: 'center' },
  quickFan: { width: 300, height: 260, alignItems: 'center', justifyContent: 'center' },
  quickTitle: { color: COLORS.white, fontSize: 15, fontWeight: '800', maxWidth: 240, textAlign: 'center', marginBottom: 14 },
  quickActions: { width: '100%', height: 132, position: 'relative' },
  quickAction: { position: 'absolute', width: 94, minHeight: 94, borderRadius: 47, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, gap: 4 },
  quickActionLeft: { left: 0, bottom: 0 },
  quickActionTop: { left: 103, top: 0 },
  quickActionRight: { right: 0, bottom: 0 },
  quickLabel: { color: COLORS.text, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  quickHint: { color: 'rgba(255,255,255,0.76)', fontSize: 12, marginTop: 12, textAlign: 'center' },
  modalSheet: {
    width: '92%', maxWidth: 420, maxHeight: '88%', backgroundColor: COLORS.surface, borderRadius: RADIUS.card, padding: 14, gap: 0, overflow: 'hidden',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  sheetSectionTitle: { fontSize: 11, fontWeight: '700', color: COLORS.text2, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 8 },
  sortGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sortPill: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border,
  },
  sortPillActive: { backgroundColor: COLORS.coral, borderColor: COLORS.coral },
  sortPillText: { fontSize: 12, color: COLORS.text2, fontWeight: '600' },
  sortPillTextActive: { color: COLORS.white, fontWeight: '700' },
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
    borderRadius: RADIUS.row, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: COLORS.text,
    height: 38, minWidth: 0,
  },
  priceDashModal: { fontSize: 14, color: COLORS.text2 },
  modalApplyBtn: {
    backgroundColor: COLORS.coral, borderRadius: RADIUS.row, paddingHorizontal: 14, paddingVertical: 8,
    alignItems: 'center', marginTop: 12,
  },
  modalApplyText: { fontSize: 13, color: COLORS.white, fontWeight: '700' },
});
