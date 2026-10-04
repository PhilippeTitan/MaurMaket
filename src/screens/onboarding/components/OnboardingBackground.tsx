import React from 'react';
import { StyleSheet, View } from 'react-native';
import { COLORS } from '../../../theme';

const screenFill = StyleSheet.absoluteFill;

export default function OnboardingBackground() {
  return <View style={[screenFill, styles.root]} pointerEvents="none" />;
}

const styles = StyleSheet.create({
  root: { backgroundColor: COLORS.bg },
});
