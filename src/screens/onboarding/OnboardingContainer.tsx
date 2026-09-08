import React, { useState } from 'react';
import {
  View, StyleSheet,
} from 'react-native';
import { COLORS, SPACING } from '../../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AnimatedOnboarding from './AnimatedOnboarding';
import AnimatedSignin from './AnimatedSignin';
import ForgotPasswordSheet from '../../components/ForgotPasswordSheet';

type AuthMode = 'signup' | 'signin';

interface OnboardingContainerProps {
  initialMode?: AuthMode;
}

export default function OnboardingContainer({ initialMode = 'signup' }: OnboardingContainerProps) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [forgotOpen, setForgotOpen] = useState(false);

  const switchMode = () => {
    setMode(m => m === 'signup' ? 'signin' : 'signup');
  };

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
  container: { flex: 1, backgroundColor: '#0A0812' },
});
