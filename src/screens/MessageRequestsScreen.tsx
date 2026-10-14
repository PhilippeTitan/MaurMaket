import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  getMessageRequests, acceptMessageRequest, declineMessageRequest, archiveMessageRequest,
  restoreMessageRequest, blockUser, reportConversationUser, type MessageRequest,
} from '../api';
import type { RootStackParamList } from '../navigation';
import { COLORS, SPACING, RADIUS } from '../theme';
import { useTranslation } from '@/localization';
import { MaterialCommunityIcons } from '../components/icons/UnifiedIcon';
import ScreenHeader from '../components/ScreenHeader';
import UserAvatar from '../components/UserAvatar';
import { useToast } from '../components/Toast';

type Props = NativeStackScreenProps<RootStackParamList, 'MessageRequests'>;

const REPORT_REASONS = ['harassment', 'scam', 'inappropriate', 'spam', 'other'] as const;

/**
 * Message Requests — first contact (APP-Q154, Q164–Q173).
 *
 * Someone you have never talked to gets one plain message here, with the listing
 * or order context it came with and nothing else about them. Nothing in this
 * screen is a commitment: accepting opens an ordinary conversation, deleting
 * declines without touching any order or listing, and an unanswered request is
 * filed away after a clear period with the restore path right here. The sender is
 * never told which of those happened — that is the point, and this screen never
 * says more than "not accepted" to them.
 */
