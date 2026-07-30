import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle, Path } from 'react-native-svg';

const AnimatedRadialGradient = Animated.createAnimatedComponent(RadialGradient);

type Tier = 'casual' | 'verified' | 'business';

interface AnimatedTierRingProps {
  tier: Tier;
  size: number;
  ringWidth?: number;
  animated?: boolean;
}

const TIER_CONFIG: Record<Tier, {
  duration: number;
  driftFrom: { cx: number; cy: number };
  driftTo: { cx: number; cy: number };
  stops: { offset: string; color: string }[];
}> = {
  casual: {
    duration: 4000,
    driftFrom: { cx: 35, cy: 35 }, driftTo: { cx: 55, cy: 55 },
    stops: [
      { offset: '0%', color: '#8FF6E0' },
      { offset: '50%', color: '#22C1DC' },
      { offset: '100%', color: '#3B7BFF' },
    ],
  },
  verified: {
    duration: 3000,
    driftFrom: { cx: 35, cy: 35 }, driftTo: { cx: 50, cy: 35 },
    stops: [
      { offset: '0%', color: '#80AAFF' },
      { offset: '55%', color: '#3060CC' },
      { offset: '100%', color: '#FF0055' },
    ],
  },
  business: {
    duration: 2600,
    driftFrom: { cx: 35, cy: 30 }, driftTo: { cx: 45, cy: 45 },
    stops: [
      { offset: '0%', color: '#FFF3D0' },
      { offset: '30%', color: '#FFD666' },
      { offset: '55%', color: '#C98A1F' },
      { offset: '100%', color: '#D6303D' },
    ],
  },
};

export default function AnimatedTierRing({ tier, size, ringWidth, animated = true }: AnimatedTierRingProps) {
  const config = TIER_CONFIG[tier];
  const rw = ringWidth ?? Math.max(3, Math.round(size * 0.14));
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animated) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: config.duration, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(progress, { toValue: 0, duration: config.duration, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [animated, config.duration, progress]);

  const cx = animated
    ? progress.interpolate({ inputRange: [0, 1], outputRange: [`${config.driftFrom.cx}%`, `${config.driftTo.cx}%`] })
    : `${config.driftFrom.cx}%`;
  const cy = animated
    ? progress.interpolate({ inputRange: [0, 1], outputRange: [`${config.driftFrom.cy}%`, `${config.driftTo.cy}%`] })
    : `${config.driftFrom.cy}%`;

  const gradId = `tierRing-${tier}`;
  const innerR = 50 - (rw / size) * 50;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <AnimatedRadialGradient id={gradId} cx={cx as any} cy={cy as any} r="80%">
          {config.stops.map((s, i) => (
            <Stop key={i} offset={s.offset} stopColor={s.color} />
          ))}
        </AnimatedRadialGradient>
      </Defs>

      <Circle cx="50" cy="50" r="48.5" fill={`url(#${gradId})`} />

      {tier === 'business' && (
        <Path
          d="M20 55 Q30 30 45 45 Q40 55 50 50 Q55 35 70 50 Q60 65 75 60 Q65 80 45 78 Q25 75 20 55 Z"
          fill="#FFE9A8"
          opacity={0.18}
        />
      )}

      <Circle cx="50" cy="50" r={innerR - 1.5} fill="#0D1117" />
    </Svg>
  );
}
