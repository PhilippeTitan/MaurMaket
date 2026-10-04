import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Icon } from '../icons/Icon';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, TOUCH } from '../../theme';
import { useTranslation } from '@/localization';

interface Props {
  /** Average rating — rendered only when there are reviews behind it. */
  rating?: number | null;
  reviewCount?: number | null;
  /** Completed sales, shown once there is at least one. */
  salesCount?: number | null;
  /** Follower count; visible whenever it is known, including zero. */
  followers?: number | null;
  /** Following count; the owner sees hers so she can open the list. */
  following?: number | null;
  onRatingPress?: () => void;
  onSalesPress?: () => void;
  onFollowersPress?: () => void;
  onFollowingPress?: () => void;
}

interface Stat {
  key: string;
  value: string;
  label: string;
  accessibilityLabel: string;
  star?: boolean;
  onPress?: () => void;
}

/**
 * The profile stats row that sits beside the avatar: bold number over a quiet
 * label, the layout people already read instantly on a profile.
 *
 * Rating and completed sales lead; followers follow them. Metrics that have not
 * loaded (or that the viewer may not see) are omitted rather than rendered as a
 * misleading zero — a brand-new seller shows no rating instead of empty stars.
 */
export default function ProfileTrustRow({
  rating,
  reviewCount,
  salesCount,
  followers,
  following,
  onRatingPress,
  onSalesPress,
  onFollowersPress,
  onFollowingPress,
}: Props) {
  const { t } = useTranslation();

  const stats: Stat[] = [];

  if (typeof rating === 'number' && rating > 0 && typeof reviewCount === 'number' && reviewCount > 0) {
    stats.push({
      key: 'rating',
      value: rating.toFixed(1),
      label: t('profile.reviewsCount', { count: reviewCount }),
      accessibilityLabel: `${t('profile.ratingA11y', { rating: rating.toFixed(1) })}, ${t('profile.reviewsCount', { count: reviewCount })}`,
      star: true,
      onPress: onRatingPress,
    });
  }

  if (typeof salesCount === 'number' && salesCount > 0) {
    stats.push({
      key: 'sales',
      value: String(salesCount),
      label: t('profile.salesLabel'),
      accessibilityLabel: t('profile.salesCount', { count: salesCount }),
      onPress: onSalesPress,
    });
  }

  if (typeof followers === 'number' && onFollowersPress) {
    stats.push({
      key: 'followers',
      value: String(followers),
      label: t('storefront.followers'),
      accessibilityLabel: t('profile.followersCountA11y', { count: followers }),
      onPress: onFollowersPress,
    });
  }

  if (typeof following === 'number' && onFollowingPress) {
    stats.push({
      key: 'following',
      value: String(following),
      label: t('storefront.following'),
      accessibilityLabel: t('profile.followingCountA11y', { count: following }),
      onPress: onFollowingPress,
    });
  }

  if (stats.length === 0) return null;

  return (
    <View style={styles.row}>
      {stats.map((stat) => {
        const body = (
          <>
            <View style={styles.valueRow}>
              {stat.star ? <Icon name="rate-this" size={13} color={COLORS.yellow} /> : null}
              <Text style={styles.value}>{stat.value}</Text>
            </View>
            <Text style={styles.label} numberOfLines={1}>{stat.label}</Text>
          </>
        );

        return stat.onPress ? (
          <TouchableOpacity
            key={stat.key}
            style={styles.stat}
            onPress={stat.onPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={stat.accessibilityLabel}
          >
            {body}
          </TouchableOpacity>
        ) : (
          <View key={stat.key} style={styles.stat}>
            {body}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  stat: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 54,
    minHeight: TOUCH.min,
    paddingHorizontal: 2,
  },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  value: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
  },
  label: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.text2,
    marginTop: 3,
    textAlign: 'center',
  },
});
