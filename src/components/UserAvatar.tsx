import React, { useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Svg, Path, Circle } from 'react-native-svg';
import { COLORS, TIER_COLORS } from '../theme';
import { getSellerAvatar, getDisplayName } from '../theme';
import { getImageUrl } from '../api';
import UserIcon from './icons/user';
import AnimatedTierRing from './AnimatedTierRing';

interface UserAvatarProps {
  seller?: { avatar_url?: string | null; store_logo_url?: string | null; use_store_identity?: boolean; full_name?: string; username?: string | null; seller_tier?: string } | null;
  name?: string;
  uri?: string;
  size?: number;
  ringColor?: string;
  animated?: boolean;
}

export function PaperPlaneIcon({ size = 24, color = COLORS.text }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M22 2L11 13" />
      <Path d="M22 2L15 22L11 13L2 9L22 2z" />
    </Svg>
  );
}

export default function UserAvatar({ seller, name, uri, size = 35, ringColor, animated }: UserAvatarProps) {
  const [failed, setFailed] = useState(false);

  const avatarUrl = uri
    ? getImageUrl(uri)
    : seller
      ? getImageUrl(getSellerAvatar(seller))
      : null;

  const label = name || getDisplayName(seller) || '?';

  const tier = seller?.seller_tier as 'casual' | 'verified' | 'business' | undefined;
  const resolvedRing = ringColor || (tier ? TIER_COLORS[tier] : undefined);

  if (!resolvedRing) {
    return (
      <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
        {avatarUrl && !failed ? (
          <Image
            source={{ uri: avatarUrl }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
            onError={() => setFailed(true)}
            accessibilityLabel={`Avatar for ${label}`}
          />
        ) : (
          <UserIcon size={size * 0.5} color={COLORS.text2} />
        )}
      </View>
    );
  }

  const outerSize = size * 100 / 80;

  if (tier) {
    return (
      <View style={{ width: outerSize, height: outerSize, alignItems: 'center', justifyContent: 'center' }}>
        <AnimatedTierRing tier={tier} size={outerSize} animated={animated} />
        <View style={[styles.container, { position: 'absolute', width: size, height: size, borderRadius: size / 2 }]}>
          {avatarUrl && !failed ? (
            <Image
              source={{ uri: avatarUrl }}
              style={{ width: size, height: size, borderRadius: size / 2 }}
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

  const outerSizeFallback = size * 100 / 80;

  return (
    <View style={{ width: outerSizeFallback, height: outerSizeFallback, alignItems: 'center', justifyContent: 'center' }}>
      <Svg
        width={outerSizeFallback}
        height={outerSizeFallback}
        viewBox="0 0 100 100"
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <Circle cx={50} cy={50} r={48} fill="none" stroke={resolvedRing} strokeWidth={4} />
        <Circle cx={50} cy={50} r={43} fill={COLORS.bg} />
      </Svg>
      <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
        {avatarUrl && !failed ? (
          <Image
            source={{ uri: avatarUrl }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
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
