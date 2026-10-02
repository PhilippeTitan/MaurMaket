import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Pressable,
  TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Icon } from '../icons/Icon';
import EmptyState from '../EmptyState';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, RADIUS, SPACING, TOUCH } from '../../theme';
import { editReviewReply, replyToReview } from '../../api';
import { useTranslation } from '@/localization';
import { useToast } from '../Toast';
import type { Review } from '../../types';

interface ReviewStats {
  avg_rating?: number | string;
  review_count?: number | string;
  breakdown?: Record<string, number>;
}

interface Props {
  reviews: Review[];
  stats?: ReviewStats | null;
  isOwner: boolean;
  ownerName: string;
  emptyHint?: string;
  onReportReview?: (review: Review) => void;
  onReportReply?: (review: Review) => void;
  /** Called after the owner posts or edits a public reply. */
  onReplySaved?: () => void;
}

/**
 * Reviews tab for both profile surfaces: rating breakdown, review cards, and —
 * for the owner — the single public reply per review that the settled profile
 * decisions allow. No threads, no editing other people's words.
 */
export default function ProfileReviews({
  reviews,
  stats,
  isOwner,
  ownerName,
  emptyHint,
  onReportReview,
  onReportReply,
  onReplySaved,
}: Props) {
  const { t } = useTranslation();
  const toast = useToast();

  const [replyTarget, setReplyTarget] = useState<Review | null>(null);
  const [replyText, setReplyText] = useState('');
  const [saving, setSaving] = useState(false);

  const reviewTotal = Number(stats?.review_count ?? reviews.length) || 0;
  const average = Number(stats?.avg_rating ?? 0) ||
    (reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0);

  const buckets = useMemo(
    () =>
      [5, 4, 3, 2, 1].map((star) => {
        const count = Number(stats?.breakdown?.[star] ?? reviews.filter((r) => r.rating === star).length) || 0;
        return { star, count, pct: reviewTotal > 0 ? (count / reviewTotal) * 100 : 0 };
      }),
    [reviews, stats, reviewTotal],
  );

  const openReply = useCallback((review: Review) => {
    setReplyTarget(review);
    setReplyText(review.seller_response || '');
  }, []);

  const saveReply = useCallback(async () => {
    if (!replyTarget) return;
    const text = replyText.trim();
    if (!text) return;
    setSaving(true);
    try {
      if (replyTarget.seller_response) await editReviewReply(replyTarget.id, text);
      else await replyToReview(replyTarget.id, text);
      toast.show({ kind: 'success', title: t('profile.replySaved') });
      setReplyTarget(null);
      setReplyText('');
      onReplySaved?.();
    } catch {
      toast.error(t('profile.replyFailed'), t('feedback.connectionRetry'));
    } finally {
      setSaving(false);
    }
  }, [replyTarget, replyText, toast, t, onReplySaved]);

  if (reviews.length === 0 && reviewTotal === 0) {
    return (
      <EmptyState
        icon="star-outline"
        title={t('profile.noReviews')}
        hint={emptyHint}
        size={56}
      />
    );
  }

  return (
    <View>
      {reviewTotal > 0 && (
        <View style={styles.summary}>
          <View style={styles.summaryLeft}>
            <Text style={styles.average}>{average > 0 ? average.toFixed(1) : '—'}</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((s) => (
                <Icon
                  key={s}
                  name={s <= Math.round(average) ? 'rating' : 'rate-this'}
                  size={13}
                  color={s <= Math.round(average) ? COLORS.yellow : COLORS.text3}
                />
              ))}
            </View>
            <Text style={styles.summaryCount}>{t('profile.reviewsCount', { count: reviewTotal })}</Text>
          </View>
          <View style={styles.summaryRight}>
            {buckets.map(({ star, count, pct }) => (
              <View key={star} style={styles.bucketRow}>
                <Text style={styles.bucketLabel}>{star}★</Text>
                <View style={styles.bucketTrack}>
                  <View style={[styles.bucketFill, { width: `${pct}%` }]} />
                </View>
                <Text style={styles.bucketCount}>{count}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={{ gap: SPACING.sm, marginTop: SPACING.md }}>
        {reviews.map((review) => {
          const reviewerName =
            review.reviewer?.username || review.reviewer_username || review.reviewer?.full_name || t('common.buyer');
          const initial = reviewerName.charAt(0).toUpperCase();
          return (
            <View key={review.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initial}</Text>
                </View>
                <View style={styles.cardHeaderInfo}>
                  <Text style={styles.reviewer} numberOfLines={1}>{reviewerName}</Text>
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Icon
                        key={s}
                        name={s <= review.rating ? 'rating' : 'rate-this'}
                        size={11}
                        color={s <= review.rating ? COLORS.yellow : COLORS.text3}
                      />
                    ))}
                  </View>
                </View>
                <Text style={styles.date}>{new Date(review.created_at).toLocaleDateString()}</Text>
                {!isOwner && onReportReview ? (
                  <TouchableOpacity
                    style={styles.reportIconBtn}
                    onPress={() => onReportReview(review)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('profile.reportReview')}
                  >
                    <MaterialCommunityIcons name="flag-outline" size={15} color={COLORS.text3} />
                  </TouchableOpacity>
                ) : null}
              </View>

              {review.comment ? <Text style={styles.comment}>{review.comment}</Text> : null}

              {review.seller_response ? (
                <View style={styles.reply}>
                  <View style={styles.replyHeader}>
                    <Text style={styles.replyLabel}>{t('profile.replied', { name: ownerName })}</Text>
                    {isOwner ? (
                      <TouchableOpacity
                        style={styles.reportIconBtn}
                        onPress={() => openReply(review)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={t('profile.editReply')}
                      >
                        <MaterialCommunityIcons name="pencil-outline" size={14} color={COLORS.blue} />
                      </TouchableOpacity>
                    ) : onReportReply ? (
                      <TouchableOpacity
                        style={styles.reportIconBtn}
                        onPress={() => onReportReply(review)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={t('profile.reportReply')}
                      >
                        <MaterialCommunityIcons name="flag-outline" size={13} color={COLORS.text3} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <Text style={styles.replyText}>{review.seller_response}</Text>
                </View>
              ) : isOwner ? (
                <TouchableOpacity
                  style={styles.replyAction}
                  onPress={() => openReply(review)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('profile.replyToReview')}
                >
                  <MaterialCommunityIcons name="reply" size={14} color={COLORS.blue} />
                  <Text style={styles.replyActionText}>{t('profile.replyToReview')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
      </View>

      <Modal
        visible={!!replyTarget}
        transparent
        animationType="fade"
        onRequestClose={() => !saving && setReplyTarget(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => !saving && setReplyTarget(null)}>
          <Pressable style={styles.replySheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>
              {replyTarget?.seller_response ? t('profile.editReply') : t('profile.replyToReview')}
            </Text>
            <Text style={styles.sheetHint}>{t('profile.replyHint')}</Text>
            <TextInput
              style={styles.replyInput}
              value={replyText}
              onChangeText={setReplyText}
              placeholder={t('profile.replyPlaceholder')}
              placeholderTextColor={COLORS.text3}
              multiline
              maxLength={1000}
              autoFocus
            />
            <Text style={styles.replyCounter}>{replyText.length}/1000</Text>
            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={styles.sheetCancel}
                onPress={() => setReplyTarget(null)}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
              >
                <Text style={styles.sheetCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetSubmit, (!replyText.trim() || saving) && styles.sheetSubmitDisabled]}
                onPress={saveReply}
                disabled={!replyText.trim() || saving}
                accessibilityRole="button"
                accessibilityLabel={t('profile.postReply')}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Text style={styles.sheetSubmitText}>{t('profile.postReply')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.card,
    padding: SPACING.lg,
  },
  summaryLeft: { alignItems: 'center', minWidth: 68 },
  average: { fontSize: FONT_SIZES.hero, fontWeight: FONT_WEIGHTS.bold, color: COLORS.text },
  starsRow: { flexDirection: 'row', gap: 2, marginTop: 4 },
  summaryCount: { fontSize: FONT_SIZES.sm, color: COLORS.text2, marginTop: 4 },
  summaryRight: { flex: 1, gap: 4 },
  bucketRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bucketLabel: { fontSize: FONT_SIZES.xs, color: COLORS.text2, width: 20 },
  bucketTrack: {
    flex: 1,
    height: 5,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface2,
    overflow: 'hidden',
  },
  bucketFill: { height: '100%', backgroundColor: COLORS.yellow, borderRadius: RADIUS.full },
  bucketCount: { fontSize: FONT_SIZES.xs, color: COLORS.text3, width: 20, textAlign: 'right' },

  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.card,
    padding: 14,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: COLORS.white, fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.bold },
  cardHeaderInfo: { flex: 1 },
  reviewer: { fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.text },
  date: { fontSize: FONT_SIZES.xs, color: COLORS.text3 },
  reportIconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comment: { fontSize: FONT_SIZES.base, color: COLORS.text2, lineHeight: 19 },

  reply: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 4,
  },
  replyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  replyLabel: { fontSize: FONT_SIZES.xs, color: COLORS.blue, fontWeight: FONT_WEIGHTS.bold },
  replyText: { fontSize: FONT_SIZES.sm, color: COLORS.text2, lineHeight: 18 },
  replyAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface2,
  },
  replyActionText: { fontSize: FONT_SIZES.sm, color: COLORS.blue, fontWeight: FONT_WEIGHTS.semibold },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  replySheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.card,
    borderTopRightRadius: RADIUS.card,
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  sheetTitle: { fontSize: FONT_SIZES.xl, fontWeight: FONT_WEIGHTS.bold, color: COLORS.text, textAlign: 'center' },
  sheetHint: { fontSize: FONT_SIZES.sm, color: COLORS.text2, textAlign: 'center', marginTop: 4, marginBottom: SPACING.md },
  replyInput: {
    minHeight: 100,
    maxHeight: 160,
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  replyCounter: { fontSize: FONT_SIZES.xs, color: COLORS.text3, textAlign: 'right', marginTop: 4, marginBottom: SPACING.md },
  sheetActions: { flexDirection: 'row', gap: SPACING.md },
  sheetCancel: {
    flex: 1,
    minHeight: TOUCH.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.surface2,
  },
  sheetCancelText: { fontSize: FONT_SIZES.md, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.text },
  sheetSubmit: {
    flex: 1,
    minHeight: TOUCH.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.coral,
  },
  sheetSubmitDisabled: { opacity: 0.5 },
  sheetSubmitText: { fontSize: FONT_SIZES.md, fontWeight: FONT_WEIGHTS.bold, color: COLORS.white },
});
