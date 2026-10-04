import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import { COLORS, RADIUS, SPACING, FONT_SIZES, FONT_WEIGHTS, SHADOW, TOUCH } from '../theme';
import { submitReport } from '../api';
import { useTranslation } from '@/localization';
import { useToast } from './Toast';

export interface ReportModalProps {
  visible: boolean;
  targetType: 'profile' | 'review' | 'reply' | 'order' | 'listing';
  targetId: string;
  targetName?: string;
  reportedUserId?: string;
  orderContext?: any;
  onClose: () => void;
  onSubmitSuccess?: () => void;
}

const REASONS_MAP: Record<string, string[]> = {
  profile: [
    'Inappropriate content',
    'Scam or fraud',
    'Harassment or hate speech',
    'Fake identity / impersonation',
    'Selling prohibited items',
    'Other',
  ],
  review: [
    'Offensive or abusive language',
    'Spam or fake review',
    'Harassment',
    'Extortion or blackmail',
    'Other',
  ],
  reply: [
    'Offensive or abusive language',
    'Harassment',
    'Disclosing private buyer information',
    'Spam or advertising',
    'Other',
  ],
  order: [
    'Item not received',
    'Item significantly not as described',
    'Payment or surcharge issue',
    'Seller unreachable / meetup failure',
    'Damaged or defective item',
    'Other',
  ],
};

export default function ReportModal({
  visible,
  targetType,
  targetId,
  targetName,
  reportedUserId,
  orderContext,
  onClose,
  onSubmitSuccess,
}: ReportModalProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [details, setDetails] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const isListingReport = targetType === 'listing';
  const reasons = isListingReport
    ? [t('feed.reportSpam'), t('feed.reportInappropriate'), t('feed.reportWrongCategory'), t('feed.reportMisleading'), t('feed.reportOther')]
    : REASONS_MAP[targetType] || REASONS_MAP.profile;

  const handleSubmit = async () => {
    if (!selectedReason) {
      toast.error(t('common.error'), isListingReport ? t('feed.reportSelectReason') : 'Please select why you are reporting this');
      return;
    }

    setLoading(true);
    try {
      await submitReport({
        targetType,
        targetId,
        reportedUserId,
        reason: selectedReason,
        details: details.trim() || undefined,
        orderContext,
      });

      toast.success(
        isListingReport ? t('feed.reportThanks') : 'Report submitted',
        isListingReport ? t('feed.reportThankMsg') : 'Our moderation team will review this promptly.',
      );
      setSelectedReason('');
      setDetails('');
      onClose();
      onSubmitSuccess?.();
    } catch (err: any) {
      const msg = err?.message || 'Failed to submit report. Please try again.';
      toast.error(t('common.error'), msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setSelectedReason('');
    setDetails('');
    onClose();
  };

  const titleType =
    targetType === 'profile'
      ? 'Profile'
      : targetType === 'review'
      ? 'Review'
      : targetType === 'reply'
      ? 'Reply'
      : 'Order';
  const title = isListingReport ? t('feed.reportTitle') : `Report ${titleType}`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <MaterialCommunityIcons name="flag-outline" size={24} color={COLORS.coral} />
            <Text style={styles.title}>{title}</Text>
          </View>

          {!!targetName && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {targetName}
            </Text>
          )}

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionLabel}>{isListingReport ? t('feed.reportMessage') : 'Why are you reporting this?'}</Text>
            <View style={styles.reasonsList}>
              {reasons.map((r) => {
                const isSelected = selectedReason === r;
                return (
                  <TouchableOpacity
                    key={r}
                    style={[styles.reasonOption, isSelected && styles.reasonOptionSelected]}
                    onPress={() => setSelectedReason(r)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons
                      name={isSelected ? 'radiobox-marked' : 'radiobox-blank'}
                      size={20}
                      color={isSelected ? COLORS.coral : COLORS.text3}
                    />
                    <Text
                      style={[
                        styles.reasonText,
                        isSelected && styles.reasonTextSelected,
                      ]}
                    >
                      {r}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.sectionLabel, { marginTop: SPACING.md }]}> 
              {isListingReport ? t('feed.reportDetailsLabel') : 'Additional details (optional)'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={isListingReport ? t('feed.reportDetailsPlaceholder') : 'Provide any context that helps our team review this...'}
              placeholderTextColor={COLORS.text3}
              value={details}
              onChangeText={setDetails}
              multiline
              numberOfLines={3}
              maxLength={500}
            />
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.cancelBtn]}
              onPress={handleClose}
              disabled={loading}
              accessibilityRole="button"
            >
              <Text style={styles.cancelBtnText}>{isListingReport ? t('common.cancel') : 'Cancel'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.submitBtn]}
              onPress={handleSubmit}
              disabled={loading || !selectedReason}
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>{isListingReport ? t('feed.submitReport') : 'Submit Report'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modal: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '85%',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    padding: SPACING.lg,
    ...SHADOW.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text3,
    marginBottom: SPACING.sm,
  },
  body: {
    maxHeight: 340,
  },
  sectionLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.text2,
    marginBottom: SPACING.xs,
  },
  reasonsList: {
    gap: SPACING.xs,
  },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: TOUCH.min,
  },
  reasonOptionSelected: {
    borderColor: COLORS.coral,
    backgroundColor: COLORS.coral + '0D',
  },
  reasonText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    flex: 1,
  },
  reasonTextSelected: {
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.coral,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    color: COLORS.text,
    fontSize: FONT_SIZES.sm,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  btn: {
    flex: 1,
    minHeight: TOUCH.min,
    borderRadius: RADIUS.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface2,
  },
  cancelBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.text2,
  },
  submitBtn: {
    backgroundColor: COLORS.coral,
  },
  submitBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#fff',
  },
});
