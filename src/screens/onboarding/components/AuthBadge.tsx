import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Circle, Path, G } from 'react-native-svg';
import { COLORS } from '../../../theme';

export type AuthGlyph =
  | 'name' | 'email' | 'password' | 'phone' | 'dob' | 'review' | 'success' | 'signin';

const SIZE = 88;
const STROKE = 2.5;

/** Hand-drawn line-art glyphs, all sharing the same 44x44 viewBox and stroke weight. */
function Glyph({ variant, color }: { variant: AuthGlyph; color: string }) {
  const common = { stroke: color, strokeWidth: STROKE, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  switch (variant) {
    case 'name':
      return (
        <G>
          <Circle cx="22" cy="16" r="7.5" {...common} />
          <Path d="M8 37c2.5-8 8-11.5 14-11.5S33.5 29 36 37" {...common} />
        </G>
      );
    case 'email':
      return (
        <G>
          <Path d="M6 12h32v20H6z" {...common} />
          <Path d="M6 13l16 12 16-12" {...common} />
        </G>
      );
    case 'password':
      return (
        <G>
          <Path d="M12 21h20a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V23a2 2 0 0 1 2-2Z" {...common} />
          <Path d="M15 21v-5a7 7 0 0 1 14 0v5" {...common} />
          <Circle cx="22" cy="29" r="1.6" fill={color} />
        </G>
      );
    case 'phone':
      return (
        <G>
          <Path d="M14 6h16a2 2 0 0 1 2 2v28a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" {...common} />
          <Path d="M19 33h6" {...common} />
        </G>
      );
    case 'dob':
      return (
        <G>
          <Path d="M8 11h28v25H8z" {...common} />
          <Path d="M8 18h28" {...common} />
          <Path d="M14 6v8M30 6v8" {...common} />
        </G>
      );
    case 'review':
      return (
        <G>
          <Path d="M13 8h18a2 2 0 0 1 2 2v24a2 2 0 0 1-2 2H13a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z" {...common} />
          <Path d="M17 6h10a1 1 0 0 1 1 1v3H16V7a1 1 0 0 1 1-1Z" {...common} />
          <Path d="M15 20l3 3 7-7" {...common} />
          <Path d="M15 29h14" {...common} />
        </G>
      );
    case 'success':
      return (
        <G>
          <Path d="M11 22l7 7 15-16" {...common} strokeWidth={3} />
        </G>
      );
    case 'signin':
    default:
      return (
        <G>
          <Path d="M22 6l14 5.5v9c0 8.5-6 14.5-14 17.5-8-3-14-9-14-17.5v-9L22 6Z" {...common} />
          <Path d="M17 22l4 4 7-8" {...common} />
        </G>
      );
  }
}

interface AuthBadgeProps {
  variant: AuthGlyph;
  /** Celebratory pulsing rings, used for the success moment. */
  celebrate?: boolean;
}

export default function AuthBadge({ variant, celebrate }: AuthBadgeProps) {
  const mount = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    mount.setValue(0);
    Animated.spring(mount, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }).start();

    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    floatLoop.start();

    const spinLoop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 14000, easing: Easing.linear, useNativeDriver: true }),
    );
    spinLoop.start();

    let pulseLoop: Animated.CompositeAnimation | undefined;
    if (celebrate) {
      pulseLoop = Animated.loop(
        Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      );
      pulseLoop.start();
    }

    return () => { floatLoop.stop(); spinLoop.stop(); pulseLoop?.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, celebrate]);

  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.9] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.5, 0.35, 0] });

  return (
    <View style={styles.wrap}>
      {celebrate && (
        <Animated.View style={[styles.ring, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]} />
      )}
      <Animated.View style={[styles.orbit, { transform: [{ rotate }] }]}>
        <Svg width={SIZE + 24} height={SIZE + 24} viewBox={`0 0 ${SIZE + 24} ${SIZE + 24}`}>
          <Circle
            cx={(SIZE + 24) / 2}
            cy={(SIZE + 24) / 2}
            r={(SIZE + 24) / 2 - 2}
            stroke={COLORS.border}
            strokeWidth={1}
            strokeDasharray="1 8"
            fill="none"
          />
        </Svg>
      </Animated.View>
      <Animated.View
        style={[
          styles.badge,
          {
            opacity: mount,
            transform: [
              { scale: mount.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
              { translateY },
            ],
          },
        ]}
      >
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 1.5} fill={COLORS.surface} stroke={COLORS.border} strokeWidth={1.5} />
          <G x={(SIZE - 44) / 2} y={(SIZE - 44) / 2}>
            <Glyph variant={variant} color={variant === 'success' ? COLORS.green : COLORS.coral} />
          </G>
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: SIZE + 24,
    height: SIZE + 24,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 8,
  },
  orbit: {
    position: 'absolute',
  },
  badge: {
    position: 'absolute',
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 4,
  },
  ring: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: COLORS.greenMuted,
  },
});
