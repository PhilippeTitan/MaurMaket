import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle, Path } from 'react-native-svg';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { COLORS } from '@/theme';

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
  const rw = ringWidth ?? Math.max(3, Math.round(size * 0.06));
  const progress = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();
  const shouldAnimate = animated && !reduceMotion;
  // Animated props on an SVG gradient do not survive react-native-web (they are
  // applied as DOM attributes), so web drives the drift from a throttled rAF
  // loop writing plain percentage strings — same motion, no Animated gradient.
  const [webDrift, setWebDrift] = useState({ cx: config.driftFrom.cx, cy: config.driftFrom.cy });

  // Native: one Animated loop, exactly as before.
  useEffect(() => {
    if (Platform.OS === 'web' || !shouldAnimate) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: config.duration, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(progress, { toValue: 0, duration: config.duration, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shouldAnimate, config.duration, progress]);

  // Web: the same sine drift, sampled at ~15fps instead of every frame.
  useEffect(() => {
    if (Platform.OS !== 'web' || !shouldAnimate) {
      setWebDrift({ cx: config.driftFrom.cx, cy: config.driftFrom.cy });
      return;
    }
    let raf = 0;
    let last = 0;
    const started = Date.now();
    const tick = () => {
      const now = Date.now();
      if (now - last >= 66) {
        last = now;
        const cycle = (now - started) % (config.duration * 2);
        const p = cycle < config.duration ? cycle / config.duration : 2 - cycle / config.duration;
        const eased = (1 - Math.cos(Math.PI * p)) / 2;
        setWebDrift({
          cx: config.driftFrom.cx + (config.driftTo.cx - config.driftFrom.cx) * eased,
          cy: config.driftFrom.cy + (config.driftTo.cy - config.driftFrom.cy) * eased,
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shouldAnimate, config]);

  const animatedPos = shouldAnimate && Platform.OS !== 'web'
    ? {
        cx: progress.interpolate({ inputRange: [0, 1], outputRange: [`${config.driftFrom.cx}%`, `${config.driftTo.cx}%`] }),
        cy: progress.interpolate({ inputRange: [0, 1], outputRange: [`${config.driftFrom.cy}%`, `${config.driftTo.cy}%`] }),
      }
    : null;
  const cx: any = animatedPos
    ? animatedPos.cx
    : `${shouldAnimate && Platform.OS === 'web' ? webDrift.cx : config.driftFrom.cx}%`;
  const cy: any = animatedPos
    ? animatedPos.cy
    : `${shouldAnimate && Platform.OS === 'web' ? webDrift.cy : config.driftFrom.cy}%`;
  const Gradient: any = animatedPos ? AnimatedRadialGradient : RadialGradient;

  const gradId = `tierRing-${tier}`;
  const innerR = 50 - (rw / size) * 50;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <Gradient id={gradId} cx={cx} cy={cy} r="80%">
          {config.stops.map((s, i) => (
            <Stop key={i} offset={s.offset} stopColor={s.color} />
          ))}
        </Gradient>
      </Defs>

      <Circle cx="50" cy="50" r="48.5" fill={`url(#${gradId})`} />

      {tier === 'business' && (
        <Path
          d="M20 55 Q30 30 45 45 Q40 55 50 50 Q55 35 70 50 Q60 65 75 60 Q65 80 45 78 Q25 75 20 55 Z"
          fill="#FFE9A8"
          opacity={0.18}
        />
      )}

      <Circle cx="50" cy="50" r={innerR - 1.5} fill={COLORS.bg} />
    </Svg>
  );
}
