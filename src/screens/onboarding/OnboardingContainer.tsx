import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { COLORS } from '../../theme';
import AnimatedOnboarding from './AnimatedOnboarding';
import AnimatedSignin from './AnimatedSignin';
import ForgotPasswordSheet from '../../components/ForgotPasswordSheet';

type AuthMode = 'signup' | 'signin';

interface OnboardingContainerProps {
  initialMode?: AuthMode;
}

export default function OnboardingContainer({ initialMode = 'signup' }: OnboardingContainerProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [forgotOpen, setForgotOpen] = useState(false);

  const switchMode = () => setMode(m => m === 'signup' ? 'signin' : 'signup');

  return (
    <View style={styles.container}>
      {mode === 'signup' ? (
        <AnimatedOnboarding onSwitchToSignin={switchMode} />
      ) : (
        <AnimatedSignin onSwitchToSignup={switchMode} onForgotPassword={() => setForgotOpen(true)} />
      )}
      <ForgotPasswordSheet visible={forgotOpen} onClose={() => setForgotOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
});
