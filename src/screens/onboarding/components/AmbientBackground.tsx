import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet, Dimensions } from 'react-native';
import { COLORS } from '../../../theme';

const { width: SCREEN_W } = Dimensions.get('window');

export default function AmbientBackground() {
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const blobATranslateY = drift.interpolate({ inputRange: [0, 1], outputRange: [0, 26] });
  const blobBTranslateY = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -20] });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.blob, styles.blobA, { transform: [{ translateY: blobATranslateY }] }]} />
      <Animated.View style={[styles.blob, styles.blobB, { transform: [{ translateY: blobBTranslateY }] }]} />
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
  blobA: {
    width: SCREEN_W * 0.75,
    height: SCREEN_W * 0.75,
    top: -SCREEN_W * 0.35,
    right: -SCREEN_W * 0.3,
    backgroundColor: 'rgba(255,77,106,0.10)',
  },
  blobB: {
    width: SCREEN_W * 0.6,
    height: SCREEN_W * 0.6,
    bottom: -SCREEN_W * 0.25,
    left: -SCREEN_W * 0.28,
    backgroundColor: 'rgba(139,92,246,0.06)',
    shadowColor: COLORS.purple,
  },
});
