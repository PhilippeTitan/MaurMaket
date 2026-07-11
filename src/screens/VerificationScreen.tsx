import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Icon } from '../components/icons/Icon';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING, RADIUS } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import { useTranslation } from '../i18n';
import { uploadImage, submitVerification } from '../api';
import { store } from '../store';
import type { RootStackParamList } from '../navigation';

let CameraView: any = null;
let useCameraPermissions: any = () => [null, () => {}];
let FaceDetection: any = null;
let ImageManipulator: any = null;
if (Platform.OS !== 'web') {
  const cam = require('expo-camera');
  CameraView = cam.CameraView;
  useCameraPermissions = cam.useCameraPermissions;
  try { FaceDetection = require('@react-native-ml-kit/face-detection').default; } catch {}
  try { ImageManipulator = require('expo-image-manipulator'); } catch {}
}

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Step = 'info' | 'cinFront' | 'cinBack' | 'selfie' | 'processing' | 'result';

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
  const [permission, requestPermission] = useCameraPermissions();
  const [rejectedReasons, setRejectedReasons] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [progressText, setProgressText] = useState('');
  const cameraRef = useRef<any>(null);

  const captureImage = async (facing: 'front' | 'back') => {
    console.log(`📷 [VERIFY] Capture requested — facing: ${facing}`);
    if (!permission?.granted) {
      const p = await requestPermission();
      if (!p.granted) {
        Alert.alert(t('common.error'), 'Camera permission is required');
        return;
      }
    }
    try {
      console.log(`📷 [VERIFY] Camera ref: ${cameraRef.current ? '✅ ready' : '❌ null'}`);
      if (cameraRef.current) {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, skipProcessing: true });
        console.log(`📸 [VERIFY] Photo captured: ${photo?.uri ? '✅' : '❌ no uri'}`);
        if (photo?.uri) {
          setLoading(true);
          console.log(`⬆️ [VERIFY] Uploading ${facing} image to imgbb...`);
          const uploadRes = await uploadImage(photo.uri);
          console.log(`✅ [VERIFY] ${facing} upload done: ${uploadRes.url}`);

          if (facing === 'front') {
            setIdFrontUrl(uploadRes.url);
            if (uploadRes.deleteUrl) setIdFrontDeleteUrl(uploadRes.deleteUrl);
            if (FaceDetection && ImageManipulator) {
              try {
                console.log(`🔍 [VERIFY] Detecting face in CIN front for crop...`);
                const faces = await FaceDetection.detect(photo.uri, { detectionMode: 0 });
                if (faces && faces.length > 0) {
                  const face = faces[0].bounds;
                  const imgW = faces[0].frame?.width || photo.width || 1080;
                  const imgH = faces[0].frame?.height || photo.height || 1920;
                  const pad = 0.4;
                  const x = Math.max(0, Math.round(face.x - face.width * pad));
                  const y = Math.max(0, Math.round(face.y - face.height * pad));
                  const w = Math.min(imgW - x, Math.round(face.width * (1 + pad * 2)));
                  const h = Math.min(imgH - y, Math.round(face.height * (1 + pad * 2)));
                  console.log(`🔍 [VERIFY] Face crop: x=${x} y=${y} w=${w} h=${h}`);
                  const manipulated = await ImageManipulator.manipulateAsync(
                    photo.uri,
                    [{ crop: { originX: x, originY: y, width: w, height: h } }],
                    { compress: 0.8, format: 'jpeg' }
                  );
                  console.log(`⬆️ [VERIFY] Uploading cropped face to imgbb...`);
                  const faceUpload = await uploadImage(manipulated.uri);
                  setIdFaceUrl(faceUpload.url);
                  if (faceUpload.deleteUrl) setIdFaceDeleteUrl(faceUpload.deleteUrl);
                  console.log(`✅ [VERIFY] Cropped face uploaded: ${faceUpload.url}`);
                } else {
                  console.log(`⚠️ [VERIFY] No face detected in CIN front — will use full image`);
                }
              } catch (e: any) {
                console.log(`⚠️ [VERIFY] Face crop failed: ${e?.message} — will use full image`);
              }
            }
            setStep('cinBack');
          } else {
            setIdBackUrl(uploadRes.url);
            if (uploadRes.deleteUrl) setIdBackDeleteUrl(uploadRes.deleteUrl);
            setCameraFacing('front');
            setStep('selfie');
          }
          setLoading(false);
        }
      }
    } catch (e: any) {
      console.error(`❌ [VERIFY] Capture error (${facing}):`, e?.message || e);
      setLoading(false);
      Alert.alert(t('common.error'), e?.message || 'Failed to capture image');
    }
  };

  const captureSelfie = async () => {
    console.log(`📷 [VERIFY] Selfie requested — switching to front camera`);
    if (!permission?.granted) {
      const p = await requestPermission();
      if (!p.granted) {
        Alert.alert(t('common.error'), 'Camera permission is required');
        return;
      }
    }
    try {
      console.log(`⏳ [VERIFY] Waiting 500ms for camera switch...`);
      await new Promise(r => setTimeout(r, 500));
      setLoading(true);
      console.log(`📷 [VERIFY] Selfie camera ref: ${cameraRef.current ? '✅ ready' : '❌ null'}`);
      if (cameraRef.current) {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, skipProcessing: true });
        console.log(`📸 [VERIFY] Selfie captured: ${photo?.uri ? '✅' : '❌ no uri'}`);
        if (photo?.uri) {
          console.log(`⬆️ [VERIFY] Uploading selfie to imgbb...`);
          const uploadRes = await uploadImage(photo.uri);
          setSelfieUrl(uploadRes.url);
          console.log(`✅ [VERIFY] Selfie upload done: ${uploadRes.url}`);
          if (uploadRes.deleteUrl) setSelfieDeleteUrl(uploadRes.deleteUrl);

          // Auto-submit immediately after selfie upload
          await submitAll(uploadRes.url, idFrontUrl, idBackUrl);
        }
      }
    } catch (e: any) {
      console.error('Selfie capture error:', e);
      setLoading(false);
      Alert.alert(t('common.error'), e?.message || 'Failed to capture selfie');
    }
  };

  const submitAll = async (selfie: string, front: string, back: string) => {
    console.log(`🚀 [VERIFY] Auto-submitting — front: ${front ? '✅' : '❌'} face: ${idFaceUrl ? '✅' : '❌'} back: ${back ? '✅' : '❌'} selfie: ${selfie ? '✅' : '❌'}`);
    setStep('processing');
    setProgressText('Reading ID card...');

    try {
      const progressTimer = setTimeout(() => setProgressText('Comparing face...'), 5000);

      const res = await submitVerification({
        idFrontUrl: front,
        idFaceUrl: idFaceUrl || undefined,
        idBackUrl: back,
        selfieUrl: selfie,
        deleteUrls: {
          idFront: idFrontDeleteUrl || undefined,
          idFace: idFaceDeleteUrl || undefined,
          idBack: idBackDeleteUrl || undefined,
          selfie: selfieDeleteUrl || undefined,
        },
      }) as { attempt: { status: string; rejection_reason?: string }; user?: any; token?: string };

      clearTimeout(progressTimer);
      console.log(`📨 [VERIFY] Server response: status=${res.attempt.status}`);

      if (res.attempt.status === 'verified') {
        console.log(`✅ [VERIFY] VERIFIED!`);
        setVerified(true);
        // Sync store with updated user (id_verified=true, seller_tier upgraded)
        if (res.user && res.token) {
          await store.setUser(res.user, res.token);
        }
      } else {
        console.log(`❌ [VERIFY] Rejected: ${res.attempt.rejection_reason}`);
        setRejectedReasons(res.attempt.rejection_reason || 'Verification failed. Please try again.');
      }
      setStep('result');
    } catch (e: any) {
      console.error(`❌ [VERIFY] Submit failed:`, e.message || e);
      setRejectedReasons(e.message || 'Submission failed');
      setStep('result');
    }
    setLoading(false);
  };

  const resetAll = () => {
    setStep('cinFront');
    setIdFrontUrl('');
    setIdFaceUrl('');
    setIdBackUrl('');
    setSelfieUrl('');
    setIdFrontDeleteUrl('');
    setIdFaceDeleteUrl('');
    setIdBackDeleteUrl('');
    setSelfieDeleteUrl('');
    setRejectedReasons(null);
    setVerified(false);
    setCameraFacing('back');
  };

  const stepLabel = (n: number) => {
    const current = step === 'cinFront' ? 1 : step === 'cinBack' ? 2 : step === 'selfie' ? 3 : step === 'processing' ? 4 : 5;
    if (n < current) return 'done';
    if (n === current) return 'current';
    return 'pending';
  };

  const renderStepIndicator = () => (
    <View style={styles.steps}>
      {[1, 2, 3, 4].map(n => (
        <View key={n} style={styles.stepWrap}>
          <View style={[
            styles.stepDot,
            stepLabel(n) === 'done' && styles.stepDotDone,
            stepLabel(n) === 'current' && styles.stepDotCurrent,
          ]}>
            {stepLabel(n) === 'done' ? (
              <Icon name="check" size={12} color={COLORS.white} />
            ) : (
              <Text style={[styles.stepNum, stepLabel(n) === 'current' && styles.stepNumCurrent]}>{n}</Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );

  const renderCamera = (facing: 'front' | 'back', onCapture: () => void, label: string) => (
    <View style={styles.cameraWrap}>
      {permission === null ? (
        <ActivityIndicator size="large" color={COLORS.coral} />
      ) : !permission.granted ? (
        <View style={styles.permissionWrap}>
          <MaterialCommunityIcons name="camera-off-outline" size={48} color={COLORS.text2} />
          <Text style={styles.permissionText}>Camera access is required</Text>
          <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission} accessibilityLabel="grant permission" accessibilityRole="button">
            <Text style={styles.permissionBtnText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing={facing}
          />
          <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]}>
            <View style={facing === 'back' ? styles.idFrameRect : styles.idFrameCircle} />
          </View>
          {facing === 'front' && <Text style={styles.faceHint}>Center your face in the circle</Text>}
        </>
      )}
      <View style={styles.cameraActions}>
        <TouchableOpacity style={styles.captureBtn} onPress={onCapture} disabled={loading} accessibilityLabel="capture photo" accessibilityRole="button">
          {loading ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <View style={styles.captureBtnInner} />
          )}
        </TouchableOpacity>
      </View>
      <Text style={styles.cameraLabel}>{label}</Text>
    </View>
  );

  const renderInfo = () => (
    <View style={styles.content}>
      <View style={styles.infoIcon}>
        <Icon name="secure-account" size={48} color={COLORS.coral} />
      </View>
      <Text style={styles.infoTitle}>Verify Your Identity</Text>
      <Text style={styles.infoDesc}>
        To become a Verified Seller, we need to verify your Haitian CIN (Carte d'Identification Nationale).
        This is a one-time process that builds trust with buyers.
      </Text>
      <View style={styles.requirements}>
        <View style={styles.reqItem}>
          <MaterialCommunityIcons name="card-account-details-outline" size={20} color={COLORS.coral} />
          <Text style={styles.reqText}>Haitian CIN — front and back</Text>
        </View>
        <View style={styles.reqItem}>
          <Icon name="camera" size={20} color={COLORS.coral} />
          <Text style={styles.reqText}>A clear selfie</Text>
        </View>
        <View style={styles.reqItem}>
          <Icon name="verified" size={20} color={COLORS.green} />
          <Text style={styles.reqText}>Instant approval if all fields match</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep('cinFront')} accessibilityLabel="start verification" accessibilityRole="button">
        <Text style={styles.primaryBtnText}>Start Verification</Text>
      </TouchableOpacity>
    </View>
  );

  const renderProcessing = () => (
    <View style={styles.processingWrap}>
      <ActivityIndicator size="large" color={COLORS.coral} />
      <Text style={styles.processingText}>{progressText}</Text>
      <Text style={styles.processingHint}>This may take a few seconds...</Text>
    </View>
  );

  const renderResult = () => {
    if (verified) {
      return (
        <View style={styles.content}>
          <View style={styles.infoIcon}>
            <MaterialCommunityIcons name="check-circle-outline" size={64} color={COLORS.green} />
          </View>
          <Text style={styles.infoTitle}>Verified!</Text>
          <Text style={styles.infoDesc}>
            Your identity has been verified. You are now a Verified Seller with lower commission rates and a trust badge.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => nav.goBack()} accessibilityLabel="done" accessibilityRole="button">
            <Text style={styles.primaryBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.content}>
        <View style={styles.infoIcon}>
          <MaterialCommunityIcons name="close-circle-outline" size={48} color={COLORS.coral} />
        </View>
        <Text style={styles.infoTitle}>Verification Failed</Text>
        <Text style={styles.infoDesc}>
          We couldn't verify your identity. Please review the issues below and try again.
        </Text>
        {rejectedReasons && (
          <View style={styles.rejectionBox}>
            {rejectedReasons.split('. ').filter(Boolean).map((reason, i) => (
              <View key={i} style={styles.rejectionItem}>
                <MaterialCommunityIcons name="alert-circle" size={14} color={COLORS.coral} />
                <Text style={styles.rejectionText}>{reason}</Text>
              </View>
            ))}
          </View>
        )}
        <TouchableOpacity style={styles.primaryBtn} onPress={resetAll} accessibilityLabel="try again" accessibilityRole="button">
          <Text style={styles.primaryBtnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (loading && step === 'processing') {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Verification" onBack={() => nav.goBack()} />
        {renderProcessing()}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Verification" onBack={() => nav.goBack()} />

      {step !== 'info' && step !== 'processing' && step !== 'result' && renderStepIndicator()}

      {step === 'info' && renderInfo()}
      {step === 'cinFront' && renderCamera('back', () => captureImage('front'), 'Capture the front of your CIN')}
      {step === 'cinBack' && renderCamera('back', () => captureImage('back'), 'Capture the back of your CIN')}
      {step === 'selfie' && renderCamera('front', captureSelfie, 'Take a selfie')}
      {step === 'processing' && renderProcessing()}
      {step === 'result' && renderResult()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { flex: 1, padding: SPACING.md },
  steps: { flexDirection: 'row', justifyContent: 'center', gap: 12, paddingVertical: SPACING.md },
  stepWrap: {},
  stepDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center' },
  stepDotDone: { backgroundColor: COLORS.green },
  stepDotCurrent: { backgroundColor: COLORS.coral },
  stepNum: { fontSize: 12, color: COLORS.text2, fontWeight: '700' },
  stepNumCurrent: { color: COLORS.white },
  infoIcon: { alignSelf: 'center', marginTop: 40, marginBottom: 20 },
  infoTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, textAlign: 'center', marginBottom: 12 },
  infoDesc: { fontSize: 14, color: COLORS.text2, textAlign: 'center', lineHeight: 20, marginBottom: 24, paddingHorizontal: 20 },
  requirements: { gap: 12, marginBottom: 32, paddingHorizontal: 20 },
  reqItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reqText: { fontSize: 13, color: COLORS.text, flex: 1 },
  primaryBtn: { backgroundColor: COLORS.coral, padding: 16, borderRadius: RADIUS.button, alignItems: 'center' },
  primaryBtnText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  cameraWrap: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  idFrameRect: { width: 300, height: 200, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)', borderRadius: RADIUS.card, borderStyle: 'dashed' },
  idFrameCircle: { width: 240, height: 240, borderWidth: 3, borderColor: 'rgba(255,255,255,0.8)', borderRadius: 120, borderStyle: 'solid', backgroundColor: 'rgba(255,255,255,0.05)' },
  faceHint: { position: 'absolute', bottom: 100, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500' },
  cameraActions: { position: 'absolute', bottom: 60, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  captureBtn: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  captureBtnInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: COLORS.white },
  cameraLabel: { position: 'absolute', bottom: 30, left: 0, right: 0, textAlign: 'center', color: COLORS.white, fontSize: 13, fontWeight: '600' },
  permissionWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 40 },
  permissionText: { fontSize: 14, color: COLORS.text2, textAlign: 'center' },
  permissionBtn: { backgroundColor: COLORS.coral, paddingHorizontal: 20, paddingVertical: 10, borderRadius: RADIUS.row, marginTop: 8 },
  permissionBtnText: { color: COLORS.white, fontWeight: '600' },
  processingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  processingText: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginTop: 20 },
  processingHint: { fontSize: 13, color: COLORS.text2, marginTop: 8 },
  rejectionBox: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.coral,
    borderRadius: RADIUS.card, padding: 14, marginBottom: 24, gap: 8,
  },
  rejectionItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rejectionText: { fontSize: 13, color: COLORS.text, flex: 1, lineHeight: 18 },
});
