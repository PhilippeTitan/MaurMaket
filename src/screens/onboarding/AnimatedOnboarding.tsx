import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Animated,
  Easing, ScrollView, Platform, KeyboardAvoidingView, Dimensions, Image, Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle, Rect, Path, Defs, LinearGradient as SvgLinearGradient, Stop, Ellipse, G as SvgG } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { COLORS, SPACING, RADIUS, FONTS } from '../../theme';
import { useTranslation } from '../../i18n';
import { signup as apiSignup, googleAuth, API_BASE } from '../../api';
import { store } from '../../store';
import AuthInput from './components/AuthInput';
import GoogleButton from './components/GoogleButton';
import PasskeyButton from './components/PasskeyButton';
import AuthMethodsCard from '../../components/AuthMethodsCard';
import OnboardingBackground from './components/OnboardingBackground';
import type { User } from '../../types';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const C = {
  bg0: '#0A0812',
  bg1: '#120E1F',
  surface: '#151326',
  surfaceHi: '#211D38',
  border: '#302B4B',
  borderHi: '#514A73',
  text: '#F4F1FB',
  sub: '#C1BAD8',
  faint: '#8F88AA',
  violet: '#8B5CF6',
  pink: '#EC4899',
  amber: '#FB923C',
  mint: '#2FE6B8',
};

const STEPS = ['name', 'username', 'email', 'purpose', 'dob', 'password', 'review'] as const;
type Step = typeof STEPS[number];
const STEP_MAX = 7;
const STEP_LABELS: Record<Step, string> = {
  name: 'About you', username: 'Username', email: 'Contact', purpose: 'Purpose', dob: 'Age', password: 'Security', review: 'Review',
};

const PURPOSES = [
  { id: 'buy', title: 'Discover & buy', desc: 'Find products from sellers around you', icon: 'shopping-outline' as const },
  { id: 'sell', title: 'Build a store', desc: 'Sell products and grow your audience', icon: 'store-outline' as const },
  { id: 'both', title: 'A little of both', desc: 'Buy, sell, and explore freely', icon: 'swap-horizontal' as const },
];

/* ── SVG Illustrations ────────────────────────────────────── */

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
  return (
    <View style={{ height: 250, alignItems: 'center', justifyContent: 'center' }}>
      <Image
        source={require('../../../illustration/commerce-more-human.webp')}
        style={{ width: 360, height: 250, resizeMode: 'contain' }}
        accessibilityLabel="Commerce made more human illustration"
      />
    </View>
  );
}

function AssetIllustration({ asset, accessibilityLabel, containerStyle }: { asset: 'lets-start' | 'digital-address' | 'keep-it-protected' | 'youre-ready' | 'pick-username' | 'choose-purpose' | 'birthday'; accessibilityLabel: string; containerStyle?: any }) {
  const birthdayAsset = asset === 'birthday';
  const pickUsernameAsset = asset === 'pick-username';
  const imageWidth = birthdayAsset || asset === 'lets-start' ? '100%' : pickUsernameAsset ? 350 : asset === 'choose-purpose' ? 330 : 360;
  const imageHeight = birthdayAsset || pickUsernameAsset ? 455 : asset === 'choose-purpose' ? 300 : 190;
  return (
    <View style={[{ height: imageHeight, width: '100%', marginBottom: 12, alignItems: 'center', justifyContent: 'center' }, containerStyle]}>
      <Image
        source={
          asset === 'lets-start' ? require('../../../illustration/lets-start.webp') :
          asset === 'digital-address' ? require('../../../illustration/digital-address.webp') :
          asset === 'keep-it-protected' ? require('../../../illustration/keep-it-protected.webp') :
          asset === 'youre-ready' ? require('../../../illustration/youre-ready.webp') :
          asset === 'pick-username' ? require('../../../illustration/pick-username.webp') :
          asset === 'choose-purpose' ? require('../../../illustration/choose-purpose.webp') :
          require('../../../illustration/birthday.webp')
        }
        style={{ width: imageWidth, height: imageHeight, resizeMode: birthdayAsset ? 'stretch' : asset === 'lets-start' || pickUsernameAsset ? 'cover' : 'contain', borderRadius: 22, overflow: 'hidden', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}
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
      <Animated.View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: '#123B31', alignItems: 'center', justifyContent: 'center', transform: [{ scale }], opacity }}>
        <Svg width="46" height="46" viewBox="0 0 46 46" fill="none">
          <Path d="M11 24l8 8 16-18" stroke={C.mint} strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Animated.View>
    </View>
  );
}

/* ── Shared UI ────────────────────────────────────────────── */

function StepBadge({ step, total, label }: { step: number; total: number; label: string }) {
  return (
    <Text style={s.stepCount} accessibilityLabel={`Onboarding progress ${step} of ${total}`}>{step}/{total}</Text>
  );
}

/* ── Birthday Picker Wheel Column (Glass Center Lens) ─────────────────────────── */

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const FULL_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const DOB_ITEM_HEIGHT = 44;
const DOB_VISIBLE_ITEMS = 5;
const DOB_WHEEL_HEIGHT = DOB_ITEM_HEIGHT * DOB_VISIBLE_ITEMS; // 220
const DOB_PADDING = (DOB_WHEEL_HEIGHT - DOB_ITEM_HEIGHT) / 2; // 88

