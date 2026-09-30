import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform, Image, Pressable, AppState, AppStateStatus, Modal,
  Animated,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Icon } from '../components/icons/Icon';
import { COLORS, SPACING, RADIUS, formatPrice } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMessages, sendMessage as apiSendMessage, sendMessageWithReply, getImageUrl, uploadImage, sendTyping, getTypingStatus, markConversationRead, getDeliveryStatuses, getPresence } from '../api';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from '@/localization';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import type { Message } from '../types';
import { store } from '../store';
import * as ImagePicker from 'expo-image-picker';
import { useToast } from '../components/Toast';
import UserAvatar from '../components/UserAvatar';
import { LinearGradient } from 'expo-linear-gradient';
import BackButton from '../components/BackButton';
import SellerItemsSheet from '../components/SellerItemsSheet';
import OfferBuilder from '../components/OfferBuilder';
import { SkeletonBlock } from '../components/Skeleton';
import { Swipeable, Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import AnimatedRe, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;
type LocalMessage = Message & { pending?: boolean; failed?: boolean; localImageUri?: string; reactions?: { emoji: string; userId: string; userName: string }[]; delivery_status?: 'sent' | 'delivered' | 'read'; reply_to?: Message['reply_to']; client_id?: string };

// WhatsApp-style swipe-right-to-reply on a message bubble.
function SwipeReplyRow({ children, onReply }: { children: React.ReactNode; onReply: () => void }) {
  return (
    <Swipeable
      renderLeftActions={() => (
        <View style={styles.swipeReplyAction} accessibilityLabel="reply" accessibilityRole="button">
          <MaterialCommunityIcons name="reply" size={22} color={COLORS.coral} />
        </View>
      )}
      onSwipeableOpen={(direction, instance) => {
        if (direction !== 'left') return;
        instance.close();
        try { Haptics.selectionAsync(); } catch {}
        onReply();
      }}
      overshootLeft={false}
      overshootRight={false}
      leftThreshold={48}
      friction={2}
    >
      {children}
    </Swipeable>
  );
}

// ───── Outbox (WhatsApp-style offline send queue) ─────
// Messages are queued locally, flushed with a client-generated UUID (server dedupes on it),
// and survive app restarts / network loss until acknowledged.
type OutboxEntry = {
  tempId: string;
  clientId: string;
  conversationId: string;
  content: string | null;
  messageType: 'text' | 'image';
  imageUri?: string;
  imageUrl?: string;
  replyToId?: string;
  attempts: number;
  createdAt: string;
};
const OUTBOX_KEY = 'mm_outbox';

const genClientId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });

const readOutbox = async (): Promise<OutboxEntry[]> => {
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    const all = raw ? JSON.parse(raw) : [];
    return Array.isArray(all) ? all : [];
  } catch { return []; }
};
const writeOutbox = async (all: OutboxEntry[]) => {
  try { await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(all)); } catch { /* storage full */ }
};

