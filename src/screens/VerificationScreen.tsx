import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Image, ScrollView, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
let ImagePicker: any = null;
let TextRecognition: any = null;
let FaceDetection: any = null;
if (Platform.OS !== 'web') {
  const cam = require('expo-camera');
  CameraView = cam.CameraView;
  useCameraPermissions = cam.useCameraPermissions;
  ImagePicker = require('expo-image-picker');
  TextRecognition = require('@react-native-ml-kit/text-recognition').default;
  FaceDetection = require('@react-native-ml-kit/face-detection').default;
}

type Nav = NativeStackNavigationProp<RootStackParamList>;

type Step = 'info' | 'cinFront' | 'cinBack' | 'selfie' | 'review';

interface OcrFields {
  fullName?: string;
  dateOfBirth?: string;
  placeOfBirth?: string;
  cinNumber?: string;
  sex?: string;
}

export default function VerificationScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();

  const [step, setStep] = useState<Step>('info');
  const [loading, setLoading] = useState(false);
  const [idFrontUrl, setIdFrontUrl] = useState('');
  const [idBackUrl, setIdBackUrl] = useState('');
  const [selfieUrl, setSelfieUrl] = useState('');
  const [idFrontDeleteUrl, setIdFrontDeleteUrl] = useState('');
  const [idBackDeleteUrl, setIdBackDeleteUrl] = useState('');
  const [selfieDeleteUrl, setSelfieDeleteUrl] = useState('');
  const [frontOcr, setFrontOcr] = useState<OcrFields>({});
  const [backOcr, setBackOcr] = useState<OcrFields>({});
  const [faceScore, setFaceScore] = useState<number | null>(null);
  const [frontFaceData, setFrontFaceData] = useState<any>(null);
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [rejectedReasons, setRejectedReasons] = useState<string | null>(null);
  const cameraRef = useRef<any>(null);

  const totalSteps = 4;

  const processImage = async (uri: string, isFront: boolean): Promise<OcrFields> => {
    try {
      const result = await TextRecognition.recognize(uri);
      const text = result.text;
      const fields: OcrFields = {};

      const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean);
      const fullText = lines.join(' ');

      const cinMatch = fullText.match(/\b(\d{8,12})\b/);
      if (cinMatch) fields.cinNumber = cinMatch[1];

      const dobMatch = fullText.match(/(\d{2}[\/\-]\d{2}[\/\-]\d{4})/);
      if (dobMatch) fields.dateOfBirth = dobMatch[1];

      if (lines.length > 0) fields.fullName = lines[0];

      if (isFront) {
        const pobMatch = fullText.match(/(?:Né\(e\)?\s+(?:à|a)\s+)([\w\s]+?)(?:\s+le|\s+\d)/i);
        if (pobMatch) fields.placeOfBirth = pobMatch[1].trim();
      } else {
        const sexMatch = fullText.match(/ Sexe\s*:\s*(M|F)/i) || fullText.match(/\b(MASCULIN|FÉMININ|MALE|FEMALE)\b/i);
        if (sexMatch) fields.sex = sexMatch[1];
      }

      return fields;
    } catch {
      return {};
    }
  };

  const captureImage = async (facing: 'front' | 'back') => {
    if (!permission?.granted) {
      const p = await requestPermission();
      if (!p.granted) {
        Alert.alert(t('common.error'), 'Camera permission is required');
        return;
      }
    }

    try {
      if (cameraRef.current) {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
        if (photo?.uri) {
          await handleImageCapture(photo.uri, facing);
        }
      }
    } catch {
      Alert.alert(t('common.error'), 'Failed to capture image');
    }
  };

  const pickImage = async (facing: 'front' | 'back') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      await handleImageCapture(result.assets[0].uri, facing);
    }
  };

  const handleImageCapture = async (uri: string, facing: 'front' | 'back') => {
    setLoading(true);
    try {
      const uploadRes = await uploadImage(uri);
      const url = uploadRes.url;

      if (facing === 'back') {
        const fields = await processImage(uri, false);
        setBackOcr(fields);
        setIdBackUrl(url);
        if (uploadRes.deleteUrl) setIdBackDeleteUrl(uploadRes.deleteUrl);
        setStep('selfie');
      } else {
        const fields = await processImage(uri, true);
        setFrontOcr(fields);
        setIdFrontUrl(url);
        if (uploadRes.deleteUrl) setIdFrontDeleteUrl(uploadRes.deleteUrl);
        try {
          const faces = await FaceDetection.detect(uri, { detectionMode: 1 });
          if (faces.length > 0) {
            setFrontFaceData(faces[0]);
          }
        } catch { /* face detection on CIN is best-effort */ }
        setStep('cinBack');
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || 'Failed to process image');
    }
    setLoading(false);
  };

  const captureSelfie = async () => {
    setCameraFacing('front');
    if (!permission?.granted) {
      const p = await requestPermission();
      if (!p.granted) {
        Alert.alert(t('common.error'), 'Camera permission is required');
        return;
      }
    }
    setLoading(true);
    try {
      if (cameraRef.current) {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
        if (photo?.uri) {
          const uploadRes = await uploadImage(photo.uri);
          setSelfieUrl(uploadRes.url);
          if (uploadRes.deleteUrl) setSelfieDeleteUrl(uploadRes.deleteUrl);

          try {
            const faces = await FaceDetection.detect(photo.uri);
            if (faces.length > 0) {
              if (frontFaceData) {
                const selfieFace = faces[0];
                const cinBounds = frontFaceData.bounds;
                const selfieBounds = selfieFace.bounds;
                const cinRatio = cinBounds.width / cinBounds.height;
                const selfieRatio = selfieBounds.width / selfieBounds.height;
                const ratioDiff = Math.abs(cinRatio - selfieRatio);
                const cinSize = cinBounds.width * cinBounds.height;
                const selfieSize = selfieBounds.width * selfieBounds.height;
                const sizeRatio = Math.min(cinSize, selfieSize) / Math.max(cinSize, selfieSize);
                const hasLandmarks = (selfieFace.landmarks?.length || 0) > 0;
                let score = 0.5;
                if (ratioDiff < 0.3) score += 0.2;
                else if (ratioDiff < 0.5) score += 0.1;
                if (sizeRatio > 0.3) score += 0.15;
                if (hasLandmarks) score += 0.15;
                setFaceScore(Math.round(Math.min(1, score) * 100) / 100);
              } else {
                const selfieFace = faces[0];
                const bounds = selfieFace.bounds;
                const ratio = bounds.width / bounds.height;
                const hasLandmarks = (selfieFace.landmarks?.length || 0) > 0;
                let score = 0.5;
                if (ratio > 0.5 && ratio < 1.2) score += 0.2;
                if (hasLandmarks) score += 0.15;
                setFaceScore(Math.round(Math.min(1, score) * 100) / 100);
              }
            } else {
              setFaceScore(0.2);
            }
          } catch {
            setFaceScore(0.3);
          }

          setStep('review');
        }
      }
    } catch {
      Alert.alert(t('common.error'), 'Failed to capture selfie');
    }
    setLoading(false);
    setCameraFacing('back');
  };

  const handleSubmit = async () => {
    if (!idFrontUrl || !idBackUrl || !selfieUrl) {
      Alert.alert(t('common.error'), 'Please capture CIN front, CIN back, and selfie before submitting.');
      return;
    }
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
      }) as { attempt: { status: string; rejection_reason?: string } };

      if (res.attempt.status === 'verified') {
        Alert.alert(
          'Verified!',
          'Your identity has been verified. You are now a Verified Seller.',
          [{ text: 'OK', onPress: () => nav.goBack() }]
        );
      } else {
        setRejectedReasons(res.attempt.rejection_reason || 'Verification failed. Please try again.');
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || 'Submission failed');
    }
    setLoading(false);
  };

  const stepLabel = (n: number) => {
    if (n < (step === 'info' ? 1 : step === 'cinFront' ? 2 : step === 'cinBack' ? 3 : step === 'selfie' ? 4 : 5)) return 'done';
    if (n === (step === 'info' ? 1 : step === 'cinFront' ? 2 : step === 'cinBack' ? 3 : step === 'selfie' ? 4 : 5)) return 'current';
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
              <MaterialCommunityIcons name="check" size={12} color={COLORS.white} />
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
        <TouchableOpacity style={styles.galleryBtn} onPress={() => pickImage(facing)} disabled={loading} accessibilityLabel="pick from gallery" accessibilityRole="button">
          <MaterialCommunityIcons name="image-multiple" size={24} color={COLORS.white} />
        </TouchableOpacity>
      </View>
      <Text style={styles.cameraLabel}>{label}</Text>
    </View>
  );

  const renderInfo = () => (
    <View style={styles.content}>
      <View style={styles.infoIcon}>
        <MaterialCommunityIcons name="shield-lock-outline" size={48} color={COLORS.coral} />
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
          <MaterialCommunityIcons name="camera" size={20} color={COLORS.coral} />
          <Text style={styles.reqText}>A clear selfie</Text>
        </View>
        <View style={styles.reqItem}>
          <MaterialCommunityIcons name="shield-check" size={20} color={COLORS.green} />
          <Text style={styles.reqText}>Instant approval if all fields match</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep('cinFront')} accessibilityLabel="start verification" accessibilityRole="button">
        <Text style={styles.primaryBtnText}>Start Verification</Text>
      </TouchableOpacity>
    </View>
  );

  const renderReview = () => (
    <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 100 }}>
      <Text style={styles.reviewTitle}>Review Your Information</Text>

      {idFrontUrl ? (
        <View style={styles.reviewSection}>
          <Text style={styles.reviewLabel}>CIN Front</Text>
          <Image source={{ uri: idFrontUrl }} style={styles.reviewImage} resizeMode="cover" />
          {Object.keys(frontOcr).length > 0 && (
            <View style={styles.ocrFields}>
              {frontOcr.fullName && <OcrField label="Full Name" value={frontOcr.fullName} />}
              {frontOcr.dateOfBirth && <OcrField label="Date of Birth" value={frontOcr.dateOfBirth} />}
              {frontOcr.placeOfBirth && <OcrField label="Place of Birth" value={frontOcr.placeOfBirth} />}
              {frontOcr.cinNumber && <OcrField label="CIN Number" value={frontOcr.cinNumber} />}
            </View>
          )}
        </View>
      ) : null}

      {idBackUrl ? (
        <View style={styles.reviewSection}>
          <Text style={styles.reviewLabel}>CIN Back</Text>
          <Image source={{ uri: idBackUrl }} style={styles.reviewImage} resizeMode="cover" />
          {backOcr.sex && <OcrField label="Sex" value={backOcr.sex} />}
        </View>
      ) : null}

      {selfieUrl ? (
        <View style={styles.reviewSection}>
          <Text style={styles.reviewLabel}>Selfie</Text>
          <Image source={{ uri: selfieUrl }} style={styles.reviewImageSmall} resizeMode="cover" />
          {faceScore !== null && (
            <Text style={[styles.faceScoreText, faceScore > 0.65 ? styles.faceOk : styles.faceWarn]}>
              Face match: {faceScore > 0.65 ? 'Passed' : 'Low confidence — may need manual review'}
            </Text>
          )}
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.primaryBtn, loading && { opacity: 0.6 }]}
        onPress={handleSubmit}
        disabled={loading}
        accessibilityLabel="submit for verification"
        accessibilityRole="button"
      >
        {loading ? (
          <ActivityIndicator size="small" color={COLORS.white} />
        ) : (
          <Text style={styles.primaryBtnText}>Submit for Verification</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.retakeBtn} onPress={() => { setStep('cinFront'); setIdFrontUrl(''); setIdBackUrl(''); setSelfieUrl(''); setFrontOcr({}); setBackOcr({}); setFaceScore(null); setRejectedReasons(null); }} accessibilityLabel="retake all photos" accessibilityRole="button">
        <Text style={styles.retakeBtnText}>Retake All Photos</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderRejected = () => (
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
      <TouchableOpacity style={styles.primaryBtn} onPress={() => { setStep('cinFront'); setIdFrontUrl(''); setIdBackUrl(''); setSelfieUrl(''); setFrontOcr({}); setBackOcr({}); setFaceScore(null); setRejectedReasons(null); }} accessibilityLabel="try again" accessibilityRole="button">
        <Text style={styles.primaryBtnText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading && step === 'review' && !rejectedReasons) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Verification" onBack={() => nav.goBack()} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.coral} />
          <Text style={styles.loadingText}>Submitting verification...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Verification" onBack={() => nav.goBack()} />

      {step !== 'info' && renderStepIndicator()}

      {step === 'info' && renderInfo()}
      {step === 'cinFront' && renderCamera('back', () => captureImage('front'), 'Capture the front of your CIN')}
      {step === 'cinBack' && renderCamera('back', () => captureImage('back'), 'Capture the back of your CIN')}
      {step === 'selfie' && renderCamera('front', captureSelfie, 'Take a selfie')}
      {step === 'review' && !rejectedReasons && renderReview()}
      {rejectedReasons && renderRejected()}
    </View>
  );
}

