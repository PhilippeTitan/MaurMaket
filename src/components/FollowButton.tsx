import React, { useState, useEffect, useRef } from 'react';
import { TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS } from '../theme';
import { toggleFollow } from '../api';
import { store } from '../store';
import { useTranslation } from '../i18n';

interface FollowButtonProps {
  sellerId: string;
  size?: 'sm' | 'md';
}

export default function FollowButton({ sellerId, size = 'sm' }: FollowButtonProps) {
  const { t } = useTranslation();
  const [isFollowing, setIsFollowing] = useState(() => store.isFollowing(sellerId));
  const checkAnim = useRef(new Animated.Value(isFollowing ? 1 : 0)).current;

  useEffect(() => {
    const unsub = store.onChange(() => {
      const next = store.isFollowing(sellerId);
      setIsFollowing(next);
      Animated.timing(checkAnim, {
        toValue: next ? 1 : 0,
        duration: 200,
        useNativeDriver: false,
      }).start();
    });
    return unsub;
  }, [sellerId]);

  const handleFollow = async () => {
    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);
    Animated.timing(checkAnim, {
      toValue: !wasFollowing ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
    try {
      const res = (await toggleFollow(sellerId)) as { following?: boolean };
      if (typeof res.following === 'boolean') {
        setIsFollowing(res.following);
      }
    } catch {
      setIsFollowing(wasFollowing);
      Animated.timing(checkAnim, {
        toValue: wasFollowing ? 1 : 0,
        duration: 200,
        useNativeDriver: false,
      }).start();
    }
  };

  const pillSize = size === 'md' ? 28 : 24;
  const iconSize = size === 'md' ? 16 : 14;

  return (
    <TouchableOpacity
      style={styles.pill}
      onPress={handleFollow}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={isFollowing ? t('accessibility.unfollow') : t('accessibility.follow')}
    >
      <Animated.View style={[
        styles.ring,
        { width: pillSize, height: pillSize },
        isFollowing && styles.ringActive,
      ]}>
        <Animated.View style={[
          styles.checkWrapper,
          { width: pillSize, height: pillSize },
          {
            transform: [
              { scale: checkAnim },
            ],
            opacity: checkAnim,
          },
        ]}>
          <MaterialCommunityIcons name="check" size={iconSize} color={COLORS.white} />
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  ring: {
    borderWidth: 2,
    borderColor: COLORS.coral,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  ringActive: {
    backgroundColor: COLORS.coral,
    borderColor: COLORS.coral,
  },
  checkWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});