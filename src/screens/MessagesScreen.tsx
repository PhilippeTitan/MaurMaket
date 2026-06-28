import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../theme';
import { getConversations, createConversation } from '../api';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import type { Conversation } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export default function MessagesScreen({ navigation }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = async () => {
    try {
      const res = await getConversations() as { conversations: Conversation[] };
      setConversations(res.conversations || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 10000);
    return () => clearInterval(interval);
  }, []);

  const renderItem = ({ item }: { item: Conversation }) => (
    <TouchableOpacity
      style={styles.item}
      onPress={() => navigation.navigate('Chat', {
        conversationId: item.id,
        otherUserName: item.other_user?.full_name || 'User',
      })}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{item.other_user?.full_name?.charAt(0) || '?'}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{item.other_user?.full_name || 'User'}</Text>
        <Text style={styles.lastMsg} numberOfLines={1}>{item.last_message?.content || 'No messages yet'}</Text>
      </View>
      {item.unread_count && item.unread_count > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{item.unread_count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.title}>Messages</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.coral} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={conversations}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No conversations yet</Text>
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
  title: { fontFamily: 'Syne', fontSize: 20, fontWeight: '800', color: COLORS.text },
  list: { padding: SPACING.md, paddingBottom: 100 },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.coral,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  lastMsg: { fontSize: 12, color: COLORS.text2, marginTop: 2 },
  badge: {
    backgroundColor: COLORS.coral, borderRadius: 10, minWidth: 20, height: 20,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6,
  },
  badgeText: { color: COLORS.white, fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: COLORS.text2, fontSize: 15 },
});