export default function MessageRequestsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [active, setActive] = useState<MessageRequest[]>([]);
  const [archived, setArchived] = useState<MessageRequest[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [reportTarget, setReportTarget] = useState<MessageRequest | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [reportBusy, setReportBusy] = useState(false);

  const load = useCallback(() => {
    setError('');
    getMessageRequests()
      .then((result) => {
        setActive(result?.active || []);
        setArchived(result?.archived || []);
      })
      .catch(() => setError(t('requests.loadError')))
      .finally(() => setLoading(false));
  }, [t]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const displayName = (request: MessageRequest) => (
    request.requester_use_store_identity && request.requester_store_name
      ? request.requester_store_name
      : (request.requester_username || request.requester_name || t('requests.unknownSender'))
  );

  const run = async (request: MessageRequest, action: () => Promise<unknown>, successKey: string) => {
    setBusyId(request.id);
    try {
      await action();
      toast.success(t('requests.title'), t(successKey));
      load();
    } catch {
      toast.error(t('common.error'), t('requests.actionFailed'));
    } finally {
      setBusyId('');
    }
  };

  const accept = (request: MessageRequest) => run(request, async () => {
    await acceptMessageRequest(request.id);
    // Accepting opens an ordinary conversation. It follows nobody (APP-Q171).
    navigation.navigate('Chat', {
      conversationId: request.id,
      otherUserName: displayName(request),
      otherUserId: request.requester_id,
      otherUserAvatar: request.requester_avatar,
      otherUserStoreLogoUrl: request.requester_store_logo_url,
      otherUserUseStoreIdentity: !!request.requester_use_store_identity,
      otherUserTier: request.requester_seller_tier || undefined,
    });
  }, 'requests.acceptedToast');

  const submitReport = async () => {
    if (!reportTarget || !reportReason) return;
    setReportBusy(true);
    try {
      await reportConversationUser(reportTarget.id, reportReason, reportDetails.trim() || undefined);
      toast.success(t('requests.title'), t('chat.reportSent'));
      setReportTarget(null);
      setReportReason('');
      setReportDetails('');
      // A report never removes the request by itself: the recipient still decides
      // whether to accept, delete or block (APP-Q165).
      load();
    } catch {
      toast.error(t('common.error'), t('requests.actionFailed'));
    } finally {
      setReportBusy(false);
    }
  };

  const card = (request: MessageRequest, isArchived: boolean) => {
    const name = displayName(request);
    const busy = busyId === request.id;
    return (
      <View key={request.id} style={styles.card}>
        <View style={styles.cardHead}>
          <UserAvatar
            seller={{
              avatar_url: request.requester_avatar,
              store_logo_url: request.requester_store_logo_url,
              use_store_identity: request.requester_use_store_identity,
              full_name: request.requester_name,
              username: request.requester_username,
              seller_tier: request.requester_seller_tier,
            } as any}
            size={46}
            animated={false}
          />
          <View style={styles.cardIdentity}>
            <Text style={styles.cardName} numberOfLines={1}>{name}</Text>
            {request.requester_username && !request.requester_use_store_identity ? (
              <Text style={styles.cardHandle} numberOfLines={1}>@{request.requester_username}</Text>
            ) : null}
            <View style={styles.contextChip}>
              <MaterialCommunityIcons
                name={request.order_id ? 'receipt' : 'tag-outline'}
                size={13}
                color={COLORS.text2}
              />
              <Text style={styles.contextText} numberOfLines={1}>
                {request.order_id
                  ? t('requests.contextOrder')
                  : request.product_name
                    ? t('requests.contextListing', { name: request.product_name })
                    : t('requests.contextGeneral')}
              </Text>
            </View>
          </View>
          <Text style={styles.cardTime}>
            {new Date(request.created_at).toLocaleDateString()}
          </Text>
        </View>

        {request.message_content ? (
          <Text style={styles.messageText} numberOfLines={6}>{request.message_content}</Text>
        ) : null}

        <View style={styles.actions}>
          {isArchived ? (
            <TouchableOpacity
              style={[styles.actionBtn, styles.primaryBtn, busy && styles.actionBusy]}
              disabled={busy}
              onPress={() => run(request, () => restoreMessageRequest(request.id), 'requests.restoredToast')}
              accessibilityRole="button"
              accessibilityLabel={t('requests.restore')}
            >
              <Text style={styles.primaryBtnText}>{t('requests.restore')}</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.actionBtn, styles.primaryBtn, busy && styles.actionBusy]}
                disabled={busy}
                onPress={() => accept(request)}
                accessibilityRole="button"
                accessibilityLabel={t('requests.accept')}
              >
                <Text style={styles.primaryBtnText}>{t('requests.accept')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, busy && styles.actionBusy]}
                disabled={busy}
                onPress={() => run(request, () => declineMessageRequest(request.id), 'requests.deletedToast')}
                accessibilityRole="button"
                accessibilityLabel={t('requests.delete')}
              >
                <Text style={styles.actionText}>{t('requests.delete')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, busy && styles.actionBusy]}
                disabled={busy}
                onPress={() => { setReportTarget(request); setReportReason(''); setReportDetails(''); }}
                accessibilityRole="button"
                accessibilityLabel={t('requests.report')}
              >
                <Text style={styles.actionText}>{t('requests.report')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {!isArchived && (
          <View style={styles.quietRow}>
            <TouchableOpacity
              style={styles.quietAction}
              disabled={busy}
              onPress={() => run(request, () => archiveMessageRequest(request.id), 'requests.archivedToast')}
              accessibilityRole="button"
              accessibilityLabel={t('requests.archive')}
            >
              <MaterialCommunityIcons name="archive-outline" size={15} color={COLORS.text2} />
              <Text style={styles.quietText}>{t('requests.archive')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quietAction}
              disabled={busy}
              onPress={() => run(request, () => blockUser(request.requester_id), 'requests.blockedToast')}
              accessibilityRole="button"
              accessibilityLabel={t('requests.block')}
            >
              <MaterialCommunityIcons name="account-cancel-outline" size={15} color={COLORS.text2} />
              <Text style={styles.quietText}>{t('requests.block')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('requests.title')} onBack={() => navigation.goBack()} />
      <Text style={styles.explainer}>{t('requests.explainer')}</Text>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={COLORS.coral} />
      ) : error ? (
        <TouchableOpacity onPress={load} accessibilityRole="button" accessibilityLabel={t('common.retry')}>
          <Text style={styles.empty}>{error} · {t('common.retry')}</Text>
        </TouchableOpacity>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: SPACING.xl }}>
          {active.length === 0 ? (
            <>
              <Text style={styles.empty}>{t('requests.empty')}</Text>
              <Text style={styles.emptyHint}>{t('requests.emptyHint')}</Text>
            </>
          ) : active.map((request) => card(request, false))}

          {archived.length > 0 && (
            <TouchableOpacity
              style={styles.archiveToggle}
              onPress={() => setShowArchived((prev) => !prev)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showArchived }}
              accessibilityLabel={t('requests.archivedToggle', { count: archived.length })}
            >
              <MaterialCommunityIcons name={showArchived ? 'chevron-down' : 'chevron-right'} size={18} color={COLORS.text2} />
              <Text style={styles.archiveToggleText}>{t('requests.archivedToggle', { count: archived.length })}</Text>
            </TouchableOpacity>
          )}
          {showArchived && archived.map((request) => card(request, true))}
        </ScrollView>
      )}

      <Modal visible={!!reportTarget} transparent animationType="fade" onRequestClose={() => setReportTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('requests.reportTitle')}</Text>
            {REPORT_REASONS.map((reason) => (
              <TouchableOpacity
                key={reason}
                style={styles.reasonRow}
                onPress={() => setReportReason(reason)}
                accessibilityRole="radio"
                accessibilityState={{ selected: reportReason === reason }}
                accessibilityLabel={t(`chat.reportReason.${reason}`)}
              >
                <MaterialCommunityIcons
                  name={reportReason === reason ? 'radiobox-marked' : 'radiobox-blank'}
                  size={20}
                  color={reportReason === reason ? COLORS.coral : COLORS.text2}
                />
                <Text style={styles.reasonText}>{t(`chat.reportReason.${reason}`)}</Text>
              </TouchableOpacity>
            ))}
            <TextInput
              style={styles.reportInput}
              value={reportDetails}
              onChangeText={setReportDetails}
              multiline
              maxLength={1500}
              placeholder={t('chat.reportDetails')}
              placeholderTextColor={COLORS.text2}
              accessibilityLabel={t('chat.reportDetails')}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setReportTarget(null)}
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
              >
                <Text style={styles.quietText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.primaryBtn, (!reportReason || reportBusy) && styles.actionBusy]}
                disabled={!reportReason || reportBusy}
                onPress={submitReport}
                accessibilityRole="button"
                accessibilityLabel={t('requests.reportSubmit')}
              >
                <Text style={styles.primaryBtnText}>{t('requests.reportSubmit')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  explainer: { color: COLORS.text2, fontSize: 13, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm, lineHeight: 18 },
  empty: { color: COLORS.text2, textAlign: 'center', marginTop: 36, fontSize: 14, paddingHorizontal: SPACING.lg },
  emptyHint: { color: COLORS.text2, textAlign: 'center', fontSize: 13, marginTop: 8, paddingHorizontal: SPACING.lg },
  card: {
    marginHorizontal: SPACING.lg, marginTop: SPACING.md, padding: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.card,
    borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardIdentity: { flex: 1 },
  cardName: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  cardHandle: { color: COLORS.text2, fontSize: 12, marginTop: 1 },
  contextChip: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  contextText: { color: COLORS.text2, fontSize: 12, flexShrink: 1 },
  cardTime: { color: COLORS.text2, fontSize: 11 },
  messageText: { color: COLORS.text, fontSize: 14, lineHeight: 20, marginTop: SPACING.sm },
  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  actionBtn: {
    minHeight: 44, paddingHorizontal: SPACING.md, borderRadius: RADIUS.button,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border,
  },
  actionBusy: { opacity: 0.5 },
  primaryBtn: { backgroundColor: COLORS.coral, borderColor: COLORS.coral },
  primaryBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 14 },
  actionText: { color: COLORS.text, fontWeight: '600', fontSize: 14 },
  quietRow: { flexDirection: 'row', gap: SPACING.lg, marginTop: SPACING.sm },
  quietAction: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44 },
  quietText: { color: COLORS.text2, fontSize: 13, fontWeight: '600' },
  archiveToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, minHeight: 44 },
  archiveToggleText: { color: COLORS.text2, fontSize: 13, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: SPACING.lg },
  modalCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.card, padding: SPACING.lg },
  modalTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700', marginBottom: SPACING.sm },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  reasonText: { color: COLORS.text, fontSize: 14 },
  reportInput: {
    minHeight: 86, maxHeight: 130, backgroundColor: COLORS.surface2, color: COLORS.text,
    borderRadius: RADIUS.row, padding: 12, textAlignVertical: 'top', marginTop: SPACING.sm,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: SPACING.md, marginTop: SPACING.md },
  modalCancel: { minHeight: 44, justifyContent: 'center', paddingHorizontal: SPACING.sm },
});
