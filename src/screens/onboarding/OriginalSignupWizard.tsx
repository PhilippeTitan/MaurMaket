import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Animated,
  Easing, ScrollView, FlatList, Platform, KeyboardAvoidingView, Image, Keyboard, ActivityIndicator, BackHandler,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import Svg, { Circle, Rect, Path, Defs, LinearGradient as SvgLinearGradient, Stop, Ellipse, G as SvgG } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import LottieView from 'lottie-react-native';
import { COLORS, SPACING, RADIUS, FONTS, TOUCH } from '../../theme';
import { useTranslation } from '@/localization';
import { useViewport } from '@/hooks';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { signup as apiSignup, retrySignupProfileBootstrap, googleAuth, googleAuthInfo, linkGoogleIdentity, API_BASE } from '../../api';
import { store } from '../../store';
import AuthInput from '@/components/AuthInput';
import GoogleButton from './components/GoogleButton';
import PasskeyButton from './components/PasskeyButton';
import AuthMethodsCard from '../../components/AuthMethodsCard';
import OnboardingBackground from './components/OnboardingBackground';
import type { User } from '../../types';

const C = {
  bg0: COLORS.bg,
  bg1: COLORS.bg,
  surface: COLORS.surface,
  surfaceHi: COLORS.surface2,
  border: COLORS.border,
  borderHi: COLORS.borderLight,
  text: COLORS.text,
  sub: COLORS.text2,
  faint: COLORS.text3,
  violet: COLORS.coral,
  pink: COLORS.coralLight,
  amber: COLORS.warning,
  mint: COLORS.green,
};

function buildUsernameSuggestions(firstName: string, lastName: string, email: string): string[] {
  const clean = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
  const first = clean(firstName);
  const last = clean(lastName);
  const emailBase = clean(email.split('@')[0] || '');
  const MAX = 20;

  const truncate = (s: string) => s.length > MAX ? s.slice(0, MAX) : s;

  const candidates: string[] = [];

  // Email base is usually short and clean — try first
  if (emailBase.length >= 3) candidates.push(emailBase);

  // First name + last initial (compact, Instagram-style)
  if (first && last) {
    candidates.push(truncate(`${first}${last[0]}`));
    candidates.push(truncate(`${first}.${last[0]}`));
    candidates.push(truncate(`${first[0]}${last}`));
  }

  // Full first+last only if short enough
  const combined = truncate(`${first}${last}`);
  if (combined.length <= 15) candidates.push(combined);

  // First name only
  if (first.length >= 3) candidates.push(first);

  return Array.from(new Set(candidates))
    .filter(v => v.length >= 5 && v.length <= 30 && /^[a-z0-9][a-z0-9._]*[a-z0-9]$/.test(v))
    .slice(0, 3);
}

const STEPS = ['name', 'username', 'email', 'purpose', 'dob', 'password', 'review'] as const;
type Step = typeof STEPS[number];
const STEP_MAX = 7;
const STEP_LABEL_KEYS: Record<Step, string> = {
  name: 'signup.aboutYou', username: 'field.username', email: 'signup.contactStep', purpose: 'signup.purposeStep', dob: 'signup.ageStep', password: 'signup.securityStep', review: 'signup.reviewStep',
};
const getStepLabels = (t: (k: string) => string): Record<Step, string> => ({
  name: t('signup.aboutYou'), username: t('field.username'), email: t('signup.contactStep'), purpose: t('signup.purposeStep'), dob: t('signup.ageStep'), password: t('signup.securityStep'), review: t('signup.reviewStep'),
});

const getPurposes = (t: (k: string) => string) => [
  { id: 'buy', title: t('signup.purposeBuyTitle'), desc: t('signup.purposeBuyDesc'), icon: 'shopping-outline' as const },
  { id: 'sell', title: t('signup.purposeSellTitle'), desc: t('signup.purposeSellDesc'), icon: 'store-outline' as const },
  { id: 'both', title: t('signup.purposeBothTitle'), desc: t('signup.purposeBothDesc'), icon: 'swap-horizontal' as const },
];

/* ΓöÇΓöÇ SVG Illustrations ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */

function Logomark({ size = 40 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.28, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', shadowColor: C.pink, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.55, shadowRadius: 20, elevation: 8 }}>
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <Defs>
          <SvgLinearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={C.violet} />
            <Stop offset="55%" stopColor={C.pink} />
            <Stop offset="100%" stopColor={C.amber} />
          </SvgLinearGradient>
        </Defs>
        <Rect width="40" height="40" rx="11" fill="url(#logoGrad)" />
        <Path d="M10 28L18 8L22 20L32 8" stroke="#160817" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    </View>
  );
}

