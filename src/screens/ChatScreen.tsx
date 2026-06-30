import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform, Alert, Image,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, formatPrice } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMessages, sendMessage as apiSendMessage, getImageUrl } from '../api';
import { useTranslation } from '../i18n';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import type { Message } from '../types';
import { store } from '../store';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export default function ChatScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { conversationId, otherUserName, otherUserId, otherUserAvatar, draftOffer } = route.params;
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [offerDraftVisible, setOfferDraftVisible] = useState(Boolean(draftOffer));
  const listRef = useRef<FlatList>(null);

  const fetchMessages = async () => {
    try {
      const res = await getMessages(conversationId) as { messages: Message[] };
      setMessages(res.messages || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [conversationId]);

  useEffect(() => {
    if (!draftOffer) return;
    const suggested = Math.max(1, Math.round(draftOffer.listPrice * 0.9));
    setText(`Offer: Rs ${suggested} for ${draftOffer.productName}`);
    setOfferDraftVisible(true);
  }, [draftOffer]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    const msg = text.trim();
    setText('');
    try {
      await apiSendMessage(conversationId, msg);
      await fetchMessages();
    } catch {
      Alert.alert(t('common.error'), t('chat.sendFailed'));
      setText(msg);
    }
    setSending(false);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === store.user?.id;
    return (
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
        <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.content}</Text>
        <Text style={styles.bubbleTime}>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + SPACING.md }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.text2} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerProfile}
          onPress={() => otherUserId && navigation.navigate('Storefront', { sellerId: otherUserId })}
          activeOpacity={0.7}
        >
          {getImageUrl(otherUserAvatar) ? (
            <Image source={{ uri: getImageUrl(otherUserAvatar)! }} style={styles.headerAvatarImg} />
          ) : (
            <View style={styles.headerAvatar}>
              <Text style={styles.headerAvatarText}>{(otherUserName || '?')[0]}</Text>
            </View>
          )}
          <Text style={styles.headerName} numberOfLines={1}>{otherUserName}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.coral} style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messageList}
          ref={listRef}
          onContentSizeChange={() => {
            if (listRef.current) {
              listRef.current.scrollToEnd({ animated: false });
            }
          }}
        />
      )}

      {draftOffer && offerDraftVisible && (
        <View style={styles.offerDock}>
          <View style={styles.offerIcon}>
            <MaterialCommunityIcons name="tag-outline" size={18} color={COLORS.white} />
          </View>
          <View style={styles.offerBody}>
            <Text style={styles.offerEyebrow}>{t('chat.negotiationDraft')}</Text>
            <Text style={styles.offerTitle} numberOfLines={1}>{draftOffer.productName}</Text>
            <View style={styles.offerChips}>
              {[0.85, 0.9, 0.95].map(multiplier => {
                const price = Math.max(1, Math.round(draftOffer.listPrice * multiplier));
                return (
                  <TouchableOpacity
                    key={multiplier}
                    style={styles.offerChip}
                    onPress={() => setText(`Offer: Rs ${price} for ${draftOffer.productName}`)}
                  >
                    <Text style={styles.offerChipText}>Rs {formatPrice(price)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <TouchableOpacity onPress={() => setOfferDraftVisible(false)} style={styles.offerClose}>
            <MaterialCommunityIcons name="close" size={16} color={COLORS.text2} />
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={t('chat.placeholder')}
          placeholderTextColor={COLORS.text2}
          multiline
        />
        <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={sending || !text.trim()}>
          <MaterialCommunityIcons name="arrow-up" size={20} color={COLORS.white} />
        </TouchableOpacity>
      </View>
    </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: SPACING.md, paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.bg,
  },
  headerProfile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.coral, alignItems: 'center', justifyContent: 'center' },
  headerAvatarImg: { width: 32, height: 32, borderRadius: 16 },
  headerAvatarText: { fontSize: 14, color: COLORS.white, fontWeight: '700' },
  headerName: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.text },
  messageList: { padding: SPACING.md, paddingBottom: 8 },
  bubble: {
    maxWidth: '75%', padding: 10, borderRadius: RADIUS.media, marginBottom: 6,
  },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: COLORS.coral, borderBottomRightRadius: 4 },
  bubbleThem: { alignSelf: 'flex-start', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, color: COLORS.text },
  bubbleTextMe: { color: COLORS.white },
  bubbleTime: { fontSize: 10, color: COLORS.text2, marginTop: 2, alignSelf: 'flex-end' },
  offerDock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: SPACING.md,
    marginBottom: 8,
    padding: 12,
    borderRadius: RADIUS.media,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  offerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.blue,
  },
  offerBody: { flex: 1, minWidth: 0 },
  offerEyebrow: { fontSize: 10, color: COLORS.text2, fontWeight: '700', textTransform: 'uppercase' },
  offerTitle: { marginTop: 2, fontSize: 13, color: COLORS.text, fontWeight: '700' },
  offerChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  offerChip: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  offerChipText: { fontSize: 11, color: COLORS.text, fontWeight: '700' },
  offerClose: { padding: 2 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', padding: SPACING.md,
    paddingBottom: SPACING.xxl + 16, borderTopWidth: 1, borderTopColor: COLORS.border,
    backgroundColor: COLORS.bg, gap: 8,
  },
  input: {
    flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 10, color: COLORS.text,
    fontSize: 14, maxHeight: 100,
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.coral,
    justifyContent: 'center', alignItems: 'center',
  },
});
