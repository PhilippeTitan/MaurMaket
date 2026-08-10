import React from 'react';
import { OnboardingContainer } from './onboarding';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation';

type Props = NativeStackScreenProps<AuthStackParamList, 'Signup'>;

export default function SignupScreen(_props: Props) {
  return <OnboardingContainer initialMode="signup" />;
}
