import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLike, useWishlist } from '../hooks/useEngagement';
import { COLORS } from '../theme';
import { useTranslation } from '../i18n';

interface ProductActionBarProps {
  productId: string;
  variant?: 'card' | 'detail';
  style?: any;
}

export default function ProductActionBar({ productId, variant = 'card', style }: ProductActionBarProps) {
  const { t } = useTranslation();
  const { liked, likeCount, toggle: toggleLike } = useLike(productId);
  const { wishlisted, toggle: toggleWishlist } = useWishlist(productId);

  if (variant === 'detail') {
    return (
      <View style={[detailStyles.container, style]}>
        <TouchableOpacity
          style={[detailStyles.btn, liked && detailStyles.btnActive]}
          onPress={() => toggleLike()}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={liked ? t('accessibility.unlike') : t('accessibility.like')}
        >
          <MaterialCommunityIcons
            name={liked ? 'heart' : 'heart-outline'}
            size={24}
            color={liked ? COLORS.coral : COLORS.text}
          />
          {likeCount > 0 && <Text style={detailStyles.count}>{likeCount}</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[detailStyles.btn, wishlisted && detailStyles.btnActive]}
          onPress={() => toggleWishlist()}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={wishlisted ? t('accessibility.removeFromWishlist') : t('accessibility.addToWishlist')}
        >
          <MaterialCommunityIcons
            name={wishlisted ? 'bookmark' : 'bookmark-outline'}
            size={24}
            color={wishlisted ? COLORS.coral : COLORS.text}
          />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[cardStyles.container, style]}>
      <TouchableOpacity
        style={cardStyles.btn}
        onPress={() => toggleLike()}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={liked ? t('accessibility.unlike') : t('accessibility.like')}
      >
        <MaterialCommunityIcons
          name={liked ? 'heart' : 'heart-outline'}
          size={18}
          color={liked ? COLORS.coral : COLORS.text2}
        />
      </TouchableOpacity>
      <TouchableOpacity
        style={cardStyles.btn}
        onPress={() => toggleWishlist()}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={wishlisted ? t('accessibility.removeFromWishlist') : t('accessibility.addToWishlist')}
      >
        <MaterialCommunityIcons
          name={wishlisted ? 'bookmark' : 'bookmark-outline'}
          size={18}
          color={wishlisted ? COLORS.coral : COLORS.text2}
        />
      </TouchableOpacity>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  btn: {
    padding: 4,
  },
});

const detailStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 8,
  },
  btnActive: {},
  count: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '500',
  },
});
