import React, { useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Svg, Path } from 'react-native-svg';
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

export function PaperPlaneIcon({ size = 24, color = COLORS.text }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M22 2L11 13" />
      <Path d="M22 2L15 22L11 13L2 9L22 2z" />
    </Svg>
  );
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
  const ringPad = resolvedRing ? 4 : 0;
  const outerSize = size + ringPad * 2;

  return (
    <View style={[{ width: outerSize, height: outerSize, alignItems: 'center', justifyContent: 'center', borderRadius: outerSize / 2, overflow: 'hidden' }, resolvedRing && { borderWidth: 3, borderColor: resolvedRing, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 3 }]}>
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
