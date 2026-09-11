import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

const screenFill = StyleSheet.absoluteFill;

export default function OnboardingBackground() {
  return (
    <View style={[screenFill, styles.root]} pointerEvents="none">
      <Image
        source={require('../../../../assets/onboarding-bg-literal.webp')}
        style={styles.image}
        resizeMode="contain"
      />

      <Image
        source={require('../../../../assets/onboarding-bg-1.webp')}
        style={styles.image}
        resizeMode="contain"
      />

      <View style={[screenFill, styles.vignette]} />
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
    alignSelf: 'center',
  },
  vignette: {
    backgroundColor: 'rgba(5, 4, 12, 0.44)',
  },
});
