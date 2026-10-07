import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
  Modal,
  TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS, formatPrice } from '../theme';
import { useTranslation } from '@/localization';
import { reviewCategoryKey } from '../utils/listingReview';
import {
  getImageUrl,
  getSellerListings,
  getListingDrafts,
  pauseListing,
  resumeListing,
  duplicateListing,
  resubmitListing,
  appealListing,
  deleteListingDraft,
} from '../api';
import { useToast } from '../components/Toast';
import type { RootStackParamList } from '../navigation';
import ScreenHeader from '../components/ScreenHeader';
import EmptyState from '../components/EmptyState';
import { RowListSkeleton } from '../components/Skeleton';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type ListingRow = {
  id: string;
  name: string;
  price: string | number;
  sale_price?: string | number | null;
  stock: number;
  is_available: boolean;
  listing_status: 'active' | 'pending_review' | 'under_review' | 'rejected';
  paused_reason?: 'seller_manual' | 'tier_cap' | 'out_of_stock' | 'content_review' | 'seller_removed' | null;
  moderation_reason?: string | null;
  moderation_category?: string | null;
  moderation_detail?: string | null;
  content_updated_during_review?: boolean | null;
  appeal_note?: string | null;
  appealed_at?: string | null;
  created_at: string;
  updated_at: string;
  category?: string | null;
  image_url?: string | null;
  variant_count: number;
  min_price: string | number;
  variant_stock: number;
  active_orders: number;
  is_pinned?: boolean;
};

type DraftRow = {
  id: string;
  name?: string | null;
  cover?: { image_url?: string | null } | null;
  updated_at: string;
};

type StatusKey = 'active' | 'pending' | 'review' | 'rejected' | 'paused';
type FilterKey = 'all' | StatusKey | 'drafts';

const statusOf = (l: ListingRow): StatusKey => {
  if (l.listing_status === 'pending_review') return 'pending';
  if (l.listing_status === 'under_review') return 'review';
  if (l.listing_status === 'rejected') return 'rejected';
  if (!l.is_available) return 'paused';
  return 'active';
};



const confirmOnWeb = (title: string, message: string, onConfirm: () => void) => {
  if (Platform.OS === 'web') {
    // RN Web does not fire Alert.alert button callbacks — use window.confirm.
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onConfirm },
    ]);
  }
};

