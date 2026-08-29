import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLike } from '../hooks/useEngagement';
import { COLORS } from '../theme';

interface Props {
  productId: string;
  size?: number;
}

export default function FeedLikeButton({ productId, size = 35 }: Props) {
  const { liked, likeCount, toggle } = useLike(productId);

  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={() => toggle()}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={liked ? 'Unlike' : 'Like'}
    >
      <MaterialCommunityIcons
        name={liked ? 'heart' : 'heart-outline'}
        size={size}
        color={liked ? COLORS.coral : COLORS.white}
      />
      <Text style={styles.count}>{Number(likeCount) || 0}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    padding: 4,
  },
  count: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
});
