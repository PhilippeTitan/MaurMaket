import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import { Icon } from '../icons/Icon';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, RADIUS, SPACING, TOUCH } from '../../theme';
import { useReduceMotion } from '../../hooks';

interface OwnerActionsProps {
  variant: 'owner';
  /** The prominent labelled button: Seller Tools on a seller's own tab, Edit Profile otherwise. */
  primaryLabel: string;
  shareLabel: string;
  /** Label for the square icon button, which opens Edit Profile. */
  iconLabel?: string;
  onPrimary: () => void;
  onShare: () => void;
  onIconPress?: () => void;
}

interface VisitorActionsProps {
  variant: 'visitor';
  messageLabel: string;
  followLabel: string;
  followingLabel: string;
  following: boolean;
  messageBusy?: boolean;
  followBusy?: boolean;
  onMessage: () => void;
  onFollow: () => void;
}

type Props = OwnerActionsProps | VisitorActionsProps;

/**
 * Profile actions, shared by both surfaces.
 *
 * Owner: one prominent context button (Seller Tools for a seller, Edit Profile
 * otherwise) with Share beside it, and a pencil icon that opens Edit Profile —
 * the old visitor-preview eye was removed on Philippe's call (Session 422).
 * Visitor: Message is the primary action (shopping happens on the listing
 * page), Follow is secondary and updates immediately with a small state change.
 */
export default function ProfileActions(props: Props) {
  if (props.variant === 'owner') {
    const { primaryLabel, shareLabel, iconLabel, onPrimary, onShare, onIconPress } = props;
    return (
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.ownerBtn}
          onPress={onPrimary}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
        >
          <Text style={styles.ownerBtnText}>{primaryLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.ownerBtn}
          onPress={onShare}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={shareLabel}
        >
          <Text style={styles.ownerBtnText}>{shareLabel}</Text>
        </TouchableOpacity>
        {onIconPress ? (
          <TouchableOpacity
            style={styles.ownerIconBtn}
            onPress={onIconPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={iconLabel}
          >
            <MaterialCommunityIcons name="pencil" size={20} color={COLORS.text} />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  const { messageLabel, followLabel, followingLabel, following, messageBusy, followBusy, onMessage, onFollow } = props;
  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.primaryBtn, messageBusy && styles.busy]}
        onPress={onMessage}
        disabled={messageBusy}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={messageLabel}
      >
        {messageBusy ? (
          <ActivityIndicator size="small" color={COLORS.white} />
        ) : (
          <>
            <Icon name="message" size={16} color={COLORS.white} />
            <Text style={styles.primaryText}>{messageLabel}</Text>
          </>
        )}
      </TouchableOpacity>
      <FollowToggle
        following={following}
        followLabel={followLabel}
        followingLabel={followingLabel}
        busy={!!followBusy}
        onPress={onFollow}
      />
    </View>
  );
}

function FollowToggle({
  following,
  followLabel,
  followingLabel,
  busy,
  onPress,
}: {
  following: boolean;
  followLabel: string;
  followingLabel: string;
  busy: boolean;
  onPress: () => void;
}) {
  const reduceMotion = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion) return;
    scale.setValue(0.94);
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 180, useNativeDriver: true }).start();
  }, [following, reduceMotion, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[styles.followBtn, following && styles.followBtnActive, busy && styles.busy]}
        onPress={onPress}
        disabled={busy}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={following ? followingLabel : followLabel}
        accessibilityState={{ selected: following }}
      >
        {busy ? (
          <ActivityIndicator size="small" color={COLORS.coral} />
        ) : (
          <>
            <MaterialCommunityIcons
              name={following ? 'heart' : 'heart-outline'}
              size={16}
              color={following ? COLORS.text2 : COLORS.coral}
            />
            <Text style={[styles.followText, following && styles.followTextActive]}>
              {following ? followingLabel : followLabel}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  ownerBtn: {
    flex: 1,
    minHeight: TOUCH.min,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
  },
  ownerBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.text,
  },
  ownerIconBtn: {
    width: TOUCH.recommended,
    height: TOUCH.recommended,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    flex: 1,
    minHeight: TOUCH.min,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.coral,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
  },
  primaryText: { fontSize: FONT_SIZES.lg, fontWeight: FONT_WEIGHTS.bold, color: COLORS.white },
  secondaryBtn: {
    flex: 1,
    minHeight: TOUCH.min,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
  },
  secondaryText: { fontSize: FONT_SIZES.lg, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.text },
  secondaryIconBtn: {
    width: TOUCH.recommended,
    height: TOUCH.recommended,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followBtn: {
    minHeight: TOUCH.min,
    borderRadius: RADIUS.button,
    borderWidth: 1.5,
    borderColor: COLORS.coral,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: SPACING.lg,
  },
  followBtnActive: { borderColor: COLORS.border, backgroundColor: COLORS.surface2 },
  followText: { fontSize: FONT_SIZES.lg, fontWeight: FONT_WEIGHTS.bold, color: COLORS.coral },
  followTextActive: { color: COLORS.text2 },
  busy: { opacity: 0.65 },
});
