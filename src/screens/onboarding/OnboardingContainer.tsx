import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { COLORS } from '../../theme';
import AnimatedOnboarding from './AnimatedOnboarding';
import AnimatedSignin from './AnimatedSignin';
import OriginalSignupWizard from './OriginalSignupWizard';
import ForgotPasswordSheet from '../../components/ForgotPasswordSheet';

type AuthMode = 'signup' | 'signin' | 'wizard';

interface OnboardingContainerProps {
  initialMode?: AuthMode;
}

export default function OnboardingContainer({ initialMode = 'signup' }: OnboardingContainerProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [forgotOpen, setForgotOpen] = useState(false);

  const switchMode = () => setMode(m => m === 'signup' ? 'signin' : 'signup');
  const [googleInfo, setGoogleInfo] = useState<{ firstName: string; lastName: string; email: string; birthDate?: string; googleIdToken: string } | null>(null);
  const handleGoogleComplete = (result: { firstName: string; lastName: string; email: string; birthDate?: string; googleIdToken: string }) => {
    setGoogleInfo(result);
    setMode('wizard');
  };

  return (
    <View style={styles.container}>
      {mode === 'signup' ? (
        <AnimatedOnboarding
          onSwitchToSignin={switchMode}
          onNaturalComplete={() => setMode('wizard')}
          onGoogleComplete={handleGoogleComplete}
        />
      ) : mode === 'wizard' ? (
        <OriginalSignupWizard initialIndex={googleInfo ? 3 : 1} initialGoogleInfo={googleInfo || undefined} onSwitchToSignin={() => setMode('signin')} />
      ) : (
        <AnimatedSignin onSwitchToSignup={switchMode} onAccountMissing={() => setMode('wizard')} onForgotPassword={() => setForgotOpen(true)} />
      )}
      <ForgotPasswordSheet visible={forgotOpen} onClose={() => setForgotOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
});
