import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING } from '../../theme';

export interface ProfileTabItem {
  key: string;
  label: string;
}

interface Props {
  tabs: ProfileTabItem[];
  active: string;
  onChange: (key: string) => void;
  /** `sticky` is the compact variant used inside the collapsing header. */
  variant?: 'flow' | 'sticky';
}

/**
 * Listings / Reviews (and the owner-only Saved) navigation, shared by both
 * profile surfaces so the two screens read as one system. Text labels instead
 * of icon-only tabs: the sections are the profile's table of contents, and the
 * active underline keeps the current one obvious in both variants.
 */
export default function ProfileTabs({ tabs, active, onChange, variant = 'flow' }: Props) {
  const sticky = variant === 'sticky';
  return (
    <View style={[styles.bar, sticky && styles.barSticky]}>
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, sticky && styles.tabSticky]}
            onPress={() => onChange(tab.key)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: isActive }}
          >
            <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
              {tab.label}
            </Text>
            <View style={[styles.underline, isActive && styles.underlineActive]} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  barSticky: {
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: SPACING.sm,
    paddingBottom: 10,
    minHeight: 44,
    gap: 6,
  },
  tabSticky: {
    paddingTop: 6,
    paddingBottom: 6,
    minHeight: 40,
  },
  label: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.text2,
  },
  labelActive: { color: COLORS.text },
  underline: {
    height: 2,
    width: 26,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  underlineActive: { backgroundColor: COLORS.coral },
});
