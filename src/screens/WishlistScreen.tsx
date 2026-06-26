import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING } from '../theme';
import { getWishlist, toggleWishlist } from '../api';
import type { Product } from '../types';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function WishlistScreen() {
  const nav = useNavigation<Nav>();
  const [items, setItems] = useState<Product[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await getWishlist() as { items: Product[] };
      setItems(res.items || []);
    } catch { Alert.alert('Error', 'Could not load wishlist.'); }
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
    } catch { Alert.alert('Error', 'Failed to remove from wishlist.'); }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => nav.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.text2} />
        </TouchableOpacity>
        <Text style={styles.title}>Wishlist</Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => nav.navigate('ProductDetail', { productId: item.id })}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.price}>Rs {item.price.toLocaleString()}</Text>
            </View>
            <TouchableOpacity onPress={() => handleRemove(item.id)}>
              <MaterialCommunityIcons name="heart-off" size={18} color={COLORS.coral} />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.coral} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={COLORS.coral} style={{ marginTop: 60 }} />
          ) : !refreshing ? (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="heart-outline" size={40} color={COLORS.text2} />
              <Text style={styles.emptyText}>Your wishlist is empty</Text>
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
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rowLeft: { flex: 1, gap: 2 },
  name: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  price: { fontSize: 12, color: COLORS.coral, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyText: { fontSize: 14, color: COLORS.text2 },
});
