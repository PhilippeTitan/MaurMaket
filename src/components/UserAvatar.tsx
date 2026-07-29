import React, { useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { COLORS, TIER_COLORS } from '../theme';
import { getSellerAvatar, getDisplayName } from '../theme';
import { getImageUrl } from '../api';
import UserIcon from './icons/user';

interface UserAvatarProps {
  seller?: { avatar_url?: string | null; store_logo_url?: string | null; use_store_identity?: boolean; full_name?: string; username?: string | null; seller_tier?: string } | null;
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

  const tier = seller?.seller_tier;
  const resolvedRing = ringColor || (tier ? TIER_COLORS[tier] : undefined);

  const r = size / 2;
  const ringPad = resolvedRing ? 3 : 0;
  const outerSize = size + ringPad * 2;

  return (
    <View style={[{ width: outerSize, height: outerSize, alignItems: 'center', justifyContent: 'center' }, resolvedRing && { borderRadius: r + ringPad, borderWidth: 2, borderColor: resolvedRing }]}>
      <View style={[styles.container, { width: size, height: size, borderRadius: r }]}>
        {avatarUrl && !failed ? (
          <Image
            source={{ uri: avatarUrl }}
            style={{ width: size, height: size, borderRadius: r }}
            onError={() => setFailed(true)}
            accessibilityLabel={`Avatar for ${label}`}
          />
        ) : (
          <UserIcon size={size * 0.5} color={COLORS.text2} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