function SplashIllustration({ spin }: { spin: Animated.Value }) {
  const rotation = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <View style={{ width: 200, height: 200, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', transform: [{ rotate: rotation }] }}>
        <Svg width="200" height="200" viewBox="0 0 200 200">
          <Defs>
            <SvgLinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor={C.violet} />
              <Stop offset="100%" stopColor={C.amber} />
            </SvgLinearGradient>
          </Defs>
          <Circle cx="100" cy="100" r="86" stroke="url(#ringGrad)" strokeWidth="1.2" strokeDasharray="4 10" fill="none" />
        </Svg>
      </Animated.View>
      <Logomark size={92} />
      <View style={{ position: 'absolute', top: 18, right: 12, width: 10, height: 10, borderRadius: 4, backgroundColor: C.amber }} />
      <View style={{ position: 'absolute', bottom: 22, left: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: C.mint }} />
    </View>
  );
}

function WelcomeIllustration() {
  const { t } = useTranslation();
  return (
    <View style={{ height: 250, alignItems: 'center', justifyContent: 'center' }}>
      <Image
        source={require('../../../illustration/commerce-more-human.webp')}
        style={{ width: 360, height: 250, resizeMode: 'contain' }}
        accessibilityLabel={t('signup.illCommerceHuman')}
      />
    </View>
  );
}

type AssetName = 'lets-start' | 'digital-address' | 'keep-it-protected' | 'youre-ready' | 'pick-username' | 'choose-purpose' | 'birthday';

// Intrinsic width/height of each illustration file, so every artwork box can be derived
// from its own aspect ratio. These pictures have an opaque near-black background baked in,
// which makes an off-ratio box look broken either way: 'cover' slices part of the artwork
// away (the name step's caption lost its bottom quarter) and a mismatched 'contain' box
// shows a strip of the card's surface colour as a frame.
const ART_SIZE: Record<AssetName, { w: number; h: number }> = {
  'lets-start': { w: 264, h: 180 },
  'keep-it-protected': { w: 269, h: 266 },
  'pick-username': { w: 423, h: 576 },
  'choose-purpose': { w: 452, h: 394 },
  'youre-ready': { w: 265, h: 145 },
  'digital-address': { w: 260, h: 338 },
  'birthday': { w: 433, h: 595 },
};
// Artwork that owns a fixed column instead of the slide's full content width.
const ART_FIXED_WIDTH: Partial<Record<AssetName, number>> = { 'pick-username': 350, 'choose-purpose': 330, 'digital-address': 350 };
// Tallest the birthday backdrop ever gets. It sits behind the date wheels rather than in the
// step body, so it keeps its own bottom offset and is sized against the window on each render.
const DOB_ART_HEIGHT = 455;
const DOB_ART_BOTTOM = 184;
// Every step screen is a column: the top bar's strip is reserved at the top, the CTA block
// sits in flow at the bottom with the same gutter it used to be pinned at, and the body in
// between keeps whatever is left. Nothing has to know the window height for that to work —
// the artwork, the fields and the button stay evenly spaced on a 667px phone and on a 900px
// one, and a step with a tall action block (password) automatically gets a shorter body.
const STEP_TOPBAR_STRIP = 28 + TOUCH.min;
const STEP_ACTIONBAR_GUTTER = 44;
// Height of the primary CTA, which is what the body has to leave room for at the bottom.
const STEP_CTA_HEIGHT = 52;
// Breathing room under the step's scroll content — subtracted from the body ceiling so a step
// that only just fits lands inside the window instead of leaving the CTA half a scroll below it.
const STEP_SCROLL_PADDING = 16;
// Minimum air the step body keeps between its content and the header / CTA block. When a
// window is too short to hold the whole step, the artwork box is the one element that gives
// up space (see AssetIllustration) so every control keeps its full size and the picture is
// the only thing that shrinks — no per-screen offsets, nothing to retune on a new phone.
const STEP_BODY_GUTTER = 16;

function AssetIllustration({ asset, accessibilityLabel, containerStyle }: { asset: AssetName; accessibilityLabel: string; containerStyle?: any }) {
  const vp = useViewport();
  const fixedWidth = ART_FIXED_WIDTH[asset];
  const source =
    asset === 'lets-start' ? require('../../../illustration/lets-start.webp') :
    asset === 'digital-address' ? require('../../../illustration/digital-address.webp') :
    asset === 'keep-it-protected' ? require('../../../illustration/keep-it-protected.webp') :
    asset === 'youre-ready' ? require('../../../illustration/youre-ready.webp') :
    asset === 'pick-username' ? require('../../../illustration/pick-username.webp') :
    asset === 'choose-purpose' ? require('../../../illustration/choose-purpose.webp') :
    require('../../../illustration/birthday.webp');
  // Width first, then height straight from the file's own ratio, so the artwork is always
  // shown whole. vp.contentWidth is the slide's own content width (viewport minus gutters,
  // capped at the content column) and is read live, so the box is right for the window the
  // user actually has instead of the one the app happened to boot in.
  const size = ART_SIZE[asset];
  const slideWidth = vp.contentWidth;
  // Artwork with its own column (the username and purpose cards) is capped to the live column
  // width too, so a 375px phone narrows the picture instead of letting it spill past the gutters.
  const artWidth = Math.min(fixedWidth ?? slideWidth, slideWidth);
  const maxWidth = artWidth;
  const imageHeight = Math.round((artWidth * size.h) / size.w);
  const frame = { borderRadius: 22, overflow: 'hidden' as const, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border };
  return (
    <View
      style={[{ height: imageHeight, minHeight: 0, flexShrink: 50, width: '100%', marginBottom: 12, alignItems: 'center', justifyContent: 'center' }, containerStyle]}
    >
      <Image
        source={source}
        // height:'100%' + aspectRatio means the picture follows whatever height the step body
        // (or the backdrop box, for the birthday artwork) can spare while keeping its own shape,
        // capped at the asset's natural column width.
        style={{ height: '100%', aspectRatio: size.w / size.h, maxWidth, width: 'auto', ...frame }}
        // resizeMode must be a prop: react-native-web ignores style.resizeMode and
        // renders this as a CSS background, so style.resizeMode left every artwork
        // at background-size:auto. 'stretch' is exact here because every box height is
        // derived from the same ratio as its file: the picture fills its rounded card edge
        // to edge, with no crop (what 'cover' did) and no frame of the card's surface
        // colour (what an off-ratio 'contain' box showed around these opaque pictures).
        resizeMode="stretch"
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
}

function NameIllustration() {
  return (
    <View style={{ height: 130, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width="180" height="120" viewBox="0 0 180 120" fill="none">
        <Defs>
          <SvgLinearGradient id="faceG" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={C.violet} />
            <Stop offset="100%" stopColor={C.pink} />
          </SvgLinearGradient>
        </Defs>
        <Circle cx="90" cy="42" r="26" fill="none" stroke={C.borderHi} strokeWidth="1.4" />
        <Circle cx="90" cy="42" r="26" stroke="url(#faceG)" strokeWidth="2.2" strokeDasharray="164" strokeDashoffset="0" />
        <Circle cx="90" cy="36" r="8" fill={C.surfaceHi} stroke={C.borderHi} />
        <Path d="M72 58c4-9 32-9 36 0" stroke={C.borderHi} strokeWidth="2" fill="none" strokeLinecap="round" />
        <Path d="M20 100c26-14 114-14 140 0" stroke={C.faint} strokeWidth="1.6" strokeDasharray="2 7" fill="none" strokeLinecap="round" />
      </Svg>
    </View>
  );
}

function ContactIllustration() {
  return (
    <View style={{ height: 150, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width="200" height="150" viewBox="0 0 200 150" fill="none">
        <Defs>
          <SvgLinearGradient id="envG" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={C.violet} />
            <Stop offset="100%" stopColor={C.pink} />
          </SvgLinearGradient>
        </Defs>
        <Circle cx="100" cy="72" r="58" stroke={C.border} strokeWidth="1" fill="none" strokeDasharray="1 7" />
        <SvgG>
          <Rect x="58" y="46" width="84" height="56" rx="9" fill="url(#envG)" />
          <Path d="M58 52l42 30 42-30" stroke="#1A0B12" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
        </SvgG>
        <SvgG>
          <Path d="M138 96l30-10-9 29-7-11-14 8 0-16z" fill={C.amber} />
        </SvgG>
      </Svg>
    </View>
  );
}

function SecurityIllustration({ matched }: { matched: boolean }) {
  return (
    <View style={{ height: 150, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width="150" height="150" viewBox="0 0 150 150" fill="none">
        <Defs>
          <SvgLinearGradient id="lockG" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={matched ? C.mint : C.violet} />
            <Stop offset="100%" stopColor={matched ? C.mint : C.pink} />
          </SvgLinearGradient>
        </Defs>
        <Circle cx="75" cy="75" r="60" fill={C.surface} stroke={C.border} />
        <Rect x="50" y="72" width="50" height="38" rx="9" fill="url(#lockG)" />
        <Path d="M58 72V58a17 17 0 0 1 34 0v14" stroke={matched ? C.mint : C.borderHi} strokeWidth="5" fill="none" strokeLinecap="round" />
        <Circle cx="75" cy="88" r="4.2" fill="#1A0B12" />
        <Rect x="73" y="90" width="4" height="9" rx="2" fill="#1A0B12" />
      </Svg>
    </View>
  );
}

function ReviewIllustration({ items }: { items: boolean[] }) {
  return (
    <View style={{ height: 140, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width="170" height="140" viewBox="0 0 170 140" fill="none">
        <Rect x="35" y="10" width="100" height="120" rx="14" fill={C.surface} stroke={C.border} />
        <Rect x="60" y="2" width="50" height="18" rx="6" fill={C.borderHi} />
        {items.map((done, i) => (
          <SvgG key={i} opacity={done ? 1 : 0.35}>
            <Circle cx="55" cy={42 + i * 22} r="7" fill={done ? C.mint : 'transparent'} stroke={done ? C.mint : C.faint} strokeWidth="1.4" />
            {done && <Path d={`M51.5 ${42 + i * 22}l2.5 2.5 5-5`} stroke="#0A0812" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
            <Rect x="70" y={38 + i * 22} width="52" height="7" rx="3.5" fill={C.faint} opacity="0.5" />
          </SvgG>
        ))}
      </Svg>
    </View>
  );
}

function SuccessIllustration({ pulse }: { pulse: Animated.Value }) {
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const opacity = pulse.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] });
  return (
    <View style={{ height: 210, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {[0, 1, 2].map(i => (
        <View key={i} style={[StyleSheet.absoluteFill, { borderRadius: 999, borderWidth: 1.4, borderColor: C.mint, opacity: 0.3 }]} />
      ))}
      <Animated.View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: COLORS.greenMuted, alignItems: 'center', justifyContent: 'center', transform: [{ scale }], opacity }}>
        <Svg width="46" height="46" viewBox="0 0 46 46" fill="none">
          <Path d="M11 24l8 8 16-18" stroke={C.mint} strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Animated.View>
    </View>
  );
}

function EmailConfirmationScreen({ name, email, onDone }: { name: string; email: string; onDone: () => void }) {
  const { t } = useTranslation();
  const pulse = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();
  useEffect(() => {
    if (reduceMotion) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: 32 }}>
      <SuccessIllustration pulse={pulse} />
      <Text style={{ fontSize: 22, fontWeight: '700', color: C.text, textAlign: 'center' }}>
        {t('signup.allSet', { name: name ? `, ${name}` : '' })}
      </Text>
      <Text style={{ fontSize: 14, color: C.sub, textAlign: 'center', lineHeight: 20 }}>
        {t('signup.verifyEmailSent')}{'\n'}
        <Text style={{ color: C.mint, fontWeight: '600' }}>{email}</Text>
        {'\n\n'}{t('signup.verifyInboxHint')}
      </Text>
      <View style={{ marginTop: 12, width: '100%' }}>
        <PrimaryButton onPress={onDone}>
          {t('signup.enterApp')}
        </PrimaryButton>
      </View>
    </View>
  );
}

function VerificationScreen({ name, onDone }: { name: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<'loading' | 'tick'>('loading');
  const spinAnim = useRef(new Animated.Value(0)).current;
  const lottieRef = useRef<LottieView>(null);
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (reduceMotion) {
      spinAnim.setValue(0);
      const timer = setTimeout(() => setPhase('tick'), 2000);
      return () => clearTimeout(timer);
    }
    const spin = Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true })
    );
    spin.start();
    const t = setTimeout(() => { spin.stop(); setPhase('tick'); }, 2000);
    return () => { spin.stop(); clearTimeout(t); };
  }, [reduceMotion, spinAnim]);

  useEffect(() => {
    if (phase === 'tick') {
      if (reduceMotion) {
        const timer = setTimeout(onDone, 400);
        return () => clearTimeout(timer);
      }
      lottieRef.current?.play();
    }
  }, [onDone, phase, reduceMotion]);

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      {phase === 'loading' ? (
        <View style={{ alignItems: 'center', gap: 24 }}>
          <Animated.View style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: C.border, borderTopColor: C.violet, transform: [{ rotate: spin }] }} />
          <View style={{ gap: 8, alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: C.text }}>{t('signup.verifyingAccount')}</Text>
            <Text style={{ fontSize: 14, color: C.sub }}>{t('signup.wontTakeLong')}</Text>
          </View>
        </View>
      ) : (
        <View style={{ alignItems: 'center', gap: 20 }}>
          {reduceMotion ? (
            <MaterialCommunityIcons name="check-circle" size={96} color={C.mint} />
          ) : (
            <LottieView
              ref={lottieRef}
              source={require('../../../assets/success-tick.json')}
              style={{ width: 200, height: 200 }}
              loop={false}
              onAnimationFinish={() => setTimeout(onDone, 400)}
            />
          )}
          <Text style={{ fontSize: 22, fontWeight: '700', color: C.text }}>
            {t('signup.allSet', { name: name ? `, ${name}` : '' })}
          </Text>
        </View>
      )}
    </View>
  );
}

/* ΓöÇΓöÇ Shared UI ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */

function StepBadge({ step, total, label }: { step: number; total: number; label: string }) {
  const { t } = useTranslation();
  return (
    <Text style={s.stepCount} accessibilityLabel={t('signup.progressA11y', { step, total })}>{step}/{total}</Text>
  );
}

/* ΓöÇΓöÇ Birthday Picker Wheel Column (Glass Center Lens) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const FULL_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const DOB_ITEM_HEIGHT = 44;
const DOB_VISIBLE_ITEMS = 5;
const DOB_WHEEL_HEIGHT = DOB_ITEM_HEIGHT * DOB_VISIBLE_ITEMS; // 220
// ── Birthday stage ────────────────────────────────────────────────────────────
// The stage is the white date card, the three selector boxes and the wheel tray. Its
// pieces are fixed sizes (the wheel is a physical 5-row drum and the selector row is a
// tap target), so the only thing a step can trade is the card's height and then, on a
// window too short even for that, the number of wheel rows on screen. Every number below
// is either a constant of that drum or derived from the live window in the render — no
// part of this step is pinned to a coordinate that only suits one phone.
// Air between the stage's pieces.
const DOB_STAGE_GAP = 14;
// Height of the month/day/year selector row.
const DOB_ROW_HEIGHT = 58;
// Air between the artwork and the selector row while the wheel is shut.
const DOB_ROW_GAP = 15;
// Tray chrome above the drum: paddingTop + the wheel column's label row.
const DOB_TRAY_HEADER = 26;
// Tray chrome below it: paddingBottom + slack under the last visible row.
const DOB_TRAY_FOOTER = 6;
const DOB_TRAY_HEIGHT = DOB_TRAY_HEADER + DOB_WHEEL_HEIGHT + DOB_TRAY_FOOTER;
// Shortest the tray may get (three rows) before the stage gives up its card instead.
const DOB_TRAY_MIN_HEIGHT = 176;
// The white card while the wheel is open is a compact summary — the wheel is the star.
const DOB_PILL_HEIGHT = 168;
const DOB_PILL_MIN_HEIGHT = 132;
// Air the open stage keeps above the CTA, so the wheel never sits flush on the button.
const DOB_STAGE_CTA_GAP = 12;
// The three selector boxes share the row in proportion to the longest thing each one has to
// show — a month name ('September'), a two-digit day, a four-digit year — so the month box
// is never the one that truncates to 'Mo…' while the day box sits half empty.
const DOB_SELECTOR_FLEX = { month: 1.45, day: 1, year: 1.12 };
// Width the boxes need for their text, measured at the row's own type size (600/12px):
// 'September' 60, 'Day' 23, 'Year' 27, plus a 32px frame of padding (6), gaps (2+2) and
// chevron (16) in every box. The calendar icon adds 20 more (18 icon + 2 gap), and it is the
// first thing the row gives up on a narrow window because it is the only part of a selector
// that carries no meaning — the value and the chevron already say what the box does.
const DOB_SELECTOR_TEXT_WIDTHS = 60 + 23 + 27;
const DOB_SELECTOR_FRAME = 32;
const DOB_SELECTOR_ICON_FRAME = 20;
const DOB_ROW_GAP_WIDE = 15;
const DOB_ROW_GAP_TIGHT = 10;
// '12/31/2008' in the card's 900-weight type is 5.53px wide per point of font size, plus 3px
// of tracking between the ten glyphs — so the card's number can be as large as this window
// can hold and no larger, instead of a fixed 36 that overflows a narrow phone.
const DOB_DATE_WIDTH_PER_POINT = 5.53;
const DOB_DATE_TRACKING = 27;
const DOB_DATE_PADDING = 40;
const ALL_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const CURRENT_YEAR = new Date().getFullYear();
const ALL_YEARS = Array.from({ length: 82 }, (_, i) => (CURRENT_YEAR - 18) - i);
const DAY_CACHE: Record<number, number[]> = {
  28: Array.from({ length: 28 }, (_, i) => i + 1),
  29: Array.from({ length: 29 }, (_, i) => i + 1),
  30: Array.from({ length: 30 }, (_, i) => i + 1),
  31: Array.from({ length: 31 }, (_, i) => i + 1),
};

const DobWheelColumn = React.memo(function DobWheelColumn({
  items,
  selectedValue,
  onSelect,
  label,
  formatItem,
  pad = 0,
}: {
  items: (number | string)[];
  selectedValue: number | string | null;
  onSelect: (val: any) => void;
  label: string;
  formatItem?: (val: any) => string;
  // Air above and below the item list. The parent derives it from the tray height the live
  // window can afford, so the drum always lands centred in whatever space it was given.
  pad?: number;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const lastIdx = useRef(-1);
  const hasMounted = useRef(false);
  const N = items.length;

  // Initial scroll once on mount
  useEffect(() => {
    if (selectedValue != null && !hasMounted.current) {
      const idx = items.indexOf(selectedValue);
      if (idx >= 0) {
        hasMounted.current = true;
        lastIdx.current = idx;
        setTimeout(() => {
          scrollRef.current?.scrollTo({ y: idx * DOB_ITEM_HEIGHT, animated: false });
        }, 50);
      }
    }
  }, [selectedValue, items]);

  const pickFromOffset = (offsetY: number) => {
    const idx = Math.max(0, Math.min(Math.round(offsetY / DOB_ITEM_HEIGHT), N - 1));
    Haptics.selectionAsync();
    onSelect(items[idx]);
  };

  return (
    <View style={s.dobWheelCol}>
      <Text style={s.dobWheelLabel}>{label}</Text>
      <View style={s.dobWheelViewport}>
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          snapToInterval={DOB_ITEM_HEIGHT}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          bounces
          nestedScrollEnabled
          onMomentumScrollEnd={(e) => pickFromOffset(e.nativeEvent.contentOffset.y)}
          onScrollEndDrag={(e) => {
            const v = e.nativeEvent.velocity?.y ?? 0;
            if (Math.abs(v) < 0.3) pickFromOffset(e.nativeEvent.contentOffset.y);
          }}
          contentContainerStyle={{
            paddingTop: pad,
            paddingBottom: pad,
          }}
          style={s.dobWheelScroll}
        >
          {items.map((item, idx) => {
            const display = formatItem ? formatItem(item) : String(item);
            const isSelected = item === selectedValue;
            return (
              <TouchableOpacity
                key={`${item}-${idx}`}
                activeOpacity={0.7}
                onPress={() => {
                  scrollRef.current?.scrollTo({ y: idx * DOB_ITEM_HEIGHT, animated: true });
                  pickFromOffset(idx * DOB_ITEM_HEIGHT);
                }}
                style={s.dobWheelItem}
              >
                <Text
                  style={[
                    s.dobWheelItemText,
                    {
                      color: isSelected ? C.violet : C.sub,
                      fontWeight: isSelected ? '800' : '500',
                      fontSize: isSelected ? 18 : 15,
                      opacity: isSelected ? 1 : 0.5,
                    },
                  ]}
                >
                  {display}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
});

/* ── Birthday Date Selector Box (one of three) ──────────────────────────────── */

