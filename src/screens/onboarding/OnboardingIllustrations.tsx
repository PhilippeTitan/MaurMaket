import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';
import Svg, { Circle, Rect, Path, Defs, LinearGradient, Stop, Ellipse, G } from 'react-native-svg';

const VIOLET = '#8B5CF6';
const PINK = '#EC4899';
const AMBER = '#FB923C';
const MINT = '#00E5A0';
const BG1 = '#120E1F';
const SURFACE = 'rgba(255,255,255,0.06)';
const BORDER_HI = 'rgba(255,255,255,0.18)';
const TEXT = '#E6EDF3';

function GradientDefs() {
  return (
    <Defs>
      <LinearGradient id="grad1" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0%" stopColor={VIOLET} />
        <Stop offset="100%" stopColor={PINK} />
      </LinearGradient>
      <LinearGradient id="grad2" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0%" stopColor={PINK} />
        <Stop offset="100%" stopColor={AMBER} />
      </LinearGradient>
      <LinearGradient id="grad3" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0%" stopColor={VIOLET} />
        <Stop offset="100%" stopColor={AMBER} />
      </LinearGradient>
    </Defs>
  );
}

function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.28, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', shadowColor: PINK, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 }}>
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <Defs>
          <LinearGradient id="logoG" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={VIOLET} />
            <Stop offset="55%" stopColor={PINK} />
            <Stop offset="100%" stopColor={AMBER} />
          </LinearGradient>
        </Defs>
        <Rect width="40" height="40" rx="11" fill="url(#logoG)" />
        <Path d="M10 28L18 8L22 20L32 8" stroke="#160817" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    </View>
  );
}

function Splash({ size = 160 }: { size?: number }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(spin, { toValue: 1, duration: 22000, easing: Easing.linear, useNativeDriver: true })).start();
  }, []);
  const rotation = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', transform: [{ rotate: rotation }] }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle cx={size/2} cy={size/2} r={size/2 - 7} stroke="url(#grad3)" strokeWidth="1.2" strokeDasharray="4 10" fill="none" />
          <GradientDefs />
        </Svg>
      </Animated.View>
      <LogoMark size={72} />
      {/* Decorative dots */}
      <View style={{ position: 'absolute', top: 14, right: 10, width: 8, height: 8, borderRadius: 3, backgroundColor: AMBER }} />
      <View style={{ position: 'absolute', bottom: 18, left: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: MINT }} />
    </View>
  );
}

function Welcome() {
  return (
    <Svg width="220" height="160" viewBox="0 0 220 160" fill="none">
      <GradientDefs />
      {/* Shadow */}
      <Ellipse cx="110" cy="140" rx="60" ry="8" fill="#000" opacity="0.25" />
      {/* Price tag */}
      <G x="130" y="40" rotation="14">
        <Rect width="40" height="30" rx="6" fill="url(#grad2)" opacity="0.9" />
      </G>
      {/* Shopping bag */}
      <G>
        <Path d="M74 72h60a7 7 0 0 1 7 7v48a7 7 0 0 1-7 7H74a7 7 0 0 1-7-7V79a7 7 0 0 1 7-7Z" fill="url(#grad1)" />
        <Path d="M88 72v-8a17 17 0 0 1 34 0v8" stroke={TEXT} strokeWidth="4" fill="none" strokeLinecap="round" />
        <Path d="M86 100c6 7 22 7 28 0" stroke="#1A0B12" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.5" />
      </G>
      {/* Checkmark badge */}
      <G>
        <Rect x="40" y="42" width="28" height="28" rx="7" fill={BG1} stroke={BORDER_HI} strokeWidth="1.5" />
        <Path d="M48 56l4 4 8-10" stroke={MINT} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </G>
    </Svg>
  );
}

function NameIllustration() {
  return (
    <Svg width="160" height="110" viewBox="0 0 160 110" fill="none">
      <GradientDefs />
      <Circle cx="80" cy="38" r="24" fill="none" stroke={BORDER_HI} strokeWidth="1.4" />
      <Circle cx="80" cy="38" r="24" stroke="url(#grad1)" strokeWidth="2.2" strokeDasharray="150" strokeDashoffset="150" />
      <Circle cx="80" cy="32" r="7" fill={SURFACE} stroke={BORDER_HI} />
      <Path d="M64 52c4-8 28-8 32 0" stroke={BORDER_HI} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <Path d="M18 90c24-12 100-12 124 0" stroke="rgba(255,255,255,0.15)" strokeWidth="1.4" strokeDasharray="2 7" fill="none" strokeLinecap="round" />
    </Svg>
  );
}

