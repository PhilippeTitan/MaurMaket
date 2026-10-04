import React from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import { Icon } from '../icons/Icon';
import { COLORS, FONTS, FONT_SIZES, FONT_WEIGHTS, SPACING, TOUCH } from '../../theme';

interface Props {
  /** 0 = collapsed bar hidden, 1 = collapsed bar fully shown (tabs row). */
  collapse: Animated.AnimatedInterpolation<number> | Animated.Value;
  collapsed: boolean;
  /** 0 = transparent, 1 = solid — fades in over the first pixels of scroll. */
  chrome?: Animated.AnimatedInterpolation<number> | Animated.Value;
  /** True once the page is scrolled: the bar turns solid and shows the mini avatar. */
  scrolled?: boolean;
  topInset: number;
  /** Back button on visitor profiles. */
  left?: React.ReactNode;
  avatar: React.ReactNode;
  name: string;
  verified?: boolean;
  right?: React.ReactNode;
  tabs: React.ReactNode;
  onIdentityPress?: () => void;
  identityLabel?: string;
  /** Show Instagram-style dropdown chevron next to username at rest. */
  showChevron?: boolean;
}

/**
 * The profile's top bar: small avatar, username, the screen's actions, and —
 * once the page is scrolled — the Listings/Reviews tabs. The identity stays
 * visible at rest (the profile block below repeats it, as people expect); only
 * the tab row fades in when the in-flow tab bar scrolls out of sight.
 */
export default function ProfileStickyBar({
  collapse,
  collapsed,
  chrome,
  scrolled = false,
  topInset,
  left,
  avatar,
  name,
  verified,
  right,
  tabs,
  onIdentityPress,
  identityLabel,
  showChevron = false,
}: Props) {
  return (
    <Animated.View
      style={[styles.wrap, { paddingTop: topInset }]}
      pointerEvents={collapsed ? 'auto' : 'box-none'}
    >
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.background, { opacity: chrome ?? collapse }]}
      />

      <View style={styles.row}>
        {left}
        <View style={styles.identity}>
          <TouchableOpacity
            style={styles.identityBtn}
            onPress={onIdentityPress}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={identityLabel || name}
          >
            {scrolled ? (
              <Animated.View style={{ opacity: chrome ?? 1 }}>{avatar}</Animated.View>
            ) : null}
            <Text style={styles.name} numberOfLines={1}>{name}</Text>
            {showChevron ? (
              <MaterialCommunityIcons name="chevron-down" size={20} color={COLORS.text} style={styles.chevron} />
            ) : null}
            {verified ? <Icon name="verified" size={15} color={COLORS.blue} /> : null}
          </TouchableOpacity>
        </View>

        <View style={styles.spacer} />
        <View style={styles.right}>{right}</View>
      </View>

      <Animated.View
        style={{ opacity: collapse }}
        pointerEvents={collapsed ? 'auto' : 'none'}
        accessibilityElementsHidden={!collapsed}
        importantForAccessibility={collapsed ? 'auto' : 'no-hide-descendants'}
      >
        {tabs}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
  },
  background: {
    backgroundColor: COLORS.bg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH.recommended,
    paddingHorizontal: SPACING.lg,
  },
  identity: { flexShrink: 1, marginLeft: 2 },
  identityBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingRight: 6 },
  name: {
    fontSize: 22,
    
    fontWeight: '800',
    color: COLORS.text,
    maxWidth: 240,
    letterSpacing: -0.3,
  },
  chevron: { marginTop: 1 },
  spacer: { flex: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
});
