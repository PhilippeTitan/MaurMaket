import React, { useState, useEffect } from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { COLORS, RADIUS } from '../theme';
import { toggleFollow } from '../api';
import { store } from '../store';
import { useTranslation } from '../i18n';

interface FollowButtonProps {
  sellerId: string;
  /** 'outline' = coral border on dark (Feed), 'filled' = dark bg (ProductDetail) */
  variant?: 'outline' | 'filled';
  size?: 'sm' | 'md';
}

export default function FollowButton({ sellerId, variant = 'outline', size = 'sm' }: FollowButtonProps) {
  const { t } = useTranslation();
  const [isFollowing, setIsFollowing] = useState(() => store.isFollowing(sellerId));

  useEffect(() => {
    const unsub = store.onChange(() => {
      setIsFollowing(store.isFollowing(sellerId));
    });
    return unsub;
  }, [sellerId]);

  const handleFollow = async () => {
    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);
    try {
      const res = (await toggleFollow(sellerId)) as { following?: boolean };
      if (typeof res.following === 'boolean') {
        setIsFollowing(res.following);
      }
    } catch {
      setIsFollowing(wasFollowing);
    }
  };

  if (variant === 'outline') {
    return (
      <TouchableOpacity
        style={[
          styles.outlineBtn,
          isFollowing && styles.outlineBtnActive,
          size === 'md' && styles.outlineBtnMd,
        ]}
        onPress={handleFollow}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={isFollowing ? t('accessibility.unfollow') : t('accessibility.follow')}
      >
        <Text
          style={[
            styles.outlineText,
            isFollowing && styles.outlineTextActive,
            size === 'md' && styles.textMd,
          ]}
        >
          {isFollowing ? t('storefront.following') : t('feed.follow')}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[
        styles.filledBtn,
        isFollowing && styles.filledBtnActive,
        size === 'md' && styles.filledBtnMd,
      ]}
      onPress={handleFollow}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={isFollowing ? t('accessibility.unfollow') : t('accessibility.follow')}
    >
      <Text
        style={[
          styles.filledText,
          isFollowing && styles.filledTextActive,
          size === 'md' && styles.textMd,
        ]}
      >
        {isFollowing ? t('storefront.following') : t('feed.follow')}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  /* Outline variant (Feed) */
  outlineBtn: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: RADIUS.media,
    borderWidth: 1,
    borderColor: COLORS.coral,
  },
  outlineBtnActive: {
    backgroundColor: COLORS.coral,
    borderColor: COLORS.coral,
  },
  outlineBtnMd: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
  },
  outlineText: {
    fontSize: 12,
    color: COLORS.coral,
    fontWeight: '700',
  },
  outlineTextActive: {
    color: COLORS.white,
  },

  /* Filled variant (ProductDetail) */
  filledBtn: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  filledBtnActive: {
    backgroundColor: COLORS.coral,
  },
  filledBtnMd: {
    borderRadius: RADIUS.pill,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  filledText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.text,
  },
  filledTextActive: {
    color: COLORS.white,
  },

  /* Shared */
  textMd: {
    fontSize: 13,
  },
});
