import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity, StyleSheet, Dimensions, RefreshControl, ActivityIndicator,
} from 'react-native';
import { COLORS, SPACING } from '../theme';
import { getProducts } from '../api';
import { getImageUrl } from '../api';
import { store } from '../store';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import type { Product } from '../types';

type Props = NativeStackScreenProps<RootStackParamList>;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - SPACING.lg * 3) / 2;

export default function HomeScreen({ navigation }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [cartCount, setCartCount] = useState(store.cartCount);

  useEffect(() => {
    const unsub = store.onChange(() => setCartCount(store.cartCount));
    return unsub;
  }, []);

  const fetchProducts = useCallback(async (p: number, reset = false) => {
    try {
      const res = await getProducts({ page: String(p), limit: '20' }) as { products: Product[]; total: number; pages: number };
      if (reset) setProducts(res.products);
      else setProducts(prev => [...prev, ...res.products]);
      setHasMore(p < res.pages);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    (async () => {
      await fetchProducts(1, true);
      setLoading(false);
    })();
  }, [fetchProducts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setPage(1);
    await fetchProducts(1, true);
    setRefreshing(false);
  }, [fetchProducts]);

  const onEndReached = useCallback(async () => {
    if (hasMore && !loading) {
      const next = page + 1;
      setPage(next);
      await fetchProducts(next);
    }
  }, [hasMore, loading, page, fetchProducts]);

  const getItemImageUrl = (p: Product) => {
    const img = p.images?.find(i => i.is_primary) || p.images?.[0];
    return getImageUrl(img?.image_url);
  };

  const renderItem = ({ item }: { item: Product }) => {
    const imgUrl = getItemImageUrl(item);
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
      >
        <View style={styles.cardImage}>
          {imgUrl ? (
            <Image source={{ uri: imgUrl }} style={styles.cardImg} resizeMode="contain" />
          ) : (
            <Text style={styles.placeholder}>📷</Text>
          )}
          <View style={styles.priceBadge}>
            <Text style={styles.priceText}>Rs {item.price.toLocaleString()}</Text>
          </View>
        </View>
        <View style={styles.cardFooter}>
          <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
          {item.seller && (
            <Text style={styles.cardSeller} numberOfLines={1}>{item.seller.full_name}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.coral} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <Text style={styles.logo}>Maur<Text style={styles.logoAccent}>Maket</Text></Text>
        <TouchableOpacity onPress={() => navigation.navigate('Cart')}>
          <Text style={styles.cartIcon}>🛒{cartCount > 0 ? `(${cartCount})` : ''}</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={products}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.coral} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No products yet</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loadingContainer: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' },
  topbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl + 40, paddingBottom: SPACING.md,
    backgroundColor: COLORS.bg, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  logo: { fontFamily: 'Syne', fontSize: 22, fontWeight: '800', color: COLORS.text },
  logoAccent: { color: COLORS.coral },
  cartIcon: { fontSize: 20, color: COLORS.text2 },
  list: { padding: SPACING.sm },
  row: { justifyContent: 'space-between', paddingHorizontal: SPACING.xs },
  card: {
    width: CARD_WIDTH, backgroundColor: COLORS.surface, borderRadius: 16,
    marginBottom: SPACING.sm, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border,
  },
  cardImage: {
    height: CARD_WIDTH, position: 'relative', backgroundColor: COLORS.surface2,
    justifyContent: 'center', alignItems: 'center',
  },
  cardImg: { width: '100%', height: '100%' },
  placeholder: { fontSize: 40 },
  priceBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: COLORS.coral, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3,
  },
  priceText: { color: COLORS.white, fontSize: 11, fontWeight: '700' },
  cardFooter: { padding: 10 },
  cardName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  cardSeller: { fontSize: 11, color: COLORS.text2, marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', paddingTop: 100 },
  emptyText: { color: COLORS.text2, fontSize: 15 },
});
