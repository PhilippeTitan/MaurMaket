import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, View, Text, StyleSheet, Animated, Dimensions, Easing, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { COLORS } from '../../theme';
import { googleAuthInfo } from '../../api';
import { store } from '../../store';
import { useTranslation } from '../../i18n';
import OnboardingBackground from './components/OnboardingBackground';
import GoogleButton from './components/GoogleButton';

interface AnimatedOnboardingProps {
  onSwitchToSignin?: () => void;
  onNaturalComplete?: () => void;
  onGoogleComplete?: (result: { firstName: string; lastName: string; email: string; birthDate?: string; googleIdToken: string }) => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const RING_SIZES = [66, 110, 150, 190, 230];
const COVER_SCALE = Math.hypot(SCREEN_WIDTH, SCREEN_HEIGHT) / Math.min(...RING_SIZES) + 0.5;

function Loader({ autoExpand, onComplete, onPressChange }: {
  autoExpand: boolean;
  onComplete: () => void;
  onPressChange: (pressed: boolean) => void;
}) {
  const rings = useRef([
    new Animated.Value(1),
    new Animated.Value(1),
    new Animated.Value(1),
    new Animated.Value(1),
    new Animated.Value(1),
  ]).current;

  const holdAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const isReturning = useRef(false);
  const idleAnimations = useRef<Animated.CompositeAnimation[]>([]);
  const idleTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const fingerprintOpacity = useRef(new Animated.Value(1)).current;

  const stopIdle = () => {
    idleTimers.current.forEach(clearTimeout);
    idleTimers.current = [];
    idleAnimations.current.forEach((animation) => animation.stop());
    idleAnimations.current = [];
  };

  const startIdle = () => {
    stopIdle();
    idleAnimations.current = rings.map((ring) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(ring, {
            toValue: 1.3,
            duration: 780,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(ring, {
            toValue: 1,
            duration: 780,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      )
    );
    idleTimers.current = idleAnimations.current.map((animation, index) =>
      setTimeout(() => animation.start(), index * 180)
    );
  };

  useEffect(() => {
    startIdle();
    return stopIdle;
  }, [rings]);

  const returnToRest = () => {
    onPressChange(false);
    Animated.timing(fingerprintOpacity, {
      toValue: 1,
      duration: 420,
      useNativeDriver: true,
    }).start();
    isReturning.current = true;
    holdAnimation.current?.stop();
    const stoppedValues = rings.map((ring) => new Promise<number>((resolve) => {
      ring.stopAnimation((value) => resolve(value));
    }));

    Promise.all(stoppedValues).then((values) => {
      if (!isReturning.current) return;

      const returnAnimation = Animated.parallel(
        rings.map((ring, ringIndex) =>
          Animated.sequence([
            Animated.delay(ringIndex * 90),
            Animated.timing(ring, {
              toValue: Math.min(values[ringIndex] * 1.04, COVER_SCALE),
              duration: 120,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(ring, {
              toValue: 1,
              duration: 1000,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ])
        ),
        { stopTogether: false }
      );
      holdAnimation.current = returnAnimation;
      returnAnimation.start(({ finished }) => {
        if (finished) {
          isReturning.current = false;
          startIdle();
        }
      });
    });
  };

  const runExpansion = (startValues = [1, 1, 1, 1, 1], compensateLateStart = false) => {
    const expansion = Animated.parallel(
      [4, 3, 2, 1, 0].map((ringIndex, waveIndex) => {
        const targetScale = ringIndex === 0 ? COVER_SCALE * 1.12 : COVER_SCALE;
        const distanceRatio = (targetScale - startValues[ringIndex]) / (COVER_SCALE - 1);
        const baseDuration = 1850 * Math.max(0.85, distanceRatio);
        const isFreshInnerRing = compensateLateStart && ringIndex === 0;
        const totalDuration = isFreshInnerRing ? 1800 : baseDuration;
        const expansionTiming = Animated.timing(rings[ringIndex], {
          toValue: targetScale,
          duration: totalDuration,
          easing: isFreshInnerRing ? Easing.inOut(Easing.ease) : ringIndex === 0 ? Easing.in(Easing.cubic) : Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        });

        return Animated.sequence([
          Animated.delay(waveIndex * 70),
          expansionTiming,
        ]);
      }),
      { stopTogether: false }
    );
    holdAnimation.current = expansion;
    expansion.start(({ finished }) => {
      if (finished) onComplete();
    });
  };

  const startExpanding = () => {
    onPressChange(true);
    Animated.timing(fingerprintOpacity, {
      toValue: 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
    const wasReturning = isReturning.current;
    stopIdle();
    holdAnimation.current?.stop();
    isReturning.current = false;

    const stoppedValues = rings.map((ring) => new Promise<number>((resolve) => {
      ring.stopAnimation((value) => resolve(value));
    }));

    Promise.all(stoppedValues).then((values) => {
      if (isReturning.current) return;
      runExpansion(values, !wasReturning);
    });
  };

  useEffect(() => {
    if (autoExpand) startExpanding();
  }, [autoExpand]);

  const ringStyles = [styles.ring1, styles.ring2, styles.ring3, styles.ring4, styles.ring5];
  const ringGradients = [
    ['#F6D77A', '#C9A227', '#4D3B0C', '#030303'],
    ['#E7C45B', '#B58A19', '#403108', '#020202'],
    ['#DDB84A', '#A77B12', '#332706', '#010101'],
    ['#EBCB70', '#BD9225', '#49370A', '#020202'],
    ['#F0D98A', '#C5A13A', '#55420E', '#030303'],
  ] as const;

  return (
    <Pressable
      style={styles.loaderWrap}
      onPressIn={startExpanding}
      onPressOut={returnToRest}
    >
      <Animated.View style={styles.loader}>
        {[5, 4, 3, 2, 1].map((ringNumber) => (
          <Animated.View
            key={ringNumber}
            style={[styles.ring, ringStyles[ringNumber - 1], { transform: [{ scale: rings[ringNumber - 1] }] }]}
          >
            <Svg style={styles.gradientRing} viewBox="0 0 100 100">
              <Defs>
                <RadialGradient id={`ring-${ringNumber}`} cx="50%" cy="50%" r="70%">
                  <Stop offset="0%" stopColor={ringGradients[ringNumber - 1][0]} />
                  <Stop offset="55%" stopColor={ringGradients[ringNumber - 1][1]} />
                  <Stop offset="78%" stopColor={ringGradients[ringNumber - 1][2]} />
                  <Stop offset="100%" stopColor={ringGradients[ringNumber - 1][3]} />
                </RadialGradient>
              </Defs>
              <Circle cx="50" cy="50" r="50" fill={`url(#ring-${ringNumber})`} />
            </Svg>
            <Svg style={styles.ringCutout} viewBox="0 0 100 100">
              <Defs>
                <RadialGradient id={`ring-center-${ringNumber}`} cx="50%" cy="50%" r="72%">
                  <Stop offset="0%" stopColor="#FF4D6A" stopOpacity="0.46" />
                  <Stop offset="24%" stopColor="#A855F7" stopOpacity="0.64" />
                  <Stop offset="52%" stopColor="#6D28D9" stopOpacity="0.38" />
                  <Stop offset="78%" stopColor="#241044" stopOpacity="0.14" />
                  <Stop offset="100%" stopColor="#000000" stopOpacity="1" />
                </RadialGradient>
              </Defs>
              <Circle cx="50" cy="50" r="50" fill={`url(#ring-center-${ringNumber})`} />
            </Svg>
            {ringNumber === 1 && (
              <Animated.View style={[styles.fingerprint, { opacity: fingerprintOpacity }]}>
                <MaterialCommunityIcons name="fingerprint" size={36} color="#FFFFFF" />
              </Animated.View>
            )}
          </Animated.View>
        ))}
      </Animated.View>
    </Pressable>
  );
}

export default function AnimatedOnboarding({ onSwitchToSignin, onNaturalComplete, onGoogleComplete }: AnimatedOnboardingProps) {
  const { t } = useTranslation();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [autoExpand, setAutoExpand] = useState(false);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const pendingGoogle = useRef<{ firstName: string; lastName: string; email: string; birthDate?: string; googleIdToken: string } | null>(null);
  const fade = useRef(new Animated.Value(1)).current;

  const handleGoogle = async () => {
    try {
      setGoogleLoading(true);
      const result = await googleAuthInfo();
      pendingGoogle.current = result;
      setAutoExpand(true);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleComplete = () => {
    Animated.timing(fade, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => {
      if (pendingGoogle.current) {
        onGoogleComplete?.(pendingGoogle.current);
        pendingGoogle.current = null;
      } else {
        onNaturalComplete?.();
      }
    });
  };

  const handlePressChange = (pressed: boolean) => {
    Animated.timing(controlsOpacity, {
      toValue: pressed ? 0 : 1,
      duration: pressed ? 220 : 320,
      useNativeDriver: true,
    }).start();
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.stage}>
        <OnboardingBackground />
        <Animated.View style={{ flex: 1, opacity: fade }}>
          <Loader autoExpand={autoExpand} onComplete={handleComplete} onPressChange={handlePressChange} />
        </Animated.View>
        <Animated.View style={[styles.authActions, { opacity: controlsOpacity }]}>
          <GoogleButton onPress={handleGoogle} loading={googleLoading} label="Sign up with Google" />
          {onSwitchToSignin && (
            <Pressable onPress={onSwitchToSignin} style={styles.signinAction}>
              <Text style={styles.signinActionText}>
                {t('auth.hasAccount')} <Text style={styles.signinActionLink}>{t('auth.signIn')}</Text>
              </Text>
            </Pressable>
          )}
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  stage: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderWrap: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authActions: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 32,
  },
  signinAction: {
    alignItems: 'center',
    paddingTop: 16,
  },
  signinActionText: {
    color: COLORS.text2,
    fontSize: 14,
  },
  signinActionLink: {
    color: COLORS.coral,
    fontWeight: '700',
  },
  loader: {
    width: 250,
    height: 250,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 125,
  },
  ring: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(100,100,100,0.12)',
    borderWidth: 1,
    borderColor: '#D4AF37',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  ring1: {
    width: 66,
    height: 66,
  },
  gradientRing: {
    ...StyleSheet.absoluteFill,
    borderRadius: 999,
  },
  ringCutout: {
    position: 'absolute',
    top: 1,
    right: 1,
    bottom: 1,
    left: 1,
    borderRadius: 999,
    backgroundColor: '#000000',
  },
  fingerprint: {
    position: 'absolute',
    top: 15,
    left: 15,
  },
  ring2: {
    width: 110,
    height: 110,
  },
  ring3: {
    width: 150,
    height: 150,
  },
  ring4: {
    width: 190,
    height: 190,
  },
  ring5: {
    width: 230,
    height: 230,
  },
});