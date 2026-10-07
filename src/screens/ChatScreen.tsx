import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, PanResponder,
  KeyboardAvoidingView, Platform, Image, Pressable, AppState, AppStateStatus, Modal,
  Animated, Linking,
} from 'react-native';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import { Icon } from '../components/icons/Icon';
import { COLORS, SPACING, RADIUS, formatPrice } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMessages, sendMessage as apiSendMessage, sendMessageWithReply, getImageUrl, uploadImage, uploadAudio, sendTyping, getTypingStatus, markConversationRead, getDeliveryStatuses, getPresence, getConversationMedia, getLinkPreview, sendProductCard, pinConversation, muteConversation, blockUser, reportConversationUser } from '../api';
import type { LinkPreviewData, ConversationMediaItem } from '../api';
import { onRealtime } from '../realtime';
import { network } from '../network';
import { cacheKeys, readSnapshot, writeSnapshot, pruneMessageSnapshots } from '../offlineCache';
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
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, setAudioModeAsync, requestRecordingPermissionsAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { useLowDataMode } from '../hooks/useLowDataMode';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;
type LocalMessage = Message & { pending?: boolean; failed?: boolean; dataPaused?: boolean; localImageUri?: string; reactions?: { emoji: string; userId: string; userName: string }[]; delivery_status?: 'sent' | 'delivered' | 'read'; reply_to?: Message['reply_to']; client_id?: string };
// WhatsApp-style swipe-right-to-reply on a message bubble.
function SwipeReplyRow({ children, onReply }: { children: React.ReactNode; onReply: () => void }) {
  const { t } = useTranslation();
  return (
    <Swipeable
      renderLeftActions={() => (
        <View style={styles.swipeReplyAction} accessibilityLabel={t('chat.reply')} accessibilityRole="button">
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

// Only one voice note plays at a time (WhatsApp behavior).
let activeVoicePlayer: { pause: () => void } | null = null;

const VOICE_BARS = 22;
function VoiceNotePlayer({ uri, isMe, duration, deferUntilPlay = false }: { uri: string; isMe: boolean; duration: number; deferUntilPlay?: boolean }) {
  const { t } = useTranslation();
  const player = useAudioPlayer(deferUntilPlay ? null : uri, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [wantsPlayback, setWantsPlayback] = useState(false);
  const total = status.duration && isFinite(status.duration) && status.duration > 0
    ? status.duration
    : (duration || 0);
  const current = total > 0 ? Math.min(status.currentTime || 0, total) : 0;
  const progress = total > 0 ? current / total : 0;
  const finished = status.didJustFinish;
  useEffect(() => {
    if (!deferUntilPlay || !wantsPlayback || !status.isLoaded || status.error) return;
    if (activeVoicePlayer && activeVoicePlayer !== player) activeVoicePlayer.pause();
    activeVoicePlayer = player;
    player.play();
    setWantsPlayback(false);
  }, [deferUntilPlay, wantsPlayback, status.isLoaded, status.error, player]);
  const toggle = () => {
    try {
      if (status.playing) {
        player.pause();
      } else if (deferUntilPlay && status.error) {
        setWantsPlayback(true);
        player.replace(uri);
      } else if (deferUntilPlay && !status.isLoaded) {
        setWantsPlayback(true);
        player.replace(uri);
      } else {
        if (activeVoicePlayer && activeVoicePlayer !== player) activeVoicePlayer.pause();
        activeVoicePlayer = player;
        if (finished || (total > 0 && current >= total - 0.05)) player.seekTo(0);
        player.play();
      }
    } catch { /* ignore playback errors */ }
  };
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const shownTime = status.playing || (!finished && current > 0) ? current : (finished ? total : total);
  const waitingForTap = deferUntilPlay && !status.isLoaded && !status.isBuffering && !status.error;
  const loading = wantsPlayback || status.isBuffering || (deferUntilPlay && !status.isLoaded && !status.error && !waitingForTap);
  const fillColor = isMe ? COLORS.white : COLORS.coral;
  const trackColor = isMe ? 'rgba(255,255,255,0.3)' : COLORS.border;
  return (
    <View style={styles.voiceRow} accessibilityLabel={t('chat.voiceMessage')}>
      <TouchableOpacity onPress={toggle} style={[styles.voicePlay, isMe && styles.voicePlayMe]} accessibilityRole="button" accessibilityLabel={status.error ? t('chat.retryVoiceLoad') : waitingForTap ? t('chat.tapToPlayVoice') : t('chat.voicePlayback')}>
        {loading ? <ActivityIndicator size="small" color={isMe ? COLORS.coral : COLORS.white} /> : <MaterialCommunityIcons name={status.error ? 'refresh' : waitingForTap ? 'cloud-download-outline' : status.playing ? 'pause' : 'play'} size={16} color={isMe ? COLORS.coral : COLORS.white} />}
      </TouchableOpacity>
      <View style={styles.voiceBars}>
        {Array.from({ length: VOICE_BARS }).map((_, i) => {
          const h = 4 + ((i * 7 + 3) % 10);
          const active = (i + 1) / VOICE_BARS <= Math.max(progress, finished ? 1 : 0);
          return <View key={i} style={{ width: 2, height: h, borderRadius: 1, backgroundColor: active ? fillColor : trackColor }} />;
        })}
      </View>
      <Text style={[styles.voiceTime, isMe && styles.voiceTimeMe]}>{status.error ? t('chat.retryVoiceLoad') : waitingForTap ? t('chat.tapToPlayVoice') : fmt(Math.round(shownTime))}</Text>
    </View>
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
  messageType: 'text' | 'image' | 'audio';
  imageUri?: string;
  imageUrl?: string;
  audioUri?: string;
  audioUrl?: string;
  audioDuration?: number;
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

const fmtMs = (ms: number) => {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`;
};

// ───── Link previews ─────
const URL_PATTERN = /(https?:\/\/[^\s<>"')\]]+)/gi;
const stripUrlPunct = (u: string) => u.replace(/[.,;:!?"'\)\]]+$/, '');
const findFirstUrl = (s: string) => { const m = s.match(URL_PATTERN); return m ? stripUrlPunct(m[0]) : null; };
const urlHost = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

const previewCache = new Map<string, LinkPreviewData | null>();
const previewPending = new Map<string, Promise<LinkPreviewData | null>>();

function LinkPreview({ url, isMe, showImage = true }: { url: string; isMe: boolean; showImage?: boolean }) {
  const [preview, setPreview] = useState<LinkPreviewData | null | undefined>(() => (previewCache.has(url) ? previewCache.get(url)! : undefined));
  useEffect(() => {
    if (preview !== undefined) return;
    let alive = true;
    let p = previewPending.get(url);
    if (!p) {
      p = getLinkPreview(url)
        .then(r => { const d = r.preview || null; previewCache.set(url, d); return d; })
        .catch(() => null);
      previewPending.set(url, p);
    }
    p.then(d => { previewPending.delete(url); if (alive) setPreview(d); });
    return () => { alive = false; };
  }, [url, preview]);
  if (!preview) return null;
  const host = urlHost(url);
  return (
    <TouchableOpacity
      style={[styles.linkCard, isMe && styles.linkCardMe]}
      onPress={() => Linking.openURL(stripUrlPunct(url)).catch(() => {})}
      activeOpacity={0.8}
      accessibilityRole="link"
      accessibilityLabel={preview.title || host}
    >
      {preview.image && showImage ? (
        <Image source={{ uri: preview.image }} style={styles.linkThumb} resizeMode="cover" />
      ) : (
        <View style={[styles.linkThumb, styles.linkThumbFallback]}>
          <MaterialCommunityIcons name="link-variant" size={20} color={COLORS.text2} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.linkTitle} numberOfLines={1}>{preview.title || host}</Text>
        {preview.description ? <Text style={styles.linkDesc} numberOfLines={2}>{preview.description}</Text> : null}
        <Text style={styles.linkHost} numberOfLines={1}>{preview.siteName || host}</Text>
      </View>
    </TouchableOpacity>
  );
}

function LinkifiedText({ content, isMe }: { content: string; isMe: boolean }) {
  const parts = content.split(URL_PATTERN);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <Text
            key={i}
            style={isMe ? styles.bubbleLinkMe : styles.bubbleLink}
            onPress={() => Linking.openURL(stripUrlPunct(p)).catch(() => {})}
          >
            {p}
          </Text>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        )
      )}
    </>
  );
}

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
  const reduceMotion = useReduceMotion();
  const lowDataMode = useLowDataMode();
  const toast = useToast();
  const { conversationId, otherUserName, otherUserId, otherUserAvatar, otherUserStoreLogoUrl, otherUserUseStoreIdentity, otherUserTier, draftOffer } = route.params;
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const [attachmentMenuVisible, setAttachmentMenuVisible] = useState(false);
  const [mutePickerVisible, setMutePickerVisible] = useState(false);
  const [muteCustomHours, setMuteCustomHours] = useState('24');
  const [confirmBlockVisible, setConfirmBlockVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [privacyInfoVisible, setPrivacyInfoVisible] = useState(false);
  const [peerProfileVisible, setPeerProfileVisible] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [conversationRole, setConversationRole] = useState<'buyer' | 'seller'>('buyer');
  const [conversationPinned, setConversationPinned] = useState(false);
  const [conversationIsMuted, setConversationIsMuted] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [blockedByOther, setBlockedByOther] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [, setHeaderHeight] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [preview, setPreview] = useState<{ uri: string; sender: string; time: string } | null>(null);
  const [viewerChrome, setViewerChrome] = useState(true);
  const [loadedChatImageIds, setLoadedChatImageIds] = useState<Set<string>>(() => new Set());
  const [loadedMediaImageIds, setLoadedMediaImageIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setLoadedChatImageIds(new Set());
    setLoadedMediaImageIds(new Set());
  }, [conversationId]);

  // Shared media gallery
  const [mediaVisible, setMediaVisible] = useState(false);
  const [mediaTab, setMediaTab] = useState<'images' | 'links'>('images');
  const [mediaList, setMediaList] = useState<ConversationMediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);

  const openMedia = async () => {
    setMediaVisible(true);
    setMediaTab('images');
    if (mediaList.length > 0 || mediaLoading) return;
    setMediaLoading(true);
    try {
      const r = await getConversationMedia(conversationId);
      setMediaList(r.media || []);
    } catch {
      toast.error(t('chat.mediaLoadFailed'));
    } finally {
      setMediaLoading(false);
    }
  };

  // Links tab: deduped URLs from messages already loaded in this chat
  const linkMessages = useMemo(() => {
    const seen = new Set<string>();
    const out: { url: string; sender: string; time: string }[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.message_type !== 'text' || !m.content || m.is_deleted) continue;
      const u = findFirstUrl(m.content);
      if (!u || seen.has(u)) continue;
      seen.add(u);
      out.push({
        url: u,
        sender: m.sender_id === store.user?.id ? (store.user?.full_name || 'You') : otherUserName || 'Message',
        time: new Date(m.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);
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
  const [otherTyping, setOtherTyping] = useState(false);
  const [presence, setPresence] = useState<{ online: boolean; lastSeen: string | null } | null>(null);
  const [offline, setOffline] = useState(false);
  const [sellerItemsVisible, setSellerItemsVisible] = useState(false);
  const [offerBuilderItem, setOfferBuilderItem] = useState<{ id: string; name: string; price: number; stock?: number; image_url?: string | null } | null>(null);
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
  const lowDataRef = useRef(lowDataMode);
  lowDataRef.current = lowDataMode;
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

  const flushOutbox = async (opts?: { resetAttempts?: boolean; allowCellularMediaId?: string }) => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    try {
      let entries = (await readOutbox()).filter(e => e.conversationId === conversationId);
      const connectionType = (await NetInfo.fetch().catch(() => null))?.type;
      if (opts?.resetAttempts) {
        entries = entries.map(e => ({ ...e, attempts: 0 }));
        const others = (await readOutbox()).filter(e => e.conversationId !== conversationId);
        await writeOutbox([...others, ...entries]);
      }
      for (const entry of entries) {
        if (entry.attempts >= 5) continue; // give up until explicit retry / reconnect
        const pendingMediaUpload = (entry.messageType === 'image' && !entry.imageUrl) || (entry.messageType === 'audio' && !entry.audioUrl);
        if (lowDataRef.current && connectionType === 'cellular' && pendingMediaUpload && opts?.allowCellularMediaId !== entry.tempId) {
          setMessages(prev => prev.map(m => m.id === entry.tempId ? { ...m, pending: true, failed: false, dataPaused: true } : m));
          continue;
        }
        try {
          let imageUrl = entry.imageUrl;
          if (entry.messageType === 'image' && !imageUrl) {
            if (!entry.imageUri) throw new Error('missing image uri');
            const up = await uploadImage(entry.imageUri) as { url: string };
            imageUrl = up.url;
            await persistEntry({ ...entry, imageUrl, attempts: entry.attempts + 1 });
          }
          let audioUrl = entry.audioUrl;
          if (entry.messageType === 'audio' && !audioUrl) {
            if (!entry.audioUri) throw new Error('missing audio uri');
            const up = await uploadAudio(entry.audioUri);
            audioUrl = up.url;
            await persistEntry({ ...entry, audioUrl, attempts: entry.attempts + 1 });
          }
          const result = (entry.replyToId
            ? await sendMessageWithReply(entry.conversationId, entry.content || '', entry.replyToId, imageUrl, entry.clientId, audioUrl, entry.audioDuration)
            : await apiSendMessage(entry.conversationId, entry.content || '', imageUrl, entry.clientId, audioUrl, entry.audioDuration)) as { message: Message };
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
    setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, pending: true, failed: false, dataPaused: false } : m)));
    flushOutbox({ allowCellularMediaId: tempId });
  };

  const enqueueLocal = (entry: OutboxEntry, optimistic: LocalMessage) => {
    stickToLatest.current = true;
    setMessages(prev => [...prev.filter(m => m.id !== entry.tempId), optimistic]);
    persistEntry(entry).then(() => flushOutbox({ allowCellularMediaId: entry.tempId }));
  };

  const fetchMessages = async (pageNum = 0, older = false, quiet = false) => {
    // Full history load (no `since` cursor): the only point worth snapshotting
    const isFullLoad = pageNum === 0 && !older && !lastMessageCursor.current;
    if (older) setLoadingOlder(true);
    try {
      const params: Record<string, string | number> = { limit: 50, offset: pageNum * 50 };
      if (!older && lastMessageCursor.current) {
        (params as Record<string, string>).since = lastMessageCursor.current.time;
        (params as Record<string, string>).sinceId = lastMessageCursor.current.id;
      }
      const res = await getMessages(conversationId, params) as { messages: Message[]; context?: any };
      const msgs = res.messages || [];
      if (res.context) {
        setConversationRole(res.context.myRole || 'buyer');
        setConversationPinned(!!res.context.isPinned);
        setConversationIsMuted(!!res.context.isMuted);
        setBlockedByMe(!!res.context.blockedByMe);
        setBlockedByOther(!!res.context.blockedByOther);
      }
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
      // Offline-first: persist last page of history so the chat opens without a network
      if (isFullLoad) {
        const uid = store.user?.id;
        if (uid) {
          void writeSnapshot(cacheKeys.messages(uid, conversationId), { messages: msgs.slice(-50) });
          void pruneMessageSnapshots(uid);
        }
      }
      if (older || !lastMessageCursor.current || pageNum === 0) setHasMore(msgs.length === 50);
    } catch {
      // Offline already explained by the global banner; only toast real online failures
      if (!quiet && !network.isOffline) toast.error(t('feedback.messagesUnavailable'), t('feedback.connectionRetry'), () => fetchMessages(pageNum, older));
    } finally {
      if (older) setLoadingOlder(false);
    }
    setLoading(false);

  };

  useEffect(() => {
    lastMessageCursor.current = null;
    // Offline-first: paint saved history instantly; fetchMessages below refreshes it.
    // The fetch full-replaces state when it succeeds, so a late snapshot can't clobber it.
    void (async () => {
      const uid = store.user?.id;
      if (!uid) return;
      try {
        const snap = await readSnapshot<{ messages: Message[] }>(cacheKeys.messages(uid, conversationId));
        const cached = snap?.value?.messages;
        if (!cached?.length) return;
        setMessages(prev => {
          if (prev.some(m => !(m.pending || m.failed))) return prev; // fresh data already arrived
          const cachedIds = new Set(cached.map(m => m.id));
          const merged = [...cached, ...prev.filter(m => !cachedIds.has(m.id))];
          return merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        });
      } catch { /* cache is best effort */ }
    })();
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
    if (reduceMotion) {
      pendingPulse.setValue(0);
    } else {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pendingPulse, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(pendingPulse, { toValue: 0, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    }
      }
      appState.current = next;
    };
    const sub = AppState.addEventListener('change', handleAppState);

    // Realtime WebSocket: instant message/typing/read delivery layered over polling
    const typingExpire = { timer: null as ReturnType<typeof setTimeout> | null };
    const unsubRealtime = onRealtime((e) => {
      if (e.type === 'message_new' && e.conversationId === conversationId && e.message) {
        const incoming = e.message as LocalMessage;
        setMessages(prev => {
          if (prev.some(m => m.id === incoming.id)) return prev;
          if (incoming.client_id) {
            const idx = prev.findIndex(m => m.client_id === incoming.client_id);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = { ...copy[idx], ...incoming, pending: false, failed: false, delivery_status: copy[idx].delivery_status || incoming.delivery_status || 'sent' };
              return copy;
            }
          }
          const kept = prev.filter(m => !((m.pending || m.failed) && m.client_id && m.client_id === incoming.client_id));
          return [...kept, incoming];
        });
        if (incoming.sender_id !== store.user?.id && Date.now() - lastMarkReadRef.current > 3000) {
          lastMarkReadRef.current = Date.now();
          markConversationRead(conversationId).catch(() => {});
        }
      } else if (e.type === 'typing' && e.conversationId === conversationId && e.userId !== store.user?.id) {
        setOtherTyping(true);
        if (typingExpire.timer) clearTimeout(typingExpire.timer);
        typingExpire.timer = setTimeout(() => setOtherTyping(false), 5500);
      } else if (e.type === 'messages_read' && e.conversationId === conversationId && e.readerId !== store.user?.id) {
        setMessages(prev => prev.map(m => (m.sender_id === store.user?.id ? { ...m, delivery_status: 'read' as const } : m)));
      } else if (e.type === 'offer_updated' && e.conversationId === conversationId) {
        lastMessageCursor.current = null;
        fetchMessages(0, false, true);
      } else if (e.type === 'block_updated' && e.blockerId && e.blockedId) {
        const myId = store.user?.id;
        const isThisPair = (e.blockerId === myId && e.blockedId === otherUserId) || (e.blockedId === myId && e.blockerId === otherUserId);
        if (isThisPair) {
          lastMessageCursor.current = null;
          fetchMessages(0, false, true);
        }
      } else if (e.type === 'message_updated' && e.conversationId === conversationId && e.message) {
        const upd = e.message as Message;
        setMessages(prev => prev.map(m => (m.id === upd.id ? { ...m, content: upd.content, is_edited: upd.is_edited } : m)));
      } else if (e.type === 'message_deleted' && e.conversationId === conversationId && e.messageId) {
        setMessages(prev => prev.map(m => (m.id === e.messageId ? { ...m, is_deleted: true, content: t('chat.messageDeleted'), image_url: undefined, audio_url: undefined } : m)));
      } else if (e.type === 'message_reactions' && e.conversationId === conversationId && e.messageId) {
        setMessages(prev => prev.map(m => (m.id === e.messageId ? { ...m, reactions: e.reactions || [] } : m)));
      }
    });

    return () => {
      stopPolling();
      pendingPulse.stopAnimation();
      sub.remove();
      unsubRealtime();
      if (typingExpire.timer) clearTimeout(typingExpire.timer);
    };
  }, [conversationId, pendingPulse, reduceMotion]);

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
          audio_url: e.audioUrl || e.audioUri,
          audio_duration: e.audioDuration,
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
    setOfferBuilderItem({ id: draftOffer.productId, name: draftOffer.productName, price: draftOffer.listPrice, stock: 99 });
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

  // ───── Voice notes (tap mic → record → tap send / cancel) ─────
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const [recording, setRecording] = useState(false);
  const recordStartRef = useRef(0);

  const startRecording = async () => {
    if (recording) return;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        toast.error(t('chat.micDenied'), t('chat.allowMic'));
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordStartRef.current = Date.now();
      setRecording(true);
    } catch {
      toast.error(t('chat.recordFailed'));
    }
  };

  const stopRecording = async (send: boolean) => {
    if (!recording) return;
    setRecording(false);
    let uri: string | null = null;
    let durationSec = Math.max(1, Math.round((Date.now() - recordStartRef.current) / 1000));
    try {
      await recorder.stop();
      uri = recorder.uri;
      if (recorderState.durationMillis > 0) durationSec = Math.max(1, Math.round(recorderState.durationMillis / 1000));
    } catch { /* recorder may already be stopped */ }
    try { await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }); } catch { /* ignore */ }
    if (!send || !uri) return;
    durationSec = Math.min(600, durationSec);
    const tempId = `local-audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const clientId = genClientId();
    const createdAt = new Date().toISOString();
    const replyingTo = replyTo;
    const optimistic: LocalMessage = {
      id: tempId, conversation_id: conversationId, sender_id: store.user?.id || '',
      content: '', message_type: 'audio', audio_url: uri, audio_duration: durationSec,
      is_read: true, created_at: createdAt, pending: true, delivery_status: 'sent', client_id: clientId,
      reply_to: replyingTo ? { id: replyingTo.id, content: replyingTo.content, senderId: replyingTo.sender_id, senderName: replyingTo.sender_id === store.user?.id ? 'You' : otherUserName, type: replyingTo.message_type } : undefined,
    } as LocalMessage;
    setReplyTo(null);
    enqueueLocal(
      { tempId, clientId, conversationId, content: null, messageType: 'audio', audioUri: uri, audioDuration: durationSec, replyToId: replyingTo?.id, attempts: 0, createdAt },
      optimistic
    );
  };

  // Stop any in-progress recording when leaving the chat
  useEffect(() => {
    return () => {
      if (recording) {
        recorder.stop().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const shareListing = async (item: { id: string; name: string }) => {
    if (offline) { toast.error(t('chat.connectToShare')); return; }
    try {
      await sendProductCard(conversationId, item.id);
      setSellerItemsVisible(false);
      lastMessageCursor.current = null;
      await fetchMessages();
    } catch (err: any) { toast.error(err?.message || t('chat.sendFailed')); }
  };

  const togglePin = async () => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const result = await pinConversation(conversationId) as { pinned: boolean };
      setConversationPinned(result.pinned);
      setProfileMenuVisible(false);
    } catch { toast.error(t('chat.actionFailed')); }
    finally { setActionBusy(false); }
  };

  const applyMute = async (durationHours: number | null, enabled = true) => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const result = await muteConversation(conversationId, durationHours, enabled) as { muted: boolean; mutedUntil: string | null };
      setConversationIsMuted(result.muted);
      setMutePickerVisible(false);
      setProfileMenuVisible(false);
    } catch { toast.error(t('chat.actionFailed')); }
    finally { setActionBusy(false); }
  };

  const toggleBlock = async () => {
    if (!otherUserId || actionBusy) return;
    setActionBusy(true);
    try {
      const result = await blockUser(otherUserId) as { blocked: boolean };
      setBlockedByMe(result.blocked);
      setConfirmBlockVisible(false);
      setProfileMenuVisible(false);
      toast.success(result.blocked ? t('chat.userBlocked') : t('chat.userUnblocked'));
    } catch { toast.error(t('chat.actionFailed')); }
    finally { setActionBusy(false); }
  };

  const submitReport = async () => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await reportConversationUser(conversationId, reportReason, reportDetails.trim() || undefined);
      setReportVisible(false);
      setProfileMenuVisible(false);
      setReportReason('');
      setReportDetails('');
      toast.success(t('chat.reportSent'));
    } catch (err: any) { toast.error(err?.message || t('chat.actionFailed')); }
    finally { setActionBusy(false); }
  };

  const closeReport = () => {
    setReportVisible(false);
    setReportReason('');
    setReportDetails('');
  };

  const viewPeerProfile = () => {
    if (!otherUserId) return;
    if (otherUserTier && otherUserTier !== 'none') {
      navigation.navigate('Storefront', { sellerId: otherUserId, preloadedSeller: { full_name: otherUserName, avatar_url: otherUserAvatar, seller_tier: otherUserTier, store_name: otherUserName } });
    } else {
      setPeerProfileVisible(true);
    }
  };

  // ───── Message Actions ─────

  const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉'];
  const [reactionPreviewIndex, setReactionPreviewIndex] = useState<number | null>(null);
  const reactionPickerMetrics = useRef({ x: 0, width: 0 });
  const reactionPickerRef = useRef<View>(null);
  const reactionPickerIndex = useRef(0);
  const selectReactionAtX = useRef((pageX: number) => {});
  const handleReactRef = useRef<(emoji: string) => void>(() => {});
  selectReactionAtX.current = (pageX: number) => {
    const { x, width } = reactionPickerMetrics.current;
    if (!width) return;
    const index = Math.max(0, Math.min(REACTION_EMOJIS.length - 1, Math.floor(((pageX - x) / width) * REACTION_EMOJIS.length)));
    reactionPickerIndex.current = index;
    setReactionPreviewIndex(index);
  };
  const reactionPickerPanResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 5 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderGrant: (_event, gesture) => selectReactionAtX.current(gesture.x0),
    onPanResponderMove: (_event, gesture) => selectReactionAtX.current(gesture.moveX),
    onPanResponderRelease: (_event, gesture) => {
      selectReactionAtX.current(gesture.moveX);
      handleReactRef.current(REACTION_EMOJIS[reactionPickerIndex.current]);
      setReactionPreviewIndex(null);
    },
    onPanResponderTerminate: () => setReactionPreviewIndex(null),
    onPanResponderTerminationRequest: () => false,
  })).current;

  const handleMessageLongPress = (msg: LocalMessage) => {
    if (msg.is_deleted || msg.pending) return;
    setReactionPreviewIndex(null);
    setActionMenuMessage(msg);
    setActionMenuVisible(true);
  };

  const handleReact = async (emoji: string) => {
    if (!actionMenuMessage) return;
    setActionMenuVisible(false);
    const msgId = actionMenuMessage.id;
    const before = messages.find(message => message.id === msgId)?.reactions || [];
    const ownReaction = before.find(reaction => reaction.userId === store.user?.id);
    // Optimistic update
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m;
      const existing = m.reactions || [];
      const newReactions = ownReaction?.emoji === emoji
        ? existing.filter(r => r.userId !== store.user?.id)
        : [...existing.filter(r => r.userId !== store.user?.id), { emoji, userId: store.user?.id || '', userName: 'You' }];
      return { ...m, reactions: newReactions };
    }));
    try {
      const { reactToMessage } = await import('../api');
      const result = await reactToMessage(msgId, emoji) as { reactions?: LocalMessage['reactions'] };
      if (result?.reactions) setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions: result.reactions } : m));
    } catch {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions: before } : m));
    }
    setActionMenuMessage(null);
  };
  handleReactRef.current = emoji => { void handleReact(emoji); };

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
      toast.success(t('chat.copied'));
    } catch {
      // fallback: do nothing silently
    }
    setActionMenuVisible(false);
  };

  const handleDelete = async () => {
    if (!actionMenuMessage) return;
    setActionMenuVisible(false);
    const msgId = actionMenuMessage.id;
    // Optimistically hide the message while the server delete completes.
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_deleted: true, content: t('chat.messageDeleted'), image_url: undefined } : m));
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
    const isAudio = item.message_type === 'audio' && item.audio_url;
    const isOffer = item.message_type === 'offer';

    if (item.message_type === 'product' && item.product_data) {
      const product = item.product_data;
      const available = product.currentlyAvailable ?? product.availableAtShare;
      const canOffer = product.sellerId === otherUserId && store.user?.id !== product.sellerId && available && !offline && !blockedByMe && !blockedByOther;
      return (
        <View style={[styles.productMsgWrap, isMe ? styles.offerMsgWrapMe : styles.offerMsgWrapThem]}>
          <View style={styles.productMsgCard}>
            <TouchableOpacity
              style={styles.productMsgMain}
              onPress={() => navigation.navigate('ProductDetail', { productId: product.productId })}
              accessibilityRole="button"
              accessibilityLabel={`${product.name}, ${formatPrice(product.price)} gourdes`}
            >
              {product.imageUrl ? <Image source={{ uri: getImageUrl(product.imageUrl) ?? product.imageUrl }} style={styles.productMsgImage} /> : (
                <View style={[styles.productMsgImage, styles.productMsgPlaceholder]}><MaterialCommunityIcons name="package-variant" size={24} color={COLORS.text2} /></View>
              )}
              <View style={styles.productMsgDetails}>
                <Text style={styles.productMsgName} numberOfLines={2}>{product.name}</Text>
                <Text style={styles.productMsgPrice}>G {formatPrice(product.price)}</Text>
                <Text style={[styles.productMsgAvailability, !available && styles.productMsgUnavailable]}>
                  {available ? `${t('chat.inStock')} · ${t('chat.stockCount', { count: String(product.currentStock ?? 0) })}` : t('chat.listingUnavailable')}
                </Text>
              </View>
            </TouchableOpacity>
            {canOffer && (
              <TouchableOpacity
                style={styles.productOfferAction}
                onPress={() => setOfferBuilderItem({ id: product.productId, name: product.name, price: product.price, image_url: product.imageUrl, stock: product.currentStock || 1 })}
                accessibilityRole="button"
              >
                <Text style={styles.productOfferActionText}>{t('chat.makeOffer')}</Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.coral} />
              </TouchableOpacity>
            )}
            <Text style={styles.offerMsgTime}>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
          </View>
        </View>
      );
    }

    if (isOffer) {
      const offerData = item.offer_data;
      if (!offerData) return null;
      const isPending = offerData.status === 'pending';
      const isAccepted = offerData.status === 'accepted';
      const isDeclined = offerData.status === 'declined';
      const isCountered = offerData.status === 'countered';
      const isExpired = offerData.status === 'expired' || offerData.status === 'redeemed' || (['pending', 'countered'].includes(offerData.status) && !!offerData.expiresAt && new Date(offerData.expiresAt) <= new Date()) || (isAccepted && !!offerData.acceptedExpiresAt && new Date(offerData.acceptedExpiresAt) <= new Date());
      const isAcceptedCurrent = isAccepted && !isExpired;
      const discountPct = offerData.listPrice && offerData.listPrice > offerData.offeredPrice
        ? Math.round(((offerData.listPrice - offerData.offeredPrice) / offerData.listPrice) * 100)
        : null;

      const handleCheckoutOffer = async () => {
        const result = await store.addAcceptedOfferToCart({
          id: offerData.productId,
          name: offerData.productName,
          price: offerData.offeredPrice,
          stock: offerData.currentStock || offerData.quantity || 1,
          quantity: offerData.quantity || 1,
          seller_id: offerData.sellerId,
        } as any, item.id);
        if (!result.added) { toast.error(t('offer.stockUnavailable')); return; }
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
              colors={isAcceptedCurrent ? ['rgba(29,158,117,0.08)', 'transparent'] : isDeclined || isExpired ? ['rgba(226,75,74,0.06)', 'transparent'] : isCountered ? ['rgba(59,130,246,0.06)', 'transparent'] : ['rgba(216,90,48,0.07)', 'transparent']}
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
                isAcceptedCurrent && styles.offerStatusBadgeAccepted,
                isDeclined && styles.offerStatusBadgeDeclined,
                isCountered && styles.offerStatusBadgeCountered,
                isExpired && styles.offerStatusBadgeDeclined,
                isPending && styles.offerStatusBadgePending,
              ]}>
                {isAcceptedCurrent ? (
                  <Text style={[styles.offerStatusText, styles.offerStatusTextAccepted]}>{offerData.isInCheckout ? t('offer.inCheckout') : t('offer.accepted')}</Text>
                ) : isDeclined ? (
                  <Text style={[styles.offerStatusText, styles.offerStatusTextDeclined]}>{t('offer.declined')}</Text>
                ) : isExpired ? (
                  <Text style={[styles.offerStatusText, styles.offerStatusTextDeclined]}>{offerData.status === 'redeemed' ? t('offer.redeemed') : t('offer.expired')}</Text>
                ) : isCountered ? (
                  <Text style={[styles.offerStatusText, styles.offerStatusTextCountered]}>{t('offer.counterCount', { count: String(offerData.counterCount || 0) })}</Text>
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
            <TouchableOpacity style={styles.offerMsgBody} onPress={() => navigation.navigate('OfferDetail', { messageId: item.id, conversationId })} accessibilityRole="button" accessibilityLabel={t('offer.openNegotiation')}>
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
                  <Text style={styles.offerMsgQuantity}>{t('offer.quantityAndTotal', { quantity: String(offerData.quantity || 1), total: formatPrice(offerData.offeredPrice * (offerData.quantity || 1)) })}</Text>
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.offerMsgView} onPress={() => navigation.navigate('OfferDetail', { messageId: item.id, conversationId })} accessibilityRole="button">
              <Text style={styles.offerMsgViewText}>{isPending ? t('offer.openNegotiation') : t('offer.viewHistory')}</Text>
              <MaterialCommunityIcons name="chevron-right" size={16} color={COLORS.text2} />
            </TouchableOpacity>

            {/* Instant Checkout Button for Buyer when Accepted */}
            {isAcceptedCurrent && !offerData.isInCheckout && offerData.buyerId === store.user?.id && offerData.productAvailable && (offerData.currentStock || 0) >= (offerData.quantity || 1) && offerData.acceptedExpiresAt && new Date(offerData.acceptedExpiresAt) > new Date() && (
              <TouchableOpacity
                style={styles.offerCheckoutBtn}
                onPress={handleCheckoutOffer}
                accessibilityLabel={t('checkout.confirmPay')}
                accessibilityRole="button"
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="lightning-bolt" size={16} color={COLORS.white} />
                <Text style={styles.offerCheckoutBtnText}>
                  {t('offer.checkoutNow', { total: formatPrice(offerData.offeredPrice * (offerData.quantity || 1)) })}
                </Text>
                <MaterialCommunityIcons name="arrow-right" size={16} color={COLORS.white} />
              </TouchableOpacity>
            )}

            <Text style={styles.offerMsgTime}>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
          </View>
        </View>
      );
    }

    const reactionGroups = [...new Set((item.reactions || []).map(reaction => reaction.emoji))].map(emoji => ({
      emoji,
      count: item.reactions!.filter(reaction => reaction.emoji === emoji).length,
      mine: item.reactions!.some(reaction => reaction.emoji === emoji && reaction.userId === store.user?.id),
    }));

    return (
      <SwipeReplyRow onReply={() => setReplyTo(item)}>
      <View style={[styles.messageLine, isMe ? styles.messageLineMe : styles.messageLineThem, reactionGroups.length > 0 && styles.messageLineWithReactions]}>
      <View style={styles.messageBubbleWrap}>
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
              <Text style={styles.replyText} numberOfLines={2}>{item.reply_to.content || (item.reply_to.type === 'image' ? '📷 Photo' : item.reply_to.type === 'audio' ? '🎤 Voice message' : 'Message')}</Text>
            </View>
          </View>
        )}
        {isImage ? (() => {
          const imageUri = item.localImageUri || getImageUrl(item.image_url!) || item.image_url!;
          const needsTap = lowDataMode && !item.localImageUri && !loadedChatImageIds.has(item.id);
          return (
            <TouchableOpacity
              onPress={() => {
                if (needsTap) {
                  setLoadedChatImageIds(current => new Set(current).add(item.id));
                  return;
                }
                setPreview({ uri: imageUri, sender: isMe ? (store.user?.full_name || 'You') : (otherUserName || 'Message'), time: new Date(item.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) });
              }}
              accessibilityRole="imagebutton"
              accessibilityLabel={needsTap ? t('chat.tapToLoadPhoto') : t('chat.openPhoto')}
            >
              {needsTap ? (
                <View style={[styles.chatImage, styles.chatImagePlaceholder]}>
                  <MaterialCommunityIcons name="cloud-download-outline" size={30} color={COLORS.text2} />
                  <Text style={styles.chatImagePlaceholderText}>{t('chat.tapToLoadPhoto')}</Text>
                </View>
              ) : (
                <View>
                  <Image source={{ uri: imageUri }} style={styles.chatImage} resizeMode="cover" />
                  {item.pending && <View style={styles.imageOverlay}><ActivityIndicator size="small" color={COLORS.white} /></View>}
                </View>
              )}
            </TouchableOpacity>
          );
        })() : null}
        {isAudio ? <VoiceNotePlayer uri={item.audio_url!} isMe={isMe} duration={item.audio_duration || 0} deferUntilPlay={lowDataMode && !item.pending} /> : null}
        {item.content ? (
          <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>
            <LinkifiedText content={item.content} isMe={isMe} />
          </Text>
        ) : null}
        {!isImage && !isOffer && !isAudio && item.content && !item.is_deleted && findFirstUrl(item.content) ? (
          <LinkPreview url={findFirstUrl(item.content)!} isMe={isMe} showImage={!lowDataMode} />
        ) : null}
        {item.is_edited && !isImage && <Text style={styles.editedLabel}>edited</Text>}
        <View style={styles.bubbleFooter}>
          <Text style={[styles.bubbleTime, isImage && styles.bubbleTimeImage]}>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
          {item.is_edited && isImage && <Text style={styles.editedLabel}>edited</Text>}
          {/* Delivery indicator for own messages (WhatsApp ticks) */}
          {isMe && item.pending && (
            <MaterialCommunityIcons name="clock-outline" size={11} color="rgba(255,255,255,0.55)" accessibilityLabel={t('chat.sending')} />
          )}
          {isMe && item.dataPaused && (
            <TouchableOpacity onPress={() => retryMessage(item.id)} accessibilityRole="button" accessibilityLabel={t('chat.waitingForWifiTapToSend')}>
              <Text style={styles.messageFailed}>{t('chat.waitingForWifiTapToSend')}</Text>
            </TouchableOpacity>
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
      </Pressable>
      {reactionGroups.length > 0 && (
        <View pointerEvents="none" style={[styles.reactionsOverlay, isMe ? styles.reactionsOverlayMe : styles.reactionsOverlayThem]}>
          {reactionGroups.map(group => (
            <View key={group.emoji} style={[styles.reactionBadge, group.mine && styles.reactionBadgeMine]}>
              <Text style={styles.reactionEmoji}>{group.emoji}</Text>
              {group.count > 1 && <Text style={styles.reactionCount}>{group.count}</Text>}
            </View>
          ))}
        </View>
      )}
      </View>
      </View>
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
        colors={['#0B1016', '#090D12', '#080B10']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.container}
      >
        <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]} onLayout={e => setHeaderHeight(e.nativeEvent.layout.height)}>
          <BackButton onPress={() => navigation.goBack()} />
          <TouchableOpacity
            style={styles.headerProfile}
            onPress={viewPeerProfile}
            activeOpacity={0.7}
          accessibilityLabel={t('chat.viewProfile')}
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
          <TouchableOpacity style={styles.headerMore} onPress={openMedia} accessibilityLabel={t('chat.sharedMedia')} accessibilityRole="button">
            <MaterialCommunityIcons name="image-multiple-outline" size={18} color={COLORS.text2} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerMore} onPress={() => setProfileMenuVisible(true)} accessibilityLabel={t('chat.moreOptions')} accessibilityRole="button">
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
              <Text style={styles.replyBarSender} numberOfLines={1}>{t('chat.replyingTo', { name: replyTo.sender_id === store.user?.id ? t('chat.yourself') : otherUserName })}</Text>
              <Text style={styles.replyBarText} numberOfLines={1}>{replyTo.content || (replyTo.message_type === 'image' ? '📷 Photo' : replyTo.message_type === 'audio' ? '🎤 Voice message' : 'Message')}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} style={styles.replyBarClose} accessibilityLabel={t('chat.cancelReply')} accessibilityRole="button">
              <Icon name="close" size={16} color={COLORS.text2} />
            </TouchableOpacity>
          </View>
        )}

        {(blockedByMe || blockedByOther) && (
          <View style={styles.blockedBanner}>
            <Text style={styles.blockedBannerText}>{t('chat.blockedNotice')}</Text>
            {blockedByMe && <TouchableOpacity onPress={toggleBlock} disabled={actionBusy}><Text style={styles.unblockText}>{t('chat.unblock')}</Text></TouchableOpacity>}
          </View>
        )}
        <View style={[styles.inputArea, { paddingBottom: Math.max(insets.bottom, SPACING.md), opacity: blockedByMe || blockedByOther ? 0.55 : 1 }]}>
          {recording ? (
            <View style={styles.recordingRow}>
              <TouchableOpacity onPress={() => stopRecording(false)} style={styles.recordingCancel} accessibilityLabel={t('common.cancel')} accessibilityRole="button">
                <MaterialCommunityIcons name="close-circle" size={28} color={COLORS.text2} />
              </TouchableOpacity>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingTime}>{fmtMs(recorderState.durationMillis)}</Text>
              <Text style={styles.recordingHint}>{t('chat.recording')}</Text>
              <TouchableOpacity onPress={() => stopRecording(true)} style={styles.recordingSend} accessibilityLabel={t('chat.sendVoiceMessage')} accessibilityRole="button">
                <MaterialCommunityIcons name="send" size={20} color={COLORS.white} />
              </TouchableOpacity>
            </View>
          ) : (
          <View style={styles.inputRow}>
            <TouchableOpacity style={styles.cameraBtn} onPress={() => setAttachmentMenuVisible(true)} disabled={sending || blockedByMe || blockedByOther} accessibilityLabel={t('chat.addAttachment')} accessibilityRole="button">
              <MaterialCommunityIcons name="plus" size={24} color={COLORS.text2} />
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
              editable={!blockedByMe && !blockedByOther}
              accessibilityLabel={t('chat.messageInput')}
            />
            {text.trim() ? (
              <TouchableOpacity style={{ opacity: sending || blockedByMe || blockedByOther ? 0.4 : 1 }} onPress={handleSend} disabled={sending || blockedByMe || blockedByOther} accessibilityLabel={t('chat.sendMessage')} accessibilityRole="button">
                <LinearGradient
                  colors={['#FF6B81', '#FF4D6A', '#E8365A']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.sendBtn}
                >
                <MaterialCommunityIcons name="arrow-up" size={20} color={COLORS.white} />
                </LinearGradient>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={startRecording} disabled={blockedByMe || blockedByOther} accessibilityLabel={t('chat.recordVoiceMessage')} accessibilityRole="button">
                <LinearGradient
                  colors={['#FF6B81', '#FF4D6A', '#E8365A']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.sendBtn}
                >
                <MaterialCommunityIcons name="microphone" size={20} color={COLORS.white} />
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
          )}
        </View>

        {/* Shared media gallery (images + links) */}
        <Modal visible={mediaVisible} animationType="slide" onRequestClose={() => setMediaVisible(false)}>
          <View style={styles.mediaRoot}>
            <View style={[styles.mediaHeader, { paddingTop: insets.top + SPACING.xs }]}>
              <TouchableOpacity onPress={() => setMediaVisible(false)} style={styles.mediaHeaderBtn} accessibilityLabel={t('common.close')} accessibilityRole="button">
                <MaterialCommunityIcons name="arrow-left" size={22} color={COLORS.text} />
              </TouchableOpacity>
              <Text style={styles.mediaTitle}>{t('chat.sharedMedia')}</Text>
              <View style={styles.mediaHeaderBtn} />
            </View>
            <View style={styles.mediaTabs}>
              <Pressable style={[styles.mediaTabBtn, mediaTab === 'images' && styles.mediaTabBtnActive]} onPress={() => setMediaTab('images')} accessibilityRole="tab" accessibilityState={{ selected: mediaTab === 'images' }}>
                <Text style={[styles.mediaTabText, mediaTab === 'images' && styles.mediaTabTextActive]}>{t('chat.mediaImages')}</Text>
              </Pressable>
              <Pressable style={[styles.mediaTabBtn, mediaTab === 'links' && styles.mediaTabBtnActive]} onPress={() => setMediaTab('links')} accessibilityRole="tab" accessibilityState={{ selected: mediaTab === 'links' }}>
                <Text style={[styles.mediaTabText, mediaTab === 'links' && styles.mediaTabTextActive]}>{t('chat.mediaLinks')}</Text>
              </Pressable>
            </View>
            {mediaTab === 'images' ? (
              mediaLoading ? (
                <View style={styles.mediaEmpty}><ActivityIndicator size="large" color={COLORS.coral} /></View>
              ) : mediaList.length === 0 ? (
                <View style={styles.mediaEmpty}>
                  <MaterialCommunityIcons name="image-outline" size={44} color={COLORS.text2} />
                  <Text style={styles.mediaEmptyText}>{t('chat.noSharedImages')}</Text>
                </View>
              ) : (
                <FlatList
                  data={mediaList}
                  keyExtractor={item => item.id}
                  numColumns={3}
                  columnWrapperStyle={{ justifyContent: 'space-between' }}
                  contentContainerStyle={styles.mediaGrid}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.mediaCell}
                      onPress={() => {
                        if (lowDataMode && !loadedMediaImageIds.has(item.id)) {
                          setLoadedMediaImageIds(current => new Set(current).add(item.id));
                          return;
                        }
                        setMediaVisible(false);
                        setPreview({
                          uri: getImageUrl(item.image_url) || item.image_url,
                          sender: item.sender_id === store.user?.id ? (store.user?.full_name || 'You') : otherUserName || 'Message',
                          time: new Date(item.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
                        });
                      }}
                      accessibilityRole="imagebutton"
                      accessibilityLabel={lowDataMode && !loadedMediaImageIds.has(item.id) ? t('chat.tapToLoadPhoto') : t('chat.openPhoto')}
                    >
                      {lowDataMode && !loadedMediaImageIds.has(item.id) ? (
                        <View style={styles.mediaCellPlaceholder}>
                          <MaterialCommunityIcons name="cloud-download-outline" size={24} color={COLORS.text2} />
                        </View>
                      ) : <Image source={{ uri: getImageUrl(item.image_url) || item.image_url }} style={styles.mediaCellImg} resizeMode="cover" />}
                    </TouchableOpacity>
                  )}
                />
              )
            ) : linkMessages.length === 0 ? (
              <View style={styles.mediaEmpty}>
                <MaterialCommunityIcons name="link-variant" size={44} color={COLORS.text2} />
                <Text style={styles.mediaEmptyText}>{t('chat.noSharedLinks')}</Text>
              </View>
            ) : (
              <FlatList
                data={linkMessages}
                keyExtractor={item => item.url}
                contentContainerStyle={styles.mediaLinks}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.mediaLinkRow} onPress={() => Linking.openURL(item.url).catch(() => {})} accessibilityRole="link" accessibilityLabel={item.url}>
                    <MaterialCommunityIcons name="link-variant" size={16} color={COLORS.coral} style={{ marginRight: 10 }} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.mediaLinkUrl} numberOfLines={1}>{item.url}</Text>
                      <Text style={styles.mediaLinkMeta} numberOfLines={1}>{item.sender} · {item.time}</Text>
                    </View>
                    <MaterialCommunityIcons name="open-in-new" size={14} color={COLORS.text2} />
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </Modal>

        <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
          <View style={styles.viewerRoot}>
            {preview && viewerChrome && (
              <View style={[styles.viewerHeader, { paddingTop: insets.top + SPACING.xs }]}>
                <TouchableOpacity onPress={() => setPreview(null)} style={styles.viewerHeaderBtn} accessibilityLabel={t('chat.closePhoto')} accessibilityRole="button">
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
          sellerId={conversationRole === 'seller' ? (store.user?.id || '') : (otherUserId || '')}
          sellerName={conversationRole === 'seller' ? (store.user?.full_name || t('common.seller')) : (otherUserName || t('common.seller'))}
          onClose={() => setSellerItemsVisible(false)}
          onSelectItem={(item) => { void shareListing(item); }}
        />

        <Modal visible={attachmentMenuVisible} transparent animationType="fade" onRequestClose={() => setAttachmentMenuVisible(false)}>
          <Pressable style={styles.modalShade} onPress={() => setAttachmentMenuVisible(false)}>
            <Pressable style={styles.chatSheet} onPress={e => e.stopPropagation()}>
              <Text style={styles.chatSheetTitle}>{t('chat.addAttachment')}</Text>
              <TouchableOpacity style={styles.menuRow} onPress={() => { setAttachmentMenuVisible(false); handleSendImage(); }} accessibilityRole="button">
                <MaterialCommunityIcons name="image-outline" size={21} color={COLORS.coral} /><Text style={styles.menuRowText}>{t('chat.photo')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuRow} onPress={() => { setAttachmentMenuVisible(false); if (!offline) setSellerItemsVisible(true); else toast.error(t('chat.connectToShare')); }} accessibilityRole="button">
                <MaterialCommunityIcons name="tag-outline" size={21} color={COLORS.coral} /><Text style={styles.menuRowText}>{t('chat.shareListing')}</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={profileMenuVisible} transparent animationType="fade" onRequestClose={() => setProfileMenuVisible(false)}>
          <Pressable style={styles.modalShade} onPress={() => setProfileMenuVisible(false)}>
            <Pressable style={styles.chatSheet} onPress={e => e.stopPropagation()}>
              <Text style={styles.chatSheetTitle}>{otherUserName}</Text>
              <TouchableOpacity style={styles.menuRow} onPress={togglePin} disabled={actionBusy} accessibilityRole="button">
                <MaterialCommunityIcons name={conversationPinned ? 'pin-off-outline' : 'pin-outline'} size={20} color={COLORS.text2} /><Text style={styles.menuRowText}>{conversationPinned ? t('chat.unpinChat') : t('chat.pinChat')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuRow} onPress={() => { setProfileMenuVisible(false); setMutePickerVisible(true); }} accessibilityRole="button">
                <MaterialCommunityIcons name={conversationIsMuted ? 'bell-outline' : 'bell-off-outline'} size={20} color={COLORS.text2} /><Text style={styles.menuRowText}>{conversationIsMuted ? t('chat.changeMute') : t('chat.muteChat')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuRow} onPress={() => { setProfileMenuVisible(false); viewPeerProfile(); }} accessibilityRole="button">
                <MaterialCommunityIcons name="account-outline" size={20} color={COLORS.text2} /><Text style={styles.menuRowText}>{t('chat.viewProfile')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuRow} onPress={() => { setProfileMenuVisible(false); setReportReason(''); setReportDetails(''); setReportVisible(true); }} accessibilityRole="button">
                <MaterialCommunityIcons name="flag-outline" size={20} color={COLORS.text2} /><Text style={styles.menuRowText}>{t('chat.reportUser')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuRow} onPress={() => { setProfileMenuVisible(false); setPrivacyInfoVisible(true); }} accessibilityRole="button">
                <MaterialCommunityIcons name="lock-outline" size={20} color={COLORS.text2} /><Text style={styles.menuRowText}>{t('chat.privacyInfo')}</Text>
              </TouchableOpacity>
              {!blockedByOther && <TouchableOpacity style={styles.menuRow} onPress={() => { setProfileMenuVisible(false); setConfirmBlockVisible(true); }} accessibilityRole="button">
                <MaterialCommunityIcons name="block-helper" size={20} color={COLORS.coral} /><Text style={[styles.menuRowText, { color: COLORS.coral }]}>{blockedByMe ? t('chat.unblockUser') : t('chat.blockUser')}</Text>
              </TouchableOpacity>}
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={mutePickerVisible} transparent animationType="fade" onRequestClose={() => setMutePickerVisible(false)}>
          <Pressable style={styles.modalShade} onPress={() => setMutePickerVisible(false)}>
            <Pressable style={styles.chatSheet} onPress={e => e.stopPropagation()}>
              <Text style={styles.chatSheetTitle}>{t('chat.muteChat')}</Text>
              {[{ label: t('chat.muteEightHours'), hours: 8 }, { label: t('chat.muteOneWeek'), hours: 168 }, { label: t('chat.muteIndefinitely'), hours: null as number | null }].map(option => (
                <TouchableOpacity key={option.label} style={styles.menuRow} onPress={() => applyMute(option.hours)} accessibilityRole="button">
                  <MaterialCommunityIcons name="bell-off-outline" size={20} color={COLORS.text2} /><Text style={styles.menuRowText}>{option.label}</Text>
                </TouchableOpacity>
              ))}
              <View style={styles.customMuteRow}>
                <TextInput style={styles.customMuteInput} value={muteCustomHours} onChangeText={setMuteCustomHours} keyboardType="number-pad" placeholder={t('chat.customHours')} placeholderTextColor={COLORS.text2} accessibilityLabel={t('chat.customHours')} />
                <TouchableOpacity style={styles.smallAction} onPress={() => applyMute(Number(muteCustomHours))} accessibilityRole="button"><Text style={styles.smallActionText}>{t('chat.apply')}</Text></TouchableOpacity>
              </View>
              {conversationIsMuted && <TouchableOpacity style={styles.menuRow} onPress={() => applyMute(null, false)} accessibilityRole="button"><MaterialCommunityIcons name="bell-outline" size={20} color={COLORS.text2} /><Text style={styles.menuRowText}>{t('chat.unmute')}</Text></TouchableOpacity>}
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={confirmBlockVisible} transparent animationType="fade" onRequestClose={() => setConfirmBlockVisible(false)}>
          <Pressable style={styles.modalShade} onPress={() => setConfirmBlockVisible(false)}>
            <Pressable style={styles.chatSheet} onPress={e => e.stopPropagation()}>
              <Text style={styles.chatSheetTitle}>{blockedByMe ? t('chat.unblockUser') : t('chat.blockUser')}</Text>
              <Text style={styles.sheetHint}>{blockedByMe ? t('chat.unblockConfirm') : t('chat.blockConfirm')}</Text>
              <View style={styles.sheetActions}>
                <TouchableOpacity style={styles.secondaryAction} onPress={() => setConfirmBlockVisible(false)}><Text style={styles.secondaryActionText}>{t('common.cancel')}</Text></TouchableOpacity>
                <TouchableOpacity style={styles.dangerAction} onPress={toggleBlock} disabled={actionBusy}><Text style={styles.dangerActionText}>{t('common.confirm')}</Text></TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={reportVisible} transparent animationType="fade" onRequestClose={closeReport}>
          <Pressable style={styles.modalShade} onPress={closeReport}>
            <Pressable style={styles.chatSheet} onPress={e => e.stopPropagation()}>
              <Text style={styles.chatSheetTitle}>{t('chat.reportUser')}</Text>
              {(['harassment', 'scam', 'inappropriate', 'spam', 'other'] as const).map(reason => (
                <TouchableOpacity key={reason} style={styles.reasonRow} onPress={() => setReportReason(reason)} accessibilityRole="radio" accessibilityState={{ selected: reportReason === reason }}>
                  <MaterialCommunityIcons name={reportReason === reason ? 'radiobox-marked' : 'radiobox-blank'} size={20} color={reportReason === reason ? COLORS.coral : COLORS.text2} /><Text style={styles.menuRowText}>{t(`chat.reportReason.${reason}`)}</Text>
                </TouchableOpacity>
              ))}
              <TextInput style={styles.reportInput} value={reportDetails} onChangeText={setReportDetails} multiline maxLength={1500} placeholder={t('chat.reportDetails')} placeholderTextColor={COLORS.text2} accessibilityLabel={t('chat.reportDetails')} />
              <TouchableOpacity style={[styles.primaryAction, (!reportReason || actionBusy) && { opacity: 0.45 }]} onPress={submitReport} disabled={!reportReason || actionBusy}><Text style={styles.primaryActionText}>{t('chat.submitReport')}</Text></TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={privacyInfoVisible} transparent animationType="fade" onRequestClose={() => setPrivacyInfoVisible(false)}>
          <Pressable style={styles.modalShade} onPress={() => setPrivacyInfoVisible(false)}>
            <Pressable style={styles.chatSheet} onPress={e => e.stopPropagation()}>
              <Text style={styles.chatSheetTitle}>{t('chat.privacyInfo')}</Text>
              <Text style={styles.sheetHint}>{t('chat.privacyNotice')}</Text>
              <TouchableOpacity style={styles.primaryAction} onPress={() => setPrivacyInfoVisible(false)} accessibilityRole="button"><Text style={styles.primaryActionText}>{t('common.confirm')}</Text></TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={peerProfileVisible} transparent animationType="fade" onRequestClose={() => setPeerProfileVisible(false)}>
          <Pressable style={styles.modalShade} onPress={() => setPeerProfileVisible(false)}>
            <Pressable style={styles.chatSheet} onPress={e => e.stopPropagation()}>
              <View style={styles.peerProfileHeader}><UserAvatar seller={{ avatar_url: otherUserAvatar, full_name: otherUserName, seller_tier: 'none' } as any} size={66} animated={false} /><View style={{ flex: 1 }}><Text style={styles.peerProfileName}>{otherUserName || t('common.seller')}</Text><Text style={styles.peerProfileType}>{t('chat.marketplaceMember')}</Text></View></View>
              <TouchableOpacity style={styles.primaryAction} onPress={() => setPeerProfileVisible(false)} accessibilityRole="button"><Text style={styles.primaryActionText}>{t('common.confirm')}</Text></TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

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
      <View
                ref={reactionPickerRef}
                style={styles.reactionPicker}
                {...reactionPickerPanResponder.panHandlers}
                onLayout={event => {
                  reactionPickerMetrics.current.width = event.nativeEvent.layout.width;
                  reactionPickerRef.current?.measureInWindow((x: number) => { reactionPickerMetrics.current.x = x; });
                }}
              >
                {REACTION_EMOJIS.map(emoji => (
                  <TouchableOpacity
                    key={emoji}
                    style={[styles.reactionBtn, reactionPreviewIndex === REACTION_EMOJIS.indexOf(emoji) && styles.reactionBtnActive]}
                    onPress={() => handleReact(emoji)}
                    accessibilityLabel={`react with ${emoji}`}
                    accessibilityRole="button"
                  >
                    <Text style={styles.reactionBtnText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.actionMenuDivider} />
              {/* Action buttons */}
              <TouchableOpacity style={styles.actionMenuItem} onPress={handleReply} accessibilityRole="button">
                <MaterialCommunityIcons name="reply" size={18} color={COLORS.text} />
                <Text style={styles.actionMenuText}>{t('chat.reply')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionMenuItem} onPress={handleCopy} accessibilityRole="button">
                <MaterialCommunityIcons name="content-copy" size={18} color={COLORS.text} />
                <Text style={styles.actionMenuText}>{t('chat.copy')}</Text>
              </TouchableOpacity>
              {actionMenuMessage?.sender_id === store.user?.id && actionMenuMessage?.message_type === 'text' && (
                <TouchableOpacity style={styles.actionMenuItem} onPress={handleEdit} accessibilityRole="button">
                  <MaterialCommunityIcons name="pencil" size={18} color={COLORS.text} />
                  <Text style={styles.actionMenuText}>{t('chat.edit')}</Text>
                </TouchableOpacity>
              )}
              {actionMenuMessage?.sender_id === store.user?.id && (
                <TouchableOpacity style={[styles.actionMenuItem, { borderBottomWidth: 0 }]} onPress={handleDelete} accessibilityRole="button">
                  <MaterialCommunityIcons name="delete-outline" size={18} color="#FF4D6A" />
                  <Text style={[styles.actionMenuText, { color: '#FF4D6A' }]}>{t('chat.delete')}</Text>
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
    borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.bg,
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
  blockedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: 10, backgroundColor: COLORS.surface2, borderTopWidth: 1, borderColor: COLORS.border },
  blockedBannerText: { flex: 1, color: COLORS.text2, fontSize: 12 },
  unblockText: { color: COLORS.coral, fontWeight: '700', marginLeft: 12 },
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
  messageLine: { width: '100%', overflow: 'visible' },
  messageLineMe: { alignItems: 'flex-end' },
  messageLineThem: { alignItems: 'flex-start' },
  messageLineWithReactions: { paddingBottom: 9 },
  messageBubbleWrap: { position: 'relative', maxWidth: '88%', overflow: 'visible' },
  bubble: {
    maxWidth: '100%', paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 20, marginBottom: 4,
  },
  bubbleMe: {
    alignSelf: 'flex-end', backgroundColor: COLORS.coral,
    borderTopRightRadius: 4,
  },
  bubbleThem: {
    alignSelf: 'flex-start', backgroundColor: '#1B2632',
    borderTopLeftRadius: 4, borderWidth: 1, borderColor: '#34414E',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 1,
  },
  tailMe: {
    position: 'absolute', top: -4, right: -5, width: 11, height: 11,
    backgroundColor: COLORS.coral, transform: [{ rotate: '45deg' }],
  },
  tailThem: {
    position: 'absolute', top: -4, left: -5, width: 11, height: 11,
    backgroundColor: '#1B2632', transform: [{ rotate: '45deg' }],
  },
  swipeReplyAction: {
    width: 44, justifyContent: 'center', alignItems: 'center',
  },
  bubbleImage: { padding: 3, backgroundColor: 'transparent', borderWidth: 0 },
  bubbleText: { fontSize: 15, color: COLORS.text, lineHeight: 21 },
  bubbleTextMe: { color: COLORS.white },
  bubbleTime: { fontSize: 10, color: 'rgba(255,255,255,0.65)', marginTop: 4, alignSelf: 'flex-end' },
  chatImage: { width: 240, height: 240, borderRadius: RADIUS.media },
  chatImagePlaceholder: { backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  chatImagePlaceholderText: { color: COLORS.text2, fontSize: 12, textAlign: 'center' },
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

  /* Reactions float over the bubble edge and never affect bubble width. */
  reactionsOverlay: { position: 'absolute', bottom: -8, flexDirection: 'row', gap: 3, zIndex: 2, elevation: 3 },
  reactionsOverlayMe: { right: 8 },
  reactionsOverlayThem: { left: 8 },
  reactionBadge: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 6, borderRadius: RADIUS.pill, backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2 },
  reactionBadgeMine: { borderColor: COLORS.coral + 'AA', backgroundColor: COLORS.coral + '22' },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { color: COLORS.text, fontSize: 10, fontWeight: '700' },

  /* Reply-to bar */
  replyBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  replyBarAccent: { width: 3, borderRadius: 2, backgroundColor: COLORS.coral, marginRight: 8, alignSelf: 'stretch' },
  replyBarContent: { flex: 1 },
  replyBarSender: { fontSize: 11, fontWeight: '700', color: COLORS.coral },
  replyBarText: { fontSize: 11, color: COLORS.text2, marginTop: 1 },
  replyBarClose: { padding: 6 },

  /* Action menu (long-press) */
  actionMenuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  actionMenu: { width: '92%', maxWidth: 360, backgroundColor: COLORS.surface, borderRadius: RADIUS.card, padding: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 8 },
  reactionPicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7, paddingHorizontal: 2 },
  reactionBtn: { flex: 1, minWidth: 30, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21 },
  reactionBtnActive: { backgroundColor: COLORS.coral + '25', transform: [{ scale: 1.18 }] },
  reactionBtnText: { fontSize: 22 },
  actionMenuDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 4 },
  actionMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  actionMenuText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  modalShade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.58)', justifyContent: 'flex-end' },
  chatSheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.media, borderTopRightRadius: RADIUS.media, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.xl, borderWidth: 1, borderColor: COLORS.border, gap: 3 },
  chatSheetTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800', marginBottom: SPACING.sm },
  menuRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  menuRowText: { flex: 1, color: COLORS.text, fontSize: 14, fontWeight: '600' },
  customMuteRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: SPACING.sm },
  customMuteInput: { flex: 1, minHeight: 44, backgroundColor: COLORS.surface2, borderRadius: RADIUS.row, paddingHorizontal: 12, color: COLORS.text },
  smallAction: { backgroundColor: COLORS.coral, borderRadius: RADIUS.pill, paddingHorizontal: 16, paddingVertical: 11 },
  smallActionText: { color: COLORS.white, fontWeight: '700' },
  sheetHint: { fontSize: 13, color: COLORS.text2, lineHeight: 19, marginBottom: SPACING.md },
  sheetActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  secondaryAction: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: RADIUS.pill, backgroundColor: COLORS.surface2 },
  secondaryActionText: { color: COLORS.text, fontWeight: '700' },
  dangerAction: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: RADIUS.pill, backgroundColor: COLORS.coral },
  dangerActionText: { color: COLORS.white, fontWeight: '800' },
  reasonRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 10 },
  reportInput: { minHeight: 86, maxHeight: 130, backgroundColor: COLORS.surface2, color: COLORS.text, borderRadius: RADIUS.row, padding: 12, textAlignVertical: 'top', marginTop: SPACING.sm },
  primaryAction: { alignItems: 'center', backgroundColor: COLORS.coral, borderRadius: RADIUS.pill, paddingVertical: 13, marginTop: SPACING.md },
  primaryActionText: { color: COLORS.white, fontWeight: '800' },
  peerProfileHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: SPACING.sm, marginBottom: SPACING.sm },
  peerProfileName: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  peerProfileType: { color: COLORS.text2, fontSize: 12, marginTop: 3 },

  /* Rich Offer Message Card */
  offerMsgWrap: { maxWidth: '95%', width: '95%', marginBottom: 8 },
  productMsgWrap: { maxWidth: '85%', width: '85%', marginBottom: 8 },
  productMsgCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.media, padding: 10 },
  productMsgMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  productMsgImage: { width: 72, height: 72, borderRadius: RADIUS.row, backgroundColor: COLORS.surface2 },
  productMsgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  productMsgDetails: { flex: 1, minWidth: 0 },
  productMsgName: { fontSize: 13, lineHeight: 18, color: COLORS.text, fontWeight: '700' },
  productMsgPrice: { fontSize: 15, color: COLORS.coral, fontWeight: '800', marginTop: 4 },
  productMsgAvailability: { fontSize: 11, color: COLORS.green || '#1D9E75', marginTop: 3 },
  productMsgUnavailable: { color: COLORS.text2 },
  productOfferAction: { minHeight: 42, borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 8, paddingHorizontal: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  productOfferActionText: { fontSize: 13, fontWeight: '700', color: COLORS.coral },
  offerMsgWrapMe: { alignSelf: 'flex-end' },
  offerMsgWrapThem: { alignSelf: 'flex-start' },
  offerMsgCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
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
  offerMsgQuantity: { fontSize: 12, color: COLORS.text2, marginTop: 5 },
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
    minHeight: 42, marginTop: 6, paddingVertical: 8, paddingHorizontal: 10,
    borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'space-between', flexDirection: 'row',
    backgroundColor: COLORS.surface2,
  },
  offerMsgViewText: {
    fontSize: 12,
    color: COLORS.text,
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
    borderColor: COLORS.border,
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
    borderTopWidth: 1, borderTopColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', padding: SPACING.sm,
    paddingHorizontal: SPACING.md,
    gap: 8,
  },
  input: {
    flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
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

  /* Voice note bubble */
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 180, paddingVertical: 2 },
  voicePlay: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.coral, alignItems: 'center', justifyContent: 'center' },
  voicePlayMe: { backgroundColor: COLORS.white },
  voiceBars: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 16 },
  voiceTime: { fontSize: 11, color: COLORS.text2, minWidth: 30, textAlign: 'right' },
  voiceTimeMe: { color: 'rgba(255,255,255,0.85)' },

  /* Recording bar */
  recordingRow: { flexDirection: 'row', alignItems: 'center', padding: SPACING.sm, paddingHorizontal: SPACING.md, gap: 10 },
  recordingCancel: { padding: 2 },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF3B30' },
  recordingTime: { fontSize: 15, fontWeight: '700', color: COLORS.text, fontVariant: ['tabular-nums'] },
  recordingHint: { flex: 1, fontSize: 12, color: COLORS.text2, fontStyle: 'italic' },
  recordingSend: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.coral, alignItems: 'center', justifyContent: 'center' },

  /* Link previews */
  linkCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, padding: 8,
    borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.25)',
    borderLeftWidth: 3, borderLeftColor: COLORS.coral,
  },
  linkCardMe: { backgroundColor: 'rgba(255,255,255,0.12)' },
  linkThumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: COLORS.surface2 },
  linkThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  linkTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  linkDesc: { fontSize: 12, color: COLORS.text2, marginTop: 2, lineHeight: 16 },
  linkHost: { fontSize: 11, color: COLORS.text3, marginTop: 2, textTransform: 'uppercase' },
  bubbleLink: { color: '#79B8FF', textDecorationLine: 'underline' },
  bubbleLinkMe: { color: '#FFE3EA', textDecorationLine: 'underline' },

  /* Shared media gallery */
  mediaRoot: { flex: 1, backgroundColor: COLORS.bg },
  mediaHeader: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.sm,
    paddingBottom: SPACING.sm, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  mediaHeaderBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  mediaTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: COLORS.text },
  mediaTabs: { flexDirection: 'row', backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  mediaTabBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  mediaTabBtnActive: { borderBottomColor: COLORS.coral },
  mediaTabText: { fontSize: 13, fontWeight: '600', color: COLORS.text2 },
  mediaTabTextActive: { color: COLORS.coral },
  mediaGrid: { padding: 6 },
  mediaCell: { width: '31.5%', aspectRatio: 1, marginBottom: 6, borderRadius: 8, overflow: 'hidden', backgroundColor: COLORS.surface },
  mediaCellImg: { width: '100%', height: '100%' },
  mediaCellPlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface },
  mediaEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  mediaEmptyText: { fontSize: 14, color: COLORS.text2, textAlign: 'center' },
  mediaLinks: { padding: SPACING.md, gap: 8 },
  mediaLinkRow: {
    flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  mediaLinkUrl: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  mediaLinkMeta: { fontSize: 11, color: COLORS.text2, marginTop: 2 },
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
