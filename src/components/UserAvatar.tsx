import React, { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { COLORS } from '../theme';
import { getSellerAvatar, getDisplayName } from '../theme';
import { getImageUrl } from '../api';

interface UserAvatarProps {
  seller?: { avatar_url?: string | null; store_logo_url?: string | null; use_store_identity?: boolean; full_name?: string } | null;
  name?: string;
  uri?: string;
  size?: number;
  ringColor?: string;
}

export default function UserAvatar({ seller, name, uri, size = 35, ringColor }: UserAvatarProps) {
  const [failed, setFailed] = useState(false);

  const avatarUrl = uri
    ? getImageUrl(uri)
    : seller
      ? getImageUrl(getSellerAvatar(seller))
      : null;

  const label = name || getDisplayName(seller) || '?';
  const initial = label.charAt(0).toUpperCase();

  const r = size / 2;
  const fontSize = size * 0.38;
  const ringPad = ringColor ? 3 : 0;
  const outerSize = size + ringPad * 2;

  return (
    <View style={[{ width: outerSize, height: outerSize }, ringColor && { borderRadius: r + ringPad, borderWidth: 1.5, borderColor: ringColor }]}>
      <View style={[styles.container, { width: size, height: size, borderRadius: r }]}>
        {avatarUrl && !failed ? (
          <Image
            source={{ uri: avatarUrl }}
            style={{ width: size, height: size, borderRadius: r }}
            onError={() => setFailed(true)}
          />
        ) : (
          <Text style={[styles.initial, { fontSize }]}>{initial}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.coral,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initial: {
    color: COLORS.white,
    fontWeight: '700',
  },
});
