import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SignupWizard from './SignupWizard';
import SigninForm from './SigninForm';
import ForgotPasswordSheet from '../../components/ForgotPasswordSheet';
import AuthVisual from './components/AuthVisual';

type AuthMode = 'signup' | 'signin';

interface OnboardingContainerProps {
  initialMode?: AuthMode;
}

function AmbientMark() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 2800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 2800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const translateY = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });

  return (
    <Animated.View pointerEvents="none" style={[styles.ambient, { transform: [{ translateY }, { scale }] }]}>
      <View style={styles.ambientRing} />
      <View style={styles.ambientDot} />
    </Animated.View>
  );
}

export default function OnboardingContainer({ initialMode = 'signup' }: OnboardingContainerProps) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [forgotOpen, setForgotOpen] = useState(false);
  const transition = useRef(new Animated.Value(1)).current;

  const switchMode = () => {
    Animated.sequence([
      Animated.timing(transition, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(transition, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
    setMode(current => current === 'signup' ? 'signin' : 'signup');
  };

  const contentStyle = {
    opacity: transition,
    transform: [{ translateY: transition.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.topBar}>
          <View style={styles.brandLockup}>
            <View style={styles.brandGlyph}>
              <MaterialCommunityIcons name="storefront-outline" size={16} color="#fff" />
            </View>
            <Text style={styles.brandText}>Maur<Text style={styles.brandAccent}>Maket</Text></Text>
          </View>
          <View style={styles.securePill}>
            <MaterialCommunityIcons name="shield-check-outline" size={14} color={COLORS.green} />
            <Text style={styles.secureText}>Secure</Text>
          </View>
        </View>

        {mode === 'signup' && <AuthVisual />}
        <AmbientMark />

        <Animated.View style={[styles.content, contentStyle]}>
          {mode === 'signup' ? (
            <SignupWizard switchMode={switchMode} />
          ) : (
            <SigninForm switchMode={switchMode} onForgotPassword={() => setForgotOpen(true)} />
          )}
        </Animated.View>
      </ScrollView>

      <ForgotPasswordSheet visible={forgotOpen} onClose={() => setForgotOpen(false)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flexGrow: 1, paddingHorizontal: SPACING.lg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 2 },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandGlyph: { width: 30, height: 30, borderRadius: 9, backgroundColor: COLORS.coral, alignItems: 'center', justifyContent: 'center' },
  brandText: { fontFamily: 'Syne', fontSize: 17, fontWeight: '800', color: COLORS.text },
  brandAccent: { color: COLORS.coral },
  securePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  secureText: { color: COLORS.text2, fontSize: 11.5, fontWeight: '700' },
  ambient: { position: 'absolute', top: 54, right: -42, width: 150, height: 150, alignItems: 'center', justifyContent: 'center', opacity: 0.5 },
  ambientRing: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 1, borderColor: COLORS.coral, opacity: 0.22 },
  ambientDot: { width: 54, height: 54, borderRadius: 27, backgroundColor: COLORS.coral, opacity: 0.08 },
  content: { flex: 1 },
});