import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { COLORS } from '../../../theme';

interface ProgressTrailProps {
  step: number;
  total: number;
  label: string;
}

export default function ProgressTrail({ step, total, label }: ProgressTrailProps) {
  const width = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(width, {
      toValue: step / total,
      duration: 420,
      useNativeDriver: false,
    }).start();
  }, [step, total, width]);

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={styles.stepText}>Step {step} of {total}</Text>
        <Text style={styles.stepLabel}>{label}</Text>
      </View>
      <View style={styles.track}>
        <Animated.View
          style={[
            styles.fill,
            { width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 22 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  stepText: { color: COLORS.text2, fontSize: 12, fontWeight: '600' },
  stepLabel: { color: COLORS.text3, fontSize: 12, fontWeight: '500' },
  track: { height: 4, borderRadius: 2, backgroundColor: COLORS.border, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2, backgroundColor: COLORS.coral },
});
