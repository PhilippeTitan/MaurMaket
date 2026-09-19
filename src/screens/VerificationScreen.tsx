import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Platform,
  Animated, Dimensions, ScrollView, Image, PanResponder,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Icon } from '../components/icons/Icon';
import Svg, { Rect, Path, Circle as SvgCircle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import { useTranslation } from '@/localization';
import { uploadImage, submitVerification, createDiditSession, getMe } from '../api';
import { store } from '../store';
import { invalidateUser } from '../hooks/useUser';
import type { RootStackParamList } from '../navigation';

let CameraView: any = null;
let useCameraPermissions: any = () => [null, () => {}];
let ImageManipulator: any = null;
let WebView: any = null;
let hasCameraSupport = false;
if (Platform.OS !== 'web') {
  try {
    const cam = require('expo-camera');
    CameraView = cam.CameraView;
    useCameraPermissions = cam.useCameraPermissions;
    hasCameraSupport = true;
    // Keep Expo Go on Expo modules only. ML Kit modules are native custom-build
    // dependencies and cannot be loaded by the Expo Go binary.
    try { ImageManipulator = require('expo-image-manipulator'); } catch {}
    try { WebView = require('react-native-webview').WebView; } catch {}
  } catch (error) {
    console.warn('expo-camera disabled for local UI editing; using a static verification placeholder.');
  }
}

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Step = 'info' | 'didit' | 'cinFront' | 'cropConfirm' | 'cinBack' | 'selfieTip' | 'selfie' | 'reviewAll' | 'processing' | 'result';
type FailedStage = 'card' | 'details' | 'face' | null;

const PHOTO_LABEL_KEYS: Record<string, string> = { cinFront: 'verification.idFront', cinBack: 'verification.idBack', selfie: 'verification.selfie' };
const STAGE_LIST = [
  { key: 'card', labelKey: 'verification.stageCard' },
  { key: 'details', labelKey: 'verification.stageDetails' },
  { key: 'face', labelKey: 'verification.stageFace' },
];
const FAILURE_COPY: Record<string, { titleKey: string; detailKey: string; retakeLabelKey: string; retakeStep: Step }> = {
  card: {
    titleKey: 'verification.failCardTitle',
    detailKey: 'verification.failCardDetail',
    retakeLabelKey: 'verification.retakeIdPhotos',
    retakeStep: 'cinFront',
  },
  details: {
    titleKey: 'verification.failDetailsTitle',
    detailKey: 'verification.failDetailsDetail',
    retakeLabelKey: 'verification.retakeIdPhotos',
    retakeStep: 'cinFront',
  },
  face: {
    titleKey: 'verification.failFaceTitle',
    detailKey: 'verification.failFaceDetail',
    retakeLabelKey: 'verification.retakeSelfie',
    retakeStep: 'selfieTip',
  },
};

const { width: SCREEN_W } = Dimensions.get('window');

export default function VerificationScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();

  const [step, setStep] = useState<Step>('info');
  const [loading, setLoading] = useState(false);
  const [idFrontUrl, setIdFrontUrl] = useState('');
  const [idFaceUrl, setIdFaceUrl] = useState('');
  const [idBackUrl, setIdBackUrl] = useState('');
  const [selfieUrl, setSelfieUrl] = useState('');
  const [idFrontDeleteUrl, setIdFrontDeleteUrl] = useState('');
  const [idFaceDeleteUrl, setIdFaceDeleteUrl] = useState('');
  const [idBackDeleteUrl, setIdBackDeleteUrl] = useState('');
  const [selfieDeleteUrl, setSelfieDeleteUrl] = useState('');
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('back');
  const [cameraReady, setCameraReady] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [failedStage, setFailedStage] = useState<FailedStage>(null);
  const [rejectionReasons, setRejectionReasons] = useState<string[]>([]);
  const insets = useSafeAreaInsets();
  const contentStyle = { flexGrow: 1 as const, padding: SPACING.lg, paddingBottom: SPACING.lg + insets.bottom + 8 };
  const [verified, setVerified] = useState(false);
  const [frontPhotoUri, setFrontPhotoUri] = useState('');
  const [croppedFaceUri, setCroppedFaceUri] = useState('');

  if (!hasCameraSupport && Platform.OS !== 'web') {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl }}>
        <MaterialCommunityIcons name="camera-off-outline" size={44} color={COLORS.text2} />
        <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: '700', marginTop: SPACING.md }}>{t('verification.cameraDisabledTitle')}</Text>
        <Text style={{ color: COLORS.text2, fontSize: 14, textAlign: 'center', marginTop: SPACING.sm, maxWidth: 280 }}>
          {t('verification.cameraDisabledDesc')}
        </Text>
      </View>
    );
  }
  const [cropSourceSize, setCropSourceSize] = useState({ w: 1080, h: 1920 });
  const [cropBox, setCropBox] = useState({ x: 0, y: 0, size: 200 });
  const cropDragRef = useRef<any>(null);
  const containerDimRef = useRef({ w: 0, h: 0 });
  const cropBoxRef = useRef(cropBox);
  cropBoxRef.current = cropBox;
  const [diditUrl, setDiditUrl] = useState('');
  const [diditLoading, setDiditLoading] = useState(false);
  const [diditError, setDiditError] = useState('');

  useEffect(() => {
    if (step === 'cropConfirm' && cropSourceSize.w > 0) {
      const dw = SCREEN_W - SPACING.lg * 2;
      const maxH = Dimensions.get('window').height * 0.55;
      const dh = Math.min(maxH, dw * 1.3);
      containerDimRef.current = { w: dw, h: dh };
      const size = Math.min(dw, dh) * 0.5;
      setCropBox({ x: (dw - size) / 2, y: (dh - size) / 2, size });
    }
  }, [step]);

  const moveResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderGrant: () => {
      cropDragRef.current = { mode: 'move', startCrop: { ...cropBoxRef.current } };
    },
    onPanResponderMove: (_, gs) => {
      if (!cropDragRef.current || cropDragRef.current.mode !== 'move') return;
      const s = cropDragRef.current.startCrop;
      const { w, h } = containerDimRef.current;
      setCropBox(prev => ({
        ...prev,
        x: Math.max(0, Math.min(w - prev.size, s.x + gs.dx)),
        y: Math.max(0, Math.min(h - prev.size, s.y + gs.dy)),
      }));
    },
  })).current;

  const resizeResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderGrant: () => {
      cropDragRef.current = { mode: 'resize', startCrop: { ...cropBoxRef.current } };
    },
    onPanResponderMove: (_, gs) => {
      if (!cropDragRef.current || cropDragRef.current.mode !== 'resize') return;
      const s = cropDragRef.current.startCrop;
      const { w, h } = containerDimRef.current;
      setCropBox(prev => {
        const ns = Math.max(60, Math.min(s.size + Math.max(gs.dx, gs.dy), Math.min(w - s.x, h - s.y)));
        return { ...prev, size: ns };
      });
    },
  })).current;
  const [stages, setStages] = useState<Record<string, 'pending' | 'active' | 'done' | 'failed'>>({});
  const cameraRef = useRef<any>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [step]);

  useEffect(() => {
    if (step === 'result' && verified) {
      invalidateUser();
      getMe().then((res: any) => {
        if (res.user) store.setUser(res.user, store.token);
      }).catch(() => {});
    }
  }, [step, verified]);

  const photos = { cinFront: !!idFrontUrl, cinBack: !!idBackUrl, selfie: !!selfieUrl };
  const photoKeys = ['cinFront', 'cinBack', 'selfie'] as const;
  const getKept = (currentPhoto: string) => photoKeys.filter(k => k !== currentPhoto && photos[k]);

  const launchDidit = async () => {
    setDiditLoading(true);
    setDiditError('');
    try {
      const res = await createDiditSession() as { url: string; sessionId: string };
      console.log(`[VERIFY] Didit session: ${res.sessionId}`);
      setDiditUrl(res.url);
      setStep('didit');
    } catch (e: any) {
      console.log(`[VERIFY] Didit unavailable, using camera fallback: ${e?.message}`);
      setDiditError(e?.message || t('verification.diditUnavailable'));
      setStep('cinFront');
    } finally {
      setDiditLoading(false);
    }
  };

  const renderDidit = () => {
    if (!WebView) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.lg }}>
          <Text style={styles.infoTitle}>{t('verification.webviewUnavailable')}</Text>
          <Text style={styles.infoDesc}>{t('verification.useCameraInstead')}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep('cinFront')}>
            <Text style={styles.primaryBtnText}>{t('verification.useCameraBtn')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={{ flex: 1 }}>
        <WebView
          source={{ uri: diditUrl }}
          style={{ flex: 1 }}
          userAgent="Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
          javaScriptEnabled
          domStorageEnabled
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          allowsFullscreenVideo
          mediaCapturePermissionGrantType={Platform.OS === 'ios' ? 'grant' : undefined}
          onPermissionRequest={(event: any) => {
            console.log(`[VERIFY] WebView permission request: ${JSON.stringify(event.permissions)}`);
            event.grant(event.permissions);
          }}
          onNavigationStateChange={(navState: any) => {
            const url = navState.url;
            if (url.includes('/api/webhooks/didit') || url.includes('verificationSessionId')) {
              console.log(`[VERIFY] Didit callback detected: ${url.substring(0, 100)}`);
              setStep('processing');
              setTimeout(() => {
                setVerified(true);
                setStep('result');
              }, 2000);
            }
          }}
          onMessage={(event: any) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (data.type === 'didit:completed') {
                console.log(`[VERIFY] Didit completed via postMessage: ${data.data?.status}`);
                if (data.data?.status === 'Approved') {
                  setStep('processing');
                  setTimeout(() => {
                    setVerified(true);
                    setStep('result');
                  }, 2000);
                }
              }
            } catch {}
          }}
          onShouldStartLoadWithRequest={(req: any) => true}
        />
      </View>
    );
  };

  const captureImage = async (facing: 'front' | 'back') => {
    console.log(`[VERIFY-DEBUG] captureImage called, facing=${facing}, cameraReady=${cameraReady}, cameraRef=${!!cameraRef.current}`);
    if (!permission?.granted) {
      const p = await requestPermission();
      if (!p.granted) { Alert.alert(t('common.error'), t('verification.cameraPermRequired')); return; }
    }
    try {
      if (!cameraRef.current) {
        console.log(`[VERIFY-DEBUG] ❌ cameraRef.current is null`);
        Alert.alert(t('verification.cameraNotReady'), t('verification.cameraNull'));
        return;
      }
      console.log(`[VERIFY-DEBUG] Calling takePictureAsync...`);
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      console.log(`[VERIFY-DEBUG] takePictureAsync returned: ${JSON.stringify(photo ? { uri: photo.uri?.substring(0, 80), width: photo.width, height: photo.height, type: photo.type } : 'null')}`);
      if (!photo?.uri) {
        console.log(`[VERIFY-DEBUG] ❌ No photo URI returned`);
        Alert.alert(t('verification.captureFailed'), t('verification.noPhoto'));
        setLoading(false);
        return;
      }
      console.log(`[VERIFY-CROP] Photo captured: ${photo.width}x${photo.height} uri=${photo.uri.substring(0, 60)}`);
      setLoading(true);
      console.log(`[VERIFY-DEBUG] Uploading image to Supabase Storage...`);
      const uploadRes = await uploadImage(photo.uri, 3600);
      console.log(`[VERIFY-DEBUG] ✅ Image uploaded: ${uploadRes.url?.substring(0, 60)}`);

        if (facing === 'front') {
          setIdFrontUrl(uploadRes.url);
          if (uploadRes.deleteUrl) setIdFrontDeleteUrl(uploadRes.deleteUrl);
          setFrontPhotoUri(photo.uri);
          setCropSourceSize({ w: photo.width || 1080, h: photo.height || 1920 });
          setLoading(false);
          setStep('cropConfirm');
      } else {
        setIdBackUrl(uploadRes.url);
        if (uploadRes.deleteUrl) setIdBackDeleteUrl(uploadRes.deleteUrl);
        setCameraReady(false);
        setCameraFacing('front');
        setLoading(false);
        setStep('selfieTip');
      }
    } catch (e: any) {
      console.log(`[VERIFY-DEBUG] ❌ captureImage error: ${e?.message}`, e?.stack?.split('\n').slice(0, 3).join(' | '));
      setLoading(false);
      Alert.alert(t('common.error'), e?.message || t('verification.captureError'));
    }
  };

  const captureSelfie = async () => {
    console.log(`[VERIFY-DEBUG] captureSelfie called, cameraReady=${cameraReady}, cameraRef=${!!cameraRef.current}`);
    if (!permission?.granted) {
      const p = await requestPermission();
      if (!p.granted) { Alert.alert(t('common.error'), t('verification.cameraPermRequired')); return; }
    }
    if (!cameraReady) { Alert.alert(t('verification.cameraNotReady'), t('verification.cameraInit')); return; }
    try {
      await new Promise(r => setTimeout(r, 1000));
      setLoading(true);
      if (!cameraRef.current) {
        console.log(`[VERIFY-DEBUG] ❌ selfie cameraRef.current is null after 1s delay`);
        Alert.alert(t('verification.cameraNotReady'), t('verification.cameraNull'));
        setLoading(false);
        return;
      }
      console.log(`[VERIFY-DEBUG] Calling takePictureAsync for selfie...`);
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      console.log(`[VERIFY-DEBUG] Selfie takePictureAsync returned: ${JSON.stringify(photo ? { uri: photo.uri?.substring(0, 80), width: photo.width, height: photo.height } : 'null')}`);
      if (photo?.uri) {
        console.log(`[VERIFY-DEBUG] Uploading selfie to Supabase Storage...`);
        const uploadRes = await uploadImage(photo.uri, 3600);
        console.log(`[VERIFY-DEBUG] ✅ Selfie uploaded: ${uploadRes.url?.substring(0, 60)}`);
        setSelfieUrl(uploadRes.url);
        if (uploadRes.deleteUrl) setSelfieDeleteUrl(uploadRes.deleteUrl);
        setLoading(false);
        setStep('reviewAll');
        return;
      } else {
        console.log(`[VERIFY-DEBUG] ❌ Selfie: no photo URI`);
      }
      setLoading(false);
    } catch (e: any) {
      console.log(`[VERIFY-DEBUG] ❌ captureSelfie error: ${e?.message}`, e?.stack?.split('\n').slice(0, 3).join(' | '));
      setLoading(false);
      Alert.alert(t('common.error'), e?.message || t('verification.selfieFailed'));
    }
  };

  const submitAll = async () => {
    setLoading(true);
    setStep('processing');
    setStages({ card: 'active', details: 'pending', face: 'pending' });

    const stageTimers: NodeJS.Timeout[] = [];
    stageTimers.push(setTimeout(() => setStages(s => ({ ...s, card: 'done', details: 'active' })), 1500));
    stageTimers.push(setTimeout(() => setStages(s => ({ ...s, details: 'done', face: 'active' })), 3000));

    try {
      const res = await submitVerification({
        idFrontUrl,
        idFaceUrl: idFaceUrl || undefined,
        idBackUrl,
        selfieUrl,
        deleteUrls: {
          idFront: idFrontDeleteUrl || undefined,
          idFace: idFaceDeleteUrl || undefined,
          idBack: idBackDeleteUrl || undefined,
          selfie: selfieDeleteUrl || undefined,
        },
      }) as { attempt: { status: string; rejection_reason?: string; failed_stage?: FailedStage; reasons?: string[] }; user?: any; token?: string };

      stageTimers.forEach(clearTimeout);

      if (res.attempt.status === 'verified') {
        setStages({ card: 'done', details: 'done', face: 'done' });
        setVerified(true);
        if (res.user && res.token) await store.setUser(res.user, res.token);
        setTimeout(() => setStep('result'), 600);
      } else {
        const fs = res.attempt.failed_stage || 'face';
        setStages(s => {
          const order = ['card', 'details', 'face'];
          const failIdx = order.indexOf(fs);
          const newS = { ...s };
          order.forEach((k, i) => {
            if (i <= failIdx) newS[k] = i === failIdx ? 'failed' : (newS[k] === 'active' ? 'done' : newS[k]);
          });
          return newS;
        });
        setFailedStage(fs);
        setRejectionReasons(res.attempt.reasons || [res.attempt.rejection_reason || t('verification.failed')]);
        setTimeout(() => setStep('result'), 800);
      }
    } catch (e: any) {
      stageTimers.forEach(clearTimeout);
      setStages({ card: 'failed', details: 'pending', face: 'pending' });
      setFailedStage('card');
      setRejectionReasons([e.message || t('verification.submissionFailed')]);
      setTimeout(() => setStep('result'), 600);
    }
    setLoading(false);
  };

  const resetAll = () => {
    setStep('cinFront');
    setIdFrontUrl(''); setIdFaceUrl(''); setIdBackUrl(''); setSelfieUrl('');
    setIdFrontDeleteUrl(''); setIdFaceDeleteUrl(''); setIdBackDeleteUrl(''); setSelfieDeleteUrl('');
    setFailedStage(null); setRejectionReasons([]); setVerified(false);
    setCameraFacing('back'); setCameraReady(false);
    setCameraFacing('back'); setCameraReady(false);
    setCropSourceSize({ w: 1080, h: 1920 }); setFrontPhotoUri(''); setCroppedFaceUri('');
    setStages({});
  };

  const retakeOnly = (target: Step) => {
    if (target === 'selfieTip') {
      setSelfieUrl(''); setSelfieDeleteUrl('');
    } else if (target === 'cinFront') {
      setIdFrontUrl(''); setIdFaceUrl(''); setIdBackUrl('');
      setIdFrontDeleteUrl(''); setIdFaceDeleteUrl(''); setIdBackDeleteUrl('');
    }
    setFailedStage(null); setRejectionReasons([]);
    setCameraFacing(target === 'selfieTip' ? 'front' : 'back');
    setCameraReady(false);
    setStep(target);
  };

  const stepProgress = () => {
    const steps = ['cinFront', 'cropConfirm', 'cinBack', 'selfieTip', 'selfie', 'reviewAll'];
    const idx = steps.indexOf(step);
    if (idx < 0) return 0;
    return Math.round((idx / (steps.length - 1)) * 100);
  };

  const renderKeptBanner = (currentPhoto: string) => {
    const kept = getKept(currentPhoto);
    if (kept.length === 0) return null;
    return (
      <View style={styles.keptBanner}>
        <Icon name="check-circle" size={14} color={COLORS.green} />
        <Text style={styles.keptText}>
          <Text style={{ fontWeight: '700' }}>{t('verification.kept')} </Text>
          {kept.map(k => t(PHOTO_LABEL_KEYS[k])).join(', ')}{t('verification.onlyRedo')}
        </Text>
      </View>
    );
  };

  const renderCardGuide = () => (
    <Svg width="280" height="178" viewBox="0 0 280 178" fill="none">
      <Rect x="4" y="4" width="272" height="170" rx="14" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeDasharray="4 4" />
      <Rect x="18" y="96" width="60" height="64" rx="6" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
      <SvgCircle cx="48" cy="120" r="12" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" />
      <Path d="M32 156 Q48 136 64 156" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" fill="none" />
      {[26, 42, 58, 74].map((y, i) => (
        <Rect key={i} x="96" y={y} width={i === 0 ? 140 : 160 - i * 14} height="6" rx="3" fill="rgba(255,255,255,0.2)" />
      ))}
      {[
        { x: 4, y: 4, dx: 1, dy: 1 }, { x: 276, y: 4, dx: -1, dy: 1 },
        { x: 4, y: 174, dx: 1, dy: -1 }, { x: 276, y: 174, dx: -1, dy: -1 },
      ].map((c, i) => (
        <Path key={i} d={`M${c.x} ${c.y + c.dy * 18} L${c.x} ${c.y} L${c.x + c.dx * 18} ${c.y}`} stroke={COLORS.coral} strokeWidth="3" strokeLinecap="round" fill="none" />
      ))}
    </Svg>
  );

  const renderFaceGuide = () => (
    <Svg width="220" height="280" viewBox="0 0 220 280" fill="none">
      <Path
        d="M110 20 C138 20 160 44 160 74 C160 96 150 112 140 122 C169 132 190 156 194 190 L194 252 C194 258 189 262 183 262 L37 262 C31 262 26 258 26 252 L26 190 C30 156 51 132 80 122 C70 112 60 96 60 74 C60 44 82 20 110 20 Z"
        stroke="rgba(255,255,255,0.65)" strokeWidth="2" fill="rgba(255,255,255,0.03)"
      />
      {[
        { x: 6, y: 6, dx: 1, dy: 1 }, { x: 214, y: 6, dx: -1, dy: 1 },
        { x: 6, y: 274, dx: 1, dy: -1 }, { x: 214, y: 274, dx: -1, dy: -1 },
      ].map((c, i) => (
        <Path key={i} d={`M${c.x} ${c.y + c.dy * 18} L${c.x} ${c.y} L${c.x + c.dx * 18} ${c.y}`} stroke={COLORS.blue} strokeWidth="3" strokeLinecap="round" fill="none" />
      ))}
    </Svg>
  );

  const renderCamera = (facing: 'front' | 'back', onCapture: () => void, label: string, hint?: string) => (
    <View style={styles.cameraWrap}>
      {permission === null ? (
        <ActivityIndicator size="large" color={COLORS.coral} />
      ) : !permission.granted ? (
        <View style={styles.permissionWrap}>
          <MaterialCommunityIcons name="camera-off-outline" size={48} color={COLORS.text2} />
          <Text style={styles.permissionText}>{t('verification.cameraAccessRequired')}</Text>
          <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
            <Text style={styles.permissionBtnText}>{t('verification.grantPermission')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <CameraView key={facing} ref={cameraRef} style={styles.camera} facing={facing}
            onCameraReady={() => setCameraReady(true)} />
          {hint && <Text style={styles.faceHint}>{hint}</Text>}
          <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]}>
            {facing === 'back' ? renderCardGuide() : renderFaceGuide()}
          </View>
          {!cameraReady && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }]}>
              <ActivityIndicator size="large" color={COLORS.coral} />
              <Text style={{ color: COLORS.white, marginTop: 12, fontSize: 14 }}>{t('verification.initializingCamera')}</Text>
            </View>
          )}
        </>
      )}
      <View style={[styles.cameraActions, { bottom: 60 + insets.bottom }]}>
        <TouchableOpacity style={[styles.captureBtn, !cameraReady && { opacity: 0.4 }]}
          onPress={onCapture} disabled={loading || !cameraReady}>
          {loading ? <ActivityIndicator size="small" color={COLORS.white} /> : <View style={styles.captureBtnInner} />}
        </TouchableOpacity>
      </View>
      <Text style={[styles.cameraLabel, { bottom: 30 + insets.bottom }]}>{label}</Text>
    </View>
  );

  const renderInfo = () => (
    <ScrollView contentContainerStyle={contentStyle}>
      <View style={styles.infoIcon}>
        <Icon name="secure-account" size={48} color={COLORS.coral} />
      </View>
      <Text style={styles.infoTitle}>{t('verification.verifyIdentity')}</Text>
      <Text style={styles.infoDesc}>
        {t('verification.infoDesc')}
      </Text>
      <View style={styles.requirements}>
        {[
          [t('verification.req1'), 'card-account-details-outline'],
          [t('verification.req2'), 'alert-circle-outline'],
          [t('verification.req3'), 'refresh'],
        ].map(([txt, icon], i) => (
          <View key={i} style={styles.reqItem}>
            <MaterialCommunityIcons name={icon as any} size={20} color={COLORS.coral} />
            <Text style={styles.reqText}>{txt}</Text>
          </View>
        ))}
      </View>
      <TouchableOpacity style={styles.primaryBtn} onPress={launchDidit} disabled={diditLoading}>
        {diditLoading ? <ActivityIndicator size="small" color={COLORS.white} /> : (
          <>
            <Text style={styles.primaryBtnText}>{t('verification.startBtn')}</Text>
            <Icon name="chevron-right" size={18} color={COLORS.white} />
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );

  const renderCropConfirm = () => {
    const dw = containerDimRef.current.w || SCREEN_W - SPACING.lg * 2;
    const dh = containerDimRef.current.h || 300;
    const imgW = cropSourceSize.w || 1;
    const imgH = cropSourceSize.h || 1;
    const containScale = Math.min(dw / imgW, dh / imgH);
    const offsetX = (dw - imgW * containScale) / 2;
    const offsetY = (dh - imgH * containScale) / 2;

    return (
      <View style={{ flex: 1, paddingHorizontal: SPACING.lg }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: SPACING.lg + insets.bottom + 8 }}>
          <Text style={styles.eyebrow}>{t('verification.quickCheck')}</Text>
          <Text style={styles.infoTitle}>{t('verification.isThisYourFace')}</Text>
          <Text style={styles.infoDesc}>
            {t('verification.cropDesc')}
          </Text>
          {renderKeptBanner('cinFront')}

          <View style={{ width: dw, height: dh, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000', marginBottom: 12 }}>
            {frontPhotoUri ? (
              <Image source={{ uri: frontPhotoUri }} style={{ width: dw, height: dh }} resizeMode="contain" />
            ) : null}

            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: cropBox.y, backgroundColor: 'rgba(0,0,0,0.55)' }} />
            <View style={{ position: 'absolute', top: cropBox.y + cropBox.size, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' }} />
            <View style={{ position: 'absolute', top: cropBox.y, left: 0, width: cropBox.x, height: cropBox.size, backgroundColor: 'rgba(0,0,0,0.55)' }} />
            <View style={{ position: 'absolute', top: cropBox.y, left: cropBox.x + cropBox.size, right: 0, height: cropBox.size, backgroundColor: 'rgba(0,0,0,0.55)' }} />

            <View
              style={{ position: 'absolute', top: cropBox.y, left: cropBox.x, width: cropBox.size, height: cropBox.size, borderWidth: 2, borderColor: COLORS.coral, borderRadius: 12 }}
              {...moveResponder.panHandlers}
            >
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name="account-outline" size={cropBox.size * 0.36} color={COLORS.coral} style={{ opacity: 0.7 }} />
              </View>
              <View
                style={{ position: 'absolute', right: -10, bottom: -10, width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.coral, borderWidth: 2.5, borderColor: COLORS.bg }}
                {...resizeResponder.panHandlers}
              />
            </View>
          </View>

          <Text style={{ fontSize: 12, color: COLORS.text2, textAlign: 'center', marginBottom: 16 }}>
            {t('verification.cropHint')}
          </Text>

          <View style={{ flex: 1, minHeight: 20 }} />
          <TouchableOpacity style={styles.primaryBtn} onPress={async () => {
              setLoading(true);
            try {
              const actualX = Math.max(0, Math.round((cropBox.x - offsetX) / containScale));
              const actualY = Math.max(0, Math.round((cropBox.y - offsetY) / containScale));
              const actualSize = Math.round(cropBox.size / containScale);
              console.log(`[VERIFY-CROP] Manual crop: ${actualSize}x${actualSize} at (${actualX},${actualY}), containScale=${containScale}`);
              if (ImageManipulator && frontPhotoUri) {
                const manipulated = await ImageManipulator.manipulateAsync(
                  frontPhotoUri,
                  [{ crop: { originX: actualX, originY: actualY, width: actualSize, height: actualSize } }],
                  { compress: 0.85, format: 'jpeg' }
                );
                console.log(`[VERIFY-CROP] Manual crop result: ${manipulated.uri.substring(0, 60)}`);
                setCroppedFaceUri(manipulated.uri);
                const faceUpload = await uploadImage(manipulated.uri, 3600);
                setIdFaceUrl(faceUpload.url);
                if (faceUpload.deleteUrl) setIdFaceDeleteUrl(faceUpload.deleteUrl);
                console.log(`[VERIFY-CROP] Face URL set: ${faceUpload.url.substring(0, 60)}`);
              }
            } catch (e: any) {
              console.log(`[VERIFY-CROP] Manual crop error: ${e?.message}`);
            }
            setLoading(false);
            setStep('cinBack');
          }} disabled={loading}>
            {loading ? <ActivityIndicator size="small" color={COLORS.white} /> : (
              <>
                <Icon name="check" size={16} color={COLORS.white} />
                <Text style={styles.primaryBtnText}>{t('verification.useCrop')}</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.outlineBtn} onPress={() => setStep('cinFront')}>
            <Icon name="back" size={15} color={COLORS.text} />
            <Text style={styles.outlineBtnText}>{t('verification.retakeAll')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  };

  const renderSelfieTip = () => (
    <ScrollView contentContainerStyle={contentStyle}>
      <View style={[styles.infoIcon, { backgroundColor: `${COLORS.blue}1f` }]}>
        <MaterialCommunityIcons name="lightbulb-outline" size={36} color={COLORS.blue} />
      </View>
      <Text style={styles.eyebrow}>{t('verification.step3of3')}</Text>
      <Text style={styles.infoTitle}>{t('verification.selfieTitle')}</Text>
      <Text style={styles.infoDesc}>{t('verification.selfieDesc')}</Text>
      {renderKeptBanner('selfie')}
      <View style={styles.tipsList}>
        {[t('verification.tip1'), t('verification.tip2'), t('verification.tip3')].map((tip, i) => (
          <View key={i} style={styles.tipItem}>
            <View style={styles.tipNum}>
              <Text style={styles.tipNumText}>{i + 1}</Text>
            </View>
            <Text style={styles.tipText}>{tip}</Text>
          </View>
        ))}
      </View>
      <View style={{ flex: 1, minHeight: 20 }} />
      <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep('selfie')}>
        <Text style={styles.primaryBtnText}>{t('verification.gotIt')}</Text>
        <Icon name="chevron-right" size={18} color={COLORS.white} />
      </TouchableOpacity>
    </ScrollView>
  );

  const renderReviewAll = () => (
    <ScrollView contentContainerStyle={contentStyle}>
      <Text style={styles.infoTitle}>{t('verification.reviewTitle')}</Text>
      <Text style={styles.infoDesc}>{t('verification.reviewDesc')}</Text>

      <View style={styles.reviewGrid}>
        {[
          { key: 'cinFront', label: t('verification.idFront'), goto: 'cinFront' as Step, uri: frontPhotoUri },
          { key: 'cinBack', label: t('verification.idBack'), goto: 'cinBack' as Step, uri: idBackUrl },
          { key: 'face', label: t('verification.croppedFace'), goto: 'cropConfirm' as Step, uri: croppedFaceUri },
          { key: 'selfie', label: t('verification.selfie'), goto: 'selfieTip' as Step, uri: selfieUrl },
        ].map((item) => (
          <View key={item.key} style={styles.reviewCard}>
            <View style={[styles.reviewThumb, item.key === 'face' && { borderRadius: 32 }]}>
              {item.uri ? (
                <Image source={{ uri: item.uri }} style={[styles.reviewThumb, item.key === 'face' && { borderRadius: 32 }]} resizeMode="cover" />
              ) : (
                <MaterialCommunityIcons name="camera-off-outline" size={24} color={COLORS.text2} />
              )}
            </View>
            <Text style={styles.reviewLabel}>{item.label}</Text>
            <TouchableOpacity onPress={() => setStep(item.goto)}>
              <Text style={styles.retakeBtn}>{t('verification.retake')}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <View style={{ flex: 1, minHeight: 20 }} />
      <TouchableOpacity style={styles.primaryBtn} onPress={submitAll} disabled={loading}>
        {loading ? <ActivityIndicator size="small" color={COLORS.white} /> : (
          <>
            <Icon name="check-circle" size={16} color={COLORS.white} />
            <Text style={styles.primaryBtnText}>{t('verification.submitBtn')}</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );

  const renderProcessing = () => (
    <View style={styles.processingWrap}>
      <Text style={styles.infoTitle}>{t('verification.verifying')}</Text>
      <Text style={[styles.infoDesc, { marginBottom: 28 }]}>{t('verification.usuallyFewSeconds')}</Text>
      {STAGE_LIST.map((stage) => {
        const status = stages[stage.key] || 'pending';
        return (
          <View key={stage.key} style={[styles.stageRow, status === 'pending' && { opacity: 0.4 }]}>
            <View style={[
              styles.stageDot,
              status === 'done' && { backgroundColor: COLORS.green },
              status === 'failed' && { backgroundColor: COLORS.coral },
              status === 'active' && { backgroundColor: COLORS.surface2 },
            ]}>
              {status === 'done' && <Icon name="check" size={14} color="#06231A" />}
              {status === 'failed' && <Icon name="close" size={14} color="#fff" />}
              {status === 'active' && <ActivityIndicator size="small" color={COLORS.coral} />}
              {status === 'pending' && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.text2 }} />}
            </View>
            <Text style={[styles.stageLabel, status !== 'pending' && { color: COLORS.text }]}>{t(stage.labelKey)}</Text>
          </View>
        );
      })}
    </View>
  );

  const renderResult = () => {
    if (verified) {
      return (
        <View style={contentStyle}>
          <View style={[styles.resultIcon, { backgroundColor: COLORS.green }]}>
            <Icon name="check-circle" size={40} color="#06231A" />
          </View>
          <Text style={styles.infoTitle}>{t('verification.verifiedTitle')}</Text>
          <Text style={styles.infoDesc}>
            {t('verification.verifiedDesc')}
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => { invalidateUser(); nav.goBack(); }}>
            <Text style={styles.primaryBtnText}>{t('common.done')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const info = failedStage ? FAILURE_COPY[failedStage] : FAILURE_COPY.face;
    return (
      <ScrollView contentContainerStyle={contentStyle}>
        <View style={[styles.resultIcon, { borderWidth: 1.5, borderColor: COLORS.coral, backgroundColor: COLORS.surface2 }]}>
          <MaterialCommunityIcons name="alert-circle-outline" size={32} color={COLORS.coral} />
        </View>
        <Text style={styles.infoTitle}>{t(info.titleKey)}</Text>
        <Text style={styles.infoDesc}>{t(info.detailKey)}</Text>

        {rejectionReasons.length > 0 && (
          <View style={styles.rejectionBox}>
            {rejectionReasons.map((reason, i) => (
              <View key={i} style={styles.rejectionItem}>
                <MaterialCommunityIcons name="alert-circle" size={14} color={COLORS.coral} />
                <Text style={styles.rejectionText}>{reason}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.stageChecklist}>
          {STAGE_LIST.map((s) => {
            const failed = s.key === failedStage;
            return (
              <View key={s.key} style={styles.stageCheckRow}>
                {failed ? <Icon name="close" size={14} color={COLORS.coral} /> : <Icon name="check" size={14} color={COLORS.green} />}
                <Text style={[styles.stageCheckLabel, failed && { color: COLORS.text, fontWeight: '700' }]}>{t(s.labelKey)}</Text>
                <Text style={[styles.stageCheckStatus, failed ? { color: COLORS.coral } : { color: COLORS.green }]}>
                  {failed ? t('verification.needsRetake') : t('verification.passed')}
                </Text>
              </View>
            );
          })}
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={() => retakeOnly(info.retakeStep)}>
          <Icon name="back" size={16} color={COLORS.white} />
          <Text style={styles.primaryBtnText}>{t(info.retakeLabelKey)}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ghostBtn} onPress={() => nav.goBack()}>
          <Text style={styles.ghostBtnText}>{t('verification.cancelForNow')}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('verification.title')} onBack={() => nav.goBack()} />
      {step !== 'info' && step !== 'didit' && step !== 'processing' && step !== 'result' && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${stepProgress()}%` }]} />
        </View>
      )}
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        {step === 'info' && renderInfo()}
        {step === 'didit' && renderDidit()}
        {step === 'cinFront' && renderCamera('back', () => captureImage('front'), t('verification.captureFrontLabel'), t('verification.captureFrontHint'))}
        {step === 'cropConfirm' && renderCropConfirm()}
        {step === 'cinBack' && renderCamera('back', () => captureImage('back'), t('verification.captureBackLabel'), t('verification.captureBackHint'))}
        {step === 'selfieTip' && renderSelfieTip()}
        {step === 'selfie' && renderCamera('front', captureSelfie, t('verification.selfieLabel'), t('verification.selfieHint'))}
        {step === 'reviewAll' && renderReviewAll()}
        {step === 'processing' && renderProcessing()}
        {step === 'result' && renderResult()}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { flexGrow: 1, padding: SPACING.lg },
  progressTrack: { height: 4, backgroundColor: COLORS.surface2, marginHorizontal: SPACING.lg },
  progressFill: { height: '100%', backgroundColor: COLORS.coral, borderRadius: 2 },
  eyebrow: { fontSize: 12, fontWeight: '700', color: COLORS.coral, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  infoIcon: { alignSelf: 'center', width: 68, height: 68, borderRadius: 20, backgroundColor: `${COLORS.coral}22`, alignItems: 'center', justifyContent: 'center', marginTop: 20, marginBottom: 16 },
  infoTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 10, textAlign: 'center' },
  infoDesc: { fontSize: 14, color: COLORS.text2, textAlign: 'center', lineHeight: 20, marginBottom: 20, paddingHorizontal: 12 },
  requirements: { gap: 14, marginBottom: 28, paddingHorizontal: 12 },
  reqItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reqText: { fontSize: 14, color: COLORS.text, flex: 1 },
  primaryBtn: { backgroundColor: COLORS.coral, padding: 16, borderRadius: RADIUS.button, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  primaryBtnText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  outlineBtn: { backgroundColor: 'transparent', padding: 14, borderRadius: RADIUS.button, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.border, marginTop: 10 },
  outlineBtnText: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  ghostBtn: { padding: 14, alignItems: 'center', marginTop: 10 },
  ghostBtnText: { color: COLORS.text2, fontSize: 14, fontWeight: '600' },
  cameraWrap: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  faceHint: { position: 'absolute', top: 80, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500' },
  cameraActions: { position: 'absolute', bottom: 60, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center' },
  captureBtn: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  captureBtnInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: COLORS.white },
  cameraLabel: { position: 'absolute', bottom: 30, left: 0, right: 0, textAlign: 'center', color: COLORS.white, fontSize: 13, fontWeight: '600' },
  permissionWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 40 },
  permissionText: { fontSize: 14, color: COLORS.text2, textAlign: 'center' },
  permissionBtn: { backgroundColor: COLORS.coral, paddingHorizontal: 20, paddingVertical: 10, borderRadius: RADIUS.row, marginTop: 8 },
  permissionBtnText: { color: COLORS.white, fontWeight: '600' },
  processingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, width: '100%' },
  stageDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center' },
  stageLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text2 },
  keptBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: `${COLORS.green}14`, borderWidth: 1, borderColor: `${COLORS.green}33`, borderRadius: 12, padding: 10, marginBottom: 14 },
  keptText: { fontSize: 12.5, color: COLORS.text, flex: 1, lineHeight: 18 },
  cropToggleRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 18 },
  cropToggle: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999, backgroundColor: COLORS.surface2 },
  cropToggleActive: { backgroundColor: COLORS.coral },
  cropToggleText: { fontSize: 12.5, fontWeight: '700', color: COLORS.text2 },
  cropToggleTextActive: { color: COLORS.white },
  cropPreviewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 24 },
  cropPreviewItem: { alignItems: 'center' },
  cropPreviewThumb: { backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center' },
  cropPreviewLabel: { fontSize: 11, color: COLORS.text2, marginTop: 6 },
  manualCropInfo: { marginBottom: 16 },
  cropBox: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 12 },
  cropAdjustRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10 },
  cropAdjBtn: { backgroundColor: COLORS.surface2, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  cropAdjBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.text },
  tipsList: { gap: 14, marginBottom: 8, paddingHorizontal: 4 },
  tipItem: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  tipNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  tipNumText: { fontSize: 12, fontWeight: '700', color: COLORS.blue },
  tipText: { fontSize: 14, color: COLORS.text, flex: 1, lineHeight: 20 },
  reviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8 },
  reviewCard: { width: (SCREEN_W - 52) / 2, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, padding: 12, alignItems: 'center', gap: 6 },
  reviewThumb: { width: 60, height: 60, borderRadius: 10, backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center' },
  reviewLabel: { fontSize: 12, color: COLORS.text2, fontWeight: '600' },
  reviewTag: { fontSize: 10, fontWeight: '700', color: COLORS.text2, textTransform: 'uppercase', letterSpacing: 0.3 },
  retakeBtn: { fontSize: 12, fontWeight: '700', color: COLORS.blue },
  resultIcon: { alignSelf: 'center', width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  rejectionBox: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.coral, borderRadius: RADIUS.card, padding: 14, marginBottom: 16, gap: 8 },
  rejectionItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rejectionText: { fontSize: 13, color: COLORS.text, flex: 1, lineHeight: 18 },
  stageChecklist: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.card, paddingHorizontal: 16, marginBottom: 20 },
  stageCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  stageCheckLabel: { fontSize: 13.5, color: COLORS.text2, fontWeight: '500', flex: 1 },
  stageCheckStatus: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
});
