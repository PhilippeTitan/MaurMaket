import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SkeletonBlock } from '../Skeleton';
import { COLORS, RADIUS, SPACING } from '../../theme';
import { useProfileLayout } from './layout';

/** Tile height pattern — varied so the skeleton matches a real masonry grid. */
const TILE_HEIGHTS = [190, 150, 230, 170, 210, 160];

/**
 * Layout-matched skeleton for a profile: identity header, trust line, actions,
 * tabs and masonry tiles at the exact widths the real content will occupy, so
 * loading fades into the profile without a layout jump.
 */
export default function ProfileSkeleton({ showHeader = true }: { showHeader?: boolean }) {
  const { columns, gridWidth } = useProfileLayout();
  const gap = SPACING.xs;
  const tileW = (gridWidth - gap * (columns - 1)) / columns;
  const columnsArr = Array.from({ length: columns }, (_, i) =>
    TILE_HEIGHTS.filter((_, idx) => idx % columns === i),
  );

  return (
    <View>
      {showHeader && (
        <View style={styles.headerBlock}>
          <View style={styles.identityRow}>
            <SkeletonBlock width={72} height={72} radius={36} />
            <View style={styles.identityLines}>
              <SkeletonBlock width="62%" height={18} radius={6} />
              <SkeletonBlock width="40%" height={12} radius={6} style={{ marginTop: 10 }} />
              <SkeletonBlock width="76%" height={12} radius={6} style={{ marginTop: 8 }} />
            </View>
          </View>
          <SkeletonBlock width="100%" height={44} radius={RADIUS.button} style={{ marginTop: SPACING.lg }} />
          <View style={styles.actionRow}>
            <SkeletonBlock width="55%" height={44} radius={RADIUS.button} />
            <SkeletonBlock width={44} height={44} radius={RADIUS.button} />
          </View>
        </View>
      )}

      <View style={styles.tabRow}>
        <SkeletonBlock width={78} height={16} radius={6} />
        <SkeletonBlock width={78} height={16} radius={6} />
      </View>

      <View style={[styles.grid, { width: gridWidth, gap }]}>
        {columnsArr.map((heights, colIdx) => (
          <View key={colIdx} style={[styles.column, { width: tileW, gap }]}>
            {heights.map((h, i) => (
              <SkeletonBlock key={i} width="100%" height={h} radius={RADIUS.media} />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerBlock: { paddingBottom: SPACING.lg },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  identityLines: { flex: 1 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.md },
  tabRow: {
    flexDirection: 'row',
    gap: SPACING.xl,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  grid: { flexDirection: 'row', alignItems: 'flex-start' },
  column: { flexDirection: 'column' },
});
