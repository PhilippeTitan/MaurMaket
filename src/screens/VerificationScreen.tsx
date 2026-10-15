import React, { useState, useRef, useEffect } from 'react';
import LottieView from 'lottie-react-native';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Platform,
  Animated, Dimensions, ScrollView, Image,
} from 'react-native';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import { Icon } from '../components/icons/Icon';
import Svg, { Rect, Path, Circle as SvgCircle } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import { useTranslation } from '@/localization';
import { uploadImage, submitVerification, getMe } from '../api';
import { store } from '../store';
import { invalidateUser } from '../hooks/useUser';
import type { RootStackParamList } from '../navigation';

let CameraView: any = null;
let useCameraPermissions: any = () => [null, () => {}];
let hasCameraSupport = false;
if (Platform.OS !== 'web') {
  try {
    const cam = require('expo-camera');
    CameraView = cam.CameraView;
    useCameraPermissions = cam.useCameraPermissions;
    hasCameraSupport = true;
  } catch (error) {
    console.warn('expo-camera disabled for local UI editing; using a static verification placeholder.');
  }
}

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Step = 'info' | 'cinFront' | 'captureConfirm' | 'cinBack' | 'selfieTip' | 'selfie' | 'reviewAll' | 'processing' | 'result';
type CaptureTarget = 'cinFront' | 'cinBack' | 'selfie';
type ResultState = 'verified' | 'pending_review' | null;

let ImageManipulator: any = null;
if (Platform.OS !== 'web') {
  try { ImageManipulator = require('expo-image-manipulator'); } catch { /* optional */ }
}

