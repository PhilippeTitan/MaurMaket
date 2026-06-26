import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Image, Alert,
} from 'react-native';
import { COLORS, SPACING } from '../theme';
import { store } from '../store';
import { getOrders, getWishlist } from '../api';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import type { Order, Product } from '../types';

type Props = NativeStackScreenProps<RootStackParamList>;

export default function ProfileScreen({ navigation }: Props) {
  const [user, setUser] = useState(store.user);
  const [orderCount, setOrderCount] = useState(0);
  const [wishlistItems, setWishlistItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = store.onChange(() => setUser(store.user));
    return unsub;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [orderRes, wlRes] = await Promise.all([
          getOrders() as Promise<{ buyerOrders: Order[] }>,
          getWishlist() as Promise<{ items: Product[] }>,
        ]);
        setOrderCount((orderRes.buyerOrders || []).length);
        setWishlistItems(wlRes.items || []);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const handleLogout = async () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => store.logout() },
    ]);
  };

  if (!user) return null;

  const initials = user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.topbar}>
        <Text style={styles.title}>Profile</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.hero}>
        <View style={styles.avatar}>
          {user.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarText}>{initials}</Text>
          )}
        </View>
        <Text style={styles.name}>{user.full_name}</Text>
        <Text style={styles.email}>{user.email}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{user.role === 'seller' ? 'Seller' : 'Buyer'}</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{orderCount}</Text>
          <Text style={styles.statLabel}>Orders</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{wishlistItems.length}</Text>
          <Text style={styles.statLabel}>Wishlist</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{user.role === 'seller' ? '✓' : '—'}</Text>
          <Text style={styles.statLabel}>Seller</Text>
        </View>
      </View>

      {user.role !== 'seller' && (
        <TouchableOpacity
          style={styles.becomeSellerBtn}
          onPress={async () => {
            try {
              const res = await import('../api').then(m => m.becomeSeller()) as { user: typeof user };
              await store.setUser(res.user, store.token);
              Alert.alert('Success', 'You are now a seller!');
            } catch (err: unknown) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed');
            }
          }}
        >
          <Text style={styles.becomeSellerText}>Become a Seller</Text>
        </TouchableOpacity>
      )}

      {user.role === 'seller' && (
        <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('Orders')}>
          <Text style={styles.menuText}>Seller Dashboard</Text>
          <Text style={styles.menuArrow}>→</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('Notifications')}>
        <Text style={styles.menuText}>Notifications</Text>
        <Text style={styles.menuArrow}>→</Text>
      </TouchableOpacity>

      {wishlistItems.length > 0 && (
        <View style={styles.wishlistSection}>
          <Text style={styles.sectionTitle}>Wishlist</Text>
          {wishlistItems.slice(0, 6).map(item => (
            <TouchableOpacity
              key={item.id}
              style={styles.wishlistItem}
              onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
            >
              <Text style={styles.wishlistItemName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.wishlistItemPrice}>Rs {item.price.toLocaleString()}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingBottom: 100 },
  topbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl + 40, paddingBottom: SPACING.sm,
  },
  title: { fontFamily: 'Syne', fontSize: 22, fontWeight: '800', color: COLORS.text },
  settingsIcon: { fontSize: 20 },
  hero: { alignItems: 'center', paddingVertical: SPACING.lg, gap: 6 },
  avatar: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: COLORS.coral, justifyContent: 'center', alignItems: 'center', marginBottom: 4,
  },
  avatarImg: { width: '100%', height: '100%', borderRadius: 38 },
  avatarText: { fontSize: 28, fontWeight: '800', color: COLORS.white },
  name: { fontFamily: 'Syne', fontSize: 20, fontWeight: '800', color: COLORS.text },
  email: { fontSize: 13, color: COLORS.text2 },
  roleBadge: {
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 3, marginTop: 2,
  },
  roleText: { fontSize: 11, color: COLORS.text2 },
  statsRow: { flexDirection: 'row', paddingHorizontal: SPACING.lg, gap: 8, marginBottom: SPACING.lg },
  statCard: {
    flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 14, padding: 12, alignItems: 'center',
  },
  statNum: { fontFamily: 'Syne', fontSize: 22, fontWeight: '800', color: COLORS.coral },
  statLabel: { fontSize: 11, color: COLORS.text2, marginTop: 2 },
  becomeSellerBtn: {
    marginHorizontal: SPACING.lg, backgroundColor: COLORS.coral, padding: 14,
    borderRadius: 20, alignItems: 'center', marginBottom: SPACING.md,
  },
  becomeSellerText: { color: COLORS.white, fontWeight: '600', fontSize: 15 },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderWidth: 1,
    borderColor: COLORS.border, borderRadius: 14, padding: 14, marginBottom: 6,
  },
  menuText: { fontSize: 14, fontWeight: '500', color: COLORS.text },
  menuArrow: { fontSize: 16, color: COLORS.text2 },
  wishlistSection: { marginHorizontal: SPACING.lg, marginTop: SPACING.md },
  sectionTitle: { fontFamily: 'Syne', fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  wishlistItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 14, padding: 12, marginBottom: 6,
  },
  wishlistItemName: { fontSize: 13, color: COLORS.text, flex: 1 },
  wishlistItemPrice: { fontSize: 13, fontWeight: '700', color: COLORS.coral },
  logoutBtn: {
    marginHorizontal: SPACING.lg, marginTop: SPACING.lg, padding: 14, borderRadius: 20,
    borderWidth: 1.5, borderColor: COLORS.coral, alignItems: 'center', marginBottom: 40,
  },
  logoutText: { color: COLORS.coral, fontWeight: '600', fontSize: 15 },
});
