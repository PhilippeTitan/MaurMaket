import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getFollowList } from '../api';
import type { RootStackParamList } from '../navigation';
import { COLORS, SPACING } from '../theme';
import UserAvatar from '../components/UserAvatar';
import ScreenHeader from '../components/ScreenHeader';

type Props = NativeStackScreenProps<RootStackParamList, 'FollowList'>;
type FollowUser = { id: string; full_name: string; username?: string; avatar_url?: string | null; store_name?: string | null; store_logo_url?: string | null; seller_tier?: any; use_store_identity?: boolean };

export default function FollowListScreen({ route, navigation }: Props) {
  const { userId, kind, title } = route.params;
  const [users, setUsers] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { getFollowList(userId, kind).then((r: any) => setUsers(r.users || [])).finally(() => setLoading(false)); }, [userId, kind]);
  return <View style={styles.container}>
    <ScreenHeader title={title} onBack={() => navigation.goBack()} />
    {loading ? <ActivityIndicator style={{ marginTop: 32 }} color={COLORS.coral} /> : <FlatList data={users} keyExtractor={item => item.id} ListEmptyComponent={<Text style={styles.empty}>No {kind} yet.</Text>} renderItem={({ item }) => <TouchableOpacity style={styles.row} onPress={() => navigation.push('Storefront', { sellerId: item.id, preloadedSeller: item as any })}>
      <UserAvatar seller={item as any} size={48} animated={false} /><View style={{ flex: 1 }}><Text style={styles.name}>{item.store_name || item.full_name}</Text><Text style={styles.handle}>{item.username ? `@${item.username}` : ''}</Text></View>
    </TouchableOpacity>} />}
  </View>;
}
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: COLORS.bg }, row: { minHeight: 68, paddingHorizontal: SPACING.lg, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border }, name: { color: COLORS.text, fontSize: 15, fontWeight: '700' }, handle: { color: COLORS.text2, fontSize: 13, marginTop: 2 }, empty: { color: COLORS.text2, textAlign: 'center', marginTop: 36, fontSize: 14 } });