export default function ChatScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const toast = useToast();
  const { conversationId, otherUserName, otherUserId, otherUserAvatar, otherUserStoreLogoUrl, otherUserUseStoreIdentity, otherUserTier, draftOffer } = route.params;
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
  const [preview, setPreview] = useState<{ uri: string; sender: string; time: string } | null>(null);
  const [viewerChrome, setViewerChrome] = useState(true);
  const vScale = useSharedValue(1);
  const vSavedScale = useSharedValue(1);
  const vTx = useSharedValue(0);
  const vTy = useSharedValue(0);
  const vSavedX = useSharedValue(0);
  const vSavedY = useSharedValue(0);
  const toggleViewerChrome = () => setViewerChrome(c => !c);
  const viewerGesture = useMemo(() => {
    const pinch = Gesture.Pinch()
      .onUpdate(e => { vScale.value = vSavedScale.value * e.scale; })
      .onEnd(() => {
        if (vScale.value <= 1) {
          vScale.value = withTiming(1);
          vSavedScale.value = 1;
          vTx.value = withTiming(0);
          vTy.value = withTiming(0);
          vSavedX.value = 0;
          vSavedY.value = 0;
        } else if (vScale.value >= 4) {
          vScale.value = withTiming(4);
          vSavedScale.value = 4;
        } else {
          vSavedScale.value = vScale.value;
        }
      });
    const pan = Gesture.Pan()
      .onUpdate(e => {
        if (vScale.value <= 1.03) return;
        vTx.value = vSavedX.value + e.translationX;
        vTy.value = vSavedY.value + e.translationY;
      })
      .onEnd(() => {
        if (vScale.value <= 1.03) return;
        vSavedX.value = vTx.value;
        vSavedY.value = vTy.value;
      });
    const tap = Gesture.Tap()
      .maxDuration(300)
      .onEnd((_e, success) => { if (success) runOnJS(toggleViewerChrome)(); });
    return Gesture.Race(Gesture.Simultaneous(pinch, pan), tap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const viewerImageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: vTx.value }, { translateY: vTy.value }, { scale: vScale.value }],
  }));
  useEffect(() => {
    if (!preview) return;
    setViewerChrome(true);
    vScale.value = 1; vSavedScale.value = 1;
    vTx.value = 0; vTy.value = 0; vSavedX.value = 0; vSavedY.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);
  const [counteringMessageId, setCounteringMessageId] = useState<string | null>(null);
  const [counterPrice, setCounterPrice] = useState('');
  const [otherTyping, setOtherTyping] = useState(false);
  const [presence, setPresence] = useState<{ online: boolean; lastSeen: string | null } | null>(null);
  const [offline, setOffline] = useState(false);
  const [sellerItemsVisible, setSellerItemsVisible] = useState(false);
  const [offerBuilderItem, setOfferBuilderItem] = useState<{ id: string; name: string; price: number; image_url?: string | null } | null>(null);
  const [replyTo, setReplyTo] = useState<LocalMessage | null>(null);
  const [actionMenuMessage, setActionMenuMessage] = useState<LocalMessage | null>(null);
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const listRef = useRef<FlatList>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appState = useRef(AppState.currentState);
  const typingCooldownRef = useRef(false);
  const pendingPulse = useRef(new Animated.Value(0)).current;

  const lastMessageCursor = useRef<{ time: string; id: string } | null>(null);
  const sendingRef = useRef(false);
  const stickToLatest = useRef(true);
  const outboxRef = useRef<OutboxEntry[]>([]);
  const flushingRef = useRef(false);
  const onlineRef = useRef(true);
  const lastMarkReadRef = useRef(0);

  // ───── Outbox: persist, flush, reconcile ─────

  const persistEntry = async (entry: OutboxEntry) => {
    const all = await readOutbox();
    await writeOutbox([...all.filter(e => e.tempId !== entry.tempId), entry]);
    outboxRef.current = outboxRef.current.filter(e => e.tempId !== entry.tempId).concat(entry);
  };
  const removeEntry = async (tempId: string) => {
    const all = await readOutbox();
    await writeOutbox(all.filter(e => e.tempId !== tempId));
    outboxRef.current = outboxRef.current.filter(e => e.tempId !== tempId);
  };

  const reconcileSent = (tempId: string, serverMessage: Message) => {
    setMessages(prev => {
      const hasServer = prev.some(m => m.id === serverMessage.id);
      if (hasServer) return prev.filter(m => m.id !== tempId); // poll beat us to it — drop optimistic
      return prev.map(m => (m.id === tempId ? { ...serverMessage, pending: false, failed: false } as LocalMessage : m));
    });
    lastMessageCursor.current = { time: serverMessage.created_at, id: serverMessage.id };
  };

  const markFailed = (tempId: string) => {
    setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
  };

  const flushOutbox = async (opts?: { resetAttempts?: boolean }) => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    try {
      let entries = (await readOutbox()).filter(e => e.conversationId === conversationId);
      if (opts?.resetAttempts) {
        entries = entries.map(e => ({ ...e, attempts: 0 }));
        const others = (await readOutbox()).filter(e => e.conversationId !== conversationId);
        await writeOutbox([...others, ...entries]);
      }
      for (const entry of entries) {
        if (entry.attempts >= 5) continue; // give up until explicit retry / reconnect
        try {
          let imageUrl = entry.imageUrl;
          if (entry.messageType === 'image' && !imageUrl) {
            if (!entry.imageUri) throw new Error('missing image uri');
            const up = await uploadImage(entry.imageUri) as { url: string };
            imageUrl = up.url;
            await persistEntry({ ...entry, imageUrl, attempts: entry.attempts + 1 });
          }
          const result = (entry.replyToId
            ? await sendMessageWithReply(entry.conversationId, entry.content || '', entry.replyToId, imageUrl, entry.clientId)
            : await apiSendMessage(entry.conversationId, entry.content || '', imageUrl, entry.clientId)) as { message: Message };
          await removeEntry(entry.tempId);
          reconcileSent(entry.tempId, result.message);
        } catch {
          const next = { ...entry, attempts: entry.attempts + 1 };
          await persistEntry(next);
          markFailed(entry.tempId);
        }
      }
    } finally {
      flushingRef.current = false;
    }
  };

  const retryMessage = async (tempId: string) => {
    const all = await readOutbox();
    const entry = all.find(e => e.tempId === tempId && e.conversationId === conversationId);
    if (!entry) {
      // Not queued (e.g. restart wiped nothing but entry missing) — nothing to retry
      return;
    }
    await persistEntry({ ...entry, attempts: 0 });
    setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, pending: true, failed: false } : m)));
    flushOutbox();
  };

  const enqueueLocal = (entry: OutboxEntry, optimistic: LocalMessage) => {
    stickToLatest.current = true;
    setMessages(prev => [...prev.filter(m => m.id !== entry.tempId), optimistic]);
    persistEntry(entry).then(() => flushOutbox());
  };

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
      const myId = store.user?.id;
      const hasIncoming = msgs.some(m => m.sender_id !== myId);
      if (older) {
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          return [...msgs.filter(m => !existingIds.has(m.id)), ...prev];
        });
      } else if (lastMessageCursor.current) {
        if (msgs.length > 0) {
          const incomingClientIds = new Set(msgs.map(m => (m as LocalMessage).client_id).filter(Boolean));
          setMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id));
            const newMsgs = msgs.filter(m => !existingIds.has(m.id));
            // Drop optimistic copies the server already echoed back (matched by client_id)
            const kept = prev.filter(m => !(m.pending || m.failed) || !m.client_id || !incomingClientIds.has(m.client_id));
            return newMsgs.length > 0 ? [...kept, ...newMsgs] : kept;
          });
        }
      } else {
        setMessages(prev => {
          // Full reload — preserve local queued/failed messages not yet acknowledged
          const localQueued = prev.filter(m =>
            (m.pending || m.failed) && m.client_id && !msgs.some(s => (s as LocalMessage).client_id === m.client_id) && !msgs.some(s => s.id === m.id));
          return [...msgs, ...localQueued];
        });
      }
      // WhatsApp read flow: chat is visible → flip incoming to read (blue ticks for sender)
      if (hasIncoming && Date.now() - lastMarkReadRef.current > 3000) {
        lastMarkReadRef.current = Date.now();
        markConversationRead(conversationId).catch(() => {});
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
    // Mark conversation as read (update delivery states)
    markConversationRead(conversationId).catch(() => {});

    const checkTyping = async () => {
      try {
        const res = await getTypingStatus(conversationId) as { typing?: boolean };
        setOtherTyping(!!res.typing);
      } catch { /* silent */ }
      if (otherUserId) {
        try {
          const p = await getPresence(otherUserId);
          setPresence(p);
        } catch { /* silent */ }
      }
    };

    // Flip our own ticks live: sent → delivered → read (WhatsApp ✓ / ✓✓ / blue ✓✓)
    const checkStatuses = async () => {
      try {
        const res = await getDeliveryStatuses(conversationId);
        const statusMap = new Map(res.statuses.map(s => [s.id, s.status]));
        if (statusMap.size === 0) return;
        setMessages(prev => {
          const changed = prev.some(m => m.sender_id === store.user?.id && statusMap.has(m.id) && statusMap.get(m.id) !== m.delivery_status);
          if (!changed) return prev;
          return prev.map(m =>
            m.sender_id === store.user?.id && statusMap.has(m.id) && statusMap.get(m.id) !== m.delivery_status
              ? { ...m, delivery_status: statusMap.get(m.id) }
              : m
          );
        });
      } catch { /* silent */ }
    };

    const startPolling = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        fetchMessages(0, false, true);
        checkTyping();
        checkStatuses();
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
        checkStatuses();
        // WhatsApp: back to foreground → flush anything that failed while away
        flushOutbox({ resetAttempts: onlineRef.current });
startPolling();

    // Start pending pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pendingPulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pendingPulse, { toValue: 0, duration: 800, useNativeDriver: true }),
      ])
    ).start();
      }
      appState.current = next;
    };
    const sub = AppState.addEventListener('change', handleAppState);

    return () => {
      stopPolling();
      sub.remove();
    };
  }, [conversationId]);

  // Rehydrate queued messages from previous sessions and flush them (WhatsApp:
  // "your message wasn't lost — it sends as soon as you're back")
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = (await readOutbox()).filter(e => e.conversationId === conversationId);
      if (cancelled || entries.length === 0) return;
      setMessages(prev => {
        const ids = new Set(prev.map(m => m.id));
        const clientIds = new Set(prev.map(m => m.client_id).filter(Boolean));
        const missing = entries.filter(e => !ids.has(e.tempId) && !clientIds.has(e.clientId));
        if (missing.length === 0) return prev;
        return [...prev, ...missing.map(e => ({
          id: e.tempId,
          conversation_id: e.conversationId,
          sender_id: store.user?.id || '',
          content: e.content || '',
          message_type: e.messageType,
          image_url: e.imageUrl,
          localImageUri: e.imageUri,
          is_read: true,
          created_at: e.createdAt,
          pending: true,
          failed: e.attempts >= 5,
          client_id: e.clientId,
        } as LocalMessage))];
      });
      flushOutbox();
    })();
    return () => { cancelled = true; };
  }, [conversationId]);

  // Connectivity: banner + auto-flush on reconnect (UnsentMessagesNetworkAvailableJob, WhatsApp-style)
  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      const online = !(state.isConnected === false || state.isInternetReachable === false);
      onlineRef.current = online;
      setOffline(!online);
      if (online) flushOutbox({ resetAttempts: true });
    });
    NetInfo.fetch().then(state => {
      const online = !(state.isConnected === false || state.isInternetReachable === false);
      onlineRef.current = online;
      setOffline(!online);
    }).catch(() => {});
    return () => unsub();
  }, [conversationId]);

  useEffect(() => {
    if (!draftOffer) return;
    setOfferDraftVisible(true);
  }, [draftOffer]);



  const handleSend = () => {
    if (!text.trim()) return;
    const msg = text.trim();
    const replyingTo = replyTo;
    const tempId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const clientId = genClientId();
    const createdAt = new Date().toISOString();
    const optimistic: LocalMessage = {
      id: tempId, conversation_id: conversationId, sender_id: store.user?.id || '',
      content: msg, message_type: 'text', is_read: true, created_at: createdAt,
      pending: true, delivery_status: 'sent', client_id: clientId,
      reply_to: replyingTo ? { id: replyingTo.id, content: replyingTo.content, senderId: replyingTo.sender_id, senderName: replyingTo.sender_id === store.user?.id ? 'You' : otherUserName, type: replyingTo.message_type } : undefined,
    } as LocalMessage;
    setText('');
    setReplyTo(null);
    enqueueLocal(
      { tempId, clientId, conversationId, content: msg, messageType: 'text', replyToId: replyingTo?.id, attempts: 0, createdAt },
      optimistic
    );
  };

  const handleSendImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const uri = result.assets![0].uri;
      const tempId = `local-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const clientId = genClientId();
      const createdAt = new Date().toISOString();
      const optimistic: LocalMessage = {
        id: tempId, conversation_id: conversationId, sender_id: store.user?.id || '',
        content: '', message_type: 'image', image_url: uri, localImageUri: uri,
        is_read: true, created_at: createdAt, pending: true, delivery_status: 'sent', client_id: clientId,
      } as LocalMessage;
      enqueueLocal(
        { tempId, clientId, conversationId, content: null, messageType: 'image', imageUri: uri, attempts: 0, createdAt },
        optimistic
      );
    } catch {
      toast.error(t('chat.photoPickerFailed'), t('chat.photoPickerRetry'));
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
        toast.success(t('offer.acceptedToast'), t('offer.acceptedDetail'));
      }
    } catch {
      toast.error(t('offer.couldNotUpdate'), t('common.tryAgain'));
    }
  };

  const handleCounterOffer = async (messageId: string) => {
    const price = Number(counterPrice.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(price) || price <= 0) {
      toast.error(t('offer.invalidPrice'));
      return;
    }
    try {
      const { counterOffer } = await import('../api');
      await counterOffer(messageId, price);
      setCounteringMessageId(null);
      setCounterPrice('');
      lastMessageCursor.current = null;
      await fetchMessages();
      toast.success(t('offer.counterSent'), t('offer.counterDetail'));
    } catch {
      toast.error(t('offer.notSentTitle'), t('common.tryAgain'));
    }
  };

  // ───── Message Actions ─────

  const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '🙏'];

  const handleMessageLongPress = (msg: LocalMessage) => {
    if (msg.is_deleted || msg.pending) return;
    setActionMenuMessage(msg);
    setActionMenuVisible(true);
  };

  const handleReact = async (emoji: string) => {
    if (!actionMenuMessage) return;
    setActionMenuVisible(false);
    const msgId = actionMenuMessage.id;
    // Optimistic update
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m;
      const existing = m.reactions || [];
      const hasReaction = existing.find(r => r.emoji === emoji && r.userId === store.user?.id);
      const newReactions = hasReaction
        ? existing.filter(r => !(r.emoji === emoji && r.userId === store.user?.id))
        : [...existing, { emoji, userId: store.user?.id || '', userName: 'You' }];
      return { ...m, reactions: newReactions };
    }));
    try {
      const { reactToMessage } = await import('../api');
      await reactToMessage(msgId, emoji);
    } catch {
      // revert on failure
      setMessages(prev => prev.map(m => {
        if (m.id !== msgId) return m;
        const existing = m.reactions || [];
        const hasReaction = existing.find(r => r.emoji === emoji && r.userId === store.user?.id);
        const newReactions = hasReaction
          ? existing.filter(r => !(r.emoji === emoji && r.userId === store.user?.id))
          : [...existing, { emoji, userId: store.user?.id || '', userName: 'You' }];
        return { ...m, reactions: newReactions };
      }));
    }
    setActionMenuMessage(null);
  };

  const handleReply = () => {
    if (!actionMenuMessage) return;
    setReplyTo(actionMenuMessage);
    setActionMenuVisible(false);
  };

  const handleCopy = () => {
    if (!actionMenuMessage?.content) { setActionMenuVisible(false); return; }
    // Use Clipboard API — works on web + native
    try {
      const Clipboard = require('expo-clipboard');
      Clipboard.setStringAsync(actionMenuMessage.content);
      toast.success('Copied');
    } catch {
      // fallback: do nothing silently
    }
    setActionMenuVisible(false);
  };

  const handleDelete = async () => {
    if (!actionMenuMessage) return;
    setActionMenuVisible(false);
    const msgId = actionMenuMessage.id;
    // Optimistic: hide message        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_deleted: true, content: t('chat.messageDeleted'), image_url: undefined } : m));
    try {
      const { deleteMessage } = await import('../api');
      await deleteMessage(msgId);
    } catch {
      toast.error(t('chat.deleteFailed'));
    }
    setActionMenuMessage(null);
  };

  const handleEdit = async () => {
    if (!actionMenuMessage?.content) { setActionMenuVisible(false); return; }
    setActionMenuVisible(false);
    setText(actionMenuMessage.content);
    setReplyTo(null);
    // TODO: switch to edit mode (reuse input for now)
  };

  const renderMessage = ({ item }: { item: LocalMessage }) => {
    const isMe = item.sender_id === store.user?.id;
    const isImage = item.message_type === 'image' && item.image_url;
    const isOffer = item.message_type === 'offer';

    if (isOffer) {
      const offerData = item.offer_data as { productId: string; productName: string; offeredPrice: number; listPrice: number; status: 'pending' | 'accepted' | 'declined' | 'countered' | 'expired'; negotiationRound?: number } | undefined;
      if (!offerData) return null;
      // Hide expired offers from chat
      if (offerData.status === 'expired') return null;
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
            <LinearGradient
              colors={isAccepted ? ['rgba(29,158,117,0.08)', 'transparent'] : isDeclined ? ['rgba(226,75,74,0.06)', 'transparent'] : isCountered ? ['rgba(59,130,246,0.06)', 'transparent'] : ['rgba(216,90,48,0.07)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ ...StyleSheet.absoluteFill, borderRadius: RADIUS.media }}
            />
            {/* Header Stripe */}
            <View style={styles.offerMsgHeader}>
              <View style={styles.offerMsgTypeWrap}>
                <Icon name="sale-tag" size={14} color={isAccepted ? '#1D9E75' : isCountered ? '#3B82F6' : COLORS.coral} />
                <Text style={styles.offerMsgEyebrow}>
                  {isMe ? t('offer.yourOffer') : t('offer.received')}
                </Text>
              </View>
              <View style={[
                styles.offerStatusBadge,
                isAccepted && styles.offerStatusBadgeAccepted,
                isDeclined && styles.offerStatusBadgeDeclined,
                isCountered && styles.offerStatusBadgeCountered,
                isPending && styles.offerStatusBadgePending,
              ]}>
                {isAccepted ? (
                  <Text style={[styles.offerStatusText, styles.offerStatusTextAccepted]}>✓ Accepted</Text>
                ) : isDeclined ? (
                  <Text style={[styles.offerStatusText, styles.offerStatusTextDeclined]}>✕ Declined</Text>
                ) : isCountered ? (
                  <Text style={[styles.offerStatusText, styles.offerStatusTextCountered]}>🔄 Counter ({offerData.negotiationRound || 1}/3)</Text>
                ) : (
                  <View style={styles.offerStatusPendingIcon}>
                    <Animated.View style={{
                      transform: [{ scale: pendingPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] }) }],
                      opacity: pendingPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }),
                    }}>
                      <MaterialCommunityIcons name="clock-outline" size={14} color="#F5A623" />
                    </Animated.View>
                  </View>
                )}
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

            {/* View Offer Details Button - for users who can't respond */}
            {!sellerCanRespond && !buyerCanRespond && !isAccepted && (
              <View style={styles.offerMsgActions}>
                <TouchableOpacity
                  style={styles.offerMsgView}
                  onPress={() => navigation.navigate('OfferDetail', { messageId: item.id, conversationId })}
                  accessibilityLabel="view offer details"
                  accessibilityRole="button"
                  activeOpacity={0.7}
                >
                  <Text style={styles.offerMsgViewText}>View</Text>
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
                    placeholder={t('offer.counterPrice')}
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
      <SwipeReplyRow onReply={() => setReplyTo(item)}>
      <Pressable
        style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem, isImage && styles.bubbleImage]}
        onLongPress={() => handleMessageLongPress(item)}
        onPress={() => { if (item.failed) retryMessage(item.id); }}
      >
        {/* WhatsApp-style tail on the sender's top corner */}
        {!isImage && (isMe ? <View style={styles.tailMe} /> : <View style={styles.tailThem} />)}
        {/* Reply-to quote */}
        {item.reply_to && (
          <View style={styles.replyQuote}>
            <View style={styles.replyAccent} />
            <View style={styles.replyContent}>
              <Text style={styles.replySender} numberOfLines={1}>{item.reply_to.senderName || 'Message'}</Text>
              <Text style={styles.replyText} numberOfLines={2}>{item.reply_to.content || (item.reply_to.type === 'image' ? '📷 Photo' : 'Message')}</Text>
            </View>
          </View>
        )}
        {isImage ? (
          <TouchableOpacity onPress={() => setPreview({ uri: item.localImageUri || getImageUrl(item.image_url!) || item.image_url!, sender: isMe ? (store.user?.full_name || 'You') : (otherUserName || 'Message'), time: new Date(item.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) })} accessibilityRole="imagebutton" accessibilityLabel="open photo">
            <View>
              <Image source={{ uri: item.localImageUri || getImageUrl(item.image_url!) || item.image_url! }} style={styles.chatImage} resizeMode="cover" />
              {item.pending && (
                <View style={styles.imageOverlay}>
                  <ActivityIndicator size="small" color={COLORS.white} />
                </View>
              )}
            </View>
          </TouchableOpacity>
        ) : null}
        {item.content ? (
          <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.content}</Text>
        ) : null}
        {item.is_edited && !isImage && <Text style={styles.editedLabel}>edited</Text>}
        <View style={styles.bubbleFooter}>
          <Text style={[styles.bubbleTime, isImage && styles.bubbleTimeImage]}>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
          {item.is_edited && isImage && <Text style={styles.editedLabel}>edited</Text>}
          {/* Delivery indicator for own messages (WhatsApp ticks) */}
          {isMe && item.pending && (
            <MaterialCommunityIcons name="clock-outline" size={11} color="rgba(255,255,255,0.55)" accessibilityLabel={t('chat.sending')} />
          )}
          {isMe && item.failed && (
            <View style={styles.retryWrap} accessibilityRole="button" accessibilityLabel={t('chat.tapRetry')}>
              <MaterialCommunityIcons name="alert-circle-outline" size={12} color="#FFD3DE" />
              <Text style={styles.messageFailed}>{t('chat.notSentTapRetry')}</Text>
            </View>
          )}
          {isMe && !item.pending && !item.failed && (
            <Text style={[styles.deliveryCheck, item.delivery_status === 'read' && styles.deliveryRead]} accessibilityLabel={t(item.delivery_status === 'read' ? 'chat.tickRead' : item.delivery_status === 'delivered' ? 'chat.tickDelivered' : 'chat.tickSent')}>
              {item.delivery_status === 'read' ? '✓✓' : item.delivery_status === 'delivered' ? '✓✓' : '✓'}
            </Text>
          )}
        </View>
        {/* Reactions */}
        {item.reactions && item.reactions.length > 0 && (
          <View style={[styles.reactionsRow, isMe ? styles.reactionsRowMe : styles.reactionsRowThem]}>
            {item.reactions.map((r, i) => (
              <Text key={i} style={styles.reactionEmoji}>{r.emoji}</Text>
            ))}
          </View>
        )}
      </Pressable>
      </SwipeReplyRow>
    );
  };

  const formatLastSeen = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return `${t('chat.today')}, ${time}`;
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `${t('chat.yesterday')}, ${time}`;
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <LinearGradient
        colors={['#121820', '#0D1117', '#0A0E14']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.container}
      >
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
              seller={{ avatar_url: otherUserAvatar, store_logo_url: otherUserStoreLogoUrl, use_store_identity: otherUserUseStoreIdentity, full_name: otherUserName, seller_tier: otherUserTier } as any}
              size={48}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.headerName} numberOfLines={1}>{otherUserName}</Text>
              {otherTyping || presence?.online ? (
                <View style={styles.headerOnlineRow}>
                  <View style={styles.onlineDot} />
                  <Text style={[styles.onlineText, otherTyping && styles.onlineTextTyping]} numberOfLines={1}>
                    {otherTyping ? t('chat.typing') : t('chat.online')}
                  </Text>
                </View>
              ) : presence?.lastSeen ? (
                <Text style={styles.headerLastSeen} numberOfLines={1}>{t('chat.lastSeenAt', { time: formatLastSeen(presence.lastSeen) })}</Text>
              ) : (
                <Text style={styles.headerLastSeen}>{' '}</Text>
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerMore} onPress={() => setProfileMenuVisible(true)} accessibilityLabel="more options" accessibilityRole="button">
            <MaterialCommunityIcons name="dots-vertical" size={18} color={COLORS.text2} />
          </TouchableOpacity>
        </View>

{/* Offer Reminder Banner - removed, View button is now on the offer card itself */}

        {offline && (
          <View style={styles.offlineBanner} accessibilityRole="alert">
            <MaterialCommunityIcons name="cloud-off-outline" size={14} color="#F5A623" />
            <Text style={styles.offlineBannerText}>{t('chat.offlineBanner')}</Text>
          </View>
        )}

        <FlatList
            data={messages}
            renderItem={renderMessage}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.messageList}
            style={{ flex: 1 }}
            ref={listRef}
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
            onContentSizeChange={() => {
              if (listRef.current && stickToLatest.current && messages.length > 0) {
                setTimeout(() => {
                  listRef.current?.scrollToEnd({ animated: false });
                }, 100);
              }
            }}
          />

        {draftOffer && offerDraftVisible && (
          <View style={styles.offerDock}>
            <LinearGradient
              colors={['rgba(59,130,246,0.06)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ ...StyleSheet.absoluteFill, borderRadius: RADIUS.media }}
            />
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
            <Text style={styles.typingText}>{t('chat.theyTyping', { name: otherUserName || t('chat.they') })}</Text>
          </View>
        )}

        {/* Reply-to preview bar */}
        {replyTo && (
          <View style={styles.replyBar}>
            <View style={styles.replyBarAccent} />
            <View style={styles.replyBarContent}>
              <Text style={styles.replyBarSender} numberOfLines={1}>Replying to {replyTo.sender_id === store.user?.id ? 'yourself' : otherUserName}</Text>
              <Text style={styles.replyBarText} numberOfLines={1}>{replyTo.content || (replyTo.message_type === 'image' ? '📷 Photo' : 'Message')}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} style={styles.replyBarClose} accessibilityLabel="cancel reply" accessibilityRole="button">
              <Icon name="close" size={16} color={COLORS.text2} />
            </TouchableOpacity>
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
            <TouchableOpacity style={[{ opacity: sending || (!text.trim()) ? 0.4 : 1 }]} onPress={handleSend} disabled={sending || !text.trim()} accessibilityLabel="send message" accessibilityRole="button">
              <LinearGradient
                colors={['#FF6B81', '#FF4D6A', '#E8365A']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.sendBtn}
              >
              <MaterialCommunityIcons name="arrow-up" size={20} color={COLORS.white} />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
          <View style={styles.viewerRoot}>
            {preview && viewerChrome && (
              <View style={[styles.viewerHeader, { paddingTop: insets.top + SPACING.xs }]}>
                <TouchableOpacity onPress={() => setPreview(null)} style={styles.viewerHeaderBtn} accessibilityLabel="close photo" accessibilityRole="button">
                  <MaterialCommunityIcons name="close" size={26} color={COLORS.white} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={styles.viewerSender} numberOfLines={1}>{preview.sender}</Text>
                  <Text style={styles.viewerTime}>{preview.time}</Text>
                </View>
              </View>
            )}
            {preview && (
              <GestureDetector gesture={viewerGesture}>
                <Animated.View style={{ flex: 1 }}>
                  <AnimatedRe.Image source={{ uri: preview.uri }} style={[styles.viewerImage, viewerImageStyle]} resizeMode="contain" />
                </Animated.View>
              </GestureDetector>
            )}
          </View>
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

        {/* Message Action Menu (long-press) */}
        <Modal visible={actionMenuVisible} transparent animationType="fade" onRequestClose={() => { setActionMenuVisible(false); setActionMenuMessage(null); }}>
          <Pressable style={styles.actionMenuOverlay} onPress={() => { setActionMenuVisible(false); setActionMenuMessage(null); }}>
            <Pressable style={styles.actionMenu} onPress={e => e.stopPropagation()}>
              {/* Reaction picker */}
              <View style={styles.reactionPicker}>
                {REACTION_EMOJIS.map(emoji => (
                  <TouchableOpacity key={emoji} style={styles.reactionBtn} onPress={() => handleReact(emoji)} accessibilityLabel={`react with ${emoji}`} accessibilityRole="button">
                    <Text style={styles.reactionBtnText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.actionMenuDivider} />
              {/* Action buttons */}
              <TouchableOpacity style={styles.actionMenuItem} onPress={handleReply} accessibilityRole="button">
                <MaterialCommunityIcons name="reply" size={18} color={COLORS.text} />
                <Text style={styles.actionMenuText}>Reply</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionMenuItem} onPress={handleCopy} accessibilityRole="button">
                <MaterialCommunityIcons name="content-copy" size={18} color={COLORS.text} />
                <Text style={styles.actionMenuText}>Copy</Text>
              </TouchableOpacity>
              {actionMenuMessage?.sender_id === store.user?.id && actionMenuMessage?.message_type === 'text' && (
                <TouchableOpacity style={styles.actionMenuItem} onPress={handleEdit} accessibilityRole="button">
                  <MaterialCommunityIcons name="pencil" size={18} color={COLORS.text} />
                  <Text style={styles.actionMenuText}>Edit</Text>
                </TouchableOpacity>
              )}
              {actionMenuMessage?.sender_id === store.user?.id && (
                <TouchableOpacity style={[styles.actionMenuItem, { borderBottomWidth: 0 }]} onPress={handleDelete} accessibilityRole="button">
                  <MaterialCommunityIcons name="delete-outline" size={18} color="#FF4D6A" />
                  <Text style={[styles.actionMenuText, { color: '#FF4D6A' }]}>Delete</Text>
                </TouchableOpacity>
              )}
            </Pressable>
          </Pressable>
        </Modal>

      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border + '40', backgroundColor: COLORS.bg,
  },
  headerProfile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerName: { fontSize: 16, fontWeight: '700', color: COLORS.text, letterSpacing: -0.2 },
  headerOnlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  onlineDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#00C853' },
  onlineText: { fontSize: 11, color: COLORS.text2, fontWeight: '500' },
  onlineTextTyping: { color: '#00C853', fontStyle: 'italic' },
  headerLastSeen: { fontSize: 11, color: COLORS.text2, fontWeight: '400', marginTop: 1 },
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(245,166,35,0.12)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(245,166,35,0.35)',
    paddingHorizontal: SPACING.md, paddingVertical: 6,
  },
  offlineBannerText: { flex: 1, fontSize: 11.5, color: '#F5A623', fontWeight: '600' },
  headerMore: { padding: 8, borderRadius: 20, backgroundColor: COLORS.surface2 },
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
    maxWidth: '78%', paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 20, marginBottom: 4,
  },
  bubbleMe: {
    alignSelf: 'flex-end', backgroundColor: COLORS.coral,
    borderTopRightRadius: 4,
  },
  bubbleThem: {
    alignSelf: 'flex-start', backgroundColor: COLORS.surface,
    borderTopLeftRadius: 4, borderWidth: 1, borderColor: COLORS.border + '50',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 1,
  },
  tailMe: {
    position: 'absolute', top: -4, right: -5, width: 11, height: 11,
    backgroundColor: COLORS.coral, transform: [{ rotate: '45deg' }],
  },
  tailThem: {
    position: 'absolute', top: -4, left: -5, width: 11, height: 11,
    backgroundColor: COLORS.surface, transform: [{ rotate: '45deg' }],
  },
  swipeReplyAction: {
    width: 44, justifyContent: 'center', alignItems: 'center',
  },
  bubbleImage: { padding: 3, backgroundColor: 'transparent', borderWidth: 0 },
  bubbleText: { fontSize: 15, color: COLORS.text, lineHeight: 21 },
  bubbleTextMe: { color: COLORS.white },
  bubbleTime: { fontSize: 10, color: 'rgba(255,255,255,0.65)', marginTop: 4, alignSelf: 'flex-end' },
  chatImage: { width: 240, height: 240, borderRadius: RADIUS.media },
  imageOverlay: { ...StyleSheet.absoluteFill, borderRadius: RADIUS.media, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' } as any,
  bubbleTimeImage: { marginTop: 4 },
  messageState: { fontSize: 10, color: COLORS.text2, marginTop: 3, alignSelf: 'flex-end' },
  messageFailed: { fontSize: 10, color: '#FFD3DE', fontWeight: '700' },
  retryWrap: { flexDirection: 'row', alignItems: 'center', gap: 3 },

  /* Delivery indicators */
  bubbleFooter: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginTop: 4 },
  deliveryCheck: { fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
  deliveryRead: { color: '#53BDEB' },
  editedLabel: { fontSize: 9, color: 'rgba(255,255,255,0.45)', fontStyle: 'italic', marginLeft: 4 },

  /* Reply quote */
  replyQuote: { flexDirection: 'row', marginBottom: 4, opacity: 0.85 },
  replyAccent: { width: 3, borderRadius: 2, backgroundColor: COLORS.coral, marginRight: 6 },
  replyContent: { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8 },
  replySender: { fontSize: 10, fontWeight: '700', color: COLORS.coral, marginBottom: 1 },
  replyText: { fontSize: 11, color: 'rgba(255,255,255,0.6)' },

  /* Reactions */
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, marginTop: 4 },
  reactionsRowMe: { alignSelf: 'flex-end' },
  reactionsRowThem: { alignSelf: 'flex-start' },
  reactionEmoji: { fontSize: 16, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' },

  /* Reply-to bar */
  replyBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border + '40' },
  replyBarAccent: { width: 3, borderRadius: 2, backgroundColor: COLORS.coral, marginRight: 8, alignSelf: 'stretch' },
  replyBarContent: { flex: 1 },
  replyBarSender: { fontSize: 11, fontWeight: '700', color: COLORS.coral },
  replyBarText: { fontSize: 11, color: COLORS.text2, marginTop: 1 },
  replyBarClose: { padding: 6 },

  /* Action menu (long-press) */
  actionMenuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  actionMenu: { width: 220, backgroundColor: COLORS.surface, borderRadius: RADIUS.card, padding: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 8 },
  reactionPicker: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8, paddingHorizontal: 4 },
  reactionBtn: { padding: 6, borderRadius: 20 },
  reactionBtnText: { fontSize: 22 },
  actionMenuDivider: { height: 1, backgroundColor: COLORS.border + '40', marginVertical: 4 },
  actionMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border + '20' },
  actionMenuText: { fontSize: 13, fontWeight: '600', color: COLORS.text },

  /* Rich Offer Message Card */
  offerMsgWrap: { maxWidth: '95%', width: '95%', marginBottom: 8 },
  offerMsgWrapMe: { alignSelf: 'flex-end' },
  offerMsgWrapThem: { alignSelf: 'flex-start' },
  offerMsgCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border + '50',
    borderRadius: RADIUS.media,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
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
  offerStatusPendingIcon: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(245,166,35,0.15)',
    borderWidth: 1,
    borderColor: '#F5A623',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  offerMsgView: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    backgroundColor: COLORS.coral,
  },
  offerMsgViewText: {
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
  offerViewBtn: {
    backgroundColor: COLORS.coral,
    borderRadius: RADIUS.pill,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  offerViewBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.white,
  },

  /* Offer Dock (at bottom) */
  offerDock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: SPACING.md,
    marginBottom: 8,
    padding: 14,
    borderRadius: RADIUS.media,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border + '40',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3,
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
    paddingHorizontal: SPACING.md + 4,
    paddingBottom: 4, paddingTop: 2,
  },
  typingText: { fontSize: 12, color: COLORS.text2, fontStyle: 'italic' },
  inputArea: {
    borderTopWidth: 1, borderTopColor: COLORS.border + '30',
    backgroundColor: COLORS.bg,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', padding: SPACING.sm,
    paddingHorizontal: SPACING.md,
    gap: 8,
  },
  input: {
    flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border + '60',
    borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, color: COLORS.text,
    fontSize: 15, maxHeight: 100, lineHeight: 20,
  },
  cameraBtn: {
    width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center',
    backgroundColor: COLORS.surface2,
  },
  offerBtn: {
    width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center',
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.coral,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: COLORS.coral, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 2,
  },
  profileOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 20,
  },
  viewerRoot: { flex: 1, backgroundColor: '#000' },
  viewerHeader: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm, backgroundColor: 'rgba(0,0,0,0.55)' },
  viewerHeaderBtn: { padding: 6, marginRight: 4 },
  viewerSender: { fontSize: 15, fontWeight: '600', color: COLORS.white },
  viewerTime: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 1 },
  viewerImage: { width: '100%', height: '100%' },
});