export default function MyListingsScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const [listings, setListings] = useState<ListingRow[]>([]);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [cap, setCap] = useState<number | null>(null);
  const [draftsCount, setDraftsCount] = useState(0);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [appealFor, setAppealFor] = useState<ListingRow | null>(null);
  const [appealNote, setAppealNote] = useState('');
  const [appealSending, setAppealSending] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [sumRes, draftRes] = await Promise.all([
        getSellerListings() as Promise<{
          listings?: ListingRow[];
          counts?: Record<string, number>;
          cap?: number | null;
          draftsCount?: number;
        }>,
        getListingDrafts() as Promise<{ drafts?: DraftRow[] }>,
      ]);
      setListings(sumRes.listings || []);
      setCounts(sumRes.counts || {});
      setCap(sumRes.cap ?? null);
      setDraftsCount(Number(sumRes.draftsCount || 0));
      setDrafts(draftRes.drafts || []);
    } catch {
      toast.error(t('common.error'), t('common.tryAgain'));
    }
    setLoading(false);
  }, [t, toast]);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  const timeAgo = useCallback(
    (dateStr: string): string => {
      const diff = Date.now() - new Date(dateStr).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return t('common.justNow');
      if (mins < 60) return t('common.minutesAgo', { mins });
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return t('common.hoursAgo', { hours: hrs });
      const days = Math.floor(hrs / 24);
      if (days < 7) return t('common.daysAgo', { days });
      return new Date(dateStr).toLocaleDateString('fr-HT', { day: 'numeric', month: 'short' });
    },
    [t]
  );

  const run = useCallback(
    async (id: string, fn: () => Promise<unknown>, onSuccess?: () => void) => {
      setBusyId(id);
      try {
        await fn();
        onSuccess?.();
        await fetchAll();
      } catch (e: any) {
        const code = e?.code;
        if (code === 'LISTING_INVALID') {
          toast.warning(t('myListings.editFirstTitle'), t('myListings.editFirstBody'));
        } else if (code === 'LISTING_PENDING') {
          toast.warning(t('myListings.badgePending'), t('myListings.waitingNote'));
        } else if (code === 'LISTING_REJECTED') {
          toast.warning(t('myListings.badgeRejected'), t('myListings.rejectFirstBody'));
        } else if (code === 'TIER_CAP' || code === 'VERIFIED_LISTING_LIMIT') {
          toast.warning(t('myListings.badgeTierCap'), t('myListings.tierCapNote', { cap: cap ?? 10 }));
        } else {
          toast.error(t('common.error'), e?.message || t('common.tryAgain'));
        }
      } finally {
        setBusyId(null);
      }
    },
    [fetchAll, t, toast]
  );

  const handlePause = (l: ListingRow) =>
    run(l.id, () => pauseListing(l.id), () => toast.success(t('myListings.toastPaused'), l.name));

  const handleResume = (l: ListingRow) =>
    run(l.id, () => resumeListing(l.id), () => toast.success(t('myListings.toastResumed'), l.name));

  const handleDuplicate = (l: ListingRow) =>
    run(l.id, () => duplicateListing(l.id), () => {
      toast.success(t('myListings.toastDuplicated'), t('myListings.toastDuplicatedBody'));
    });

  const handleResubmit = (l: ListingRow) =>
    run(l.id, () => resubmitListing(l.id, {}), () =>
      toast.success(t('myListings.toastResubmitted'), t('myListings.toastResubmittedBody'))
    );

  const handleDeleteDraft = (d: DraftRow) => {
    confirmOnWeb(
      t('myListings.confirmDeleteDraftTitle'),
      t('myListings.confirmDeleteDraftBody'),
      () => {
        run(d.id, () => deleteListingDraft(d.id), () =>
          toast.success(t('myListings.toastDraftDeleted'), d.name || t('addListing.previewUntitled'))
        );
      }
    );
  };

  const submitAppeal = async () => {
    if (!appealFor) return;
    const note = appealNote.trim();
    if (note.length < 10) {
      toast.warning(t('myListings.appealTitle'), t('myListings.appealTooShort'));
      return;
    }
    setAppealSending(true);
    try {
      await appealListing(appealFor.id, note);
      setAppealFor(null);
      setAppealNote('');
      toast.success(t('myListings.toastAppealed'), t('myListings.toastAppealedBody'));
      await fetchAll();
    } catch (e: any) {
      toast.error(t('common.error'), e?.message || t('common.tryAgain'));
    } finally {
      setAppealSending(false);
    }
  };

  const filters: { key: FilterKey; label: string; count: number }[] = useMemo(
    () => [
      { key: 'all', label: t('myListings.filterAll'), count: listings.length },
      { key: 'active', label: t('myListings.filterActive'), count: counts.active || 0 },
      { key: 'pending', label: t('myListings.filterPending'), count: counts.pending_review || 0 },
      { key: 'review', label: t('myListings.filterReview'), count: counts.under_review || 0 },
      { key: 'rejected', label: t('myListings.filterRejected'), count: counts.rejected || 0 },
      { key: 'paused', label: t('myListings.filterPaused'), count: counts.paused || 0 },
      { key: 'drafts', label: t('myListings.filterDrafts'), count: draftsCount },
    ],
    [t, listings.length, counts, draftsCount]
  );

  const visibleListings = useMemo(() => {
    if (filter === 'all' || filter === 'drafts') return filter === 'all' ? listings : [];
    return listings.filter((l) => statusOf(l) === filter);
  }, [listings, filter]);

  const headerRight = (
    <TouchableOpacity
      style={styles.headerAdd}
      onPress={() => nav.navigate('AddListing')}
      accessibilityLabel={t('myListings.add')}
      accessibilityRole="button"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <MaterialCommunityIcons name="plus" size={24} color={COLORS.text} />
    </TouchableOpacity>
  );

  const renderBadges = (l: ListingRow) => {
    const st = statusOf(l);
    const badges: React.ReactNode[] = [];
    if (st === 'pending')
      badges.push(
        <View key="pending" style={[styles.badge, styles.badgePending]}>
          <MaterialCommunityIcons name="clock-outline" size={11} color={COLORS.warning || '#E6A817'} />
          <Text style={styles.badgePendingText}>{t('myListings.badgePending')}</Text>
        </View>
      );
    if (st === 'review')
      badges.push(
        <View key="review" style={[styles.badge, styles.badgeReview]}>
          <MaterialCommunityIcons name="shield-search" size={11} color={COLORS.blue} />
          <Text style={styles.badgeReviewText}>{t('myListings.badgeReview')}</Text>
        </View>
      );
    if (st === 'rejected')
      badges.push(
        <View key="rejected" style={[styles.badge, styles.badgeRejected]}>
          <MaterialCommunityIcons name="close-circle-outline" size={11} color={COLORS.coral} />
          <Text style={styles.badgeRejectedText}>{t('myListings.badgeRejected')}</Text>
        </View>
      );
    if (st === 'paused') {
      const oos = l.paused_reason === 'out_of_stock';
      const tierPaused = l.paused_reason === 'tier_cap';
      badges.push(
        <View key="paused" style={[styles.badge, styles.badgePaused]}>
          <MaterialCommunityIcons
            name={oos ? 'package-variant' : tierPaused ? 'chart-box-outline' : 'pause-circle-outline'}
            size={11}
            color={COLORS.text2}
          />
          <Text style={styles.badgePausedText}>
            {oos ? t('myListings.badgeOutOfStock') : tierPaused ? t('myListings.badgeTierCap') : t('myListings.badgePaused')}
          </Text>
        </View>
      );
    }
    if (l.is_pinned)
      badges.push(
        <View key="pinned" style={[styles.badge, styles.badgeNeutral]}>
          <MaterialCommunityIcons name="pin" size={11} color={COLORS.text2} />
          <Text style={styles.badgeNeutralText}>{t('myListings.pinned')}</Text>
        </View>
      );
    if (l.sale_price && Number(l.sale_price) > 0)
      badges.push(
        <View key="sale" style={[styles.badge, styles.badgeSale]}>
          <Text style={styles.badgeSaleText}>{t('addListing.saleBadge')}</Text>
        </View>
      );
    return badges.length ? <View style={styles.badgeRow}>{badges}</View> : null;
  };

  const renderActions = (l: ListingRow) => {
    const st = statusOf(l);
    const busy = busyId === l.id;
    const action = (label: string, icon: string, onPress: () => void, primary = false) => (
      <TouchableOpacity
        key={label}
        style={[styles.actionBtn, primary && styles.actionPrimary, busy && styles.actionDisabled]}
        onPress={onPress}
        disabled={busy}
        accessibilityLabel={label}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator size="small" color={primary ? COLORS.white : COLORS.text2} />
        ) : (
          <MaterialCommunityIcons
            name={icon as any}
            size={15}
            color={primary ? COLORS.white : COLORS.text2}
          />
        )}
        <Text style={[styles.actionText, primary && styles.actionTextPrimary]} numberOfLines={1}>
          {label}
        </Text>
      </TouchableOpacity>
    );

    const actions: React.ReactNode[] = [];
    if (st === 'active') {
      actions.push(action(t('myListings.pauseBtn'), 'pause', () => handlePause(l)));
      actions.push(action(t('myListings.editBtn'), 'pencil', () => nav.navigate('EditListing', { productId: l.id })));
      actions.push(action(t('myListings.duplicateBtn'), 'content-copy', () => handleDuplicate(l)));
    } else if (st === 'paused') {
      actions.push(action(t('myListings.resumeBtn'), 'play', () => handleResume(l), true));
      actions.push(
        action(
          l.paused_reason === 'out_of_stock' ? t('myListings.restockBtn') : t('myListings.editBtn'),
          'pencil',
          () => nav.navigate('EditListing', { productId: l.id })
        )
      );
      actions.push(action(t('myListings.duplicateBtn'), 'content-copy', () => handleDuplicate(l)));
    } else if (st === 'pending') {
      actions.push(action(t('myListings.editBtn'), 'pencil', () => nav.navigate('EditListing', { productId: l.id })));
      actions.push(action(t('myListings.duplicateBtn'), 'content-copy', () => handleDuplicate(l)));
    } else if (st === 'review') {
      // APP-Q546: fix the disputed content, then resubmit for review. APP-Q547: appeal.
      actions.push(action(t('myListings.editBtn'), 'pencil', () => nav.navigate('EditListing', { productId: l.id }), true));
      actions.push(action(t('myListings.resubmitBtn'), 'refresh', () => handleResubmit(l)));
      actions.push(action(t('myListings.appealBtn'), 'lifebuoy', () => {
        setAppealNote(l.appeal_note || '');
        setAppealFor(l);
      }));
    } else {
      actions.push(action(t('myListings.editBtn'), 'pencil', () => nav.navigate('EditListing', { productId: l.id }), true));
      actions.push(action(t('myListings.resubmitBtn'), 'refresh', () => handleResubmit(l)));
      actions.push(action(t('myListings.appealBtn'), 'lifebuoy', () => {
        setAppealNote(l.appeal_note || '');
        setAppealFor(l);
      }));
    }
    return <View style={styles.actionsRow}>{actions}</View>;
  };

  const renderListing = ({ item }: { item: ListingRow }) => {
    const st = statusOf(item);
    const cover = getImageUrl(item.image_url);
    const stock = item.variant_count > 0 ? Number(item.variant_stock) : Number(item.stock);
    const price = item.variant_count > 0 ? Number(item.min_price) : Number(item.price);
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => nav.navigate('ProductDetail', { productId: item.id })}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={item.name}
      >
        <View style={styles.cardTop}>
          <View style={styles.coverWrap}>
            {cover ? (
              <Image source={{ uri: cover }} style={styles.cover} resizeMode="cover" />
            ) : (
              <View style={[styles.cover, styles.coverFallback]}>
                <MaterialCommunityIcons name="image-outline" size={22} color={COLORS.text3} />
              </View>
            )}
            {item.variant_count > 0 && (
              <View style={styles.variantChip}>
                <Text style={styles.variantChipText}>{item.variant_count}</Text>
              </View>
            )}
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardName} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={styles.cardPrice}>{formatPrice(price)}</Text>
            <View style={styles.metaRow}>
              <MaterialCommunityIcons name="package-variant" size={13} color={COLORS.text3} />
              <Text style={styles.metaText}>{t('myListings.stock', { count: stock })}</Text>
              {item.active_orders > 0 && (
                <Text style={styles.metaActive}>
                  {t('myListings.activeOrders', { count: item.active_orders })}
                </Text>
              )}
            </View>
            {renderBadges(item)}
          </View>
        </View>

        {st === 'pending' && (
          <Text style={styles.noteText}>
            {item.moderation_category ? t('myListings.waitingReviewNote') : t('myListings.waitingAutoNote')}
          </Text>
        )}
        {st === 'paused' && item.paused_reason === 'tier_cap' && (
          <Text style={styles.noteText}>{t('myListings.tierCapNote', { cap: cap ?? 0 })}</Text>
        )}
        {st === 'review' && (
          <View>
            <Text style={[styles.noteText, styles.noteReview]}>
              {t('myListings.reviewNotice', { category: t(reviewCategoryKey(item.moderation_category)) })}
            </Text>
            {!!item.moderation_detail && (
              <Text style={styles.noteText}>{t('myListings.reviewAffected', { detail: item.moderation_detail })}</Text>
            )}
            <Text style={styles.noteText}>
              {!item.is_available && item.paused_reason === 'content_review'
                ? t('myListings.reviewRestrictedHidden')
                : t('myListings.reviewRestrictedVisible')}
            </Text>
            <Text style={styles.noteText}>{t('myListings.reviewResponsePath')}</Text>
            {item.content_updated_during_review && (
              <Text style={styles.appealSentText}>{t('myListings.reviewContentUpdated')}</Text>
            )}
            {item.appealed_at && (
              <Text style={styles.appealSentText}>
                {t('myListings.appealSent', { when: timeAgo(item.appealed_at) })}
              </Text>
            )}
          </View>
        )}
        {st === 'rejected' && (
          <View>
            <Text style={[styles.noteText, styles.noteRejected]}>
              {t('myListings.rejectReason', { reason: item.moderation_reason || t('myListings.rejectReasonGeneric') })}
            </Text>
            {item.appealed_at && (
              <Text style={styles.appealSentText}>
                {t('myListings.appealSent', { when: timeAgo(item.appealed_at) })}
              </Text>
            )}
          </View>
        )}

        {renderActions(item)}
      </TouchableOpacity>
    );
  };

  const renderDraft = ({ item }: { item: DraftRow }) => {
    const cover = getImageUrl(item.cover?.image_url);
    return (
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.cardTop}
          onPress={() => nav.navigate('AddListing', { draftId: item.id })}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={item.name || t('addListing.previewUntitled')}
        >
          <View style={styles.coverWrap}>
            {cover ? (
              <Image source={{ uri: cover }} style={styles.cover} resizeMode="cover" />
            ) : (
              <View style={[styles.cover, styles.coverFallback]}>
                <MaterialCommunityIcons name="image-outline" size={22} color={COLORS.text3} />
              </View>
            )}
            <View style={[styles.variantChip, styles.draftChip]}>
              <MaterialCommunityIcons name="file-edit-outline" size={10} color={COLORS.white} />
            </View>
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardName} numberOfLines={2}>
              {item.name || t('addListing.previewUntitled')}
            </Text>
            <Text style={styles.metaText}>{t('myListings.draftUpdated', { when: timeAgo(item.updated_at) })}</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionPrimary]}
            onPress={() => nav.navigate('AddListing', { draftId: item.id })}
            accessibilityRole="button"
          >
            <MaterialCommunityIcons name="pencil" size={15} color={COLORS.white} />
            <Text style={[styles.actionText, styles.actionTextPrimary]}>{t('myListings.continueBtn')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleDeleteDraft(item)}
            accessibilityRole="button"
          >
            <MaterialCommunityIcons name="trash-can-outline" size={15} color={COLORS.coral} />
            <Text style={[styles.actionText, styles.actionDelete]}>{t('myListings.deleteBtn')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const listHeader = (
    <View>
      {cap !== null && (
        <View style={styles.capRow}>
          <MaterialCommunityIcons name="chart-box-outline" size={14} color={COLORS.text2} />
          <Text style={styles.capText}>
            {t('addListing.capUsage', { active: counts.active || 0, cap })}
          </Text>
          {(counts.active || 0) >= cap && (
            <TouchableOpacity
              onPress={() => nav.navigate('SellerToolsSettings')}
              accessibilityRole="button"
              accessibilityLabel={t('addListing.viewTiers')}
            >
              <Text style={styles.capTierLink}>{t('addListing.viewTiers')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      <FlatList
        horizontal
        data={filters}
        keyExtractor={(f) => f.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
        renderItem={({ item: f }) => {
          const on = filter === f.key;
          return (
            <TouchableOpacity
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => setFilter(f.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{f.label}</Text>
              {f.count > 0 && (
                <Text style={[styles.chipCount, on && styles.chipCountOn]}>{f.count}</Text>
              )}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );

  const emptyState = () => {
    if (filter === 'drafts')
      return (
        <EmptyState
          icon="file-document-edit-outline"
          title={t('myListings.emptyDraftsTitle')}
          hint={t('myListings.emptyDraftsHint')}
          size={56}
        />
      );
    return (
      <EmptyState
        icon="package-variant"
        title={t('myListings.emptyTitle')}
        hint={t('myListings.emptyHint')}
        actionLabel={t('myListings.add')}
        onAction={() => nav.navigate('AddListing')}
        size={56}
      />
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title={t('myListings.title')} onBack={() => nav.goBack()} right={headerRight} />
        <RowListSkeleton count={5} />
      </View>
    );
  }

  const showDrafts = filter === 'drafts';
  const data = showDrafts ? drafts : visibleListings;

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('myListings.title')} onBack={() => nav.goBack()} right={headerRight} />
      <FlatList
        data={data as ListingRow[]}
        keyExtractor={(item) => item.id}
        renderItem={showDrafts ? renderDraft : renderListing}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyState}
        contentContainerStyle={[styles.listContent, data.length === 0 && styles.listEmpty]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.coral} />}
        keyboardShouldPersistTaps="handled"
      />

      <Modal visible={!!appealFor} transparent animationType="fade" onRequestClose={() => setAppealFor(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('myListings.appealTitle')}</Text>
            <Text style={styles.modalBody}>{t('myListings.appealBody')}</Text>
            <TextInput
              style={styles.modalInput}
              value={appealNote}
              onChangeText={setAppealNote}
              placeholder={t('myListings.appealPlaceholder')}
              placeholderTextColor={COLORS.text3}
              multiline
              maxLength={1000}
              textAlignVertical="top"
              accessibilityLabel={t('myListings.appealPlaceholder')}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setAppealFor(null)}
                accessibilityRole="button"
              >
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSend, appealSending && styles.actionDisabled]}
                onPress={submitAppeal}
                disabled={appealSending}
                accessibilityRole="button"
              >
                {appealSending ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Text style={styles.modalSendText}>{t('myListings.appealSend')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={{ height: insets.bottom }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  listContent: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xl },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  headerAdd: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  capText: { color: COLORS.text2, fontSize: 13, fontWeight: '600' },
  capTierLink: { color: COLORS.coral, fontSize: 12, fontWeight: '700' },
  chipsRow: { gap: 8, paddingVertical: SPACING.sm, paddingRight: SPACING.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card || COLORS.bg,
    minHeight: 36,
  },
  chipOn: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  chipText: { color: COLORS.text2, fontSize: 13, fontWeight: '600' },
  chipTextOn: { color: COLORS.white },
  chipCount: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text3,
    backgroundColor: COLORS.bg2 || COLORS.bg,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  chipCountOn: { color: COLORS.text, backgroundColor: COLORS.white },
  card: {
    backgroundColor: COLORS.card || COLORS.bg,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  cardTop: { flexDirection: 'row', gap: SPACING.md },
  coverWrap: { width: 76, height: 76, borderRadius: RADIUS.button, overflow: 'hidden' },
  cover: { width: '100%', height: '100%', backgroundColor: COLORS.bg2 || COLORS.bg },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  variantChip: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: RADIUS.sm,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  variantChipText: { color: COLORS.white, fontSize: 10, fontWeight: '700' },
  draftChip: { backgroundColor: COLORS.coral },
  cardInfo: { flex: 1, gap: 4 },
  cardName: { color: COLORS.text, fontSize: 15, fontWeight: '700', lineHeight: 20 },
  cardPrice: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  metaText: { color: COLORS.text3, fontSize: 12 },
  metaActive: {
    color: COLORS.coral,
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: COLORS.coralSoft || 'rgba(255,77,106,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
  },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
  },
  badgePending: { backgroundColor: 'rgba(230,168,23,0.14)' },
  badgePendingText: { color: '#B07C08', fontSize: 10.5, fontWeight: '700' },
  badgeReview: { backgroundColor: 'rgba(45,110,220,0.12)' },
  badgeReviewText: { color: COLORS.blue, fontSize: 10.5, fontWeight: '700' },
  badgeRejected: { backgroundColor: 'rgba(255,77,106,0.12)' },
  badgeRejectedText: { color: COLORS.coral, fontSize: 10.5, fontWeight: '700' },
  badgePaused: { backgroundColor: 'rgba(128,128,128,0.15)' },
  badgePausedText: { color: COLORS.text2, fontSize: 10.5, fontWeight: '700' },
  badgeNeutral: { backgroundColor: 'rgba(128,128,128,0.12)' },
  badgeNeutralText: { color: COLORS.text2, fontSize: 10.5, fontWeight: '700' },
  badgeSale: { backgroundColor: COLORS.coralSoft || 'rgba(255,77,106,0.12)' },
  badgeSaleText: { color: COLORS.coral, fontSize: 10.5, fontWeight: '800' },
  noteText: {
    color: COLORS.text2,
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.bg2 || COLORS.bg,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 7,
  },
  noteRejected: { color: COLORS.text },
  noteReview: { color: COLORS.text, fontWeight: '600' },
  appealSentText: { color: COLORS.text3, fontSize: 12, marginTop: 6, fontStyle: 'italic' },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACING.md,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  actionPrimary: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  actionDisabled: { opacity: 0.55 },
  actionText: { color: COLORS.text2, fontSize: 13, fontWeight: '600' },
  actionTextPrimary: { color: COLORS.white },
  actionDelete: { color: COLORS.coral },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.card || COLORS.bg,
    borderRadius: RADIUS.card,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  modalTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  modalBody: { color: COLORS.text2, fontSize: 13.5, lineHeight: 19 },
  modalInput: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.button,
    padding: SPACING.md,
    color: COLORS.text,
    fontSize: 14.5,
    backgroundColor: COLORS.bg,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.sm, marginTop: SPACING.xs },
  modalCancel: {
    paddingHorizontal: SPACING.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.button,
  },
  modalCancelText: { color: COLORS.text2, fontSize: 14.5, fontWeight: '600' },
  modalSend: {
    paddingHorizontal: SPACING.lg,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.coral,
  },
  modalSendText: { color: COLORS.white, fontSize: 14.5, fontWeight: '700' },
});
