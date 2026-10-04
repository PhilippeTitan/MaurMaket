import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';
import { COLORS } from '../../../theme';
import { useViewport } from '@/hooks';
import { useReduceMotion } from '@/hooks/useReduceMotion';

export default function AmbientBackground() {
  // Blob geometry is a fraction of the live window width, so the glow keeps its
  // proportions when the window is resized, rotated or opened in split screen — the
  // module-scope snapshot this used to read froze it at whatever size the app booted in.
  const vp = useViewport();
  const blobASize = vp.width * 0.75;
  const blobBSize = vp.width * 0.6;
  const blobA = { width: blobASize, height: blobASize, top: -vp.width * 0.35, right: -vp.width * 0.3 };
  const blobB = { width: blobBSize, height: blobBSize, bottom: -vp.width * 0.25, left: -vp.width * 0.28 };
  const drift = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (reduceMotion) {
      drift.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift, reduceMotion]);

  const blobATranslateY = drift.interpolate({ inputRange: [0, 1], outputRange: [0, 26] });
  const blobBTranslateY = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -20] });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.blob, styles.blobA, blobA, { transform: [{ translateY: blobATranslateY }] }]} />
      <Animated.View style={[styles.blob, styles.blobB, blobB, { transform: [{ translateY: blobBTranslateY }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  blob: {
    position: 'absolute',
    borderRadius: 999,
    shadowColor: COLORS.coral,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 80,
    elevation: 0,
  },
  // Geometry (width/height/offsets) comes per-render from the live window; these carry
  // the parts that never change.
  blobA: {
    backgroundColor: 'rgba(255,77,106,0.10)',
  },
  blobB: {
    backgroundColor: 'rgba(139,92,246,0.06)',
    shadowColor: COLORS.purple,
  },
});
