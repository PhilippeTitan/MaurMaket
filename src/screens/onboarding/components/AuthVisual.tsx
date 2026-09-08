import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { COLORS } from '../../../theme';

const AnimatedSvg = Animated.createAnimatedComponent(Svg);

export default function AuthVisual() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 2400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 2400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.58] });

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Animated.View style={[styles.ring, { opacity, transform: [{ scale }] }]} />
      <AnimatedSvg width={92} height={92} viewBox="0 0 92 92" style={{ transform: [{ scale }] }}>
        <Rect x="10" y="10" width="72" height="72" rx="22" fill={COLORS.surface} stroke={COLORS.border} strokeWidth="1.5" />
        <Path d="M28 38h36l-3 28H31l-3-28Z" fill={COLORS.coral} opacity="0.95" />
        <Path d="M35 38c0-7 4.8-12 11-12s11 5 11 12" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        <Path d="M39 49h14M39 56h8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
        <Circle cx="67" cy="25" r="4" fill={COLORS.green} opacity="0.9" />
      </AnimatedSvg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 112, height: 112, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 10 },
  ring: { position: 'absolute', width: 108, height: 108, borderRadius: 54, borderWidth: 1, borderColor: COLORS.coral },
});