function DobWheelColumn({
  items,
  selectedValue,
  onSelect,
  label,
  formatItem,
}: {
  items: (number | string)[];
  selectedValue: number | string | null;
  onSelect: (val: any) => void;
  label: string;
  formatItem?: (val: any) => string;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const isUserScrolling = useRef(false);

  // Sync scroll position when selectedValue changes externally
  useEffect(() => {
    if (selectedValue != null && !isUserScrolling.current) {
      const idx = items.indexOf(selectedValue);
      if (idx >= 0) {
        scrollRef.current?.scrollTo({ y: idx * DOB_ITEM_HEIGHT, animated: true });
      }
    }
  }, [selectedValue, items]);

  const handleMomentumScrollEnd = (e: any) => {
    isUserScrolling.current = false;
    const offsetY = e?.nativeEvent?.contentOffset?.y;
    if (typeof offsetY !== 'number') return;
    const rawIdx = Math.round(offsetY / DOB_ITEM_HEIGHT);
    const clampedIdx = Math.max(0, Math.min(rawIdx, items.length - 1));
    const item = items[clampedIdx];
    if (item !== undefined && item !== selectedValue) {
      onSelect(item);
    }
  };

  const handleScrollEndDrag = (e: any) => {
    // Extract offsetY synchronously from synthetic event before it's pooled
    const offsetY = e?.nativeEvent?.contentOffset?.y;
    if (typeof offsetY !== 'number') return;

    if (Platform.OS === 'android') {
      // Android momentum end can sometimes be skipped if drag stops abruptly
      setTimeout(() => {
        if (!isUserScrolling.current) {
          const rawIdx = Math.round(offsetY / DOB_ITEM_HEIGHT);
          const clampedIdx = Math.max(0, Math.min(rawIdx, items.length - 1));
          const item = items[clampedIdx];
          if (item !== undefined && item !== selectedValue) {
            onSelect(item);
          }
        }
      }, 150);
    }
  };

  return (
    <View style={s.dobWheelCol}>
      <Text style={s.dobWheelLabel}>{label}</Text>

      <View style={s.dobWheelViewport}>
        <Animated.ScrollView
          ref={scrollRef as any}
          showsVerticalScrollIndicator={false}
          snapToInterval={DOB_ITEM_HEIGHT}
          decelerationRate="fast"
          bounces={false}
          nestedScrollEnabled
          onScrollBeginDrag={() => { isUserScrolling.current = true; }}
          onScrollEndDrag={handleScrollEndDrag}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true }
          )}
          scrollEventThrottle={16}
          contentContainerStyle={{
            paddingTop: DOB_PADDING,
            paddingBottom: DOB_PADDING,
          }}
          style={s.dobWheelScroll}
        >
          {items.map((item, idx) => {
            const display = formatItem ? formatItem(item) : String(item);
            const itemOffset = idx * DOB_ITEM_HEIGHT;

            // Distance from center lens
            const inputRange = [
              itemOffset - DOB_ITEM_HEIGHT * 2,
              itemOffset - DOB_ITEM_HEIGHT,
              itemOffset,
              itemOffset + DOB_ITEM_HEIGHT,
              itemOffset + DOB_ITEM_HEIGHT * 2,
            ];

            const opacity = scrollY.interpolate({
              inputRange,
              outputRange: [0.22, 0.45, 1, 0.45, 0.22],
              extrapolate: 'clamp',
            });

            const scale = scrollY.interpolate({
              inputRange,
              outputRange: [0.84, 0.92, 1.15, 0.92, 0.84],
              extrapolate: 'clamp',
            });

            return (
              <TouchableOpacity
                key={String(item)}
                onPress={() => {
                  isUserScrolling.current = false;
                  scrollRef.current?.scrollTo({ y: idx * DOB_ITEM_HEIGHT, animated: true });
                  onSelect(item);
                }}
                activeOpacity={0.7}
                style={s.dobWheelItem}
              >
                <Animated.Text
                  style={[
                    s.dobWheelItemText,
                    {
                      opacity,
                      transform: [{ scale }],
                      color: selectedValue === item ? '#FFFFFF' : C.sub,
                      fontWeight: selectedValue === item ? '800' : '600',
                    },
                  ]}
                >
                  {display}
                </Animated.Text>
              </TouchableOpacity>
            );
          })}
        </Animated.ScrollView>
      </View>
    </View>
  );
}

function PrimaryButton({ children, onPress, disabled }: { children: React.ReactNode; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.85} style={{ width: '100%', opacity: disabled ? 0.7 : 1 }}>
      <LinearGradient
        colors={disabled ? ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.08)'] : [C.violet, C.pink, C.amber]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={s.primaryBtn}
      >
        <Text style={[s.primaryBtnText, disabled && { color: C.faint }]}>{children}</Text>
        <MaterialCommunityIcons name="arrow-right" size={17} color={disabled ? C.faint : '#1A0B12'} />
      </LinearGradient>
    </TouchableOpacity>
  );
}

function StepActions({ children, step, label, onBack, compact }: { children: React.ReactNode; step: number; label: string; onBack: () => void; compact?: boolean }) {
  return (
    <>
      <View style={s.stepTopBar}>
        <TouchableOpacity onPress={onBack} style={s.topBackAction} accessibilityRole="button" accessibilityLabel="Go back">
          <MaterialCommunityIcons name="arrow-left" size={18} color={C.sub} />
          <Text style={s.backActionText}>Back</Text>
        </TouchableOpacity>
        <StepBadge step={step} total={STEP_MAX} label={label} />
      </View>
      <View style={s.actions}>{children}</View>
    </>
  );
}

const Field = React.forwardRef<TextInput, { icon: any; label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; secureTextEntry?: boolean; autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'; right?: React.ReactNode; onFocus?: () => void }>(function Field({ icon, label, value, onChangeText, placeholder, secureTextEntry, autoCapitalize, right, onFocus }, ref) {
  const inputRef = useRef<TextInput | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={() => inputRef.current?.focus()} style={[s.field, isFocused && s.fieldFocused]} accessibilityRole="none">
      <MaterialCommunityIcons name={icon} size={18} color={isFocused ? C.violet : C.sub} />
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={s.fieldLabel}>{label}</Text>
        <TextInput
          ref={node => { inputRef.current = node; if (typeof ref === 'function') ref(node); else if (ref) ref.current = node; }}
          onFocus={() => { setIsFocused(true); onFocus?.(); }}
          onBlur={() => setIsFocused(false)}
          style={s.fieldInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.sub}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize || 'none'}
        />
      </View>
      {right}
    </TouchableOpacity>
  );
});

