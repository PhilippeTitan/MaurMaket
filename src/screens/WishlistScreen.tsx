import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert, ActivityIndicator, Image,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING } from '../theme';
import { useTranslation } from '../i18n';
import { getWishlist, toggleWishlist, getImageUrl } from '../api';
import type { Product } from '../types';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function WishlistScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const [items, setItems] = useState<Product[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await getWishlist() as { items: Product[] };
      setItems(res.items || []);
    } catch { Alert.alert(t('common.error'), t('wishlist.loadFailed')); }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, []);

  const handleRemove = async (productId: string) => {
    try {
      await toggleWishlist(productId);
      setItems(prev => prev.filter(i => i.id !== productId));
    } catch { Alert.alert(t('common.error'), t('wishlist.removeFailed')); }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => nav.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.text2} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('wishlist.title')}</Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const img = item.images?.find(i => i.is_primary) || item.images?.[0];
          const imgUrl = getImageUrl(img?.image_url);
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => nav.navigate('ProductDetail', { productId: item.id })}
            >
              {imgUrl ? (
                <Image source={{ uri: imgUrl }} style={styles.thumb} resizeMode="cover" />
              ) : (
                <View style={styles.thumbPlaceholder}>
                  <MaterialCommunityIcons name="image-off-outline" size={20} color={COLORS.text2} />
                </View>
              )}
              <View style={styles.rowLeft}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.price}>Rs {item.price.toLocaleString()}</Text>
                {item.stock !== undefined && item.stock !== null && (
                  <Text style={styles.stock}>{item.stock > 0 ? t('feed.available') : t('feed.soldOut')}</Text>
                )}
              </View>
              <TouchableOpacity onPress={() => handleRemove(item.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <MaterialCommunityIcons name="heart-off" size={18} color={COLORS.coral} />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.coral} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={COLORS.coral} style={{ marginTop: 60 }} />
          ) : !refreshing ? (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="heart-outline" size={40} color={COLORS.text2} />
              <Text style={styles.emptyText}>{t('wishlist.empty')}</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { fontSize: 16, color: COLORS.text, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 12 },
  thumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: COLORS.surface2 },
  thumbPlaceholder: { width: 48, height: 48, borderRadius: 8, backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center' },
  rowLeft: { flex: 1, gap: 2 },
  name: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  price: { fontSize: 12, color: COLORS.coral, fontWeight: '700' },
  stock: { fontSize: 11, color: COLORS.text2 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyText: { fontSize: 14, color: COLORS.text2 },
});