function ContactIllustration() {
  return (
    <Svg width="180" height="140" viewBox="0 0 180 140" fill="none">
      <GradientDefs />
      <Circle cx="90" cy="68" r="52" stroke="rgba(255,255,255,0.06)" strokeWidth="1" fill="none" strokeDasharray="1 7" />
      {/* Envelope */}
      <G>
        <Rect x="52" y="42" width="76" height="52" rx="8" fill="url(#grad1)" />
        <Path d="M52 48l38 28 38-28" stroke="#1A0B12" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
      </G>
      {/* Paper plane */}
      <G>
        <Path d="M128 88l26-8-8 26-6-10-12 6 0-14z" fill={AMBER} />
      </G>
    </Svg>
  );
}

function SecurityIllustration({ matched }: { matched: boolean }) {
  const color = matched ? MINT : VIOLET;
  return (
    <Svg width="140" height="140" viewBox="0 0 140 140" fill="none">
      <GradientDefs />
      <Circle cx="70" cy="70" r="56" fill={SURFACE} stroke="rgba(255,255,255,0.08)" />
      <Defs>
        <LinearGradient id="lockG" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor={color} />
          <Stop offset="100%" stopColor={matched ? MINT : PINK} />
        </LinearGradient>
      </Defs>
      <Rect x="46" y="68" width="48" height="36" rx="8" fill="url(#lockG)" />
      <Path d="M54 68V55a16 16 0 0 1 32 0v13" stroke={matched ? MINT : BORDER_HI} strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <Circle cx="70" cy="84" r="4" fill="#1A0B12" />
      <Rect x="68.5" y="86" width="3" height="8" rx="1.5" fill="#1A0B12" />
    </Svg>
  );
}

function ReviewIllustration({ items }: { items: boolean[] }) {
  return (
    <Svg width="150" height="120" viewBox="0 0 150 120" fill="none">
      <GradientDefs />
      <Rect x="30" y="8" width="90" height="104" rx="12" fill={SURFACE} stroke="rgba(255,255,255,0.08)" />
      <Rect x="52" y="0" width="46" height="16" rx="5" fill={BORDER_HI} />
      {items.map((done, i) => (
        <G key={i} opacity={done ? 1 : 0.3}>
          <Circle cx="50" cy={38 + i * 20} r="6" fill={done ? MINT : 'transparent'} stroke={done ? MINT : 'rgba(255,255,255,0.2)'} strokeWidth="1.2" />
          {done && <Path d={`M47 ${38 + i * 20}l2 2 4-4.5`} stroke="#0A0812" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
          <Rect x="62" y={35 + i * 20} width="44" height="6" rx="3" fill="rgba(255,255,255,0.15)" />
        </G>
      ))}
    </Svg>
  );
}

function Success() {
  const scale = useRef(new Animated.Value(0.4)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  return (
    <View style={{ width: 180, height: 180, alignItems: 'center', justifyContent: 'center' }}>
      {/* Ring pulses */}
      {[0, 1, 2].map(i => (
        <View key={i} style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, borderRadius: 999, borderWidth: 1.2, borderColor: MINT, opacity: 0.3 }} />
      ))}
      <Animated.View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#123B31', alignItems: 'center', justifyContent: 'center', transform: [{ scale }], opacity }}>
        <Svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <Path d="M10 22l7 7 14-16" stroke={MINT} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Animated.View>
    </View>
  );
}

function StepIllustration({ step, pwMatched }: { step: string; pwMatched: boolean }) {
  switch (step) {
    case 'name': return <NameIllustration />;
    case 'email': return <ContactIllustration />;
    case 'password': return <SecurityIllustration matched={pwMatched} />;
    case 'phone': return <ContactIllustration />;
    case 'dob': return <NameIllustration />;
    case 'review': return <ReviewIllustration items={[true, true, pwMatched]} />;
    default: return null;
  }
}

export default { LogoMark, Splash, Welcome, NameIllustration, ContactIllustration, SecurityIllustration, ReviewIllustration, Success, StepIllustration };
