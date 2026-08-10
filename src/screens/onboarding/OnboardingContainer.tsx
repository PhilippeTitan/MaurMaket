import React, { useState } from 'react';
import {
  View, KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
} from 'react-native';
import { COLORS, SPACING } from '../../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SignupWizard from './SignupWizard';
import SigninForm from './SigninForm';
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + SPACING.lg }]}
        keyboardShouldPersistTaps="handled"
      >
        {mode === 'signup' ? (
          <SignupWizard switchMode={switchMode} />
        ) : (
          <SigninForm switchMode={switchMode} onForgotPassword={() => setForgotOpen(true)} />
        )}
      </ScrollView>
      <ForgotPasswordSheet visible={forgotOpen} onClose={() => setForgotOpen(false)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flexGrow: 1, paddingHorizontal: SPACING.xl, justifyContent: 'center' },
});