function GhostFieldRow({ icon, label, value, onChangeText, secure, capitalize, active }: { icon: any; label: string; value: string; onChangeText: (value: string) => void; secure?: boolean; capitalize?: 'none' | 'sentences' | 'words' | 'characters'; active?: boolean }) {
  return (
    <View style={[s.keyboardGhostRow, active && s.keyboardGhostRowActive]}>
      <MaterialCommunityIcons name={icon} size={18} color={active ? C.violet : C.sub} />
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={s.fieldLabel}>{label}</Text>
        <TextInput
          autoFocus={active}
          style={s.keyboardGhostInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={label}
          placeholderTextColor={C.sub}
          secureTextEntry={secure}
          autoCapitalize={capitalize}
        />
      </View>
    </View>
  );
}

/* ── Main Component ───────────────────────────────────────── */

interface Props {
  onSwitchToSignin: () => void;
}

export default function AnimatedOnboarding({ onSwitchToSignin }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [form, setForm] = useState({ first: '', last: '', username: '', email: '', purpose: '', birthMonth: null as number | null, birthDay: null as number | null, birthYear: null as number | null, pw: '', pw2: '' });
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [userResult, setUserResult] = useState<{ user: User; token: string } | null>(null);
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const [emailChecking, setEmailChecking] = useState(false);
  const emailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const usernameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

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
  const [revealOrigin, setRevealOrigin] = useState({ x: SCREEN_W / 2, y: SCREEN_H / 2 });

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, eventData => setKeyboardHeight(eventData.endCoordinates.height));
    const hideSubscription = Keyboard.addListener(hideEvent, () => { setKeyboardHeight(0); setFocusedField(null); });
    return () => { showSubscription.remove(); hideSubscription.remove(); };
  }, []);

  // Continuous animations
  useEffect(() => {
    Animated.loop(Animated.timing(spin, { toValue: 1, duration: 22000, easing: Easing.linear, useNativeDriver: true })).start();
    Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(float, { toValue: 0, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true })).start();
    const ringAnimation = (value: Animated.Value, delay: number) => Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(value, { toValue: 1, duration: 1900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: true }),
    ])).start();
    ringAnimation(holdRingA, 0);
    ringAnimation(holdRingB, 620);
    ringAnimation(holdRingC, 1240);
  }, []);

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
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
  const usernameValid = /^[a-z0-9][a-z0-9._]{0,28}[a-z0-9]$/.test(form.username) || form.username.length === 1;
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
    usernameValid && usernameAvailable !== false,
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
          const res = await fetch(`${API_BASE}/auth/check-email?email=${encodeURIComponent(form.email)}`);
          const data = await res.json();
          setEmailAvailable(data.available);
          if (!data.available) setErrors(p => ({ ...p, email: 'This email is already registered' }));
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
          const res = await fetch(`${API_BASE}/auth/check-username?username=${encodeURIComponent(form.username)}`);
          const data = await res.json();
          setUsernameAvailable(data.available);
          if (!data.available) setErrors(p => ({ ...p, username: 'This username is taken' }));
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
    if (step === 'name' && (!form.first.trim() || !form.last.trim())) { setErrors({ name: "First and last name are needed" }); return; }
    if (step === 'username') {
      if (!usernameValid) { setErrors({ username: 'Lowercase letters, numbers, dots, and underscores only (1-30 chars)' }); return; }
      if (usernameAvailable === false) { setErrors({ username: 'This username is taken' }); return; }
    }
    if (step === 'email') {
      if (!emailValid) { setErrors({ email: "That doesn't look like a full email" }); return; }
      if (emailAvailable === false) { setErrors({ email: 'This email is already registered' }); return; }
    }
    if (step === 'purpose' && !form.purpose) return;
    if (step === 'dob' && !isAdult) { setErrors({ dob: 'You must be at least 18 years old' }); return; }
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
      const res = await apiSignup(fullName, form.email, form.pw, '', dob, form.username) as { user: User; token: string };
      setUserResult(res);
      go(1); // → success screen
    } catch (err: any) {
      setErrors({ email: err?.message || 'Signup failed' });
      setIndex(3); // → email step
    } finally { setLoading(false); }
  };

  const handleEnterApp = async () => { if (userResult) await store.setUser(userResult.user, userResult.token); };

  const enterClass = dir >= 0 ? { opacity: enterAnim, transform: [{ translateX: enterAnim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }] }
    : { opacity: enterAnim, transform: [{ translateX: enterAnim.interpolate({ inputRange: [0, 1], outputRange: [-28, 0] }) }] };

  const canContinue =
    (step === 'name' && !(!form.first.trim() || !form.last.trim())) ||
    (step === 'username' && usernameValid && usernameAvailable !== false) ||
    (step === 'email' && emailValid && emailAvailable !== false) ||
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
    email: { label: 'Email address', icon: 'email-outline', placeholder: undefined, value: form.email, setValue: (value: string) => set('email', value), secure: false, capitalize: 'none' as const },
    username: { label: 'Username', icon: 'at', placeholder: undefined, value: form.username, setValue: (value: string) => set('username', value.toLowerCase().replace(/[^a-z0-9._]/g, '')), secure: false, capitalize: 'none' as const },
    first: { label: 'First name', icon: 'account-outline', placeholder: undefined, value: form.first, setValue: (value: string) => set('first', value), secure: false, capitalize: 'words' as const },
    last: { label: 'Last name', icon: 'account-outline', placeholder: undefined, value: form.last, setValue: (value: string) => set('last', value), secure: false, capitalize: 'words' as const },
    pw: { label: 'Password', icon: 'lock-outline', placeholder: '••••••••', value: form.pw, setValue: (value: string) => set('pw', value), secure: !showPw, capitalize: 'none' as const },
    pw2: { label: 'Confirm password', icon: 'lock-outline', placeholder: '••••••••', value: form.pw2, setValue: (value: string) => set('pw2', value), secure: !showPw, capitalize: 'none' as const },
  } as const;

  const ghostFieldKeys = focusedField === 'first' || focusedField === 'last' ? ['first', 'last'] as const : focusedField ? [focusedField] as const : [];
  const ghostFields = ghostFieldKeys.map(key => ({ key, ...ghostFieldMap[key as keyof typeof ghostFieldMap] }));

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg0 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={{ flex: 1, backgroundColor: C.bg0 }}>
        <OnboardingBackground />

        <ScrollView ref={scrollRef} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">

          <Animated.View style={[s.slide, enterClass]} key={index}>

            {/* SCREEN 0 — SPLASH */}
            {index === 0 && (
              <View style={s.screenCenter}>
                <SplashIllustration spin={spin} />
                <Text style={s.splashBrand}>MaurMaket</Text>
                <Text style={s.splashSub}>{splashReady ? "Everything's set. Let's go." : "Warming up your marketplace…"}</Text>
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
                    accessibilityLabel="Press and hold to continue"
                  >
                    <Animated.View style={[s.holdRing, s.holdRingA, { opacity: holdRingA.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }), transform: [{ scale: holdRingA.interpolate({ inputRange: [0, 1], outputRange: [1, 1.85] }) }] }]} />
                    <Animated.View style={[s.holdRing, s.holdRingB, { opacity: holdRingB.interpolate({ inputRange: [0, 1], outputRange: [0.62, 0] }), transform: [{ scale: holdRingB.interpolate({ inputRange: [0, 1], outputRange: [1, 1.85] }) }] }]} />
                    <Animated.View style={[s.holdRing, s.holdRingC, { opacity: holdRingC.interpolate({ inputRange: [0, 1], outputRange: [0.54, 0] }), transform: [{ scale: holdRingC.interpolate({ inputRange: [0, 1], outputRange: [1, 1.85] }) }] }]} />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* SCREEN 1 — WELCOME */}
            {index === 1 && (
              <View style={s.welcomeScreen}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 8, paddingBottom: 24 }}>
                  <Logomark size={34} />
                  <Text style={{ fontFamily: FONTS.heading, fontSize: 17, fontWeight: '700', color: C.text }}>MaurMaket</Text>
                </View>
                <WelcomeIllustration />
                <Text style={[s.heroTitle, { textAlign: 'center' }]}>
                  Commerce,{'\n'}
                  <Text style={s.heroAccent}>made more human.</Text>
                </Text>
                <Text style={[s.heroSub, { textAlign: 'center', alignSelf: 'center' }]}>MaurMaket connects people, products, and opportunity in one place built for how you actually buy and sell.</Text>
                <View style={s.welcomeActions}>
                  <PrimaryButton onPress={() => go(1)}>Get started</PrimaryButton>
                  <TouchableOpacity onPress={onSwitchToSignin} style={{ paddingVertical: 14 }}>
                    <Text style={{ textAlign: 'center', color: C.sub, fontSize: 14, fontWeight: '500' }}>I already have an account</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* SCREEN 2 — NAME */}
            {index === 2 && (
              <View style={s.stepScreen}>
                <View style={[s.centeredStepBody, s.nameStepBody]}>
                  <AssetIllustration asset="lets-start" accessibilityLabel="Let's start illustration" />
                  <View style={s.nameFields}>
                    <Field icon="account-outline" label="First name" value={form.first} onChangeText={v => set('first', v)} placeholder="Jordan" onFocus={() => setFocusedField('first')} />
                    <Field icon="account-outline" label="Last name" value={form.last} onChangeText={v => set('last', v)} placeholder="Reyes" onFocus={() => setFocusedField('last')} />
                    {errors.name ? <Text style={s.fieldError}>{errors.name}</Text> : null}
                  </View>
                </View>
                <StepActions step={1} label={STEP_LABELS.name} onBack={() => go(-1)}>
                  <PrimaryButton onPress={validateAndNext} disabled={!form.first || !form.last}>Continue</PrimaryButton>
                </StepActions>
              </View>
            )}

            {/* SCREEN 3 — USERNAME */}
            {index === 3 && (
              <View style={s.stepScreen}>
                <View style={s.centeredStepBody}>
                  {form.username.length > 0 && !usernameValid ? <Text style={s.fieldError}>Lowercase letters, numbers, dots, and underscores only (1-30 chars)</Text> : null}
                  {usernameAvailable === true ? <Text style={[s.fieldError, { color: C.mint }]}>✓ Username is available</Text> : null}
                  {errors.username ? <Text style={s.fieldError}>{errors.username}</Text> : null}
                </View>
                <StepActions step={2} label={STEP_LABELS.username} onBack={() => go(-1)}>
                  <AssetIllustration
                    asset="pick-username"
                    accessibilityLabel="Pick your username illustration"
                    containerStyle={{ marginBottom: 15 }}
                  />
                  <Field
                    icon="at"
                    label="Username"
                    value={form.username}
                    onChangeText={v => set('username', v.toLowerCase().replace(/[^a-z0-9._]/g, ''))}
                    placeholder="jordan.reyes"
                    onFocus={() => setFocusedField('username')}
                    right={
                      usernameChecking ? <MaterialCommunityIcons name="dots-horizontal" size={17} color={C.faint} /> :
                      usernameAvailable === true ? <MaterialCommunityIcons name="check-circle" size={17} color={C.mint} /> :
                      usernameAvailable === false ? <MaterialCommunityIcons name="close-circle" size={17} color={C.pink} /> : null
                    }
                  />
                  <View style={{ height: 15 }} />
                  <PrimaryButton onPress={validateAndNext} disabled={!usernameValid || usernameAvailable === false}>Continue</PrimaryButton>
                </StepActions>
              </View>
            )}

            {/* SCREEN 4 — EMAIL */}
            {index === 4 && (
              <View style={[s.stepScreen, s.emailScreen]}>
                <View style={s.emailArtWindow}>
                  <Image
                    source={require('../../../illustration/digital-address.webp')}
                    style={s.emailArtwork}
                    resizeMode="contain"
                    accessibilityLabel="Digital address illustration"
                  />
                </View>
                <View style={s.emailContent}>
                  <Field icon="email-outline" label="Email address" value={form.email} onChangeText={v => set('email', v)} placeholder="you@example.com" onFocus={() => setFocusedField('email')} right={
                    emailChecking ? <MaterialCommunityIcons name="dots-horizontal" size={17} color={C.faint} /> :
                    emailAvailable === true ? <MaterialCommunityIcons name="check-circle" size={17} color={C.mint} /> :
                    emailAvailable === false ? <MaterialCommunityIcons name="close-circle" size={17} color={C.pink} /> : null
                  } />
                  {errors.email ? <Text style={s.fieldError}>{errors.email}</Text> : null}
                  {emailAvailable === true ? <Text style={[s.fieldError, { color: C.mint }]}>✓ Email is available</Text> : null}
                </View>
                <StepActions step={3} label={STEP_LABELS.email} onBack={() => go(-1)}>
                  <PrimaryButton onPress={validateAndNext} disabled={!emailValid || emailAvailable === false}>Continue</PrimaryButton>
                </StepActions>
              </View>
            )}

            {/* SCREEN 5 — PURPOSE */}
            {index === 5 && (
              <View style={s.stepScreen}>
                <AssetIllustration asset="choose-purpose" accessibilityLabel="Choose your purpose illustration" containerStyle={s.purposeArtwork} />
                <View style={s.purposeChoices}>
                  {PURPOSES.map(p => {
                    const active = form.purpose === p.id;
                    return (
                      <TouchableOpacity key={p.id} onPress={() => set('purpose', p.id)} activeOpacity={0.85} style={[s.purposeCard, active && s.purposeCardActive]}>
                        <View style={[s.purposeIcon, active && s.purposeIconActive]}>
                          <MaterialCommunityIcons name={p.icon} size={18} color={active ? '#1A0B12' : C.sub} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.purposeTitle}>{p.title}</Text>
                          <Text style={s.purposeDesc}>{p.desc}</Text>
                        </View>
                        <View style={[s.radio, active && s.radioActive]}>
                          {active && <MaterialCommunityIcons name="check" size={11} color="#1A0B12" />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <StepActions step={4} label={STEP_LABELS.purpose} onBack={() => go(-1)}>
                  <PrimaryButton onPress={validateAndNext} disabled={!form.purpose}>Continue</PrimaryButton>
                </StepActions>
              </View>
            )}

            {/* SCREEN 6 — DOB */}
            {index === 6 && (() => {
              const currentYear = new Date().getFullYear();
              const monthItems = Array.from({ length: 12 }, (_, i) => i + 1);
              const maxDaysInMonth = form.birthMonth && form.birthYear
                ? new Date(form.birthYear, form.birthMonth, 0).getDate()
                : 31;
              const dayItems = Array.from({ length: maxDaysInMonth }, (_, i) => i + 1);
              const yearItems = Array.from({ length: 82 }, (_, i) => (currentYear - 18) - i);

              const formattedFullDate = birthDateValid
                ? `${FULL_MONTH_NAMES[form.birthMonth! - 1]} ${form.birthDay}, ${form.birthYear}`
                : form.birthMonth || form.birthDay || form.birthYear
                ? `${form.birthMonth ? MONTH_NAMES[form.birthMonth - 1] : 'Month'} ${form.birthDay || 'Day'}, ${form.birthYear || 'Year'}`
                : 'Select your birthday';

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
              });

              const containerTranslateY = dobPickerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -210],
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
                <View style={s.stepScreen}>
                  {/* Fading Illustration */}
                  <Animated.View
                    pointerEvents={dobPickerActive ? 'none' : 'auto'}
                    style={[s.birthdayArtwork, { opacity: artOpacity }]}
                  >
                    <AssetIllustration
                      asset="birthday"
                      accessibilityLabel="Birthday illustration"
                      containerStyle={{ height: '100%', marginBottom: 0 }}
                    />
                  </Animated.View>

                  {/* Animated Center Stage Container: Date Shower + 3 Boxes + Vertical Wheels */}
                  <Animated.View
                    style={[
                      s.dobCenterContainer,
                      {
                        transform: [{ translateY: containerTranslateY }],
                      },
                    ]}
                  >
                    {/* White Date Shower above the boxes */}
                    <Animated.View
                      style={[
                        s.dobDateShower,
                        {
                          opacity: headerOpacity,
                          transform: [{ translateY: headerTranslateY }],
                        },
                      ]}
                    >
                      <Text style={s.dobDateShowerText}>{formattedFullDate}</Text>
                      {ageNumber != null && (
                        <Text
                          style={[
                            s.dobAgeBadge,
                            ageNumber >= 18 ? s.dobAgeBadgeAdult : s.dobAgeBadgeMinor,
                          ]}
                        >
                          {ageNumber >= 18
                            ? `✓ ${ageNumber} years old (18+ verified)`
                            : `✕ ${ageNumber} years old (Must be 18+)`}
                        </Text>
                      )}
                    </Animated.View>

                    {/* 3 Date Selector Boxes */}
                    <View style={s.datePickerRow}>
                      <TouchableOpacity
                        style={[
                          s.dateSelector,
                          dobPickerActive && dobActiveTab === 'month' && s.dateSelectorActive,
                        ]}
                        onPress={() => {
                          if (!form.birthMonth) set('birthMonth', 1);
                          openDobPicker('month');
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Select birth month"
                      >
                        <MaterialCommunityIcons
                          name="calendar-month-outline"
                          size={20}
                          color={dobPickerActive && dobActiveTab === 'month' ? C.violet : C.text}
                        />
                        <Text
                          numberOfLines={1}
                          style={[
                            s.dateSelectorText,
                            !form.birthMonth && s.dateSelectorPlaceholder,
                            dobPickerActive && dobActiveTab === 'month' && { color: '#FFFFFF' },
                          ]}
                        >
                          {form.birthMonth ? MONTH_NAMES[form.birthMonth - 1] : 'Month'}
                        </Text>
                        <MaterialCommunityIcons
                          name={dobPickerActive && dobActiveTab === 'month' ? 'chevron-up' : 'chevron-down'}
                          size={20}
                          color={dobPickerActive && dobActiveTab === 'month' ? C.violet : C.sub}
                        />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          s.dateSelector,
                          dobPickerActive && dobActiveTab === 'day' && s.dateSelectorActive,
                        ]}
                        onPress={() => {
                          if (!form.birthDay) set('birthDay', 1);
                          openDobPicker('day');
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Select birth day"
                      >
                        <MaterialCommunityIcons
                          name="calendar-month-outline"
                          size={20}
                          color={dobPickerActive && dobActiveTab === 'day' ? C.violet : C.text}
                        />
                        <Text
                          numberOfLines={1}
                          style={[
                            s.dateSelectorText,
                            !form.birthDay && s.dateSelectorPlaceholder,
                            dobPickerActive && dobActiveTab === 'day' && { color: '#FFFFFF' },
                          ]}
                        >
                          {form.birthDay || 'Day'}
                        </Text>
                        <MaterialCommunityIcons
                          name={dobPickerActive && dobActiveTab === 'day' ? 'chevron-up' : 'chevron-down'}
                          size={20}
                          color={dobPickerActive && dobActiveTab === 'day' ? C.violet : C.sub}
                        />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          s.dateSelector,
                          dobPickerActive && dobActiveTab === 'year' && s.dateSelectorActive,
                        ]}
                        onPress={() => {
                          if (!form.birthYear) set('birthYear', currentYear - 18);
                          openDobPicker('year');
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Select birth year"
                      >
                        <MaterialCommunityIcons
                          name="calendar-month-outline"
                          size={20}
                          color={dobPickerActive && dobActiveTab === 'year' ? C.violet : C.text}
                        />
                        <Text
                          numberOfLines={1}
                          style={[
                            s.dateSelectorText,
                            !form.birthYear && s.dateSelectorPlaceholder,
                            dobPickerActive && dobActiveTab === 'year' && { color: '#FFFFFF' },
                          ]}
                        >
                          {form.birthYear || 'Year'}
                        </Text>
                        <MaterialCommunityIcons
                          name={dobPickerActive && dobActiveTab === 'year' ? 'chevron-up' : 'chevron-down'}
                          size={20}
                          color={dobPickerActive && dobActiveTab === 'year' ? C.violet : C.sub}
                        />
                      </TouchableOpacity>
                    </View>

                    {/* Revealing Vertical Carousel Tray */}
                    {dobPickerActive && (
                      <Animated.View
                        style={[
                          s.dobWheelTray,
                          {
                            opacity: carouselOpacity,
                            transform: [{ translateY: carouselTranslateY }],
                          },
                        ]}
                      >
                        {/* Horizontal Frosted Glass Center Lens */}
                        <View pointerEvents="none" style={s.dobWheelGlassLens}>
                          <LinearGradient
                            colors={['rgba(255,255,255,0.18)', 'rgba(139,92,246,0.12)', 'rgba(255,255,255,0.06)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={StyleSheet.absoluteFill}
                          />
                        </View>

                        {/* Top Gradient Fade Overlay */}
                        <LinearGradient
                          pointerEvents="none"
                          colors={['rgba(21,19,38,0.95)', 'rgba(21,19,38,0.4)', 'transparent']}
                          style={s.dobWheelTopFade}
                        />

                        {/* Bottom Gradient Fade Overlay */}
                        <LinearGradient
                          pointerEvents="none"
                          colors={['transparent', 'rgba(21,19,38,0.4)', 'rgba(21,19,38,0.95)']}
                          style={s.dobWheelBottomFade}
                        />

                        <View style={s.dobWheelRow}>
                          <DobWheelColumn
                            label="Month"
                            items={monthItems}
                            selectedValue={form.birthMonth}
                            onSelect={m => {
                              set('birthMonth', m);
                              setDobActiveTab('month');
                            }}
                            formatItem={m => MONTH_NAMES[m - 1]}
                          />
                          <DobWheelColumn
                            label="Day"
                            items={dayItems}
                            selectedValue={form.birthDay}
                            onSelect={d => {
                              set('birthDay', d);
                              setDobActiveTab('day');
                            }}
                          />
                          <DobWheelColumn
                            label="Year"
                            items={yearItems}
                            selectedValue={form.birthYear}
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
                    onBack={() => {
                      if (dobPickerActive) {
                        closeDobPicker();
                      } else {
                        go(-1);
                      }
                    }}
                  >
                    <PrimaryButton onPress={validateAndNext} disabled={!birthDateValid}>
                      Continue
                    </PrimaryButton>
                  </StepActions>
                </View>
              );
            })()}

            {/* SCREEN 7 — PASSWORD */}
            {index === 7 && (
              <View style={s.stepScreen}>
                <View style={s.centeredStepBody}>
                  <AssetIllustration asset="keep-it-protected" accessibilityLabel="Keep it protected illustration" />
                  <View style={{ gap: 12 }}>
                    <Field icon="lock-outline" label="Password" value={form.pw} onChangeText={v => set('pw', v)} placeholder="••••••••" secureTextEntry={!showPw} onFocus={() => setFocusedField('pw')} right={
                      <TouchableOpacity onPress={() => setShowPw(s => !s)}>
                        <MaterialCommunityIcons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={17} color={C.faint} />
                      </TouchableOpacity>
                    } />
                    <Field icon="lock-outline" label="Confirm password" value={form.pw2} onChangeText={v => set('pw2', v)} placeholder="••••••••" secureTextEntry={!showPw} onFocus={() => setFocusedField('pw2')} right={
                      form.pw2 ? (pwMatched ? <MaterialCommunityIcons name="check-circle" size={17} color={C.mint} /> : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.pink }} />) : null
                    } />
                  </View>
                </View>
                <StepActions step={6} label={STEP_LABELS.password} onBack={() => go(-1)}>
                  <PrimaryButton onPress={validateAndNext} disabled={!pwMatched}>Continue</PrimaryButton>
                </StepActions>
              </View>
            )}

            {/* SCREEN 8 — REVIEW */}
            {index === 8 && (
              <View style={s.stepScreen}>
                <View style={s.centeredStepBody}>
                  <AssetIllustration asset="youre-ready" accessibilityLabel="You're ready illustration" />
                  <View style={{ gap: 10 }}>
                    {[
                      ['Name', form.first ? `${form.first} ${form.last}` : '—', reviewItems[0]],
                      ['Username', form.username ? `@${form.username}` : '—', reviewItems[1]],
                      ['Email', form.email || '—', reviewItems[2]],
                      ['Purpose', PURPOSES.find(p => p.id === form.purpose)?.title || '—', reviewItems[3]],
                      ['Birthday', birthDateValid ? `${form.birthMonth}/${form.birthDay}/${form.birthYear}` : '—', reviewItems[4]],
                      ['Password', pwMatched ? 'Set' : '—', reviewItems[5]],
                    ].map(([label, val, ok], i) => (
                      <View key={i} style={s.reviewRow}>
                        <View>
                          <Text style={s.reviewLabel}>{label}</Text>
                          <Text style={s.reviewVal}>{val as string}</Text>
                        </View>
                        <View style={[s.reviewCheck, ok ? { backgroundColor: C.mint + '15', borderColor: C.mint } : {}]}>
                          {ok ? <MaterialCommunityIcons name="check" size={12} color={C.mint} /> : null}
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
                <StepActions step={7} label={STEP_LABELS.review} onBack={() => go(-1)}>
                  <PrimaryButton onPress={validateAndNext} disabled={loading}>{loading ? t('common.loading') : 'Create account'}</PrimaryButton>
                </StepActions>
              </View>
            )}

            {/* SCREEN 9 — SUCCESS */}
            {index === 9 && (
              <View style={[s.screenCenter, { paddingTop: 20 }]}>
                <SuccessIllustration pulse={pulse} />
                <View style={s.successBadge}>
                  <Text style={s.successBadgeText}>Welcome in</Text>
                </View>
                <Text style={s.successTitle}>
                  This is your{'\n'}
                  <Text style={s.heroAccent}>marketplace.</Text>
                </Text>
                <Text style={s.successSub}>{form.first ? `Good to have you, ${form.first}. ` : ''}Your MaurMaket journey starts now.</Text>
                <View style={s.pillRow}>
                  {['Buy', 'Sell', 'Grow'].map(t => (
                    <View key={t} style={s.pill}><Text style={s.pillText}>{t}</Text></View>
                  ))}
                </View>
                <View style={{ flex: 1 }} />
                <PrimaryButton onPress={handleEnterApp}>Explore MaurMaket</PrimaryButton>
              </View>
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
                accessibilityLabel="Dismiss keyboard"
              />
            </BlurView>
            <View style={[s.keyboardGhostStack, { bottom: 123 }]}>
              {ghostFields.map((ghostField) => (
                <GhostFieldRow
                  key={ghostField.key}
                  icon={ghostField.icon}
                  label={ghostField.label}
                  value={ghostField.value}
                  onChangeText={ghostField.setValue}
                  secure={ghostField.secure}
                  capitalize={ghostField.capitalize}
                  active={ghostField.key === focusedField}
                />
              ))}
            </View>
            <View style={[s.keyboardGhostContinue, { bottom: 56 }]}>
              <TouchableOpacity onPress={handleGhostContinue} style={s.keyboardGhostButton} accessibilityRole="button" accessibilityLabel="Continue">
                <Text style={s.keyboardGhostContinueText}>Continue</Text>
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
              { left: revealOrigin.x - Math.max(SCREEN_W, SCREEN_H) * 1.1, top: revealOrigin.y - Math.max(SCREEN_W, SCREEN_H) * 1.1 },
              { opacity: revealOpacity, transform: [{ scale: reveal }] },
            ]}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

/* ── Styles ───────────────────────────────────────────────── */

const s = StyleSheet.create({
  scrollContent: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 28, paddingTop: 0, paddingBottom: 16 },
  slide: { flex: 1, width: '100%', maxWidth: 430, minHeight: Math.max(620, SCREEN_H - 40), alignSelf: 'center' },
  stepScreen: { flex: 1, minHeight: Math.max(620, SCREEN_H - 40), position: 'relative', paddingBottom: 130 },
  centeredStepBody: { flex: 1, justifyContent: 'center', marginBottom: 18 },
  nameStepBody: { alignItems: 'center' },
  nameFields: { width: '100%', gap: 12 },
  emailScreen: { overflow: 'hidden' },
  emailArtWindow: { position: 'absolute', left: 0, right: 0, bottom: 184, height: 455, width: '100%', alignItems: 'center', borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  emailArtwork: { width: 350, height: 455 },
  emailContent: { position: 'absolute', left: 0, right: 0, bottom: 111 },
  screenCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  welcomeScreen: { minHeight: Math.max(620, SCREEN_H - 40), justifyContent: 'center', paddingVertical: 24, position: 'relative', paddingBottom: 144 },
  welcomeActions: { position: 'absolute', left: 0, right: 0, bottom: 18, gap: 12 },
  stepTopBar: { position: 'absolute', top: 28, left: 0, right: 0, zIndex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepCount: { color: C.sub, fontSize: 13, fontWeight: '700', letterSpacing: 0.5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  datePickerRow: { flexDirection: 'row', gap: 15, width: '100%', marginBottom: 15 },
  dateSelector: { flex: 1, height: 58, minWidth: 0, borderRadius: 14, backgroundColor: 'rgba(13,23,52,0.72)', borderWidth: 1, borderColor: '#315BA8', paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateSelectorActive: { borderColor: C.violet, backgroundColor: 'rgba(38,29,60,0.92)', shadowColor: C.violet, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  dateSelectorText: { flex: 1, color: C.text, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  dateSelectorPlaceholder: { color: '#B9C7E8', fontWeight: '500' },
  actions: { position: 'absolute', left: 0, right: 0, bottom: 44, width: '100%', alignItems: 'stretch' },
  birthdayArtwork: { position: 'absolute', left: 0, right: 0, bottom: 184, height: 455, marginBottom: 0 },
  birthdayDatePickerRow: { position: 'absolute', left: 0, right: 0, bottom: 111, marginBottom: 0 },

  // Birthday animation & vertical carousel styles
  dobCenterContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 111,
    zIndex: 10,
  },
  dobDateShower: {
    alignSelf: 'center',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#ffffff',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  dobDateShowerText: {
    color: '#0A0812',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  dobAgeBadge: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dobAgeBadgeAdult: {
    color: '#059669',
  },
  dobAgeBadgeMinor: {
    color: '#DC2626',
  },
  dobWheelTray: {
    marginTop: 16,
    height: 252,
    borderRadius: 24,
    backgroundColor: 'rgba(18,14,31,0.95)',
    borderWidth: 1.5,
    borderColor: 'rgba(139,92,246,0.45)',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
    position: 'relative',
    shadowColor: C.violet,
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
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
    top: 114, // 28px header/padding + 88px (DOB_PADDING)
    height: 44, // DOB_ITEM_HEIGHT
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
    top: 26,
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
    height: 44, // DOB_ITEM_HEIGHT
    alignItems: 'center',
    justifyContent: 'center',
  },
  dobWheelItemText: {
    fontSize: 15,
    color: C.faint,
    fontWeight: '600',
    textAlign: 'center',
  },

  topBackAction: { minHeight: 38, paddingHorizontal: 4, paddingRight: 12, borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  backActionText: { color: C.sub, fontSize: 14, fontWeight: '600' },
  // Splash
  splashBrand: { fontFamily: FONTS.heading, fontSize: 26, fontWeight: '800', color: C.text, marginTop: 12 },
  splashSub: { fontSize: 14, color: C.sub, marginTop: 8, maxWidth: 220, textAlign: 'center' },
  dotsRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.faint },
  holdCircle: { width: 64, height: 64, marginTop: 56, borderRadius: 32, borderWidth: 1.5, borderColor: 'rgba(236,72,153,0.72)', backgroundColor: 'rgba(18,14,31,0.9)', alignItems: 'center', justifyContent: 'center', shadowColor: C.pink, shadowOpacity: 0.8, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
  holdRing: { position: 'absolute', width: 64, height: 64, borderRadius: 32, borderWidth: 1.5 },
  holdRingA: { borderColor: C.pink },
  holdRingB: { borderColor: C.violet },
  holdRingC: { borderColor: C.amber },
  revealLayer: { position: 'absolute', width: Math.max(SCREEN_W, SCREEN_H) * 2.2, height: Math.max(SCREEN_W, SCREEN_H) * 2.2, left: SCREEN_W / 2 - Math.max(SCREEN_W, SCREEN_H) * 1.1, borderRadius: 999, backgroundColor: C.pink, shadowColor: C.amber, shadowOpacity: 0.8, shadowRadius: 70, shadowOffset: { width: 0, height: 0 }, elevation: 14 },

  // Welcome
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  badgeText: { fontSize: 12, fontWeight: '500', color: C.sub },
  heroTitle: { fontFamily: FONTS.heading, fontSize: 30, fontWeight: '800', color: C.text, lineHeight: 36, marginTop: 12 },
  heroAccent: { color: C.violet },
  heroSub: { fontSize: 14, color: C.sub, lineHeight: 21, marginTop: 10, maxWidth: 280 },

  // Steps
  stepTitle: { fontFamily: FONTS.heading, fontSize: 24, fontWeight: '800', color: C.text, marginTop: 8, textAlign: 'center' },
  stepSub: { fontSize: 14, color: C.sub, marginTop: 8, marginBottom: 24, lineHeight: 20, textAlign: 'center', alignSelf: 'center', maxWidth: 340 },

  // Fields
  field: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 58, borderRadius: 16, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.borderHi, paddingHorizontal: 16 },
  fieldFocused: { borderColor: C.violet, backgroundColor: 'rgba(38,29,60,0.92)', shadowColor: C.violet, shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: C.sub },
  fieldInput: { backgroundColor: 'transparent', borderWidth: 0, color: C.text, fontSize: 14, fontWeight: '500' as const, padding: 0 },
  fieldError: { color: C.pink, fontSize: 12.5, marginTop: 4 },
  keyboardGhostStack: { position: 'absolute', left: 28, right: 28, paddingHorizontal: 0, paddingVertical: 0, gap: 8 },
  keyboardGhostRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62, borderRadius: 16, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.borderHi, paddingHorizontal: 16, paddingVertical: 12 },
  keyboardGhostRowActive: { borderColor: C.violet, backgroundColor: 'rgba(38,29,60,0.92)', shadowColor: C.violet, shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  keyboardDimmer: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10,8,18,0.52)' },
  keyboardGhostValue: { color: C.text, fontSize: 14, fontWeight: '500' },
  keyboardGhostInput: { height: 22, padding: 0, color: C.text, fontSize: 14, fontWeight: '500' },
  keyboardGhostContinue: { position: 'absolute', left: 28, right: 28, height: 52, borderRadius: 999, backgroundColor: 'rgba(139,92,246,0.32)', borderWidth: 1, borderColor: C.violet, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  keyboardGhostButton: { flex: 1, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  keyboardGhostContinueText: { color: C.sub, fontSize: 15, fontWeight: '800' },

  // Purpose
  purposeCard: { height: 76, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border },
  purposeChoices: { position: 'absolute', left: 0, right: 0, bottom: 111, gap: 15 },
  purposeArtwork: { position: 'absolute', left: 0, right: 0, bottom: 384, height: 300, marginBottom: 0 },
  purposeCardActive: { backgroundColor: C.pink + '10', borderColor: C.pink },
  purposeIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  purposeIconActive: { backgroundColor: C.pink },
  purposeTitle: { fontSize: 14, fontWeight: '600', color: C.text },
  purposeDesc: { fontSize: 12, color: C.sub, marginTop: 2 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: C.borderHi, alignItems: 'center', justifyContent: 'center' },
  radioActive: { backgroundColor: C.pink, borderColor: C.pink },

  // Review
  reviewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  reviewLabel: { fontSize: 11, color: C.faint },
  reviewVal: { fontSize: 14, fontWeight: '500', color: C.text, marginTop: 2 },
  reviewCheck: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: C.borderHi, alignItems: 'center', justifyContent: 'center' },

  // Success
  successBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: C.mint + '12', borderWidth: 1, borderColor: C.mint + '40', marginTop: 8 },
  successBadgeText: { fontSize: 12, fontWeight: '600', color: C.mint },
  successTitle: { fontFamily: FONTS.heading, fontSize: 27, fontWeight: '800', color: C.text, textAlign: 'center', lineHeight: 34, marginTop: 12 },
  successSub: { fontSize: 14, color: C.sub, textAlign: 'center', lineHeight: 21, marginTop: 10, maxWidth: 260 },
  pillRow: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 20 },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  pillText: { fontSize: 12, fontWeight: '500', color: C.sub },

  // Primary button
  primaryBtn: { height: 52, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#1A0B12' },
});
