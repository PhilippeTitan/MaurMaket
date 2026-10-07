import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getMessageBookmarks, type MessageBookmark } from '../api';
import type { RootStackParamList } from '../navigation';
import { COLORS, SPACING } from '../theme';
import { useTranslation } from '@/localization';
import { MaterialCommunityIcons } from '../components/icons/UnifiedIcon';
import ScreenHeader from '../components/ScreenHeader';

type Props = NativeStackScreenProps<RootStackParamList, 'SavedMessages'>;

/**
 * Saved messages — the user's own private bookmarks.
 *
 * This list belongs to one person. Nothing here is shared with the other
 * participant, and nothing here is an order term: it is a place to keep a line
 * you want to find again. A message its author later deleted stays listed but
 * shows the deleted placeholder, because the point of saving it was to remember
 * that it existed, not to keep reading withdrawn text.
 */
export default function SavedMessagesScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [bookmarks, setBookmarks] = useState<MessageBookmark[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    getMessageBookmarks()
      .then((result) => {
        setBookmarks(result?.bookmarks || []);
        setTruncated(!!result?.truncated);
      })
      .catch(() => setError(t('savedMessages.loadError')))
      .finally(() => setLoading(false));
  }, [t]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openConversation = (bookmark: MessageBookmark) => {
    navigation.navigate('Chat', {
      conversationId: bookmark.conversationId,
      otherUserName: bookmark.peerName || t('savedMessages.unknownPeer'),
      otherUserId: bookmark.senderId,
    });
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('savedMessages.title')} onBack={() => navigation.goBack()} />
      <Text style={styles.explainer}>{t('savedMessages.explainer')}</Text>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={COLORS.coral} />
      ) : error ? (
        <TouchableOpacity onPress={load} accessibilityRole="button" accessibilityLabel={t('common.retry')}>
          <Text style={styles.empty}>{error} · {t('common.retry')}</Text>
        </TouchableOpacity>
      ) : (
        <FlatList
          data={bookmarks}
          keyExtractor={(item) => item.messageId}
          ListEmptyComponent={<Text style={styles.empty}>{t('savedMessages.empty')}</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => openConversation(item)}
              accessibilityRole="button"
              accessibilityLabel={t('savedMessages.openChat', { name: item.peerName || t('savedMessages.unknownPeer') })}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="bookmark" size={18} color={COLORS.coral} />
              <View style={styles.rowBody}>
                <Text style={styles.peer} numberOfLines={1}>
                  {item.peerName || t('savedMessages.unknownPeer')}
                </Text>
                <Text style={[styles.excerpt, item.isDeleted && styles.excerptDeleted]} numberOfLines={2}>
                  {item.excerpt}
                </Text>
                <Text style={styles.when}>
                  {t('savedMessages.savedOn', { date: new Date(item.bookmarkedAt).toLocaleDateString() })}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          ListFooterComponent={truncated ? <Text style={styles.footer}>{t('savedMessages.truncated')}</Text> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  explainer: { color: COLORS.text2, fontSize: 13, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm, lineHeight: 18 },
  row: {
    minHeight: 72, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  rowBody: { flex: 1 },
  peer: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  excerpt: { color: COLORS.text, fontSize: 14, marginTop: 3, lineHeight: 19 },
  excerptDeleted: { color: COLORS.text2, fontStyle: 'italic' },
  when: { color: COLORS.text2, fontSize: 12, marginTop: 4 },
  empty: { color: COLORS.text2, textAlign: 'center', marginTop: 36, fontSize: 14, paddingHorizontal: SPACING.lg },
  footer: { color: COLORS.text2, textAlign: 'center', fontSize: 12, paddingVertical: SPACING.md },
});
