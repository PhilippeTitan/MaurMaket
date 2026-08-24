import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS } from '../theme';

interface Props {
  /** Loading message shown below the spinner */
  message?: string;
  /** Spinner color. Defaults to COLORS.coral */
  color?: string;
  /** Full-screen mode with centered content. Defaults to true */
  fullScreen?: boolean;
}

/**
 * Shared loading state shown during initial data fetches.
 * Used by screens that need to show a centered spinner while data loads.
 *
 * For skeleton loading, use SkeletonBlock / RowListSkeleton / ProductGridSkeleton instead.
 */
export default function LoadingState({
  message,
  color = COLORS.coral,
  fullScreen = true,
}: Props) {
  return (
    <View style={[styles.container, fullScreen && styles.fullScreen]}>
      <ActivityIndicator size="large" color={color} />
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
  },
  fullScreen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  message: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.text2,
  },
});
