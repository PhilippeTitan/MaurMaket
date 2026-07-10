import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform, Alert, Image, Pressable, AppState, AppStateStatus,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Icon } from '../components/icons/Icon';
import { COLORS, SPACING, RADIUS, formatPrice } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMessages, sendMessage as apiSendMessage, getImageUrl, uploadImage } from '../api';
import { useTranslation } from '../i18n';
import BackButton from '../components/BackButton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import type { Message } from '../types';
import { store } from '../store';
import * as ImagePicker from 'expo-image-picker';

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
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const listRef = useRef<FlatList>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appState = useRef(AppState.currentState);

  const lastMessageTime = useRef<string | null>(null);
  const sendingRef = useRef(false);

  const fetchMessages = async (pageNum = 0, append = false) => {
    try {
      const params: Record<string, string | number> = { limit: 50, offset: pageNum * 50 };
      if (!append && lastMessageTime.current) {
        (params as Record<string, string>).since = lastMessageTime.current;
      }
      const res = await getMessages(conversationId, params) as { messages: Message[] };
      const msgs = res.messages || [];
      if (append) {
        setMessages(prev => [...msgs, ...prev]);
      } else if (lastMessageTime.current && msgs.length > 0) {
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const newMsgs = msgs.filter(m => !existingIds.has(m.id));
          return newMsgs.length > 0 ? [...prev, ...newMsgs] : prev;
        });
      } else {
        setMessages(msgs);
      }
      if (msgs.length > 0) {
        lastMessageTime.current = msgs[msgs.length - 1].created_at;
      }
      setHasMore(msgs.length === 50);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    lastMessageTime.current = null;
    fetchMessages(0, false);
    setPage(0);

    const startPolling = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => fetchMessages(0, false), 5000);
    };
    const stopPolling = () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };

    startPolling();

    const handleAppState = (next: AppStateStatus) => {
      if (appState.current.match(/active/) && next.match(/inactive|background/)) {
        stopPolling();
      } else if (appState.current.match(/inactive|background/) && next === 'active') {
        fetchMessages(0, false);
        startPolling();
      }
      appState.current = next;
    };
    const sub = AppState.addEventListener('change', handleAppState);

    return () => {
      stopPolling();
      sub.remove();
    };
  }, [conversationId]);

  useEffect(() => {
    if (!draftOffer) return;
    setOfferDraftVisible(true);
  }, [draftOffer]);

  const handleSend = async () => {
    if (!text.trim() || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    const msg = text.trim();
    setText('');
    try {
      await apiSendMessage(conversationId, msg);
      lastMessageTime.current = null;
      await fetchMessages();
    } catch {
      Alert.alert(t('common.error'), t('chat.sendFailed'));
      setText(msg);
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  };

  const handleSendImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      sendingRef.current = true;
      setSending(true);
      const r = await uploadImage(result.assets[0].uri);
      await apiSendMessage(conversationId, '', r.url);
      lastMessageTime.current = null;
      await fetchMessages();
    } catch {
      Alert.alert(t('common.error'), t('chat.sendFailed'));
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  };

  const handleSendOffer = async (price: number) => {
    if (!draftOffer || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    try {
      const { sendOffer } = await import('../api');
      await sendOffer(conversationId, {
        productId: draftOffer.productId,
        productName: draftOffer.productName,
        offeredPrice: price,
        listPrice: draftOffer.listPrice,
      });
      lastMessageTime.current = null;
      await fetchMessages();
      setOfferDraftVisible(false);
    } catch {
      Alert.alert(t('common.error'), t('chat.sendFailed'));
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  };

  const handleOfferRespond = async (messageId: string, action: 'accepted' | 'declined') => {
    try {
      const { respondToOffer } = await import('../api');
      await respondToOffer(messageId, action);
      lastMessageTime.current = null;
      await fetchMessages();
      if (action === 'accepted') {
        Alert.alert('Offer accepted', 'The buyer can now check out at the agreed price.');
      }
    } catch {
      Alert.alert(t('common.error'), 'Could not respond to offer.');
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === store.user?.id;
    const isImage = item.message_type === 'image' && item.image_url;
    const isOffer = item.message_type === 'offer';

    if (isOffer) {
      const offerData = item.offer_data as { productId: string; productName: string; offeredPrice: number; listPrice: number; status: 'pending' | 'accepted' | 'declined' | 'countered' } | undefined;
      if (!offerData) return null;
      const isPending = offerData.status === 'pending';
      const canRespond = isPending && !isMe;
      return (
        <View style={[styles.offerMsgWrap, isMe ? styles.offerMsgWrapMe : styles.offerMsgWrapThem]}>
          <View style={styles.offerMsgCard}>
            <View style={styles.offerMsgIconWrap}>
              <Icon name="sale-tag" size={16} color={COLORS.coral} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.offerMsgEyebrow}>{isMe ? 'Your offer' : 'Offer received'}</Text>
              <Text style={styles.offerMsgProduct} numberOfLines={1}>{offerData.productName}</Text>
              <View style={styles.offerMsgPriceRow}>
                <Text style={styles.offerMsgPrice}>Rs {formatPrice(offerData.offeredPrice)}</Text>
                <Text style={styles.offerMsgListPrice}>Rs {formatPrice(offerData.listPrice)}</Text>
              </View>
              <Text style={[
                styles.offerMsgStatus,
                offerData.status === 'accepted' && styles.offerMsgStatusAccepted,
                offerData.status === 'declined' && styles.offerMsgStatusDeclined,
              ]}>
                {offerData.status === 'pending' ? 'Waiting for response' : offerData.status === 'accepted' ? 'Accepted' : offerData.status === 'declined' ? 'Declined' : 'Countered'}
              </Text>
            </View>
          </View>
          {canRespond && (
            <View style={styles.offerMsgActions}>
              <TouchableOpacity style={styles.offerMsgDecline} onPress={() => handleOfferRespond(item.id, 'declined')} accessibilityLabel="decline offer" accessibilityRole="button">
                <Text style={styles.offerMsgDeclineText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.offerMsgAccept} onPress={() => handleOfferRespond(item.id, 'accepted')} accessibilityLabel="accept offer" accessibilityRole="button">
                <Text style={styles.offerMsgAcceptText}>Accept</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    }

    return (
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem, isImage && styles.bubbleImage]}>
        {isImage ? (
          <Image source={{ uri: getImageUrl(item.image_url!) || item.image_url! }} style={styles.chatImage} resizeMode="cover" onError={() => {}} />
        ) : null}
        {item.content ? (
          <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.content}</Text>
        ) : null}
        <Text style={[styles.bubbleTime, isImage && styles.bubbleTimeImage]}>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + SPACING.md }]} onLayout={e => setHeaderHeight(e.nativeEvent.layout.height)}>
        <BackButton onPress={() => navigation.goBack()} />
        <TouchableOpacity
          style={styles.headerProfile}
          onPress={() => setProfileMenuVisible(!profileMenuVisible)}
          activeOpacity={0.7}
          accessibilityLabel="view profile menu"
          accessibilityRole="button"
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

      {profileMenuVisible && (
        <Pressable style={styles.profileOverlay} onPress={() => setProfileMenuVisible(false)}>
          <View style={[styles.profileDropdown, { top: headerHeight || 110 }]}>
            {getImageUrl(otherUserAvatar) ? (
              <Image source={{ uri: getImageUrl(otherUserAvatar)! }} style={styles.dropdownAvatar} />
            ) : (
              <View style={styles.dropdownAvatarFallback}>
                <Text style={styles.dropdownAvatarText}>{(otherUserName || '?')[0]}</Text>
              </View>
            )}
            <Text style={styles.dropdownName} numberOfLines={1}>{otherUserName}</Text>
            <TouchableOpacity
              style={styles.dropdownAction}
              onPress={() => {
                setProfileMenuVisible(false);
                if (otherUserId) navigation.navigate('Storefront', { sellerId: otherUserId });
              }}
              accessibilityLabel="view store"
              accessibilityRole="button"
            >
              <Icon name="storefront" size={20} color={COLORS.text} />
              <Text style={styles.dropdownActionText}>View Store</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.coral} style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messageList}
          ref={listRef}
          onEndReached={() => {
            if (hasMore && !loading) {
              const nextPage = page + 1;
              setPage(nextPage);
              fetchMessages(nextPage, true);
            }
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={hasMore && messages.length > 0 ? <ActivityIndicator size="small" color={COLORS.coral} style={{ paddingVertical: 12 }} /> : null}
          ListHeaderComponent={
            <View style={styles.introHeader}>
              {getImageUrl(otherUserAvatar) ? (
                <Image source={{ uri: getImageUrl(otherUserAvatar)! }} style={styles.introAvatar} />
              ) : (
                <View style={styles.introAvatarFallback}>
                  <Text style={styles.introAvatarText}>{(otherUserName || '?')[0]}</Text>
                </View>
              )}
              <Text style={styles.introName} numberOfLines={1}>{otherUserName}</Text>
              <TouchableOpacity
                style={styles.introViewProfileBtn}
                onPress={() => {
                  if (otherUserId) navigation.navigate('Storefront', { sellerId: otherUserId });
                }}
                accessibilityLabel="view profile"
                accessibilityRole="button"
              >
                <Text style={styles.introViewProfileText}>View profile</Text>
              </TouchableOpacity>
            </View>
          }
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
            <Icon name="sale-tag" size={18} color={COLORS.white} />
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
                    onPress={() => handleSendOffer(price)}
                    disabled={sending}
                    accessibilityLabel={`send offer rs ${price}`}
                    accessibilityRole="button"
                  >
                    <Text style={styles.offerChipText}>Rs {formatPrice(price)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <TouchableOpacity onPress={() => setOfferDraftVisible(false)} style={styles.offerClose} accessibilityLabel="close offer" accessibilityRole="button">
            <Icon name="close" size={16} color={COLORS.text2} />
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
        <TouchableOpacity style={styles.cameraBtn} onPress={handleSendImage} disabled={sending} accessibilityLabel="attach photo" accessibilityRole="button">
          <MaterialCommunityIcons name="camera-outline" size={22} color={COLORS.text2} />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={t('chat.placeholder')}
          placeholderTextColor={COLORS.text2}
          multiline
          accessibilityLabel="message input"
         
        />
        <TouchableOpacity style={[styles.sendBtn, { opacity: sending || (!text.trim()) ? 0.4 : 1 }]} onPress={handleSend} disabled={sending || !text.trim()} accessibilityLabel="send message" accessibilityRole="button">
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
  headerAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(128,128,128,0.25)', alignItems: 'center', justifyContent: 'center' },
  headerAvatarImg: { width: 32, height: 32, borderRadius: 16 },
  headerAvatarText: { fontSize: 14, color: COLORS.text2, fontWeight: '700' },
  headerName: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.text },
  messageList: { padding: SPACING.md, paddingBottom: 8 },
  introHeader: {
    alignItems: 'center',
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.lg,
    gap: 4,
  },
  introAvatar: { width: 84, height: 84, borderRadius: 42, marginBottom: 8 },
  introAvatarFallback: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: 'rgba(128,128,128,0.25)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  introAvatarText: { fontSize: 32, color: COLORS.text2, fontWeight: '700' },
  introName: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  introViewProfileBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  introViewProfileText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  bubble: {
    maxWidth: '75%', padding: 10, borderRadius: RADIUS.media, marginBottom: 6,
  },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: COLORS.coral, borderBottomRightRadius: 4 },
  bubbleThem: { alignSelf: 'flex-start', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, color: COLORS.text },
  bubbleTextMe: { color: COLORS.white },
  bubbleImage: { padding: 4 },
  chatImage: { width: 200, height: 200, borderRadius: RADIUS.media },
  bubbleTime: { fontSize: 10, color: COLORS.text2, marginTop: 2, alignSelf: 'flex-end' },
  bubbleTimeImage: { marginTop: 4 },
  offerMsgWrap: { maxWidth: '78%', marginBottom: 8 },
  offerMsgWrapMe: { alignSelf: 'flex-end' },
  offerMsgWrapThem: { alignSelf: 'flex-start' },
  offerMsgCard: {
    flexDirection: 'row', gap: 10, padding: 12,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.media,
  },
  offerMsgIconWrap: {
    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(216,90,48,0.15)',
  },
  offerMsgEyebrow: { fontSize: 10, color: COLORS.text2, fontWeight: '700', textTransform: 'uppercase' },
  offerMsgProduct: { fontSize: 13, color: COLORS.text, fontWeight: '700', marginTop: 2 },
  offerMsgPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 },
  offerMsgPrice: { fontSize: 16, color: COLORS.coral, fontWeight: '700' },
  offerMsgListPrice: { fontSize: 12, color: COLORS.text2, textDecorationLine: 'line-through' },
  offerMsgStatus: { fontSize: 11, color: COLORS.text2, marginTop: 4 },
  offerMsgStatusAccepted: { color: '#1D9E75', fontWeight: '700' },
  offerMsgStatusDeclined: { color: '#E24B4A', fontWeight: '700' },
  offerMsgActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  offerMsgDecline: {
    flex: 1, paddingVertical: 8, borderRadius: RADIUS.pill, alignItems: 'center',
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  offerMsgDeclineText: { fontSize: 12, color: COLORS.text2, fontWeight: '700' },
  offerMsgAccept: {
    flex: 1, paddingVertical: 8, borderRadius: RADIUS.pill, alignItems: 'center',
    backgroundColor: COLORS.coral,
  },
  offerMsgAcceptText: { fontSize: 12, color: COLORS.white, fontWeight: '700' },
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
  cameraBtn: {
    width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center',
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.coral,
    justifyContent: 'center', alignItems: 'center',
  },
  profileOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 20,
  },
  profileDropdown: {
    position: 'absolute',
    top: 110,
    alignSelf: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 10,
    minWidth: 200,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  dropdownAvatar: { width: 56, height: 56, borderRadius: 28 },
  dropdownAvatarFallback: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(128,128,128,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  dropdownAvatarText: { fontSize: 22, color: COLORS.text2, fontWeight: '700' },
  dropdownName: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  dropdownAction: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: RADIUS.row,
    backgroundColor: COLORS.surface2,
    width: '100%',
  },
  dropdownActionText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
});