function OcrField({ label, value }: { label: string; value: string }) {
  return (
    <View style={ocrStyles.row}>
      <Text style={ocrStyles.label}>{label}:</Text>
      <Text style={ocrStyles.value}>{value}</Text>
    </View>
  );
}

const ocrStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, marginTop: 4 },
  label: { fontSize: 11, color: COLORS.text2, fontWeight: '600' },
  value: { fontSize: 11, color: COLORS.text, flex: 1 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  content: { flex: 1, padding: SPACING.md },
  steps: { flexDirection: 'row', justifyContent: 'center', gap: 12, paddingVertical: SPACING.md },
  stepWrap: {},
  stepDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center' },  // circle: size/2
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
  idFrameCircle: { width: 220, height: 220, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)', borderRadius: 110, borderStyle: 'dashed' },  // circle: size/2
  cameraActions: { position: 'absolute', bottom: 60, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 40 },
  captureBtn: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  captureBtnInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: COLORS.white },
  galleryBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  cameraLabel: { position: 'absolute', bottom: 30, left: 0, right: 0, textAlign: 'center', color: COLORS.white, fontSize: 13, fontWeight: '600' },
  permissionWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 40 },
  permissionText: { fontSize: 14, color: COLORS.text2, textAlign: 'center' },
  permissionBtn: { backgroundColor: COLORS.coral, paddingHorizontal: 20, paddingVertical: 10, borderRadius: RADIUS.row, marginTop: 8 },
  permissionBtnText: { color: COLORS.white, fontWeight: '600' },
  reviewTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 16 },
  reviewSection: { marginBottom: 20 },
  reviewLabel: { fontSize: 12, color: COLORS.text2, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  reviewImage: { width: '100%', height: 160, borderRadius: RADIUS.row, backgroundColor: COLORS.surface2 },
  reviewImageSmall: { width: 120, height: 120, borderRadius: 60, backgroundColor: COLORS.surface2 },  // circle: size/2
  ocrFields: { marginTop: 8 },
  faceScoreText: { fontSize: 12, fontWeight: '600', marginTop: 8 },
  faceOk: { color: COLORS.green },
  faceWarn: { color: COLORS.yellow },
  loadingText: { fontSize: 14, color: COLORS.text2, marginTop: 12 },
  retakeBtn: { padding: 12, alignItems: 'center', marginTop: 8 },
  retakeBtnText: { color: COLORS.text2, fontSize: 13, fontWeight: '600' },
  rejectionBox: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.coral,
    borderRadius: RADIUS.card, padding: 14, marginBottom: 24, gap: 8,
  },
  rejectionItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rejectionText: { fontSize: 13, color: COLORS.text, flex: 1, lineHeight: 18 },
});
