import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS } from '../../theme';
import { useReduceMotion } from '../../hooks';

interface Props {
  saved: boolean;
  onPress: () => void;
  label: string;
}

/**
 * Compact Save control for a listing tile: immediate bookmark fill with a tiny
 * scale pop, no count and no toast — the Saved tab is the only feedback the
 * shopper needs. The shimmer is skipped entirely under Reduce Motion.
 */
export default function SaveChip({ saved, onPress, label }: Props) {
  const reduceMotion = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (reduceMotion) return;
    scale.setValue(0.82);
    Animated.spring(scale, { toValue: 1, friction: 4, tension: 200, useNativeDriver: true }).start();
  }, [saved, reduceMotion, scale]);

  return (
    <Animated.View style={[styles.wrap, { transform: [{ scale }] }]}>
      <TouchableOpacity
        style={styles.saveIconBtn}
        onPress={onPress}
        activeOpacity={0.8}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: saved }}
      >
        <MaterialCommunityIcons
          name={saved ? 'bookmark' : 'bookmark-outline'}
          size={17}
          color={saved ? COLORS.coral : COLORS.white}
        />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 6, bottom: 6 },
  saveIconBtn: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