// The camera returns raw sensor pixels with EXIF orientation tags; the upload
// resize strips EXIF without applying it, so a vertical shot reaches the
// server rotated 90Â° and the face detector finds nothing. Normalize pixels
// to portrait before upload/preview.
const normalizeCaptureOrientation = async (uri: string, exif?: any): Promise<string> => {
  if (!ImageManipulator) return uri;
  try {
    const probe = await ImageManipulator.manipulateAsync(uri, [], { compress: 1 });
    const orientation = Number(exif?.Orientation ?? exif?.orientation ?? 0);
    let rotate = 0;
    if (probe.width > probe.height) rotate = orientation === 8 || orientation === 7 ? 270 : 90;
    else if (orientation === 3 || orientation === 4) rotate = 180;
    if (!rotate) return uri;
    const out = await ImageManipulator.manipulateAsync(
      uri, [{ rotate }], { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
    );
    return out.uri || uri;
  } catch {
    return uri;
  }
};

const PHOTO_LABEL_KEYS: Record<CaptureTarget, string> = {
  cinFront: 'verification.idFront',
  cinBack: 'verification.idBack',
  selfie: 'verification.selfie',
};
const CAMERA_STEPS: Step[] = ['cinFront', 'cinBack', 'selfie'];
const PROGRESS_STEPS: Step[] = ['cinFront', 'cinBack', 'selfieTip', 'selfie', 'reviewAll'];
const STAGE_LIST = [
  { key: 'card', labelKey: 'verification.stageCard' },
  { key: 'details', labelKey: 'verification.stageDetails' },
  { key: 'face', labelKey: 'verification.stageFace' },
];

// Granular QC codes returned by the backend map to localized copy and to the
// capture step that should reopen for a retake (APP-Q559).
const QC_COPY: Record<string, { titleKey: string; descKey: string; step: Step; clear: CaptureTarget | null }> = {
  card_not_detected: { titleKey: 'verification.qcCardNotTitle', descKey: 'verification.qcCardNotDesc', step: 'cinFront', clear: 'cinFront' },
  face_not_found: { titleKey: 'verification.qcFaceNotTitle', descKey: 'verification.qcFaceNotDesc', step: 'cinFront', clear: 'cinFront' },
  ocr_low: { titleKey: 'verification.qcOcrTitle', descKey: 'verification.qcOcrDesc', step: 'cinFront', clear: 'cinFront' },
  details_mismatch: { titleKey: 'verification.qcDetailsTitle', descKey: 'verification.qcDetailsDesc', step: 'cinFront', clear: 'cinFront' },
  face_mismatch: { titleKey: 'verification.qcMismatchTitle', descKey: 'verification.qcMismatchDesc', step: 'selfie', clear: 'selfie' },
  not_live: { titleKey: 'verification.qcNotLiveTitle', descKey: 'verification.qcNotLiveDesc', step: 'selfie', clear: 'selfie' },
  timeout: { titleKey: 'verification.qcTimeoutTitle', descKey: 'verification.qcTimeoutDesc', step: 'reviewAll', clear: null },
  server_error: { titleKey: 'verification.qcServerTitle', descKey: 'verification.qcServerDesc', step: 'reviewAll', clear: null },
};
const STAGE_FALLBACK_CODE: Record<string, string> = { card: 'ocr_low', details: 'ocr_low', face: 'face_mismatch' };

// In-session draft so a brief navigation away doesn't lose captures
// (APP-Q563). Module scope only â€” never persisted to disk.
type KycDraft = {
  idFrontUrl: string; idBackUrl: string; selfieUrl: string;
  idFrontDeleteUrl: string; idBackDeleteUrl: string; selfieDeleteUrl: string;
  idFrontLocal?: string; idBackLocal?: string; selfieLocal?: string;
  step: Step; updatedAt: number;
};
const DRAFT_TTL_MS = 2 * 60 * 60 * 1000;
let kycDraftStore: KycDraft | null = null;
const readDraft = (): KycDraft | null =>
  kycDraftStore && Date.now() - kycDraftStore.updatedAt < DRAFT_TTL_MS ? kycDraftStore : null;
const clearDraft = () => { kycDraftStore = null; };

const { width: SCREEN_W } = Dimensions.get('window');

// Review thumbnail: prefer the local capture (always present in-session),
// fall back to the temporary remote URL, then to the placeholder icon.
function ReviewThumb({ local, remote }: { local?: string; remote?: string }) {
  const [uri, setUri] = useState<string | null>(local || remote || null);
  useEffect(() => { setUri(local || remote || null); }, [local, remote]);
  if (!uri) return <MaterialCommunityIcons name="camera-off-outline" size={24} color={COLORS.text2} />;
  return (
    <Image
      source={{ uri }}
      style={styles.reviewThumb}
      resizeMode="cover"
      onError={() => setUri(local && remote && uri === local ? remote : null)}
    />
  );
}

export default function VerificationScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const restoredDraft = useRef(readDraft()).current;
  const [step, setStep] = useState<Step>(() => {
    const d = restoredDraft;
    if (!d) return 'info';
    if (d.idFrontUrl && d.idBackUrl && d.selfieUrl) return 'reviewAll';
    return CAMERA_STEPS.includes(d.step) || d.step === 'selfieTip' || d.step === 'reviewAll' ? d.step : 'info';
  });
  const [loading, setLoading] = useState(false);
  const [idFrontUrl, setIdFrontUrl] = useState(restoredDraft?.idFrontUrl || '');
  const [idBackUrl, setIdBackUrl] = useState(restoredDraft?.idBackUrl || '');
  const [selfieUrl, setSelfieUrl] = useState(restoredDraft?.selfieUrl || '');
  const [idFrontDeleteUrl, setIdFrontDeleteUrl] = useState(restoredDraft?.idFrontDeleteUrl || '');
  const [idBackDeleteUrl, setIdBackDeleteUrl] = useState(restoredDraft?.idBackDeleteUrl || '');
  const [selfieDeleteUrl, setSelfieDeleteUrl] = useState(restoredDraft?.selfieDeleteUrl || '');
  // Local file copies of the captures â€” always renderable in review even if
  // the temporary remote URL is slow, expired, or blocked on the device.
  const [idFrontLocal, setIdFrontLocal] = useState(restoredDraft?.idFrontLocal || '');
  const [idBackLocal, setIdBackLocal] = useState(restoredDraft?.idBackLocal || '');
  const [selfieLocal, setSelfieLocal] = useState(restoredDraft?.selfieLocal || '');
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('back');
  const [cameraReady, setCameraReady] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [pendingCapture, setPendingCapture] = useState<{ target: CaptureTarget; localUri: string; url: string; deleteUrl: string } | null>(null);
  const [captureError, setCaptureError] = useState<{ titleKey: string; descKey: string; reasons: string[] } | null>(null);
  const [resultState, setResultState] = useState<ResultState>(null);
  const cameraRef = useRef<any>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const contentStyle = { flexGrow: 1 as const, padding: SPACING.lg, paddingBottom: SPACING.lg + insets.bottom + 16 };

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [step]);

  // Persist the in-session draft while the flow is in progress.
  useEffect(() => {
    if (step === 'info' || step === 'processing' || step === 'result' || step === 'captureConfirm') return;
    kycDraftStore = {
      idFrontUrl, idBackUrl, selfieUrl,
      idFrontDeleteUrl, idBackDeleteUrl, selfieDeleteUrl,
      idFrontLocal, idBackLocal, selfieLocal,
      step, updatedAt: Date.now(),
    };
  }, [step, idFrontUrl, idBackUrl, selfieUrl, idFrontDeleteUrl, idBackDeleteUrl, selfieDeleteUrl, idFrontLocal, idBackLocal, selfieLocal]);

  useEffect(() => {
    if (step === 'result' && resultState === 'verified') {
      invalidateUser();
      getMe().then((res: any) => {
        if (res.user) store.setUser(res.user, store.token);
      }).catch(() => {});
    }
  }, [step, resultState]);

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

  const photos: Record<CaptureTarget, boolean> = { cinFront: !!idFrontUrl, cinBack: !!idBackUrl, selfie: !!selfieUrl };
  const photoKeys: CaptureTarget[] = ['cinFront', 'cinBack', 'selfie'];

  const goToStep = (s: Step) => {
    if (CAMERA_STEPS.includes(s)) {
      setCameraReady(false);
      setCameraFacing(s === 'selfie' ? 'front' : 'back');
    }
    setStep(s);
  };

  const captureImage = async (target: 'cinFront' | 'cinBack') => {
    if (!permission?.granted) {
      const p = await requestPermission();
      if (!p.granted) { Alert.alert(t('common.error'), t('verification.cameraPermRequired')); return; }
    }
    if (!cameraReady) { Alert.alert(t('verification.cameraNotReady'), t('verification.cameraInit')); return; }
    try {
      if (!cameraRef.current) {
        Alert.alert(t('verification.cameraNotReady'), t('verification.cameraNull'));
        return;
      }
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, exif: true });
      if (!photo?.uri) {
        Alert.alert(t('verification.captureFailed'), t('verification.noPhoto'));
        return;
      }
      setLoading(true);
      setCaptureError(null);
      const uprightUri = await normalizeCaptureOrientation(photo.uri, photo.exif);
      const uploadRes = await uploadImage(uprightUri, 7200, 'kyc');
      setPendingCapture({
        target,
        localUri: uprightUri,
        url: uploadRes.url,
        deleteUrl: uploadRes.deleteUrl || '',
      });
      setStep('captureConfirm');
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('verification.captureError'));
    } finally {
      setLoading(false);
    }
  };

  const captureSelfie = async () => {
    if (!permission?.granted) {
      const p = await requestPermission();
      if (!p.granted) { Alert.alert(t('common.error'), t('verification.cameraPermRequired')); return; }
    }
    if (!cameraReady) { Alert.alert(t('verification.cameraNotReady'), t('verification.cameraInit')); return; }
    try {
      await new Promise(r => setTimeout(r, 1000));
      setLoading(true);
      setCaptureError(null);
      if (!cameraRef.current) {
        Alert.alert(t('verification.cameraNotReady'), t('verification.cameraNull'));
        return;
      }
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, exif: true });
      if (!photo?.uri) {
        Alert.alert(t('verification.captureFailed'), t('verification.noPhoto'));
        return;
      }
      const uprightUri = await normalizeCaptureOrientation(photo.uri, photo.exif);
      const uploadRes = await uploadImage(uprightUri, 7200, 'kyc');
      setPendingCapture({
        target: 'selfie',
        localUri: uprightUri,
        url: uploadRes.url,
        deleteUrl: uploadRes.deleteUrl || '',
      });
      setStep('captureConfirm');
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('verification.selfieFailed'));
    } finally {
      setLoading(false);
    }
  };

  const confirmCapture = () => {
    if (!pendingCapture) return;
    const { target, url, deleteUrl, localUri } = pendingCapture;
    // Continue with the first photo that is still missing â€” a retake of one
    // photo jumps straight back to review instead of re-walking the wizard.
    let next: Step;
    if (target === 'cinFront') {
      setIdFrontUrl(url); setIdFrontDeleteUrl(deleteUrl); setIdFrontLocal(localUri);
      next = idBackUrl ? (selfieUrl ? 'reviewAll' : 'selfieTip') : 'cinBack';
    } else if (target === 'cinBack') {
      setIdBackUrl(url); setIdBackDeleteUrl(deleteUrl); setIdBackLocal(localUri);
      next = selfieUrl ? 'reviewAll' : 'selfieTip';
    } else {
      setSelfieUrl(url); setSelfieDeleteUrl(deleteUrl); setSelfieLocal(localUri);
      next = idFrontUrl && idBackUrl ? 'reviewAll' : idBackUrl ? 'cinFront' : 'cinBack';
    }
    goToStep(next);
    setPendingCapture(null);
    setCaptureError(null);
  };

  const retakeCapture = () => {
    if (!pendingCapture) return;
    const target = pendingCapture.target;
    setPendingCapture(null);
    goToStep(target);
  };

  const submitAll = async () => {
    setCaptureError(null);
    setStep('processing');
    setLoading(true);
    try {
      const res = await submitVerification({
        idFrontUrl,
        idBackUrl,
        selfieUrl,
        deleteUrls: {
          idFront: idFrontDeleteUrl || undefined,
          idBack: idBackDeleteUrl || undefined,
          selfie: selfieDeleteUrl || undefined,
        },
      }) as { attempt: { status: string; rejection_reason?: string; failed_stage?: string | null; reasons?: string[]; reason_codes?: string[] }; user?: any; token?: string };

      if (res.attempt.status === 'verified') {
        clearDraft();
        setResultState('verified');
        if (res.user) await store.setUser(res.user, res.token || store.token);
        setStep('result');
      } else if (res.attempt.status === 'manual_review') {
        clearDraft();
        setResultState('pending_review');
        setStep('result');
      } else {
        // Rejected â€” reopen the exact capture step with granular, localized
        // QC feedback instead of a generic failure screen (APP-Q559).
        const codes = res.attempt.reason_codes || [];
        const primaryCode = codes[0] || STAGE_FALLBACK_CODE[res.attempt.failed_stage || ''] || 'face_mismatch';
        const copy = QC_COPY[primaryCode] || QC_COPY.face_mismatch;
        setCaptureError({
          titleKey: copy.titleKey,
          descKey: copy.descKey,
          reasons: (res.attempt.reasons || []).filter(r => typeof r === 'string' && r.length > 0),
        });
        if (copy.clear === 'cinFront') { setIdFrontUrl(''); setIdFrontDeleteUrl(''); setIdFrontLocal(''); }
        if (copy.clear === 'selfie') { setSelfieUrl(''); setSelfieDeleteUrl(''); setSelfieLocal(''); }
        goToStep(copy.step);
      }
    } catch (e: any) {
      setCaptureError({
        titleKey: 'verification.qcServerTitle',
        descKey: 'verification.qcServerDesc',
        reasons: [e?.message || t('verification.submissionFailed')],
      });
      setStep('reviewAll');
    } finally {
      setLoading(false);
    }
  };

  const retakeOnly = (target: CaptureTarget) => {
    if (target === 'cinFront') { setIdFrontUrl(''); setIdFrontDeleteUrl(''); setIdFrontLocal(''); }
    else if (target === 'cinBack') { setIdBackUrl(''); setIdBackDeleteUrl(''); setIdBackLocal(''); }
    else { setSelfieUrl(''); setSelfieDeleteUrl(''); setSelfieLocal(''); }
    setCaptureError(null);
    goToStep(target);
  };

  // Cancel must fully restart the flow: wipe the in-session draft so the next
  // entry starts at 'info', then leave the screen.
  const cancelForNow = () => {
    clearDraft();
    setIdFrontUrl(''); setIdFrontDeleteUrl(''); setIdFrontLocal('');
    setIdBackUrl(''); setIdBackDeleteUrl(''); setIdBackLocal('');
    setSelfieUrl(''); setSelfieDeleteUrl(''); setSelfieLocal('');
    setPendingCapture(null);
    setCaptureError(null);
    setResultState(null);
    setStep('info');
    if (nav.canGoBack()) nav.goBack();
    else nav.navigate('Main', { screen: 'FeedTab' });
  };

  const stepProgress = () => {
    const idx = PROGRESS_STEPS.indexOf(step);
    if (idx < 0) return 0;
    return Math.round((idx / (PROGRESS_STEPS.length - 1)) * 100);
  };

  const renderKeptBanner = (current: CaptureTarget) => {
    const kept = photoKeys.filter(k => k !== current && photos[k]);
    if (kept.length === 0) return null;
    return (
      <View style={styles.keptBanner}>
        <Icon name="check-circle" size={13} color={COLORS.green} />
        <Text style={styles.keptText}>
          <Text style={{ fontWeight: '700' }}>{t('verification.kept')} </Text>
          {kept.map(k => t(PHOTO_LABEL_KEYS[k])).join(', ')}{t('verification.onlyRedo')}
        </Text>
      </View>
    );
  };

  const renderCaptureError = () => {
    if (!captureError) return null;
    return (
      <View style={styles.errorBanner} accessibilityLiveRegion="polite">
        <View style={styles.errorHeader}>
          <MaterialCommunityIcons name="alert-circle" size={16} color={COLORS.coral} />
          <Text style={styles.errorTitle}>{t(captureError.titleKey)}</Text>
        </View>
        <Text style={styles.errorDesc}>{t(captureError.descKey)}</Text>
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

  const renderCamera = (facing: 'front' | 'back', target: CaptureTarget, onCapture: () => void, label: string, hint?: string) => (
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
      {captureError && (
        <View style={styles.camErrorWrap}>
          {renderCaptureError()}
        </View>
      )}
      <View style={[styles.cameraActions, { bottom: 60 + insets.bottom }]}>
        <TouchableOpacity style={[styles.captureBtn, !cameraReady && { opacity: 0.4 }]}
          onPress={onCapture} disabled={loading || !cameraReady}>
          {loading ? <ActivityIndicator size="small" color={COLORS.white} /> : <View style={styles.captureBtnInner} />}
        </TouchableOpacity>
      </View>
      <Text style={[styles.cameraLabel, { bottom: 30 + insets.bottom }]}>{label}</Text>
      <View style={[styles.keptChip, { top: 8 }]}>{renderKeptBanner(target)}</View>
    </View>
  );

  const renderInfo = () => (
    <ScrollView contentContainerStyle={[contentStyle, styles.introContent]} showsVerticalScrollIndicator={false}>
      <View>
        <View style={styles.introHeading}>
          <View style={styles.introIcon}>
            <Icon name="secure-account" size={24} color={COLORS.coral} />
          </View>
          <Text style={[styles.infoTitle, styles.introTitle]}>{t('verification.verifyIdentity')}</Text>
        </View>
        <Text style={[styles.infoDesc, styles.introDesc]}>
          {t('verification.infoDesc')}
        </Text>
        <View style={styles.requirements}>
          {[
            [t('verification.req1'), 'card-account-details-outline'],
            [t('verification.req2'), 'alert-circle-outline'],
            [t('verification.req3'), 'refresh'],
          ].map(([txt, icon], i) => (
            <View key={i} style={[styles.reqItem, i < 2 && styles.reqDivider]}>
              <MaterialCommunityIcons name={icon as any} size={19} color={COLORS.coral} />
              <Text style={styles.reqText}>{txt}</Text>
            </View>
          ))}
        </View>
      </View>
      <TouchableOpacity style={styles.primaryBtn} onPress={() => goToStep('cinFront')}>
        <Text style={styles.primaryBtnText}>{t('verification.startBtn')}</Text>
        <Icon name="chevron-right" size={18} color={COLORS.white} />
      </TouchableOpacity>
    </ScrollView>
  );

  const renderCaptureConfirm = () => {
    if (!pendingCapture) return null;
    const isSelfie = pendingCapture.target === 'selfie';
    return (
      <ScrollView contentContainerStyle={contentStyle} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>{t(PHOTO_LABEL_KEYS[pendingCapture.target])}</Text>
        <Text style={styles.infoTitle}>{t('verification.confirmTitle')}</Text>
        <Text style={styles.infoDesc}>
          {t(isSelfie ? 'verification.confirmDescSelfie' : 'verification.confirmDescCard')}
        </Text>
        <View style={styles.confirmPhotoWrap}>
          <Image source={{ uri: pendingCapture.localUri }} style={styles.confirmPhoto} resizeMode="contain" />
        </View>
        <View style={{ flex: 1, minHeight: 16 }} />
        <TouchableOpacity style={styles.primaryBtn} onPress={confirmCapture}>
          <Icon name="check" size={16} color={COLORS.white} />
          <Text style={styles.primaryBtnText}>{t('verification.usePhoto')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.outlineBtn} onPress={retakeCapture}>
          <MaterialCommunityIcons name="camera-retake-outline" size={16} color={COLORS.text} />
          <Text style={styles.outlineBtnText}>{t('verification.retakePhoto')}</Text>
        </TouchableOpacity>
      </ScrollView>
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
        {[t('verification.tip1'), t('verification.tip2'), t('verification.tip3'), t('verification.tip4')].map((tip, i) => (
          <View key={i} style={styles.tipItem}>
            <View style={styles.tipNum}>
              <Text style={styles.tipNumText}>{i + 1}</Text>
            </View>
            <Text style={styles.tipText}>{tip}</Text>
          </View>
        ))}
      </View>
      <View style={{ flex: 1, minHeight: 20 }} />
      <TouchableOpacity style={styles.primaryBtn} onPress={() => goToStep('selfie')}>
        <Text style={styles.primaryBtnText}>{t('verification.gotIt')}</Text>
        <Icon name="chevron-right" size={18} color={COLORS.white} />
      </TouchableOpacity>
    </ScrollView>
  );

  const renderReviewAll = () => (
    <ScrollView contentContainerStyle={contentStyle} showsVerticalScrollIndicator={false}>
      <Text style={styles.infoTitle}>{t('verification.reviewTitle')}</Text>
      <Text style={styles.infoDesc}>{t('verification.reviewDesc')}</Text>

      {renderCaptureError()}

      <View style={styles.reviewGrid}>
        {([
          { key: 'cinFront' as CaptureTarget, label: t('verification.idFront'), uri: idFrontUrl, local: idFrontLocal },
          { key: 'cinBack' as CaptureTarget, label: t('verification.idBack'), uri: idBackUrl, local: idBackLocal },
          { key: 'selfie' as CaptureTarget, label: t('verification.selfie'), uri: selfieUrl, local: selfieLocal },
        ]).map((item) => (
          <View key={item.key} style={styles.reviewCard}>
            <View style={styles.reviewThumb}>
              <ReviewThumb local={item.local} remote={item.uri} />
            </View>
            <Text style={styles.reviewLabel}>{item.label}</Text>
            <TouchableOpacity onPress={() => retakeOnly(item.key)} style={styles.retakeHit}>
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
      <TouchableOpacity style={styles.ghostBtn} onPress={cancelForNow}>
        <Text style={styles.ghostBtnText}>{t('verification.cancelForNow')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  // Honest processing state â€” one real request, no fake stage animation
  // (APP-Q561).
  const renderProcessing = () => (
    <View style={styles.processingWrap}>
      <ActivityIndicator size="large" color={COLORS.coral} />
      <Text style={[styles.infoTitle, { marginTop: 24 }]}>{t('verification.verifying')}</Text>
      <Text style={[styles.infoDesc, { marginBottom: 28 }]}>{t('verification.processingDuration')}</Text>
      <View style={styles.passiveChecks}>
        {STAGE_LIST.map((stage) => (
          <View key={stage.key} style={styles.passiveRow}>
            <MaterialCommunityIcons name="shield-search-outline" size={16} color={COLORS.text2} />
            <Text style={styles.passiveLabel}>{t(stage.labelKey)}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const renderResult = () => {
    if (resultState === 'verified') {
      return (
        <View style={contentStyle}>
          <View accessible accessibilityRole="image" accessibilityLabel={t('verification.verifiedTitle')}>
            <LottieView
              source={require('../../assets/success-tick.json')}
              autoPlay
              loop={false}
              style={styles.successAnimation}
            />
          </View>
          <Text style={styles.infoTitle}>{t('verification.verifiedTitle')}</Text>
          <Text style={styles.infoDesc}>
            {t('verification.verifiedDesc')}
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => { clearDraft(); invalidateUser(); nav.goBack(); }}>
            <Text style={styles.primaryBtnText}>{t('common.done')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Manual review (APP-Q561 honesty â€” this is a real backend state).
    return (
      <View style={contentStyle}>
        <View style={[styles.resultIcon, { borderWidth: 1.5, borderColor: COLORS.blue, backgroundColor: `${COLORS.blue}12` }]}>
          <MaterialCommunityIcons name="clock-outline" size={32} color={COLORS.blue} />
        </View>
        <Text style={styles.infoTitle}>{t('verification.pendingReviewTitle')}</Text>
        <Text style={styles.infoDesc}>{t('verification.pendingReviewDesc')}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => { clearDraft(); nav.goBack(); }}>
          <Text style={styles.primaryBtnText}>{t('common.done')}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('verification.title')} onBack={() => nav.goBack()} />
      {PROGRESS_STEPS.includes(step) && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${stepProgress()}%` }]} />
        </View>
      )}
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        {step === 'info' && renderInfo()}
        {step === 'cinFront' && renderCamera('back', 'cinFront', () => captureImage('cinFront'), t('verification.captureFrontLabel'), t('verification.captureFrontHint'))}
        {step === 'captureConfirm' && renderCaptureConfirm()}
        {step === 'cinBack' && renderCamera('back', 'cinBack', () => captureImage('cinBack'), t('verification.captureBackLabel'), t('verification.captureBackHint'))}
        {step === 'selfieTip' && renderSelfieTip()}
        {step === 'selfie' && renderCamera('front', 'selfie', captureSelfie, t('verification.selfieLabel'), t('verification.selfieHint'))}
        {step === 'reviewAll' && renderReviewAll()}
        {step === 'processing' && renderProcessing()}
        {step === 'result' && renderResult()}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  progressTrack: { height: 4, backgroundColor: COLORS.surface2, marginHorizontal: SPACING.lg },
  progressFill: { height: '100%', backgroundColor: COLORS.coral, borderRadius: 2 },
  eyebrow: { fontSize: 12, fontWeight: '700', color: COLORS.coral, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  introContent: { justifyContent: 'space-between', gap: 24 },
  introHeading: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: SPACING.sm },
  introIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: `${COLORS.coral}18`, alignItems: 'center', justifyContent: 'center' },
  infoIcon: { alignSelf: 'center', width: 68, height: 68, borderRadius: 20, backgroundColor: `${COLORS.coral}22`, alignItems: 'center', justifyContent: 'center', marginTop: 20, marginBottom: 16 },
  introTitle: { textAlign: 'left', marginBottom: 0, flex: 1 },
  introDesc: { textAlign: 'left', paddingHorizontal: 0, marginTop: SPACING.md, marginBottom: SPACING.lg, lineHeight: 21 },
  infoTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 10, textAlign: 'center' },
  infoDesc: { fontSize: 14, color: COLORS.text2, textAlign: 'center', lineHeight: 20, marginBottom: 20, paddingHorizontal: 12 },
  requirements: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.card, paddingHorizontal: SPACING.md },
  reqItem: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingVertical: SPACING.sm },
  reqDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  reqText: { fontSize: 14, color: COLORS.text, flex: 1 },
  primaryBtn: { backgroundColor: COLORS.coral, padding: 16, borderRadius: RADIUS.button, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, minHeight: 48 },
  primaryBtnText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  outlineBtn: { backgroundColor: 'transparent', padding: 14, borderRadius: RADIUS.button, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: COLORS.border, marginTop: 10, minHeight: 48 },
  outlineBtnText: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  ghostBtn: { padding: 14, alignItems: 'center', marginTop: 10, minHeight: 44, justifyContent: 'center' },
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
  permissionBtn: { backgroundColor: COLORS.coral, paddingHorizontal: 20, paddingVertical: 10, borderRadius: RADIUS.row, marginTop: 8, minHeight: 44, justifyContent: 'center' },
  permissionBtnText: { color: COLORS.white, fontWeight: '600' },
  processingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  passiveChecks: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.card, paddingHorizontal: 16, width: '100%', maxWidth: 300 },
  passiveRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  passiveLabel: { fontSize: 13.5, color: COLORS.text2, fontWeight: '500', flex: 1 },
  keptBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: `${COLORS.green}14`, borderWidth: 1, borderColor: `${COLORS.green}33`, borderRadius: 12, padding: 10, marginBottom: 14 },
  keptText: { fontSize: 12.5, color: COLORS.text, flex: 1, lineHeight: 18 },
  keptChip: { position: 'absolute', left: SPACING.lg, right: SPACING.lg },
  errorBanner: { backgroundColor: 'rgba(20,10,10,0.88)', borderWidth: 1, borderColor: `${COLORS.coral}66`, borderRadius: RADIUS.card, padding: 12, gap: 4 },
  camErrorWrap: { position: 'absolute', top: 12, left: SPACING.lg, right: SPACING.lg },
  errorHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorTitle: { fontSize: 13.5, fontWeight: '700', color: COLORS.white, flex: 1 },
  errorDesc: { fontSize: 12.5, color: 'rgba(255,255,255,0.85)', lineHeight: 17 },
  confirmPhotoWrap: { width: SCREEN_W - SPACING.lg * 2, height: Math.min(Dimensions.get('window').height * 0.4, 320), borderRadius: RADIUS.card, overflow: 'hidden', backgroundColor: '#000' },
  confirmPhoto: { width: '100%', height: '100%' },
  tipsList: { gap: 14, marginBottom: 8, paddingHorizontal: 4 },
  tipItem: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  tipNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  tipNumText: { fontSize: 12, fontWeight: '700', color: COLORS.blue },
  tipText: { fontSize: 14, color: COLORS.text, flex: 1, lineHeight: 20 },
  reviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8 },
  reviewCard: { width: (SCREEN_W - 52) / 2, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, padding: 12, alignItems: 'center', gap: 6 },
  reviewThumb: { width: 60, height: 60, borderRadius: 10, backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  reviewLabel: { fontSize: 12, color: COLORS.text2, fontWeight: '600' },
  retakeHit: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 8 },
  retakeBtn: { fontSize: 12, fontWeight: '700', color: COLORS.blue },
  resultIcon: { alignSelf: 'center', width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  successAnimation: { alignSelf: 'center', width: 180, height: 180, marginBottom: 8 },
});
