import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

export default function OnboardingBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image source={require('../../../../assets/onboarding-bg-1.webp')} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <Image source={require('../../../../assets/onboarding-bg-2.webp')} style={[StyleSheet.absoluteFill, { opacity: 0.42 }]} resizeMode="cover" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5, 4, 12, 0.46)' }]} />
    </View>
  );
}
