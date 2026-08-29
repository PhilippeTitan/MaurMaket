import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useWishlist } from '../hooks/useEngagement';
import { COLORS } from '../theme';

interface Props {
  productId: string;
  size?: number;
}

export default function FeedSaveButton({ productId, size = 35 }: Props) {
  const { wishlisted, toggle } = useWishlist(productId);

  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={() => toggle()}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={wishlisted ? 'Remove from saved' : 'Save'}
    >
      <MaterialCommunityIcons
        name={wishlisted ? 'bookmark' : 'bookmark-outline'}
        size={size}
        color={wishlisted ? COLORS.coral : COLORS.white}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    padding: 4,
  },
});
