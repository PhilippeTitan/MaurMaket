import React from 'react';
import AuthScreen from '../components/AuthScreen';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen(_props: Props) {
  return <AuthScreen initialMode="signin" />;
}
