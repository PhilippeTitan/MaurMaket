import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { COLORS, SPACING } from '../theme';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../api';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import type { Notification } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

export default function NotificationsScreen({ navigation }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    try {
      const res = await getNotifications() as { notifications: Notification[] };
      setNotifications(res.notifications || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchNotifications(); }, []);

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
    } catch { /* ignore */ }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch { /* ignore */ }
  };

  const renderItem = ({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[styles.item, !item.is_read && styles.itemUnread]}
      onPress={() => handleMarkRead(item.id)}
    >
      <View style={[styles.dot, !item.is_read && styles.dotUnread]} />
      <View style={styles.info}>
        <Text style={styles.notifTitle}>{item.title}</Text>
        {item.body && <Text style={styles.body} numberOfLines={2}>{item.body}</Text>}
        <Text style={styles.time}>{new Date(item.created_at).toLocaleDateString()}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        {notifications.some(n => !n.is_read) && (
          <TouchableOpacity onPress={handleMarkAllRead}>
            <Text style={styles.markAll}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.coral} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No notifications</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  topbar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl + 40, paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { color: COLORS.text, fontSize: 24 },
  title: { fontFamily: 'Syne', fontSize: 20, fontWeight: '800', color: COLORS.text, flex: 1 },
  markAll: { color: COLORS.blue, fontSize: 13, fontWeight: '500' },
  list: { padding: SPACING.md, paddingBottom: 100 },
  item: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  itemUnread: { backgroundColor: COLORS.surface },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border, marginTop: 5 },
  dotUnread: { backgroundColor: COLORS.coral },
  info: { flex: 1 },
  notifTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  body: { fontSize: 12, color: COLORS.text2, marginTop: 2 },
  time: { fontSize: 11, color: COLORS.text2, marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: COLORS.text2, fontSize: 15 },
});
