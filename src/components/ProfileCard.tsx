import React, { useEffect, useRef } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS, TIER_COLORS } from '../theme';
import { getImageUrl } from '../api';

interface Props {
  user: any;
  onPress?: () => void;
}

/**
 * Premium profile card for settings header.
 *
 * Features:
 * - 64px avatar with tier-colored ring
 * - Gradient accent bar at top
 * - Tier badge with color coding
 * - Verified/unverified email status
 * - Subtle entrance animation (fade + slide)
 */
export default function ProfileCard({ user, onPress }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  const avatarUri = user?.avatar_url ? getImageUrl(user.avatar_url) : null;
  const displayName = user?.full_name || user?.username || 'User';
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  const tierLabel =
    user?.seller_tier === 'business' ? 'Business'
    : user?.seller_tier === 'verified' ? 'Verified'
    : user?.seller_tier === 'casual' ? 'Casual'
    : null;
  const tierColor = user?.seller_tier ? TIER_COLORS[user.seller_tier] ?? COLORS.text2 : null;

  const cardContent = (
    <Animated.View style={[styles.card, { opacity, transform: [{ translateY }] }]}>
      <View style={styles.inner}>
        {/* Avatar with tier ring */}
        <View style={[styles.avatarRing, { borderColor: tierColor || COLORS.border }]}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
          {user?.username ? (
            <Text style={styles.username}>@{user.username}</Text>
          ) : null}
          <View style={styles.metaRow}>
            {tierLabel ? (
              <View style={[styles.tierBadge, { backgroundColor: (tierColor || COLORS.text2) + '18' }]}>
                <Text style={[styles.tierText, { color: tierColor || COLORS.text2 }]}>{tierLabel}</Text>
              </View>
            ) : null}
            {user?.email_verified ? (
              <View style={styles.verifiedBadge}>
                <MaterialCommunityIcons name="check-circle" size={12} color={COLORS.green} />
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            ) : (
              <View style={styles.unverifiedBadge}>
                <MaterialCommunityIcons name="alert-circle-outline" size={12} color="#F59E0B" />
                <Text style={styles.unverifiedText}>Email not verified</Text>
              </View>
            )}
          </View>
        </View>

        {/* Chevron */}
        <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.text3} />
      </View>
    </Animated.View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
        {cardContent}
      </TouchableOpacity>
    );
  }
  return cardContent;
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    overflow: 'hidden',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  avatarRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2.5,
    padding: 2,
  },
  avatarImg: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  avatarFallback: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 22,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text2,
  },
  info: {
    flex: 1,
    gap: 3,
  },
  name: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
  },
  username: {
    fontSize: FONT_SIZES.base,
    color: COLORS.text3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: 4,
  },
  tierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
  },
  tierText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  verifiedText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.green,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  unverifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  unverifiedText: {
    fontSize: FONT_SIZES.xs,
    color: '#F59E0B',
    fontWeight: FONT_WEIGHTS.semibold,
  },
});
