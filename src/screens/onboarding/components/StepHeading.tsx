import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../../../theme';

interface StepHeadingProps {
  eyebrow: string;
  title: string;
}

export default function StepHeading({ eyebrow, title }: StepHeadingProps) {
  return (
    <View style={styles.stepHeading}>
      <Text style={styles.stepEyebrow}>{eyebrow}</Text>
      <Text style={styles.stepTitle}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stepHeading: { marginBottom: 20 },
  stepEyebrow: {
    fontSize: 12.5, fontWeight: '700', color: COLORS.coral, textTransform: 'uppercase',
    letterSpacing: 0.6, marginBottom: 6,
  },
  stepTitle: {
    fontFamily: 'Syne', fontSize: 26, fontWeight: '800', color: COLORS.text, lineHeight: 30,
  },
});