const DobSelectorBox = React.memo(function DobSelectorBox({
  value,
  placeholder,
  active,
  showIcon,
  flexGrow,
  label,
  onPress,
}: {
  value: string | number | null;
  placeholder: string;
  active: boolean;
  showIcon: boolean;
  flexGrow: number;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[s.dateSelector, { flexGrow }, active && s.dateSelectorActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {showIcon && (
        <MaterialCommunityIcons name="calendar-month-outline" size={18} color={active ? C.violet : C.text} />
      )}
      <Text
        numberOfLines={1}
        style={[s.dateSelectorText, !value && s.dateSelectorPlaceholder, active && { color: C.text }]}
      >
        {value || placeholder}
      </Text>
      <MaterialCommunityIcons name={active ? 'chevron-up' : 'chevron-down'} size={16} color={active ? C.violet : C.sub} />
    </TouchableOpacity>
  );
});

function PrimaryButton({ children, onPress, disabled }: { children: React.ReactNode; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.85} style={[s.primaryButtonTouch, disabled && s.primaryButtonDisabled]}>
      <View pointerEvents="none" style={[s.primaryBtn, disabled && s.primaryBtnDisabled]}>
        <Text style={[s.primaryBtnText, disabled && { color: C.faint }]}>{children}</Text>
        <MaterialCommunityIcons name="arrow-right" size={17} color={disabled ? C.faint : COLORS.black} />
      </View>
    </TouchableOpacity>
  );
}

function StepActions({ children, step, label, onBack, compact, onMeasure }: { children: React.ReactNode; step: number; label: string; onBack: () => void; compact?: boolean; onMeasure?: (height: number) => void }) {
  const { t } = useTranslation();
  return (
    <>
      <View style={s.stepTopBar}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={s.topBackAction} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <MaterialCommunityIcons name="arrow-left" size={18} color={C.sub} />
          <Text style={s.backActionText}>{t('signup.back')}</Text>
        </TouchableOpacity>
        <StepBadge step={step} total={STEP_MAX} label={label} />
      </View>
      {/* The step body sizes itself against this block, so its real height has to travel up:
          the username step's field and the password step's two fields are far taller than the
          CTA, and guessing 52 for them left those steps a scroll too tall. */}
      <View style={s.actions} onLayout={onMeasure ? (e) => onMeasure(e.nativeEvent.layout.height) : undefined}>{children}</View>
    </>
  );
}

const Field = React.forwardRef<TextInput, { icon: any; label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; secureTextEntry?: boolean; autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'; right?: React.ReactNode; onFocus?: () => void; suffix?: string; inputValue?: string }>(function Field({ icon, label, value, onChangeText, placeholder, secureTextEntry, autoCapitalize, right, onFocus, suffix, inputValue }, ref) {
  const inputRef = useRef<TextInput | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[s.field, isFocused && s.fieldFocused]} accessibilityRole="none">
      {/* Negative margin cancels the row's padding so the whole box is the tap target. */}
      <TouchableOpacity activeOpacity={0.9} onPress={() => inputRef.current?.focus()} style={{ flex: 1, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, marginHorizontal: -16 }}>
        <MaterialCommunityIcons name={icon} size={18} color={isFocused ? C.violet : C.sub} />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={s.fieldLabel}>{label}</Text>
          <View style={suffix ? s.fieldInputRow : undefined}>
            <TextInput
              ref={node => { inputRef.current = node; if (typeof ref === 'function') ref(node); else if (ref) ref.current = node; }}
              onFocus={() => { setIsFocused(true); onFocus?.(); }}
              onBlur={() => setIsFocused(false)}
              style={[s.fieldInput, suffix && s.fieldInputWithSuffix]}
              value={inputValue ?? value}
              onChangeText={onChangeText}
              placeholder={placeholder}
              placeholderTextColor={C.sub}
              secureTextEntry={secureTextEntry}
              autoCapitalize={autoCapitalize || 'none'}
            />
            {suffix ? <Text style={s.fieldSuffix}>{suffix}</Text> : null}
          </View>
        </View>
      </TouchableOpacity>
      {right}
    </View>
  );
});

function GhostFieldRow({ icon, label, value, onChangeText, secure, capitalize, active, right, suffix, inputValue }: { icon: any; label: string; value: string; onChangeText: (value: string) => void; secure?: boolean; capitalize?: 'none' | 'sentences' | 'words' | 'characters'; active?: boolean; right?: React.ReactNode; suffix?: string; inputValue?: string }) {
  const inputRef = useRef<TextInput>(null);
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={() => inputRef.current?.focus()} style={[s.field, active && s.fieldFocused]}>
      <MaterialCommunityIcons name={icon} size={18} color={active ? C.violet : C.sub} />
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={s.fieldLabel}>{label}</Text>
        <View style={suffix ? s.fieldInputRow : undefined}>
          <TextInput
            ref={inputRef}
            autoFocus={active}
            style={[s.fieldInput, suffix && s.fieldInputWithSuffix]}
            value={inputValue ?? value}
            onChangeText={onChangeText}
            placeholder={label}
            placeholderTextColor={C.sub}
            secureTextEntry={secure}
            autoCapitalize={capitalize}
          />
          {suffix ? <Text style={s.fieldSuffix}>{suffix}</Text> : null}
        </View>
      </View>
      {right}
    </TouchableOpacity>
  );
}

/* ΓöÇΓöÇ Main Component ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */

interface Props {
  onSwitchToSignin: () => void;
  initialIndex?: number;
  initialGoogleInfo?: { firstName: string; lastName: string; email: string; birthDate?: string; googleIdToken: string };
}

