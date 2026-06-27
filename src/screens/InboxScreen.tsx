import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING } from '../theme';
import { useTranslation } from '../i18n';
import { getConversations, getNotifications, markNotificationRead } from '../api';
import type { Conversation, Notification } from '../types';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString('fr-HT', { day: 'numeric', month: 'short' });
}

export default function InboxScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'Inbox'>>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const convos = await getConversations() as { conversations: Conversation[] };
      const notifs = await getNotifications() as unknown as { notifications: Notification[] };
      setConversations(convos.conversations || []);
      setNotifications((notifs.notifications || []).slice(0, 3));
    } catch { Alert.alert(t('common.error'), 'Could not load messages.'); }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, []);

  const handleNotificationPress = async (notif: Notification) => {
    if (!notif.is_read) {
      try { await markNotificationRead(notif.id); } catch { /* silent */ }
    }
    if (notif.data && (notif.data as any).orderId) {
      nav.navigate('OrderDetail', { orderId: (notif.data as any).orderId });
    }
  };

  const handleBack = () => {
    if (route.params?.returnTab) {
      nav.navigate('Main', { screen: route.params.returnTab });
      return;
    }
    if (nav.canGoBack()) {
      nav.goBack();
      return;
    }
    nav.navigate('Main', { screen: 'FeedTab' });
  };

  const renderConversation = ({ item }: { item: Conversation }) => {
    const otherName = item.other_user?.full_name || 'Seller';
    const initial = otherName[0] || '?';
    const hasUnread = (item.unread_count || 0) > 0;

    return (
      <TouchableOpacity
        style={styles.convo}
        onPress={() => nav.navigate('Chat', { conversationId: item.id, otherUserName: otherName })}
      >
        <View style={[styles.convoAvatar, { backgroundColor: COLORS.coral }]}>
          <Text style={styles.convoAvatarText}>{initial}</Text>
        </View>
        <View style={styles.convoBody}>
          <Text style={styles.convoName}>{otherName}</Text>
          <Text style={styles.convoMsg} numberOfLines={1}>
            {item.last_message?.content || 'No messages yet'}
          </Text>
        </View>
        <View style={styles.convoRight}>
          <Text style={styles.convoTime}>{timeAgo(item.last_message_at || item.created_at)}</Text>
          {hasUnread && <View style={styles.unreadDot} />}
        </View>
      </TouchableOpacity>
    );
  };

  const ListHeader = () => (
    <>
      <View style={[styles.topBar, { paddingTop: insets.top + SPACING.md }]}>
        {(route.params?.returnTab || nav.canGoBack()) && (
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.text2} />
          </TouchableOpacity>
        )}
        <Text style={styles.title}>{t('inbox.title')}</Text>
      </View>
      {notifications.length > 0 && (
        <TouchableOpacity style={styles.notifBanner} onPress={() => handleNotificationPress(notifications[0])}>
          <MaterialCommunityIcons name="package-variant" size={18} color={COLORS.yellow} />
          <View style={{ flex: 1 }}>
            <Text style={styles.notifText}>{notifications[0].title}</Text>
            <Text style={styles.notifSub}>{timeAgo(notifications[0].created_at)} - tap to view</Text>
          </View>
        </TouchableOpacity>
      )}
    </>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={conversations}
        renderItem={renderConversation}
        keyExtractor={item => item.id}
        ListHeaderComponent={<ListHeader />}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.coral} />
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={COLORS.coral} style={{ marginTop: 60 }} />
          ) : !refreshing ? (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="message-outline" size={40} color={COLORS.text2} />
              <Text style={styles.emptyText}>{t('inbox.noMessages')}</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { padding: 2 },
  title: { fontSize: 18, color: COLORS.text, fontWeight: '700' },
  notifBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    margin: SPACING.md, marginBottom: 0,
    backgroundColor: 'rgba(255,209,102,0.1)', borderWidth: 1, borderColor: 'rgba(255,209,102,0.3)',
    borderRadius: 10, padding: SPACING.md,
  },
  notifText: { fontSize: 12, color: COLORS.text, lineHeight: 18 },
  notifSub: { fontSize: 10, color: COLORS.text2, marginTop: 2 },
  convo: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 10 },
  convoAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  convoAvatarText: { fontSize: 14, color: COLORS.white, fontWeight: '700' },
  convoBody: { flex: 1 },
  convoName: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  convoMsg: { fontSize: 12, color: COLORS.text2, marginTop: 1 },
  convoRight: { alignItems: 'flex-end', gap: 4 },
  convoTime: { fontSize: 10, color: COLORS.text2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.coral },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 100, gap: 8 },
  emptyText: { fontSize: 14, color: COLORS.text2 },
});
