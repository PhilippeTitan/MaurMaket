import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

const screenFill = StyleSheet.absoluteFill;

export default function OnboardingBackground() {
  return (
    <View style={[screenFill, styles.root]} pointerEvents="none">
      <Image
        source={require('../../../../assets/PURPLE BACKGROUND.webp')}
        style={[styles.image, { position: 'absolute' }]}
        resizeMode="cover"
      />
      <Image
        source={require('../../../../assets/onboarding-bg-literal.webp')}
        style={[styles.image, { position: 'absolute', opacity: 0.6 }]}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
