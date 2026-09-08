import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../../theme';

interface StepHeadingProps {
  eyebrow: string;
  title: string;
}

export default function StepHeading({ eyebrow, title }: StepHeadingProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(7)).current;

  useEffect(() => {
    opacity.setValue(0);
    translateY.setValue(7);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, friction: 7, tension: 90, useNativeDriver: true }),
    ]).start();
  }, [eyebrow, title, opacity, translateY]);

  return (
    <Animated.View style={[styles.stepHeading, { opacity, transform: [{ translateY }] }]}>
      <View style={styles.eyebrowRow}>
        <View style={styles.eyebrowDot} />
        <Text style={styles.stepEyebrow}>{eyebrow}</Text>
      </View>
      <Text style={styles.stepTitle}>{title}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stepHeading: { marginBottom: 21 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7, gap: 7 },
  eyebrowDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.coral },
  stepEyebrow: {
    fontSize: 11.5,
    fontWeight: '800',
    color: COLORS.coral,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  stepTitle: {
    fontFamily: 'Syne',
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
    lineHeight: 32,
    maxWidth: 330,
  },
});