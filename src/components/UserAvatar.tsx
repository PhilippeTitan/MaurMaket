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
  // Ring thickness scales with avatar size so it reads as a crisp outline
  // at both small (35px feed) and large (86px profile) sizes.
  const ringWidth = resolvedRing ? Math.max(3, Math.round(size * 0.13)) : 0;
  const ringGap = resolvedRing ? 2 : 0; // small breathing room between photo and ring
  const outerSize = size + (ringWidth + ringGap) * 2;

  // Manual glow instead of shadowColor/elevation: RN's `elevation` (Android)
  // ignores shadowColor and always renders a plain dark shadow, so a
  // tier-colored glow would silently not appear on Android with the
  // shadow-prop approach. This fakes the glow with two stacked, oversized,
  // low-opacity circles of the ring color behind the ring — renders
  // identically on both platforms since it's just plain Views, not shadows.
  const glowSize1 = outerSize + Math.round(size * 0.22);
  const glowSize2 = outerSize + Math.round(size * 0.42);

  return (
    <View style={{ width: glowSize2, height: glowSize2, alignItems: 'center', justifyContent: 'center' }}>
      {resolvedRing && (
        <>
          <View style={{
            position: 'absolute', width: glowSize2, height: glowSize2, borderRadius: glowSize2 / 2,
            backgroundColor: resolvedRing, opacity: 0.12,
          }} />
          <View style={{
            position: 'absolute', width: glowSize1, height: glowSize1, borderRadius: glowSize1 / 2,
            backgroundColor: resolvedRing, opacity: 0.22,
          }} />
        </>
      )}
      <View style={[
        { width: outerSize, height: outerSize, alignItems: 'center', justifyContent: 'center', borderRadius: outerSize / 2 },
        resolvedRing && { borderWidth: ringWidth, borderColor: resolvedRing },
      ]}>
        <View style={[styles.container, { width: size, height: size, borderRadius: r, overflow: 'hidden' }]}>
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
