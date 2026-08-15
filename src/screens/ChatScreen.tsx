import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform, Image, Pressable, AppState, AppStateStatus, Modal,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Icon } from '../components/icons/Icon';
import { COLORS, SPACING, RADIUS, formatPrice } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMessages, sendMessage as apiSendMessage, getImageUrl, uploadImage, sendTyping, getTypingStatus } from '../api';
import { useTranslation } from '../i18n';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import type { Message } from '../types';
import { store } from '../store';
import * as ImagePicker from 'expo-image-picker';
import { useToast } from '../components/Toast';
import UserAvatar from '../components/UserAvatar';
import BackButton from '../components/BackButton';
import SellerItemsSheet from '../components/SellerItemsSheet';
import OfferBuilder from '../components/OfferBuilder';
import { SkeletonBlock } from '../components/Skeleton';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;
type LocalMessage = Message & { pending?: boolean; failed?: boolean; localImageUri?: string };

export default function ChatScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const toast = useToast();
  const { conversationId, otherUserName, otherUserId, otherUserAvatar, otherUserTier, draftOffer } = route.params;
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [offerDraftVisible, setOfferDraftVisible] = useState(Boolean(draftOffer));
  const [, setProfileMenuVisible] = useState(false);
  const [, setHeaderHeight] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [counteringMessageId, setCounteringMessageId] = useState<string | null>(null);
  const [counterPrice, setCounterPrice] = useState('');
  const [otherTyping, setOtherTyping] = useState(false);
  const [sellerItemsVisible, setSellerItemsVisible] = useState(false);
  const [offerBuilderItem, setOfferBuilderItem] = useState<{ id: string; name: string; price: number; image_url?: string | null } | null>(null);
  const listRef = useRef<FlatList>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appState = useRef(AppState.currentState);
  const typingCooldownRef = useRef(false);

  const lastMessageCursor = useRef<{ time: string; id: string } | null>(null);
  const sendingRef = useRef(false);
  const stickToLatest = useRef(true);

  const fetchMessages = async (pageNum = 0, older = false, quiet = false) => {
    if (older) setLoadingOlder(true);
    try {
      const params: Record<string, string | number> = { limit: 50, offset: pageNum * 50 };
      if (!older && lastMessageCursor.current) {
        (params as Record<string, string>).since = lastMessageCursor.current.time;
        (params as Record<string, string>).sinceId = lastMessageCursor.current.id;
      }
      const res = await getMessages(conversationId, params) as { messages: Message[] };
      const msgs = res.messages || [];
      if (older) {
        setMessages(prev => [...msgs, ...prev]);
      } else if (lastMessageCursor.current) {
        if (msgs.length > 0) {
          setMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id));
            const newMsgs = msgs.filter(m => !existingIds.has(m.id));
            return newMsgs.length > 0 ? [...prev, ...newMsgs] : prev;
          });
        }
      } else {
        setMessages(msgs);
      }
      if (msgs.length > 0) {
        const latest = msgs[msgs.length - 1];
        lastMessageCursor.current = { time: latest.created_at, id: latest.id };
      }
      if (older || !lastMessageCursor.current || pageNum === 0) setHasMore(msgs.length === 50);
    } catch {
      if (!quiet) toast.error(t('feedback.messagesUnavailable'), t('feedback.connectionRetry'), () => fetchMessages(pageNum, older));
    } finally {
      if (older) setLoadingOlder(false);
    }
    setLoading(false);
  };

  useEffect(() => {
    lastMessageCursor.current = null;
    fetchMessages(0, false);
    setPage(0);
    setOtherTyping(false);

    const checkTyping = async () => {
      try {
        const res = await getTypingStatus(conversationId) as { typing?: boolean };
        setOtherTyping(!!res.typing);
      } catch { /* silent */ }
    };

    const startPolling = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        fetchMessages(0, false, true);
        checkTyping();
      }, 5000);
    };
    const stopPolling = () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };

    startPolling();

    const handleAppState = (next: AppStateStatus) => {
      if (appState.current.match(/active/) && next.match(/inactive|background/)) {
        stopPolling();
      } else if (appState.current.match(/inactive|background/) && next === 'active') {
        fetchMessages(0, false, true);
        checkTyping();
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
    const tempId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: LocalMessage = { id: tempId, conversation_id: conversationId, sender_id: store.user?.id || '', content: msg, message_type: 'text', is_read: true, created_at: new Date().toISOString(), pending: true };
    setText('');
    stickToLatest.current = true;
    setMessages(prev => [...prev, optimistic]);
    try {
      const result = await apiSendMessage(conversationId, msg) as { message: Message };
      setMessages(prev => prev.map(m => m.id === tempId ? result.message : m));
      lastMessageCursor.current = { time: result.message.created_at, id: result.message.id };
    } catch {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, pending: false, failed: true } : m));
      toast.error(t('chat.messageNotSent'), t('chat.sendFailed'), () => {
        setText(msg);
        setMessages(prev => prev.filter(m => m.id !== tempId));
        handleSend();
      });
      setText(msg);
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  };

  const sendImage = async (uri: string, tempId: string) => {
    try {
      const r = await uploadImage(uri);
      const result = await apiSendMessage(conversationId, '', r.url) as { message: Message };
      setMessages(prev => prev.map(m => m.id === tempId ? result.message : m));
      lastMessageCursor.current = { time: result.message.created_at, id: result.message.id };
    } catch {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, pending: false, failed: true } : m));
      toast.error(t('chat.photoNotSent'), t('chat.photoStillHere'), () => sendImage(uri, tempId));
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
      const tempId = `local-image-${Date.now()}`;
      stickToLatest.current = true;
      setMessages(prev => [...prev, { id: tempId, conversation_id: conversationId, sender_id: store.user?.id || '', content: '', message_type: 'image', image_url: result.assets![0].uri, localImageUri: result.assets![0].uri, is_read: true, created_at: new Date().toISOString(), pending: true }]);
      await sendImage(result.assets[0].uri, tempId);
    } catch {
      toast.error(t('chat.photoPickerFailed'), t('chat.photoPickerRetry'));
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
      lastMessageCursor.current = null;
      await fetchMessages();
      setOfferDraftVisible(false);
    } catch {
      toast.error(t('offer.notSent'), t('chat.sendFailed'));
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  };

  const handleOfferRespond = async (messageId: string, action: 'accepted' | 'declined') => {
    try {
      const { respondToOffer } = await import('../api');
      await respondToOffer(messageId, action);
      lastMessageCursor.current = null;
      await fetchMessages();
      if (action === 'accepted') {
        toast.success('Offer accepted', 'The buyer can now check out at the agreed price.');
      }
    } catch {
      toast.error('Offer could not be updated', 'Please try again.');
    }
  };

  const handleCounterOffer = async (messageId: string) => {
    const price = Number(counterPrice.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(price) || price <= 0) {
      toast.error('Enter a valid counter price');
      return;
    }
    try {
      const { counterOffer } = await import('../api');
      await counterOffer(messageId, price);
      setCounteringMessageId(null);
      setCounterPrice('');
      lastMessageCursor.current = null;
      await fetchMessages();
      toast.success('Counter offer sent', 'The buyer can accept or decline the new price.');
    } catch {
      toast.error('Counter offer not sent', 'Please try again.');
    }
  };

  const renderMessage = ({ item }: { item: LocalMessage }) => {
    const isMe = item.sender_id === store.user?.id;
    const isImage = item.message_type === 'image' && item.image_url;
    const isOffer = item.message_type === 'offer';

    if (isOffer) {
      const offerData = item.offer_data as { productId: string; productName: string; offeredPrice: number; listPrice: number; status: 'pending' | 'accepted' | 'declined' | 'countered'; negotiationRound?: number } | undefined;
      if (!offerData) return null;
      const isPending = offerData.status === 'pending';
      const isAccepted = offerData.status === 'accepted';
      const isDeclined = offerData.status === 'declined';
      const isCountered = offerData.status === 'countered';
      const sellerCanRespond = isPending && !isMe;
      const buyerCanRespond = isCountered && isMe;
      const discountPct = offerData.listPrice && offerData.listPrice > offerData.offeredPrice
        ? Math.round(((offerData.listPrice - offerData.offeredPrice) / offerData.listPrice) * 100)
        : null;

      const handleCheckoutOffer = () => {
        store.addToCart({
          id: offerData.productId,
          name: offerData.productName,
          price: offerData.offeredPrice,
          stock: 1,
          quantity: 1,
        } as any);
        navigation.navigate('Cart');
      };

      return (
        <View style={[styles.offerMsgWrap, isMe ? styles.offerMsgWrapMe : styles.offerMsgWrapThem]}>
          <View style={[
            styles.offerMsgCard,
            isAccepted && styles.offerMsgCardAccepted,
            isDeclined && styles.offerMsgCardDeclined,
            isCountered && styles.offerMsgCardCountered,
          ]}>
            {/* Header Stripe */}
            <View style={styles.offerMsgHeader}>
              <View style={styles.offerMsgTypeWrap}>
                <Icon name="sale-tag" size={14} color={isAccepted ? '#1D9E75' : isCountered ? '#3B82F6' : COLORS.coral} />
                <Text style={styles.offerMsgEyebrow}>
                  {isMe ? 'Your Offer' : 'Offer Received'}
                </Text>
              </View>
              <View style={[
                styles.offerStatusBadge,
                isAccepted && styles.offerStatusBadgeAccepted,
                isDeclined && styles.offerStatusBadgeDeclined,
                isCountered && styles.offerStatusBadgeCountered,
                isPending && styles.offerStatusBadgePending,
              ]}>
                <Text style={[
                  styles.offerStatusText,
                  isAccepted && styles.offerStatusTextAccepted,
                  isDeclined && styles.offerStatusTextDeclined,
                  isCountered && styles.offerStatusTextCountered,
                  isPending && styles.offerStatusTextPending,
                ]}>
                  {isAccepted ? '✓ Accepted' : isDeclined ? '✕ Declined' : isCountered ? `🔄 Counter (${offerData.negotiationRound || 1}/3)` : '⏳ Pending'}
                </Text>
              </View>
            </View>

            <View style={styles.offerMsgDivider} />

            {/* Product & Price Details */}
            <View style={styles.offerMsgBody}>
              <View style={styles.offerMsgProductIconWrap}>
                <MaterialCommunityIcons name="shopping-outline" size={20} color={COLORS.coral} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.offerMsgProduct} numberOfLines={2}>{offerData.productName}</Text>
                <View style={styles.offerMsgPriceRow}>
                  <Text style={styles.offerMsgPrice}>G {formatPrice(offerData.offeredPrice)}</Text>
                  {offerData.listPrice && offerData.listPrice > offerData.offeredPrice ? (
                    <Text style={styles.offerMsgListPrice}>G {formatPrice(offerData.listPrice)}</Text>
                  ) : null}
                  {discountPct !== null && discountPct > 0 && (
                    <View style={styles.offerDiscountPill}>
                      <Text style={styles.offerDiscountText}>-{discountPct}%</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Action Buttons for Seller */}
            {sellerCanRespond && (
              <View style={styles.offerMsgActions}>
                <TouchableOpacity
                  style={styles.offerMsgDecline}
                  onPress={() => handleOfferRespond(item.id, 'declined')}
                  accessibilityLabel="decline offer"
                  accessibilityRole="button"
                  activeOpacity={0.7}
                >
                  <Text style={styles.offerMsgDeclineText}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.offerMsgCounter}
                  onPress={() => { setCounteringMessageId(item.id); setCounterPrice(String(offerData.offeredPrice || offerData.listPrice)); }}
                  accessibilityLabel="counter offer"
                  accessibilityRole="button"
                  activeOpacity={0.7}
                >
                  <Text style={styles.offerMsgCounterText}>Counter</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.offerMsgAccept}
                  onPress={() => handleOfferRespond(item.id, 'accepted')}
                  accessibilityLabel="accept offer"
                  accessibilityRole="button"
                  activeOpacity={0.7}
                >
                  <Text style={styles.offerMsgAcceptText}>Accept</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Counter Price Entry Form */}
            {counteringMessageId === item.id && (
              <View style={styles.counterEntry}>
                <View style={styles.counterInputWrap}>
                  <Text style={styles.counterCurrencyPrefix}>G</Text>
                  <TextInput
                    value={counterPrice}
                    onChangeText={setCounterPrice}
                    keyboardType="decimal-pad"
                    style={styles.counterInput}
                    placeholder="Counter price"
                    placeholderTextColor={COLORS.text2}
                    accessibilityLabel="counter offer price"
                    autoFocus
                  />
                </View>
                <TouchableOpacity
                  style={styles.counterSubmitBtn}
                  onPress={() => handleCounterOffer(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel="send counter offer"
                  activeOpacity={0.7}
                >
                  <Text style={styles.counterSubmitText}>Send</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Action Buttons for Buyer Counter */}
            {buyerCanRespond && (
              <View style={styles.offerMsgActions}>
                <TouchableOpacity
                  style={styles.offerMsgDecline}
                  onPress={() => handleOfferRespond(item.id, 'declined')}
                  accessibilityLabel="decline counter offer"
                  accessibilityRole="button"
                  activeOpacity={0.7}
                >
                  <Text style={styles.offerMsgDeclineText}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.offerMsgAccept}
                  onPress={() => handleOfferRespond(item.id, 'accepted')}
                  accessibilityLabel="accept counter offer"
                  accessibilityRole="button"
                  activeOpacity={0.7}
                >
                  <Text style={styles.offerMsgAcceptText}>Accept Counter</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Instant Checkout Button for Buyer when Accepted */}
            {isAccepted && isMe && (
              <TouchableOpacity
                style={styles.offerCheckoutBtn}
                onPress={handleCheckoutOffer}
                accessibilityLabel="checkout now"
                accessibilityRole="button"
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="lightning-bolt" size={16} color={COLORS.white} />
                <Text style={styles.offerCheckoutBtnText}>
                  Checkout Now • G {formatPrice(offerData.offeredPrice)}
                </Text>
                <MaterialCommunityIcons name="arrow-right" size={16} color={COLORS.white} />
              </TouchableOpacity>
            )}

            <Text style={styles.offerMsgTime}>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem, isImage && styles.bubbleImage]}>
        {isImage ? (
          <TouchableOpacity onPress={() => setPreviewImage(item.localImageUri || getImageUrl(item.image_url!) || item.image_url!)} accessibilityRole="imagebutton" accessibilityLabel="open photo">
            <Image source={{ uri: item.localImageUri || getImageUrl(item.image_url!) || item.image_url! }} style={styles.chatImage} resizeMode="cover" />
          </TouchableOpacity>
        ) : null}
        {item.content ? (
          <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.content}</Text>
        ) : null}
        <Text style={[styles.bubbleTime, isImage && styles.bubbleTimeImage]}>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        {item.pending && <Text style={styles.messageState}>Sending…</Text>}
        {item.failed && <Text style={styles.messageFailed}>Not sent</Text>}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]} onLayout={e => setHeaderHeight(e.nativeEvent.layout.height)}>
          <BackButton onPress={() => navigation.goBack()} />
          <TouchableOpacity
            style={styles.headerProfile}
            onPress={() => { if (otherUserId) navigation.navigate('Storefront', { sellerId: otherUserId, preloadedSeller: { username: otherUserName, avatar_url: otherUserAvatar, seller_tier: otherUserTier } }); }}
            activeOpacity={0.7}
            accessibilityLabel="view profile"
            accessibilityRole="button"
          >
            <UserAvatar
              seller={{ avatar_url: otherUserAvatar, full_name: otherUserName, seller_tier: otherUserTier } as any}
              size={34}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.headerName} numberOfLines={1}>{otherUserName}</Text>
              <View style={styles.headerOnlineRow}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlineText}>Active now</Text>
              </View>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerMore} onPress={() => setProfileMenuVisible(true)} accessibilityLabel="more options" accessibilityRole="button">
            <MaterialCommunityIcons name="dots-vertical" size={18} color={COLORS.text2} />
          </TouchableOpacity>
        </View>

        {(() => {
          const activeOffer = messages.find(m => m.message_type === 'offer' && m.offer_data && ((m.offer_data as any).status === 'pending' || (m.offer_data as any).status === 'countered'));
          if (!activeOffer || !activeOffer.offer_data) return null;
          const od = activeOffer.offer_data as any;
          const isCountered = od.status === 'countered';
          return (
            <TouchableOpacity style={[styles.offerReminderBanner, isCountered && styles.offerReminderBannerCountered]} onPress={() => {
              setSellerItemsVisible(true);
            }} accessibilityLabel={`active offer: G ${od.offeredPrice} for ${od.productName}`} accessibilityRole="button">
              <Icon name="sale-tag" size={16} color={COLORS.white} />
              <Text style={styles.offerReminderText} numberOfLines={1}>{isCountered ? 'Counter offer' : 'Your offer'}: G {formatPrice(od.offeredPrice)} for {od.productName}</Text>
              <Text style={styles.offerReminderAction}>View</Text>
            </TouchableOpacity>
          );
        })()}

        {loading ? (
          <View style={{ flex: 1, padding: SPACING.md, gap: 14, justifyContent: 'flex-end' }}>
            {[140, 180, 100].map((w, i) => (
              <View key={`t${i}`} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, alignSelf: 'flex-start' }}>
                <SkeletonBlock width={24} height={24} radius={12} />
                <SkeletonBlock width={w} height={36} radius={16} />
              </View>
            ))}
            {[160, 120].map((w, i) => (
              <View key={`m${i}`} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, alignSelf: 'flex-end' }}>
                <SkeletonBlock width={w} height={36} radius={16} style={{ backgroundColor: COLORS.coral + '30' }} />
              </View>
            ))}
            {[200, 90].map((w, i) => (
              <View key={`t2${i}`} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, alignSelf: 'flex-start' }}>
                <SkeletonBlock width={24} height={24} radius={12} />
                <SkeletonBlock width={w} height={36} radius={16} />
              </View>
            ))}
          </View>
        ) : (
          <FlatList
            data={messages}
            renderItem={renderMessage}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.messageList}
            ref={listRef}
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            onScroll={({ nativeEvent }) => {
              const distanceFromBottom = nativeEvent.contentSize.height - nativeEvent.layoutMeasurement.height - nativeEvent.contentOffset.y;
              stickToLatest.current = distanceFromBottom < 96;
              if (nativeEvent.contentOffset.y < 72 && hasMore && !loadingOlder) {
                const nextPage = page + 1;
                setPage(nextPage);
                fetchMessages(nextPage, true);
              }
            }}
            scrollEventThrottle={16}
            ListHeaderComponent={
              loadingOlder ? <ActivityIndicator size="small" color={COLORS.coral} style={{ paddingVertical: 12 }} /> : null
            }
            onContentSizeChange={() => {
              if (listRef.current && stickToLatest.current) {
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
                      <Text style={styles.offerChipText}>{formatPrice(price)} G</Text>
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

        {otherTyping && (
          <View style={styles.typingRow}>
            <Text style={styles.typingText}>{otherUserName || 'They'} is typing…</Text>
          </View>
        )}

        <View style={[styles.inputArea, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
          <View style={styles.inputRow}>
            <TouchableOpacity style={styles.cameraBtn} onPress={handleSendImage} disabled={sending} accessibilityLabel="attach photo" accessibilityRole="button">
              <MaterialCommunityIcons name="camera-outline" size={22} color={COLORS.text2} />
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={(t) => {
                setText(t);
                if (t.trim() && !typingCooldownRef.current) {
                  typingCooldownRef.current = true;
                  sendTyping(conversationId).catch(() => {});
                  setTimeout(() => { typingCooldownRef.current = false; }, 3000);
                }
              }}
              placeholder={t('chat.placeholder')}
              placeholderTextColor={COLORS.text2}
              multiline
              accessibilityLabel="message input"
            />
            <TouchableOpacity style={styles.offerBtn} onPress={() => {
              if (draftOffer) {
                setOfferDraftVisible(true);
              } else if (otherUserId) {
                setSellerItemsVisible(true);
              }
            }} accessibilityLabel="make an offer" accessibilityRole="button">
              <Icon name="sale-tag" size={20} color={COLORS.coral} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sendBtn, { opacity: sending || (!text.trim()) ? 0.4 : 1 }]} onPress={handleSend} disabled={sending || !text.trim()} accessibilityLabel="send message" accessibilityRole="button">
              <MaterialCommunityIcons name="arrow-up" size={20} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        </View>

        <Modal visible={!!previewImage} transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
          <Pressable style={styles.imagePreview} onPress={() => setPreviewImage(null)} accessibilityLabel="close photo" accessibilityRole="button">
            {previewImage && <Image source={{ uri: previewImage }} style={styles.previewImage} resizeMode="contain" />}
          </Pressable>
        </Modal>

        <SellerItemsSheet
          visible={sellerItemsVisible}
          sellerId={otherUserId || ''}
          sellerName={otherUserName || 'Seller'}
          onClose={() => setSellerItemsVisible(false)}
          onSelectItem={(item) => { setSellerItemsVisible(false); setOfferBuilderItem(item); }}
        />

        <OfferBuilder
          visible={!!offerBuilderItem}
          item={offerBuilderItem}
          conversationId={conversationId}
          onClose={() => setOfferBuilderItem(null)}
          onSent={() => { setOfferBuilderItem(null); fetchMessages(); }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.bg,
  },
  headerProfile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerName: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  headerOnlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#00C853' },
  onlineText: { fontSize: 11, color: COLORS.text2 },
  headerMore: { padding: 8, borderRadius: 20 },
  offerReminderBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(216,90,48,0.15)', borderWidth: 1, borderColor: COLORS.coral,
    borderRadius: RADIUS.card, marginHorizontal: SPACING.md, marginTop: SPACING.xs,
    paddingVertical: 8, paddingHorizontal: 12,
  },
  offerReminderBannerCountered: {
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderColor: COLORS.blue,
  },
  offerReminderText: { flex: 1, fontSize: 12, color: COLORS.text, fontWeight: '600' },
  offerReminderAction: { fontSize: 12, color: COLORS.coral, fontWeight: '700' },
  messageList: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  bubble: {
    maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: RADIUS.row, marginBottom: 8,
  },
  bubbleMe: {
    alignSelf: 'flex-end', backgroundColor: COLORS.coral,
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    alignSelf: 'flex-start', backgroundColor: COLORS.surface,
    borderBottomLeftRadius: 4, borderWidth: 1, borderColor: COLORS.border,
  },
  bubbleImage: { padding: 4, backgroundColor: 'transparent', borderWidth: 0 },
  bubbleText: { fontSize: 15, color: COLORS.text, lineHeight: 20 },
  bubbleTextMe: { color: COLORS.white },
  bubbleTime: { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 4, alignSelf: 'flex-end' },
  chatImage: { width: 220, height: 220, borderRadius: RADIUS.card },
  bubbleTimeImage: { marginTop: 4 },
  messageState: { fontSize: 10, color: COLORS.text2, marginTop: 3, alignSelf: 'flex-end' },
  messageFailed: { fontSize: 10, color: COLORS.coral, marginTop: 3, alignSelf: 'flex-end', fontWeight: '700' },

  /* Rich Offer Message Card */
  offerMsgWrap: { maxWidth: '88%', marginBottom: 12 },
  offerMsgWrapMe: { alignSelf: 'flex-end' },
  offerMsgWrapThem: { alignSelf: 'flex-start' },
  offerMsgCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.card,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  offerMsgCardAccepted: {
    borderColor: 'rgba(29,158,117,0.4)',
    backgroundColor: 'rgba(29,158,117,0.06)',
  },
  offerMsgCardDeclined: {
    borderColor: 'rgba(226,75,74,0.3)',
    backgroundColor: 'rgba(226,75,74,0.04)',
  },
  offerMsgCardCountered: {
    borderColor: 'rgba(59,130,246,0.35)',
    backgroundColor: 'rgba(59,130,246,0.05)',
  },
  offerMsgHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  offerMsgTypeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  offerMsgEyebrow: {
    fontSize: 11,
    color: COLORS.text2,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  offerStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface2,
  },
  offerStatusBadgePending: {
    backgroundColor: 'rgba(245,166,35,0.15)',
    borderWidth: 1,
    borderColor: '#F5A623',
  },
  offerStatusBadgeAccepted: {
    backgroundColor: 'rgba(29,158,117,0.15)',
    borderWidth: 1,
    borderColor: '#1D9E75',
  },
  offerStatusBadgeDeclined: {
    backgroundColor: 'rgba(226,75,74,0.15)',
    borderWidth: 1,
    borderColor: '#E24B4A',
  },
  offerStatusBadgeCountered: {
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  offerStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.text2,
  },
  offerStatusTextPending: { color: '#F5A623' },
  offerStatusTextAccepted: { color: '#1D9E75' },
  offerStatusTextDeclined: { color: '#E24B4A' },
  offerStatusTextCountered: { color: '#3B82F6' },
  offerMsgDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 10,
  },
  offerMsgBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  offerMsgProductIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(216,90,48,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerMsgProduct: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '700',
  },
  offerMsgPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 4,
  },
  offerMsgPrice: {
    fontSize: 16,
    color: COLORS.coral,
    fontWeight: '800',
  },
  offerMsgListPrice: {
    fontSize: 12,
    color: COLORS.text2,
    textDecorationLine: 'line-through',
  },
  offerDiscountPill: {
    backgroundColor: 'rgba(29,158,117,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  offerDiscountText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1D9E75',
  },
  offerMsgActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  offerMsgDecline: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  offerMsgDeclineText: {
    fontSize: 12,
    color: COLORS.text2,
    fontWeight: '700',
  },
  offerMsgCounter: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  offerMsgCounterText: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '700',
  },
  offerMsgAccept: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    backgroundColor: COLORS.coral,
  },
  offerMsgAcceptText: {
    fontSize: 12,
    color: COLORS.white,
    fontWeight: '700',
  },
  counterEntry: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    alignItems: 'center',
  },
  counterInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
  },
  counterCurrencyPrefix: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.coral,
    marginRight: 4,
  },
  counterInput: {
    flex: 1,
    color: COLORS.text,
    paddingVertical: 6,
    fontSize: 13,
  },
  counterSubmitBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterSubmitText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.white,
  },
  offerCheckoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1D9E75',
    borderRadius: RADIUS.pill,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  offerCheckoutBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.white,
  },
  offerMsgTime: {
    fontSize: 10,
    color: COLORS.text2,
    marginTop: 8,
    alignSelf: 'flex-end',
  },

  /* Offer Dock (at bottom) */
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
  typingRow: {
    paddingHorizontal: SPACING.md,
    paddingBottom: 4, paddingTop: 2,
  },
  typingText: { fontSize: 12, color: COLORS.text2, fontStyle: 'italic' },
  inputArea: {
    borderTopWidth: 1, borderTopColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', padding: SPACING.md,
    gap: 8,
  },
  input: {
    flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 19, paddingHorizontal: 14, paddingVertical: 10, color: COLORS.text,
    fontSize: 14, maxHeight: 100,
  },
  cameraBtn: {
    width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center',
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  offerBtn: {
    width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center',
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.coral,
    justifyContent: 'center', alignItems: 'center',
  },
  profileOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 20,
  },
  imagePreview: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: SPACING.md },
  previewImage: { width: '100%', height: '100%' },
});