export default function AnimatedOnboarding({ onSwitchToSignin, initialIndex = 0, initialGoogleInfo }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const reduceMotion = useReduceMotion();
  const STEP_LABELS = getStepLabels(t);
  const PURPOSES = getPurposes(t);
  const [index, setIndex] = useState(initialIndex);
  const [dir, setDir] = useState(1);
  const initialBirth = initialGoogleInfo?.birthDate?.split('-').map(Number) || [];
  const [form, setForm] = useState({ first: initialGoogleInfo?.firstName || '', last: initialGoogleInfo?.lastName || '', username: '', email: initialGoogleInfo?.email || '', purpose: '', birthMonth: initialBirth[1] || null as number | null, birthDay: initialBirth[2] || null as number | null, birthYear: initialBirth[0] || null as number | null, pw: '', pw2: '' });
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleInfo, setGoogleInfo] = useState<{ firstName: string; lastName: string; email: string; birthDate?: string; googleIdToken: string } | null>(initialGoogleInfo || null);
  const [userResult, setUserResult] = useState<{ user: User; token: string | null; emailConfirmationPending?: boolean } | null>(null);
  const [pendingEmailConfirm, setPendingEmailConfirm] = useState(false);
  const [profileSetupPending, setProfileSetupPending] = useState(false);
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const [emailChecking, setEmailChecking] = useState(false);
  const emailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const usernameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const hideFieldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Birthday screen vertical picker animation & state
  const [dobPickerActive, setDobPickerActive] = useState(false);
  const [dobActiveTab, setDobActiveTab] = useState<'month' | 'day' | 'year'>('month');
  const dobPickerAnim = useRef(new Animated.Value(0)).current;

  const openDobPicker = useCallback((tab: 'month' | 'day' | 'year' = 'month') => {
    setDobActiveTab(tab);
    setDobPickerActive(true);
    Animated.spring(dobPickerAnim, {
      toValue: 1,
      tension: 68,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }, [dobPickerAnim]);

  const closeDobPicker = useCallback(() => {
    Animated.timing(dobPickerAnim, {
      toValue: 0,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setDobPickerActive(false));
  }, [dobPickerAnim]);

  const [splashReady, setSplashReady] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const reveal = useRef(new Animated.Value(0)).current;
  const revealOpacity = useRef(new Animated.Value(1)).current;
  const revealCompleted = useRef(false);
  const holdRingA = useRef(new Animated.Value(0)).current;
  const holdRingB = useRef(new Animated.Value(0)).current;
  const holdRingC = useRef(new Animated.Value(0)).current;

  // Animations
  const spin = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const enterAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const holdButtonRef = useRef<View>(null);
  const vp = useViewport();
  // Screens lay out to at least the window height (so the CTA anchors to the bottom edge on
  // tall screens and the content scrolls on short ones) — from the live window, never a
  // snapshot taken when the module was first imported.
  const screenMin = { minHeight: vp.minScreenHeight };
  // Ceiling for a step body: what is left of the window once the top bar's strip, the CTA and
  // its gutter are paid for. The artwork inside the body absorbs the difference, so the
  // controls keep their size and the picture is the only thing that changes between a 667px
  // phone and a 900px window.
  const [actionsHeight, setActionsHeight] = useState(0);
  const stepBodyMax = Math.max(0, vp.height - STEP_SCROLL_PADDING - STEP_TOPBAR_STRIP - STEP_ACTIONBAR_GUTTER - (actionsHeight || STEP_CTA_HEIGHT));
  // The reveal circle starts from the measured button once the splash is pressed, and from
  // the window centre until then.
  const [revealOrigin, setRevealOrigin] = useState<{ x: number; y: number } | null>(null);
  const revealCenter = revealOrigin ?? { x: vp.width / 2, y: vp.height / 2 };
  const revealSize = Math.max(vp.width, vp.height) * 2.2;

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, (e) => {
      if (hideFieldTimer.current) { clearTimeout(hideFieldTimer.current); hideFieldTimer.current = null; }
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      hideFieldTimer.current = setTimeout(() => { setFocusedField(null); hideFieldTimer.current = null; }, 150);
    });
    return () => { showSubscription.remove(); hideSubscription.remove(); if (hideFieldTimer.current) clearTimeout(hideFieldTimer.current); };
  }, []);

  // Android hardware back: dismiss ghost overlay first, then go back
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (focusedField) {
        setFocusedField(null);
        Keyboard.dismiss();
        return true; // consumed
      }
      if (index > 0) {
        go(-1);
        return true; // consumed
      }
      return false; // let system handle (exit app)
    });
    return () => sub.remove();
  }, [focusedField, index]);

  // Continuous animations
  useEffect(() => {
    const animations: Animated.CompositeAnimation[] = [];
    if (reduceMotion) {
      spin.setValue(0);
      float.setValue(0);
      pulse.setValue(0);
      holdRingA.setValue(0);
      holdRingB.setValue(0);
      holdRingC.setValue(0);
      return;
    }
    animations.push(Animated.loop(Animated.timing(spin, { toValue: 1, duration: 22000, easing: Easing.linear, useNativeDriver: true })));
    animations.push(Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(float, { toValue: 0, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])));
    animations.push(Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true })));
    const ringAnimation = (value: Animated.Value, delay: number) => Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(value, { toValue: 1, duration: 1900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    animations.push(ringAnimation(holdRingA, 0), ringAnimation(holdRingB, 620), ringAnimation(holdRingC, 1240));
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [float, holdRingA, holdRingB, holdRingC, pulse, reduceMotion, spin]);

  // Splash auto-advance
  useEffect(() => {
    if (index === 0) {
      setSplashReady(false);
      const t = setTimeout(() => setSplashReady(true), 1400);
      return () => clearTimeout(t);
    }
  }, [index]);

  // Step enter animation
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    enterAnim.setValue(0);
    Animated.timing(enterAnim, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    if (index !== 6) {
      dobPickerAnim.setValue(0);
      setDobPickerActive(false);
    }
  }, [index, dobPickerAnim]);

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const stepIdx = index - 2;
  const step: Step | null = stepIdx >= 0 && stepIdx < STEPS.length ? STEPS[stepIdx] : null;

  const pwLen = form.pw.length;
  const pwOk = pwLen >= 6 && pwLen <= 128;
  const pwScore = pwLen === 0 ? 0 : pwLen < 6 ? 1 : pwLen < 10 ? 2 : 3;
  const pwMatched = pwOk && form.pw === form.pw2;
  const emailValid = /^[^\s@]+@gmail\.com$/i.test(form.email);
  const emailLocalPart = form.email.replace(/@gmail\.com$/i, '');
  const usernameValid = /^[a-z0-9][a-z0-9._]{3,28}[a-z0-9]$/.test(form.username);
  const birthDateValid = !!form.birthMonth && !!form.birthDay && !!form.birthYear;
  const isAdult = birthDateValid && (() => {
    const birthDate = new Date(form.birthYear!, form.birthMonth! - 1, form.birthDay!);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDelta = today.getMonth() - birthDate.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) age--;
    return age >= 18;
  })();

  const reviewItems = [
    !!(form.first && form.last),
    usernameValid && usernameAvailable === true,
    emailValid,
    !!form.purpose,
    isAdult,
    pwMatched,
  ];

  // Email availability check
  useEffect(() => {
    if (emailTimer.current) clearTimeout(emailTimer.current);
    if (emailValid && form.email.length > 5) {
      emailTimer.current = setTimeout(async () => {
        setEmailChecking(true);
        try {
          const res = await fetch(`${API_BASE}/user/check-email?email=${encodeURIComponent(form.email)}`);
          const data = await res.json();
          setEmailAvailable(data.available);
          if (!data.available) setErrors(p => ({ ...p, email: t('signup.emailTaken') }));
          else setErrors(p => { const n = { ...p }; delete n.email; return n; });
        } catch { setEmailAvailable(null); }
        setEmailChecking(false);
      }, 500);
    } else { setEmailAvailable(null); }
    return () => { if (emailTimer.current) clearTimeout(emailTimer.current); };
  }, [form.email, emailValid]);

  // Username availability check
  useEffect(() => {
    if (usernameTimer.current) clearTimeout(usernameTimer.current);
    if (usernameValid && form.username.length >= 1) {
      setUsernameChecking(true);
      usernameTimer.current = setTimeout(async () => {
        try {
          const res = await fetch(`${API_BASE}/user/check-username?username=${encodeURIComponent(form.username)}`);
          const data = await res.json();
          setUsernameAvailable(data.available);
          if (!data.available) setErrors(p => ({ ...p, username: t('signup.usernameTaken') }));
          else setErrors(p => { const n = { ...p }; delete n.username; return n; });
        } catch { setUsernameAvailable(null); }
        setUsernameChecking(false);
      }, 500);
    } else { setUsernameAvailable(null); }
    return () => { if (usernameTimer.current) clearTimeout(usernameTimer.current); };
  }, [form.username, usernameValid]);

  const go = (delta: number) => {
    setDir(delta);
    setErrors({});
    setFocusedField(null);
    Keyboard.dismiss();
    setIndex(i => Math.min(Math.max(i + delta, 0), 9));
  };

  const startSplashReveal = () => {
    if (!splashReady || revealing) return;
    holdButtonRef.current?.measureInWindow((x, y, width, height) => {
      setRevealOrigin({ x: x + width / 2, y: y + height / 2 });
      revealCompleted.current = false;
      setRevealing(true);
      Animated.timing(reveal, { toValue: 1, duration: 1900, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
        if (!finished) return;
        revealCompleted.current = true;
        setIndex(1);
        setTimeout(() => {
            Animated.timing(revealOpacity, { toValue: 0, duration: 760, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start(() => {
            reveal.setValue(0);
            revealOpacity.setValue(1);
            setRevealing(false);
          });
        }, 80);
      });
    });
  };

  const cancelSplashReveal = () => {
    if (!revealing || revealCompleted.current) return;
    reveal.stopAnimation(value => {
      Animated.timing(reveal, { toValue: value * 0.08, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => setRevealing(false));
    });
  };

  const validateAndNext = () => {
    if (step === 'name' && (!form.first.trim() || !form.last.trim())) { setErrors({ name: t('signup.nameNeeded') }); return; }
    if (step === 'username') {
      if (!usernameValid) { setErrors({ username: t('signup.usernameInvalid') }); return; }
      if (usernameAvailable !== true) { setErrors({ username: usernameAvailable === false ? t('signup.usernameTaken') : t('signup.usernameChecking') }); return; }
      // If Google pre-filled email, skip email step (jump from username ΓåÆ purpose)
      if (googleInfo) { go(2); return; }
    }
    if (step === 'email') {
      // If Google pre-filled, skip this step entirely
      if (googleInfo) { go(1); return; }
      if (!emailValid) { setErrors({ email: t('signup.emailGmailError') }); return; }
      if (emailAvailable !== true) { setErrors({ email: emailAvailable === false ? t('signup.emailTaken') : t('signup.emailChecking') }); return; }
    }
    if (step === 'purpose' && !form.purpose) return;
    if (step === 'dob') {
      if (!isAdult) { setErrors({ dob: t('signup.dobAgeError') }); return; }
      // If Google pre-filled DOB, skip to password
      if (googleInfo?.birthDate) { go(1); return; }
    }
    if (step === 'password' && !pwMatched) return;
    if (step === 'review') { submitSignup(); return; }
    go(1);
  };

  const submitSignup = async () => {
    setLoading(true); setErrors({});
    const fullName = [form.first, form.last].filter(Boolean).join(' ').trim();
    const dob = form.birthYear && form.birthMonth && form.birthDay
      ? `${form.birthYear}-${String(form.birthMonth).padStart(2, '0')}-${String(form.birthDay).padStart(2, '0')}`
      : '';
    try {
      const res = await apiSignup(fullName, form.email, form.pw, '', dob, form.username) as { user: User; token: string | null };
      // If user signed up via Google, link the Google identity to their account
      if (googleInfo?.googleIdToken) {
        try {
          await linkGoogleIdentity(googleInfo.googleIdToken);
        } catch (linkErr: any) {
          console.warn('[onboarding] Google link failed (non-blocking):', linkErr?.message);
        }
      }
      setUserResult(res);
      setPendingEmailConfirm(!res.user.email_verified);
      go(1); // → success / verification screen
    } catch (err: any) {
      if (err?.code === 'PROFILE_BOOTSTRAP_FAILED') {
        setProfileSetupPending(true);
        setErrors({});
        return;
      }
      setErrors({ email: err?.message || t('signup.signupFailed') });
      setIndex(4); // → email step
    } finally { setLoading(false); }
  };

  const retryProfileSetup = async () => {
    setLoading(true);
    const fullName = [form.first, form.last].filter(Boolean).join(' ').trim();
    const dob = form.birthYear && form.birthMonth && form.birthDay
      ? `${form.birthYear}-${String(form.birthMonth).padStart(2, '0')}-${String(form.birthDay).padStart(2, '0')}`
      : '';
    try {
      const res = await retrySignupProfileBootstrap(fullName, form.email, '', dob, form.username) as { user: User; token: string | null };
      if (googleInfo?.googleIdToken) {
        try { await linkGoogleIdentity(googleInfo.googleIdToken); }
        catch (linkErr: any) { console.warn('[onboarding] Google link failed (non-blocking):', linkErr?.message); }
      }
      setProfileSetupPending(false);
      setUserResult(res);
      setPendingEmailConfirm(!res.user.email_verified);
      go(1);
    } catch (err: any) {
      setErrors({ profileSetup: err?.message || t('signup.profileSetupIncomplete') });
    } finally { setLoading(false); }
  };

  const handleEnterApp = async () => { if (userResult) await store.setUser(userResult.user, userResult.token); };

  const handleGoogleSignup = async () => {
    setGoogleLoading(true);
    try {
      const info = await googleAuthInfo();
      setGoogleInfo(info);

      // Parse birthday (format: "YYYY-MM-DD") into month/day/year
      let birthMonth: number | null = null;
      let birthDay: number | null = null;
      let birthYear: number | null = null;
      if (info.birthDate) {
        const parts = info.birthDate.split('-');
        if (parts.length === 3) {
          birthYear = parseInt(parts[0], 10) || null;
          birthMonth = parseInt(parts[1], 10) || null;
          birthDay = parseInt(parts[2], 10) || null;
        }
      }

      // Pre-fill name, email, and DOB from Google
      setForm(f => ({
        ...f,
        first: info.firstName || f.first,
        last: info.lastName || f.last,
        email: info.email || f.email,
        birthMonth: birthMonth || f.birthMonth,
        birthDay: birthDay || f.birthDay,
        birthYear: birthYear || f.birthYear,
      }));

      // If we have all DOB fields, jump to username (skip name + DOB edit)
      // If no DOB, jump to username (skip name)
      // DOB step will be skipped later if all fields are pre-filled
      setDir(1);
      setIndex(3);
    } catch (err: any) {
      if (!String(err?.message || '').includes('cancelled')) {
        setErrors({ name: err?.message || t('signin.googleFailed') });
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const enterClass = dir >= 0 ? { opacity: enterAnim, transform: [{ translateX: enterAnim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }] }
    : { opacity: enterAnim, transform: [{ translateX: enterAnim.interpolate({ inputRange: [0, 1], outputRange: [-28, 0] }) }] };

  const canContinue =
    (step === 'name' && !(!form.first.trim() || !form.last.trim())) ||
    (step === 'username' && usernameValid && usernameAvailable === true) ||
    (step === 'email' && emailValid && emailAvailable === true) ||
    (step === 'purpose' && !!form.purpose) ||
    (step === 'password' && pwMatched) ||
    (step === 'review');

  const ghostOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    ghostOpacity.setValue(1);
  }, [focusedField, index, ghostOpacity]);

  const handleGhostContinue = () => {
    if (focusedField === 'first' && form.first.trim() && !form.last.trim()) {
      setFocusedField('last');
      return;
    }
    if (!canContinue) { validateAndNext(); return; }
    Animated.timing(ghostOpacity, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      Keyboard.dismiss();
      setFocusedField(null);
      validateAndNext();
    });
  };

  const ghostFieldMap = {
    email: { label: t('signin.emailAddress'), icon: 'email-outline', placeholder: '', value: form.email, inputValue: emailLocalPart, suffix: '@gmail.com', setValue: (value: string) => { const local = value.replace(/@.*$/, '').toLowerCase().replace(/[^a-z0-9.!#$%&'*+/=?^_{}|~-]/g, ''); set('email', `${local}@gmail.com`); }, secure: false, capitalize: 'none' as const },
    username: { label: t('field.username'), icon: 'at', placeholder: undefined, value: form.username, inputValue: undefined, suffix: undefined, setValue: (value: string) => set('username', value.toLowerCase().replace(/[^a-z0-9._]/g, '')), secure: false, capitalize: 'none' as const },
    first: { label: t('signup.firstName'), icon: 'account-outline', placeholder: undefined, value: form.first, inputValue: undefined, suffix: undefined, setValue: (value: string) => set('first', value), secure: false, capitalize: 'words' as const },
    last: { label: t('signup.lastName'), icon: 'account-outline', placeholder: undefined, value: form.last, inputValue: undefined, suffix: undefined, setValue: (value: string) => set('last', value), secure: false, capitalize: 'words' as const },
    pw: { label: t('signin.passwordLabel'), icon: 'lock-outline', placeholder: '••••••••', value: form.pw, inputValue: undefined, suffix: undefined, setValue: (value: string) => set('pw', value), secure: !showPw, capitalize: 'none' as const },
    pw2: { label: t('signup.confirmPassword'), icon: 'lock-outline', placeholder: '••••••••', value: form.pw2, inputValue: undefined, suffix: undefined, setValue: (value: string) => set('pw2', value), secure: !showPw, capitalize: 'none' as const },
  } as const;

  const ghostFieldKeys = focusedField === 'first' || focusedField === 'last' ? ['first', 'last'] as const
    : focusedField === 'pw' || focusedField === 'pw2' ? ['pw', 'pw2'] as const
    : focusedField ? [focusedField] as const : [];
  const ghostFields = ghostFieldKeys.map(key => ({ key, ...ghostFieldMap[key as keyof typeof ghostFieldMap] }));
  const usernameSuggestions = buildUsernameSuggestions(form.first, form.last, form.email);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg0 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={{ flex: 1, backgroundColor: C.bg0 }}>
        <OnboardingBackground />

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!dobPickerActive}
        >

          <Animated.View style={[s.slide, screenMin, enterClass]} key={index}>

            {/* SCREEN 0 -- SPLASH */}
            {index === 0 && (
              <View style={s.screenCenter}>
                <SplashIllustration spin={spin} />
                <Text style={s.splashBrand}>MaurMaket</Text>
                <Text style={s.splashSub}>{splashReady ? t('signup.splashReady') : t('signup.splashWarming')}</Text>
                <View style={s.dotsRow}>
                  {[0, 1, 2].map(d => (
                    <Animated.View key={d} style={[s.dot, { opacity: pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.4, 1, 0.4] }) }]} />
                  ))}
                </View>
                {splashReady && (
                  <TouchableOpacity
                    onPressIn={startSplashReveal}
                    onPressOut={cancelSplashReveal}
                    disabled={revealing}
                    ref={holdButtonRef}
                    style={s.holdCircle}
                    accessibilityRole="button"
                    accessibilityLabel={t('signup.holdToContinue')}
                  >
                    <Animated.View style={[s.holdRing, s.holdRingA, { opacity: holdRingA.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }), transform: [{ scale: holdRingA.interpolate({ inputRange: [0, 1], outputRange: [1, 1.85] }) }] }]} />
                    <Animated.View style={[s.holdRing, s.holdRingB, { opacity: holdRingB.interpolate({ inputRange: [0, 1], outputRange: [0.62, 0] }), transform: [{ scale: holdRingB.interpolate({ inputRange: [0, 1], outputRange: [1, 1.85] }) }] }]} />
                    <Animated.View style={[s.holdRing, s.holdRingC, { opacity: holdRingC.interpolate({ inputRange: [0, 1], outputRange: [0.54, 0] }), transform: [{ scale: holdRingC.interpolate({ inputRange: [0, 1], outputRange: [1, 1.85] }) }] }]} />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* SCREEN 1 -- WELCOME */}
            {index === 1 && (
              <View style={[s.welcomeScreen, screenMin]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 8, paddingBottom: 24 }}>
                  <Logomark size={34} />
                  <Text style={{ fontSize: 17, fontWeight: '700', color: C.text }}>MaurMaket</Text>
                </View>
                <WelcomeIllustration />
                <Text style={[s.heroTitle, { textAlign: 'center' }]}>
                  {t('signup.welcomeTitle1')}{'\n'}
                  <Text style={s.heroAccent}>{t('signup.welcomeTitle2')}</Text>
                </Text>
                <Text style={[s.heroSub, { textAlign: 'center', alignSelf: 'center' }]}>{t('signup.welcomeBody')}</Text>
                <View style={s.welcomeActions}>
                  <PrimaryButton onPress={() => go(1)}>{t('signup.getStarted')}</PrimaryButton>
                  <TouchableOpacity onPress={onSwitchToSignin} style={{ paddingVertical: 14 }}>
                    <Text style={{ textAlign: 'center', color: C.sub, fontSize: 14, fontWeight: '500' }}>{t('signup.iHaveAccount')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* SCREEN 2 -- NAME */}
            {index === 2 && (
              <View style={[s.stepScreen, screenMin]}>
                <View style={[s.centeredStepBody, s.nameStepBody, { maxHeight: stepBodyMax }]}>
                  <AssetIllustration asset="lets-start" accessibilityLabel={t('signup.illLetsStart')} />
                  <View style={s.nameFields}>
                    <Field icon="account-outline" label={t('signup.firstName')} value={form.first} onChangeText={v => set('first', v)} placeholder="Jordan" onFocus={() => setFocusedField('first')} />
                    <Field icon="account-outline" label={t('signup.lastName')} value={form.last} onChangeText={v => set('last', v)} placeholder="Reyes" onFocus={() => setFocusedField('last')} />
                    <Text style={s.fieldHint}>{t('signup.nameHint')}</Text>
                    {errors.name ? <Text style={s.fieldError}>{errors.name}</Text> : null}
                  </View>
                  {/* Google sign-up divider + button */}
                  <View style={{ width: '100%', marginTop: 20 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                      <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
                      <Text style={{ color: C.faint, fontSize: 12, fontWeight: '600' }}>{t('signup.orSignUpWith')}</Text>
                      <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
                    </View>
                    <GoogleButton onPress={handleGoogleSignup} loading={googleLoading} disabled={googleLoading} compact={false} label={t('auth.googleSignIn')} />
                  </View>
                </View>
                <StepActions step={1} label={STEP_LABELS.name} onBack={() => go(-1)} onMeasure={setActionsHeight}>
                  <PrimaryButton onPress={validateAndNext} disabled={!form.first || !form.last}>{t('signup.continue')}</PrimaryButton>
                </StepActions>
              </View>
            )}

            {/* SCREEN 3 -- USERNAME */}
            {index === 3 && (
              <View style={[s.stepScreen, screenMin]}>
                <View style={[s.centeredStepBody, { maxHeight: stepBodyMax }]}>
                  {/* The artwork lives in the body (not the CTA block) so it can give up height
                      on a short window and still leave the hint text somewhere visible. */}
                  <AssetIllustration
                    asset="pick-username"
                    accessibilityLabel={t('signup.illPickUsername')}
                    containerStyle={{ marginBottom: 15 }}
                  />
                  <Text style={s.fieldHint}>{t('signup.usernameHint')}</Text>
                  {form.username.length > 0 && !usernameValid ? <Text style={s.fieldError}>{t('signup.usernameInvalid')}</Text> : null}
                  {usernameAvailable === true ? <Text style={[s.fieldError, { color: C.mint }]}>{t('signup.usernameAvailable')}</Text> : null}
                  {errors.username ? <Text style={s.fieldError}>{errors.username}</Text> : null}
                </View>
                <StepActions step={2} label={STEP_LABELS.username} onBack={() => go(-1)} onMeasure={setActionsHeight}>
                  <Field
                    icon="at"
                    label={t('field.username')}
                    value={form.username}
                    onChangeText={v => set('username', v.toLowerCase().replace(/[^a-z0-9._]/g, ''))}
                    placeholder="jordan.reyes"
                    onFocus={() => setFocusedField('username')}
                    right={
                      usernameChecking ? <ActivityIndicator size="small" color={C.faint} /> :
                      usernameAvailable === true ? <MaterialCommunityIcons name="check-circle" size={17} color={C.mint} /> :
                      usernameAvailable === false ? <MaterialCommunityIcons name="close-circle" size={17} color={C.pink} /> : null
                    }
                  />
                  <View style={{ height: 15 }} />
                  <PrimaryButton onPress={validateAndNext} disabled={!usernameValid || usernameAvailable !== true}>{t('signup.continue')}</PrimaryButton>
                </StepActions>
              </View>
            )}

            {/* SCREEN 4 -- EMAIL */}
            {index === 4 && (
              <View style={[s.stepScreen, screenMin]}>
                <View style={[s.centeredStepBody, { maxHeight: stepBodyMax }]}>
                  <AssetIllustration
                    asset="digital-address"
                    accessibilityLabel={t('signup.illDigitalAddress')}
                    containerStyle={{ marginBottom: 15 }}
                  />
                  <Field icon="email-outline" label={t('signin.emailAddress')} value={form.email} inputValue={emailLocalPart} suffix="@gmail.com" onChangeText={v => { const local = v.replace(/@.*$/, '').toLowerCase().replace(/[^a-z0-9.!#$%&'*+/=?^_{}|~-]/g, ''); set('email', `${local}@gmail.com`); }} placeholder="" onFocus={() => setFocusedField('email')} right={
                    emailChecking ? <ActivityIndicator size="small" color={C.faint} /> :
                    emailAvailable === true ? <MaterialCommunityIcons name="check-circle" size={17} color={C.mint} /> :
                    emailAvailable === false ? <MaterialCommunityIcons name="close-circle" size={17} color={C.pink} /> : null
                  } />
                  <Text style={s.fieldHint}>{t('signup.emailGmailHint')}</Text>
                  {errors.email ? <Text style={s.fieldError}>{errors.email}</Text> : null}
                  {emailAvailable === true ? <Text style={[s.fieldError, { color: C.mint }]}>{t('signup.emailAvailable')}</Text> : null}
                </View>
                <StepActions step={3} label={STEP_LABELS.email} onBack={() => go(-1)} onMeasure={setActionsHeight}>
                  <PrimaryButton onPress={validateAndNext} disabled={!emailValid || emailAvailable !== true}>{t('signup.continue')}</PrimaryButton>
                </StepActions>
              </View>
            )}

            {/* SCREEN 5 -- PURPOSE */}
            {index === 5 && (
              <View style={[s.stepScreen, screenMin]}>
                <View style={[s.centeredStepBody, s.purposeStepBody, { maxHeight: stepBodyMax }]}>
                  <AssetIllustration
                    asset="choose-purpose"
                    accessibilityLabel={t('signup.illChoosePurpose')}
                    containerStyle={{ marginBottom: 0 }}
                  />
                  <View style={s.purposeChoices}>
                  {PURPOSES.map(p => {
                    const active = form.purpose === p.id;
                    return (
                      <TouchableOpacity key={p.id} onPress={() => set('purpose', p.id)} activeOpacity={0.85} style={[s.purposeCard, active && s.purposeCardActive]}>
                        <View style={[s.purposeIcon, active && s.purposeIconActive]}>
                          <MaterialCommunityIcons name={p.icon} size={18} color={active ? COLORS.black : C.sub} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.purposeTitle}>{p.title}</Text>
                          <Text style={s.purposeDesc}>{p.desc}</Text>
                        </View>
                        <View style={[s.radio, active && s.radioActive]}>
                          {active && <MaterialCommunityIcons name="check" size={11} color={COLORS.black} />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                  </View>
                </View>
                <StepActions step={4} label={STEP_LABELS.purpose} onBack={() => go(-1)} onMeasure={setActionsHeight}>
                  <PrimaryButton onPress={validateAndNext} disabled={!form.purpose}>{t('signup.continue')}</PrimaryButton>
                </StepActions>
              </View>
            )}

            {/* SCREEN 6 -- DOB */}
            {index === 6 && (() => {
              const monthItems = ALL_MONTHS;
              const maxDaysInMonth = form.birthMonth && form.birthYear
                ? new Date(form.birthYear, form.birthMonth, 0).getDate()
                : 31;
              const dayItems = DAY_CACHE[maxDaysInMonth] ?? DAY_CACHE[31];
              const yearItems = ALL_YEARS;

              const mm = form.birthMonth ? String(form.birthMonth).padStart(2, '0') : 'MM';
              const dd = form.birthDay ? String(form.birthDay).padStart(2, '0') : 'DD';
              const yyyy = form.birthYear ? String(form.birthYear) : 'YYYY';
              const formattedFullDate = `${mm}/${dd}/${yyyy}`;

              let ageNumber: number | null = null;
              if (birthDateValid) {
                const birthDate = new Date(form.birthYear!, form.birthMonth! - 1, form.birthDay!);
                const today = new Date();
                let age = today.getFullYear() - birthDate.getFullYear();
                const monthDelta = today.getMonth() - birthDate.getMonth();
                if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) age--;
                ageNumber = age;
              }

              const artOpacity = dobPickerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 0],
              });              // How tall the step actually lays out: the window minus the scroll content's
              // bottom padding, but never shorter than the screen minimum (below that the
              // page scrolls instead of squashing, and the CTA stays with the content).
              const stepLayoutHeight = Math.max(vp.height - STEP_SCROLL_PADDING, vp.minScreenHeight);
              // Space the picker has to work with: the step header down to the CTA's top edge.
              // actionsHeight is the measured CTA block, so a step with a taller CTA gives the
              // wheel less room on its own — nothing here guesses a button height.
              const ctaTop = stepLayoutHeight - STEP_ACTIONBAR_GUTTER - (actionsHeight || STEP_CTA_HEIGHT);
              const dobStageBudget = Math.max(0, ctaTop - DOB_STAGE_CTA_GAP - STEP_TOPBAR_STRIP);

              // Drum first: it keeps its five rows unless the window can't hold a minimal card
              // and the selector row as well, in which case it sheds rows and the glass lens
              // follows the drum's new centre.
              const dobTrayHeight = Math.round(Math.max(
                DOB_TRAY_MIN_HEIGHT,
                Math.min(DOB_TRAY_HEIGHT, dobStageBudget - DOB_PILL_MIN_HEIGHT - DOB_ROW_HEIGHT - DOB_STAGE_GAP * 2),
              ));
              const dobWheelPad = Math.max(0, (dobTrayHeight - DOB_TRAY_HEADER - DOB_TRAY_FOOTER - DOB_ITEM_HEIGHT) / 2);
              const dobLensTop = DOB_TRAY_HEADER + dobWheelPad;
              // The card takes whatever is left over, within its own compact range.
              const dobPillHeight = Math.round(Math.max(
                DOB_PILL_MIN_HEIGHT,
                Math.min(DOB_PILL_HEIGHT, dobStageBudget - dobTrayHeight - DOB_ROW_HEIGHT - DOB_STAGE_GAP * 2),
              ));
              const dobStageHeight = dobPillHeight + DOB_ROW_HEIGHT + dobTrayHeight + DOB_STAGE_GAP * 2;

              // Selector row: a tighter gutter on a narrow window, and the calendar icons only
              // while the row can still afford them (see the width constants).
              const dobRowGap = vp.contentWidth >= 340 ? DOB_ROW_GAP_WIDE : DOB_ROW_GAP_TIGHT;
              const dobSelectorIcons =
                vp.contentWidth - dobRowGap * 2 >=
                DOB_SELECTOR_TEXT_WIDTHS + DOB_SELECTOR_FRAME * 3 + DOB_SELECTOR_ICON_FRAME * 3;
              const dobDateFontSize = Math.round(Math.max(24, Math.min(
                36,
                (vp.contentWidth - DOB_DATE_PADDING - DOB_DATE_TRACKING) / DOB_DATE_WIDTH_PER_POINT,
              )));
              // Bottom-anchored: the stage rests on the CTA's shoulder, so opening the wheel
              // reads as a picker rising into place rather than a card drifting mid-screen.
              const dobStageTop = Math.max(STEP_TOPBAR_STRIP, Math.round(ctaTop - DOB_STAGE_CTA_GAP - dobStageHeight));
              // Where the selector row rests while the wheel is shut — tucked just under the
              // artwork, which is where the step's own bottom offset already puts it.
              const dobRowRestTop = stepLayoutHeight - DOB_ART_BOTTOM + DOB_ROW_GAP;
              const dobLift = Math.max(0, Math.round(dobRowRestTop - (dobStageTop + dobPillHeight + DOB_STAGE_GAP)));

              // Tallest backdrop this window can hold below the step header. Decorative, so it
              // only ever loses height (keeping its own ratio) rather than riding up behind the
              // Back button on a short screen.
              const dobArtHeight = Math.round(Math.max(200, Math.min(
                DOB_ART_HEIGHT,
                stepLayoutHeight - DOB_ART_BOTTOM - STEP_TOPBAR_STRIP - STEP_BODY_GUTTER,
              )));

              // Closed: the stage is pushed down so the selector row sits under the artwork.
              // Open: it slides up to its bottom-anchored place and stays there.
              const containerTranslateY = dobPickerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [dobLift, 0],
              });

              const headerOpacity = dobPickerAnim.interpolate({
                inputRange: [0, 0.4, 1],
                outputRange: [0, 0.5, 1],
              });

              const headerTranslateY = dobPickerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [14, 0],
              });

              const carouselOpacity = dobPickerAnim.interpolate({
                inputRange: [0, 0.3, 1],
                outputRange: [0, 0.4, 1],
              });

              const carouselTranslateY = dobPickerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [24, 0],
              });

              return (
                <View style={[s.stepScreen, screenMin]}>
                  {/* Backdrop dismiss when wheel is open */}
                  {dobPickerActive && (
                    <TouchableOpacity
                      activeOpacity={1}
                      onPress={closeDobPicker}
                      style={StyleSheet.absoluteFill}
                    />
                  )}

                  {/* Fading Illustration */}
                  <Animated.View
                    pointerEvents={dobPickerActive ? 'none' : 'auto'}
                    style={[s.birthdayArtwork, { opacity: artOpacity, height: dobArtHeight }]}
                  >
                    <AssetIllustration
                      asset="birthday"
                      accessibilityLabel="Birthday illustration"
                      containerStyle={{ height: '100%', marginBottom: 0 }}
                    />
                  </Animated.View>

                  {/* Animated Center Stage Container: Date Shower + 3 Boxes + Vertical Wheels */}
                  <Animated.View
                    pointerEvents={dobPickerActive ? 'box-none' : 'auto'}
                    style={[
                      s.dobCenterContainer,
                      {
                        top: dobStageTop,
                        gap: DOB_STAGE_GAP,
                        transform: [{ translateY: containerTranslateY }],
                      },
                    ]}
                  >
                    {/* White Date Shower above the boxes */}
                    <Animated.View
                      pointerEvents={dobPickerActive ? 'auto' : 'none'}
                      style={[
                        s.dobDateShower,
                        {
                          height: dobPillHeight,
                          opacity: headerOpacity,
                          transform: [{ translateY: headerTranslateY }],
                        },
                      ]}
                    >
                      <View style={s.dobDateShowerPill}>
                        <Text style={s.dobCardMiniLabel}>{t('signup.dobLabel')}</Text>
                        <Text style={[s.dobDateShowerText, { fontSize: dobDateFontSize }]}>{formattedFullDate}</Text>
                        {ageNumber != null && (
                          <Text
                            style={[
                              s.dobAgeBadge,
                              ageNumber >= 18 ? s.dobAgeBadgeAdult : s.dobAgeBadgeMinor,
                            ]}
                          >
                            {ageNumber >= 18
                              ? t('signup.ageVerified', { age: ageNumber })
                              : t('signup.ageMinor', { age: ageNumber })}
                          </Text>
                        )}
                      </View>
                    </Animated.View>

                    {/* 3 Date Selector Boxes */}
                    <View style={[s.datePickerRow, { height: DOB_ROW_HEIGHT, gap: dobRowGap }]}>
                      <DobSelectorBox
                        value={form.birthMonth ? MONTH_NAMES[form.birthMonth - 1] : null}
                        placeholder={t('signup.month')}
                        active={dobPickerActive && dobActiveTab === 'month'}
                        showIcon={dobSelectorIcons}
                        flexGrow={DOB_SELECTOR_FLEX.month}
                        label={t('signup.selectMonth')}
                        onPress={() => {
                          if (!form.birthMonth) set('birthMonth', 1);
                          openDobPicker('month');
                        }}
                      />
                      <DobSelectorBox
                        value={form.birthDay}
                        placeholder={t('signup.day')}
                        active={dobPickerActive && dobActiveTab === 'day'}
                        showIcon={dobSelectorIcons}
                        flexGrow={DOB_SELECTOR_FLEX.day}
                        label={t('signup.selectDay')}
                        onPress={() => {
                          if (!form.birthDay) set('birthDay', 1);
                          openDobPicker('day');
                        }}
                      />
                      <DobSelectorBox
                        value={form.birthYear}
                        placeholder={t('signup.year')}
                        active={dobPickerActive && dobActiveTab === 'year'}
                        showIcon={dobSelectorIcons}
                        flexGrow={DOB_SELECTOR_FLEX.year}
                        label={t('signup.selectYear')}
                        onPress={() => {
                          if (!form.birthYear) set('birthYear', CURRENT_YEAR - 18);
                          openDobPicker('year');
                        }}
                      />
                    </View>

                    {/* Revealing Vertical Carousel Tray */}
                    {dobPickerActive && (
                      <Animated.View
                        style={[
                          s.dobWheelTray,
                          {
                            height: dobTrayHeight,
                            opacity: carouselOpacity,
                            transform: [{ translateY: carouselTranslateY }],
                          },
                        ]}
                      >
                        {/* Horizontal Frosted Glass Center Lens */}
                        <View pointerEvents="none"                    style={[s.dobWheelGlassLens, { top: dobLensTop }]}>
                          <LinearGradient
                            colors={['transparent', COLORS.coralMuted, 'transparent']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={StyleSheet.absoluteFill}
                          />
                        </View>

                        {/* Top Gradient Fade Overlay */}
                        <LinearGradient
                          pointerEvents="none"
                          colors={[C.surface, 'transparent']}
                          style={s.dobWheelTopFade}
                        />

                        {/* Bottom Gradient Fade Overlay */}
                        <LinearGradient
                          pointerEvents="none"
                          colors={['transparent', C.surface]}
                          style={s.dobWheelBottomFade}
                        />

                        <View style={s.dobWheelRow}>
                          <DobWheelColumn
                            label={t('signup.month')}
                            items={monthItems}
                            selectedValue={form.birthMonth}
                            pad={dobWheelPad}
                            onSelect={m => {
                              set('birthMonth', m);
                              setDobActiveTab('month');
                            }}
                            formatItem={m => MONTH_NAMES[m - 1]}
                          />
                          <DobWheelColumn
                            label={t('signup.day')}
                            items={dayItems}
                            selectedValue={form.birthDay}
                            pad={dobWheelPad}
                            onSelect={d => {
                              set('birthDay', d);
                              setDobActiveTab('day');
                            }}
                          />
                          <DobWheelColumn
                            label={t('signup.year')}
                            items={yearItems}
                            selectedValue={form.birthYear}
                            pad={dobWheelPad}
                            onSelect={y => {
                              set('birthYear', y);
                              setDobActiveTab('year');
                            }}
                          />
                        </View>
                      </Animated.View>
                    )}
                  </Animated.View>

                  <StepActions
                    step={5}
                    label={STEP_LABELS.dob}
                    onMeasure={setActionsHeight}
                    onBack={() => {
                      if (dobPickerActive) {
                        closeDobPicker();
                      } else {
                        go(-1);
                      }
                    }}
                  >
                    <PrimaryButton onPress={validateAndNext} disabled={!birthDateValid}>
                      {t('signup.continue')}
                    </PrimaryButton>
                  </StepActions>
                </View>
              );
            })()}

            {/* SCREEN 7 -- PASSWORD */}
            {index === 7 && (
              <View style={[s.stepScreen, screenMin]}>
                <View style={[s.centeredStepBody, { maxHeight: stepBodyMax }]}>
                  <AssetIllustration asset="keep-it-protected" accessibilityLabel={t('signup.illKeepProtected')} />
                </View>
                <StepActions step={6} label={STEP_LABELS.password} onBack={() => go(-1)} onMeasure={setActionsHeight}>
                  <View style={s.passwordActionContainer}>
                    <Field icon="lock-outline" label={t('signin.passwordLabel')} value={form.pw} onChangeText={v => set('pw', v)} placeholder="••••••••" secureTextEntry={!showPw} onFocus={() => setFocusedField('pw')} right={
                      <TouchableOpacity onPress={() => setShowPw(s => !s)} hitSlop={{ top: 20, bottom: 20, left: 50, right: 0 }} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 50, justifyContent: 'center', alignItems: 'center' }}>
                        <MaterialCommunityIcons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={28} color={C.faint} />
                      </TouchableOpacity>
                    } />
                    <Field icon="lock-outline" label={t('signup.confirmPassword')} value={form.pw2} onChangeText={v => set('pw2', v)} placeholder="••••••••" secureTextEntry={!showPw} onFocus={() => setFocusedField('pw2')} right={
                      form.pw2 ? (pwMatched ? <MaterialCommunityIcons name="check-circle" size={17} color={C.mint} /> : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.pink }} />) : null
                    } />
                    <Text style={s.fieldHint}>{t('signup.passwordRuleHint')}</Text>
                    <PrimaryButton onPress={validateAndNext} disabled={!pwMatched}>{t('signup.continue')}</PrimaryButton>
                  </View>
                </StepActions>
              </View>
            )}

            {/* SCREEN 8 -- REVIEW */}
            {index === 8 && (
              <View style={[s.stepScreen, screenMin]}>
                <View style={[s.reviewBody, { maxHeight: stepBodyMax }]}>
                  <AssetIllustration
                    asset="youre-ready"
                    accessibilityLabel={t('signup.illYoureReady')}
                    containerStyle={s.reviewArtwork}
                  />
                  <View style={s.reviewList}>
                    {[
                      [t('signup.reviewName'), form.first ? `${form.first} ${form.last}` : '--', reviewItems[0]],
                      [t('field.username'), form.username ? `@${form.username}` : '--', reviewItems[1]],
                      [t('signup.reviewEmail'), form.email || '--', reviewItems[2]],
                      [t('signup.reviewPurpose'), PURPOSES.find(p => p.id === form.purpose)?.title || '--', reviewItems[3]],
                      [t('signup.reviewBirthday'), birthDateValid ? `${form.birthMonth}/${form.birthDay}/${form.birthYear}` : '--', reviewItems[4]],
                      [t('signin.passwordLabel'), pwMatched ? t('signup.reviewSet') : '--', reviewItems[5]],
                    ].map(([label, val, ok], i) => (
                      <View key={i} style={s.reviewRow}>
                        <Text style={s.reviewLabel}>{label}</Text>
                        <Text style={s.reviewVal} numberOfLines={1}>{val as string}</Text>
                        {((i === 2 && googleInfo) || (i === 4 && googleInfo?.birthDate)) ? (
                          <View style={s.reviewGoogleTag}>
                            <Text style={s.reviewGoogleText}>Google</Text>
                          </View>
                        ) : null}
                        <View style={[s.reviewCheck, ok ? { backgroundColor: C.mint + '15', borderColor: C.mint } : {}]}>
                          {ok ? <MaterialCommunityIcons name="check" size={11} color={C.mint} /> : null}
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
                {profileSetupPending ? (
                  <Text style={s.profileSetupError}>{errors.profileSetup || t('signup.profileSetupIncomplete')}</Text>
                ) : null}
                <StepActions step={7} label={STEP_LABELS.review} onBack={() => go(-1)} onMeasure={setActionsHeight}>
                  <PrimaryButton onPress={profileSetupPending ? retryProfileSetup : validateAndNext} disabled={loading}>
                    {loading ? t('common.loading') : profileSetupPending ? t('signup.retryProfileSetup') : t('signup.createAccountBtn')}
                  </PrimaryButton>
                </StepActions>
              </View>
            )}

            {/* SCREEN 9 -- VERIFICATION / SUCCESS */}
            {index === 9 && (
              pendingEmailConfirm
                ? <EmailConfirmationScreen name={form.first} email={form.email} onDone={handleEnterApp} />
                : <VerificationScreen name={form.first} onDone={handleEnterApp} />
            )}

          </Animated.View>
        </ScrollView>
        {focusedField && ghostFields.length > 0 && (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: ghostOpacity }]}>
            <BlurView intensity={72} tint="dark" style={s.keyboardDimmer}>
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => { Keyboard.dismiss(); setFocusedField(null); }}
                style={StyleSheet.absoluteFill}
                accessibilityLabel={t('signin.dismissKeyboard')}
              />
            </BlurView>
            {focusedField === 'username' && usernameSuggestions.length > 0 && (
              <View style={s.usernameSuggestionStrip}>
                {usernameSuggestions.map(suggestion => (
                  <TouchableOpacity
                    key={suggestion}
                    onPress={() => set('username', suggestion)}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                    style={[s.usernameSuggestion, form.username === suggestion && s.usernameSuggestionActive]}
                    accessibilityRole="button"
                    accessibilityLabel={t('signup.useUsernameA11y', { username: suggestion })}
                  >
                    <Text style={[s.usernameSuggestionText, form.username === suggestion && s.usernameSuggestionTextActive]} numberOfLines={1}>
                      @{suggestion}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <View style={[s.keyboardGhostStack, { bottom: 123 }]}>
              {ghostFields.map((ghostField) => (
                <GhostFieldRow
                  key={ghostField.key}
                  icon={ghostField.icon}
                  label={ghostField.label}
                  value={ghostField.value}
                  inputValue={ghostField.inputValue}
                  suffix={ghostField.suffix}
                  onChangeText={ghostField.setValue}
                  secure={ghostField.secure}
                  capitalize={ghostField.capitalize}
                  active={ghostField.key === focusedField}
                  right={ghostField.key === 'username' ? (
                    usernameChecking ? <ActivityIndicator size="small" color={C.faint} /> :
                    usernameAvailable === true ? <MaterialCommunityIcons name="check-circle" size={17} color={C.mint} /> :
                    usernameAvailable === false ? <MaterialCommunityIcons name="close-circle" size={17} color={C.pink} /> : null
                  ) : ghostField.key === 'email' ? (
                    emailChecking ? <ActivityIndicator size="small" color={C.faint} /> :
                    emailAvailable === true ? <MaterialCommunityIcons name="check-circle" size={17} color={C.mint} /> :
                    emailAvailable === false ? <MaterialCommunityIcons name="close-circle" size={17} color={C.pink} /> : null
                  ) : ghostField.key === 'pw' ? (
                    <TouchableOpacity onPress={() => setShowPw(show => !show)} hitSlop={{ top: 20, bottom: 20, left: 50, right: 0 }} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 50, justifyContent: 'center', alignItems: 'center' }} accessibilityRole="button" accessibilityLabel={showPw ? t('signup.hidePassword') : t('signup.showPassword')}>
                      <MaterialCommunityIcons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={28} color={C.faint} />
                    </TouchableOpacity>
                  ) : ghostField.key === 'pw2' && ghostField.value ? (
                    pwMatched ? <MaterialCommunityIcons name="check-circle" size={17} color={C.mint} /> : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.pink }} />
                  ) : undefined}
                />
              ))}
            </View>
            <View style={[s.keyboardGhostContinue, { bottom: 56 }]}>
              <TouchableOpacity onPress={handleGhostContinue} style={s.keyboardGhostButton} accessibilityRole="button" accessibilityLabel={t('signup.continue')}>
                <Text style={s.keyboardGhostContinueText}>{t('signup.continue')}</Text>
                <MaterialCommunityIcons name="arrow-right" size={17} color={C.sub} />
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
        {revealing && (
          <Animated.View
            pointerEvents="none"
            style={[
              s.revealLayer,
              {
                width: revealSize,
                height: revealSize,
                left: revealCenter.x - revealSize / 2,
                top: revealCenter.y - revealSize / 2,
              },
              { opacity: revealOpacity, transform: [{ scale: reveal }] },
            ]}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

/* ΓöÇΓöÇ Styles ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */

const s = StyleSheet.create({
  scrollContent: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 28, paddingTop: 0, paddingBottom: STEP_SCROLL_PADDING },
  // minHeight is applied per-render (see screenMin) so it always matches the live window;
  // maxWidth matches CONTENT_MAX_WIDTH in the layout hooks.
  slide: { flex: 1, width: '100%', maxWidth: 430, alignSelf: 'center' },
  stepScreen: { flex: 1, position: 'relative', paddingTop: STEP_TOPBAR_STRIP, paddingBottom: STEP_ACTIONBAR_GUTTER },
  // The body owns the space between the top bar and the CTA block and centres its content
  // in it, so the air above and below the artwork is decided by the layout, not by offsets.
  centeredStepBody: { flex: 1, justifyContent: 'center', paddingVertical: STEP_BODY_GUTTER },
  nameStepBody: { alignItems: 'center' },
  nameFields: { width: '100%', gap: 12 },
  screenCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  welcomeScreen: { justifyContent: 'center', paddingVertical: 24, position: 'relative', paddingBottom: 144 },
  welcomeActions: { position: 'absolute', left: 0, right: 0, bottom: 18, gap: 12 },
  stepTopBar: { position: 'absolute', top: 28, left: 0, right: 0, zIndex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepCount: { color: C.sub, fontSize: 13, fontWeight: '700', letterSpacing: 0.5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  datePickerRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 15,
    zIndex: 14,
  },
  // flexGrow comes per-box from DOB_SELECTOR_FLEX so the row's shares follow its content.
  dateSelector: { flex: 1, minWidth: 0, alignSelf: 'stretch', borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', gap: 2 },
  dateSelectorActive: { borderColor: C.violet, backgroundColor: C.surfaceHi, shadowColor: C.violet, shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  dateSelectorText: { flex: 1, color: C.text, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  dateSelectorPlaceholder: { color: C.sub, fontWeight: '500' },
  // marginTop:'auto' keeps the CTA block on the floor of the column on the steps whose own
  // children are all absolutely positioned (email, purpose, birthday) — those have no flex
  // body to soak up the slack.
  actions: { width: '100%', alignItems: 'stretch', zIndex: 11, marginTop: 'auto' },
  // Height comes per-render from dobArtHeight, so the backdrop can never reach the header.
  birthdayArtwork: { position: 'absolute', left: 0, right: 0, bottom: DOB_ART_BOTTOM, marginBottom: 0 },

  // The stage column: white card, selector row, wheel tray. Its top, its height and its
  // pieces all come from the live window per-render, so it lands above the CTA on any
  // screen instead of overlapping it on a short one.
  dobCenterContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: 'visible',
  },
  dobDateShower: {
    width: '100%',
    zIndex: 15,
  },
  dobDateShowerPill: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    shadowColor: COLORS.black,
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  dobCardMiniLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: C.violet,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  // fontSize comes per-render from dobDateFontSize so the date fits the card on any window.
  dobDateShowerText: {
    color: C.text,
    fontWeight: '900',
    letterSpacing: 3,
    textAlign: 'center',
  },
  dobAgeBadge: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
  },
  dobAgeBadgeAdult: {
    backgroundColor: COLORS.greenMuted,
    color: COLORS.green,
  },
  dobAgeBadgeMinor: {
    backgroundColor: COLORS.coralMuted,
    color: COLORS.error,
  },
  dobWheelTray: {
    width: '100%',
    borderRadius: 24,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.border,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
    shadowColor: C.violet,
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
    zIndex: 12,
  },
  dobWheelRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    zIndex: 1,
  },
  dobWheelCol: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
  },
  dobWheelViewport: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
  },
  dobWheelGlassLens: {
    position: 'absolute',
    left: 8,
    right: 8,
    height: DOB_ITEM_HEIGHT,
    borderRadius: 14,
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
    zIndex: 2,
    shadowColor: C.violet,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  dobWheelTopFade: {
    position: 'absolute',
    top: DOB_TRAY_HEADER,
    left: 0,
    right: 0,
    height: 48,
    zIndex: 3,
  },
  dobWheelBottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 48,
    zIndex: 3,
  },
  dobWheelLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: C.sub,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  dobWheelScroll: {
    width: '100%',
    flex: 1,
  },
  dobWheelItem: {
    width: '100%',
    height: DOB_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dobWheelItemText: {
    fontSize: 15,
    color: C.faint,
    fontWeight: '600',
    textAlign: 'center',
  },

  topBackAction: { minHeight: TOUCH.min, paddingHorizontal: 4, paddingRight: 12, borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  backActionText: { color: C.sub, fontSize: 14, fontWeight: '600' },
  // Splash
  splashBrand: { fontSize: 28, fontWeight: '800', color: C.text, marginTop: 12 },
  splashSub: { fontSize: 14, color: C.sub, marginTop: 8, maxWidth: 220, textAlign: 'center' },
  dotsRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.faint },
  holdCircle: { width: 64, height: 64, marginTop: 56, borderRadius: 32, borderWidth: 1.5, borderColor: 'rgba(236,72,153,0.72)', backgroundColor: 'rgba(18,14,31,0.9)', alignItems: 'center', justifyContent: 'center', shadowColor: C.pink, shadowOpacity: 0.8, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
  holdRing: { position: 'absolute', width: 64, height: 64, borderRadius: 32, borderWidth: 1.5 },
  holdRingA: { borderColor: C.pink },
  holdRingB: { borderColor: C.violet },
  holdRingC: { borderColor: C.amber },
  revealLayer: { position: 'absolute', borderRadius: 999, backgroundColor: C.pink, shadowColor: C.amber, shadowOpacity: 0.8, shadowRadius: 70, shadowOffset: { width: 0, height: 0 }, elevation: 14 },

  // Welcome
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  badgeText: { fontSize: 12, fontWeight: '500', color: C.sub },
  heroTitle: { fontSize: 32, fontWeight: '800', color: C.text, lineHeight: 38, marginTop: 12 },
  heroAccent: { color: C.violet },
  heroSub: { fontSize: 14, color: C.sub, lineHeight: 21, marginTop: 10, maxWidth: 280 },

  // Steps
  stepTitle: { fontSize: 24, fontWeight: '800', color: C.text, marginTop: 8, textAlign: 'center' },
  stepSub: { fontSize: 14, color: C.sub, marginTop: 8, marginBottom: 24, lineHeight: 20, textAlign: 'center', alignSelf: 'center', maxWidth: 340 },

  // Fields
  field: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 58, borderRadius: 16, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.borderHi, paddingHorizontal: 16 },
  fieldFocused: { borderColor: C.violet, backgroundColor: 'rgba(38,29,60,0.92)', shadowColor: C.violet, shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: C.sub },
  fieldInput: { backgroundColor: 'transparent', borderWidth: 0, color: C.text, fontSize: 14, fontWeight: '500' as const, padding: 0 },
  fieldInputRow: { flexDirection: 'row', alignItems: 'center' },
  fieldInputWithSuffix: { flex: 1 },
  fieldSuffix: { color: C.sub, fontSize: 14, fontWeight: '500' as const },
  fieldHint: { color: C.faint, fontSize: 12, lineHeight: 17, marginTop: 4 },
  passwordActionContainer: { width: '100%', gap: 15 },
  fieldError: { color: C.pink, fontSize: 12.5, marginTop: 4 },
  keyboardGhostStack: { position: 'absolute', left: 28, right: 28, paddingHorizontal: 0, paddingVertical: 0, gap: 8 },
  usernameSuggestionStrip: { position: 'absolute', left: 28, right: 28, bottom: 197, flexDirection: 'row', gap: 8, justifyContent: 'center' },
  usernameSuggestion: { flex: 1, minWidth: 0, height: 34, paddingHorizontal: 10, borderRadius: 999, backgroundColor: 'rgba(33,29,56,0.94)', borderWidth: 1, borderColor: C.borderHi, alignItems: 'center', justifyContent: 'center' },
  usernameSuggestionActive: { backgroundColor: 'rgba(139,92,246,0.28)', borderColor: C.violet },
  usernameSuggestionText: { color: C.sub, fontSize: 12, fontWeight: '600' },
  usernameSuggestionTextActive: { color: C.text },
  keyboardGhostRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62, borderRadius: 16, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.borderHi, paddingHorizontal: 16, paddingVertical: 12 },
  keyboardGhostRowActive: { borderColor: C.violet, backgroundColor: 'rgba(38,29,60,0.92)', shadowColor: C.violet, shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  keyboardDimmer: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10,8,18,0.52)' },
  keyboardGhostValue: { color: C.text, fontSize: 14, fontWeight: '500' },
  keyboardGhostInput: { height: 22, padding: 0, color: C.text, fontSize: 14, fontWeight: '500' },
  keyboardGhostContinue: { position: 'absolute', left: 28, right: 28, height: 52, borderRadius: 999, backgroundColor: 'rgba(139,92,246,0.32)', borderWidth: 1, borderColor: C.violet, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  keyboardGhostButton: { flex: 1, alignSelf: 'stretch', width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  keyboardGhostContinueText: { color: C.sub, fontSize: 15, fontWeight: '800' },

  // Purpose
  purposeCard: { height: 76, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border },
  // Purpose step: the artwork and the three choices are one centred stack, so the picture can
  // shrink while the cards keep their tap size.
  purposeStepBody: { gap: 15 },
  purposeChoices: { gap: 15 },
  purposeCardActive: { backgroundColor: C.pink + '10', borderColor: C.pink },
  purposeIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  purposeIconActive: { backgroundColor: C.pink },
  purposeTitle: { fontSize: 14, fontWeight: '600', color: C.text },
  purposeDesc: { fontSize: 12, color: C.sub, marginTop: 2 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: C.borderHi, alignItems: 'center', justifyContent: 'center' },
  radioActive: { backgroundColor: C.pink, borderColor: C.pink },

  // Review — compact single-line rows; the body centres the artwork and rows between the
  // top bar and the CTA, so the page breathes the same way on a short window and a tall one.
  reviewBody: { flex: 1, justifyContent: 'center', paddingVertical: STEP_BODY_GUTTER },
  reviewArtwork: { marginBottom: 10 },
  reviewList: { gap: 7 },
  profileSetupError: { color: C.pink, fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 8, marginHorizontal: 8 },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  reviewLabel: { width: 80, fontSize: 11, fontWeight: '600', color: C.faint },
  reviewVal: { flex: 1, fontSize: 13.5, fontWeight: '600', color: C.text },
  reviewGoogleTag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: C.violet + '20', borderWidth: 1, borderColor: C.violet + '40' },
  reviewGoogleText: { fontSize: 9, fontWeight: '700', color: C.violet },
  reviewCheck: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: C.borderHi, alignItems: 'center', justifyContent: 'center' },

  // Success
  successBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: C.mint + '12', borderWidth: 1, borderColor: C.mint + '40', marginTop: 8 },
  successBadgeText: { fontSize: 12, fontWeight: '600', color: C.mint },
  successTitle: { fontSize: 28, fontWeight: '800', color: C.text, textAlign: 'center', lineHeight: 34, marginTop: 12 },
  successSub: { fontSize: 14, color: C.sub, textAlign: 'center', lineHeight: 21, marginTop: 10, maxWidth: 260 },
  pillRow: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 20 },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  pillText: { fontSize: 12, fontWeight: '500', color: C.sub },

  // Primary button
  primaryButtonTouch: { width: '100%', opacity: 1 },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryBtn: { width: '100%', height: STEP_CTA_HEIGHT, borderRadius: 999, backgroundColor: C.violet, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryBtnDisabled: { borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceHi },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.black },
});
