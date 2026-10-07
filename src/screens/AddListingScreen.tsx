import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, Share, Modal,
  Pressable, useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import NetInfo, { NetInfoStateType } from '@react-native-community/netinfo';
import { COLORS, SPACING, RADIUS, formatPrice } from '../theme';
import { useTranslation } from '@/localization';
import { useToast } from '../components/Toast';
import {
  createProduct, getCategories, uploadImage, getSellerListings,
  createListingDraft, getListingDraft, updateListingDraft,
} from '../api';
import { store } from '../store';
import type { Category } from '../types';
import type { RootStackParamList } from '../navigation';
import ScreenHeader from '../components/ScreenHeader';
import ConfirmModal from '../components/ConfirmModal';
import SaleSection from '../components/SaleSection';
import {
  CONDITIONS, MAX_PHOTOS, MIN_PRICE, MAX_PRICE, MAX_VARIANTS,
  MAX_VARIANT_DIMENSIONS, LISTING_LANGUAGES, DEFAULT_LOW_STOCK_THRESHOLD,
  allowedAttrsForCategory, flawNotesRequired, generateVariantCombos,
  variantComboLabel, dimsFromVariants, assessModeration,
} from '../utils/listingConstants';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type AddListingRoute = RouteProp<RootStackParamList, 'AddListing'>;

const STEP_TITLE_KEYS = [
  'addListing.stepPhotos',
  'addListing.stepDetails',
  'addListing.stepPrice',
  'addListing.stepPreview',
] as const;
const STEP_HINT_KEYS = [
  'addListing.hintPhotos',
  'addListing.hintDetails',
  'addListing.hintPrice',
  'addListing.hintPreview',
] as const;

const CONDITION_LABEL_KEYS: Record<string, string> = {
  new: 'addListing.cond.new',
  like_new: 'addListing.cond.likeNew',
  good: 'addListing.cond.good',
  fair: 'addListing.cond.fair',
  for_parts: 'addListing.cond.forParts',
};

const LANGUAGE_LABEL_KEYS: Record<string, string> = {
  en: 'addListing.langEn',
  fr: 'addListing.langFr',
  ht: 'addListing.langHt',
};

type DimDraft = { name: string; values: string[] };
type VariantDraft = { options: Record<string, string>; price: string; stock: string; sku: string };

interface FormState {
  name: string;
  description: string;
  categoryId: string;
  condition: string;
  flawNotes: string;
  sku: string;
  attrs: Record<string, string>;
  languageLabel: string;
  images: string[];
  price: string;
  stock: string;
  salePrice: string;
  saleEndDate: string;
  offersEnabled: boolean;
  meetupEnabled: boolean | null;
  deliveryEnabled: boolean | null;
  lowStockThreshold: string;
  hasVariants: boolean;
  variantDims: DimDraft[];
  variants: VariantDraft[];
  // APP-Q541: required content-rights confirmation. Deliberately not persisted
  // in drafts, so publishing always needs a fresh explicit confirmation.
  rightsConfirmed: boolean;
}

const EMPTY_DIMS: DimDraft[] = [
  { name: '', values: [] },
  { name: '', values: [] },
];

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  categoryId: '',
  condition: '',
  flawNotes: '',
  sku: '',
  attrs: {},
  languageLabel: '',
  images: [],
  price: '',
  stock: '1',
  salePrice: '',
  saleEndDate: '',
  offersEnabled: true,
  meetupEnabled: null,
  deliveryEnabled: null,
  lowStockThreshold: '',
  hasVariants: false,
  variantDims: EMPTY_DIMS,
  variants: [],
  rightsConfirmed: false,
};

interface ValidationIssue {
  step: number;
  key: string;
  params?: Record<string, string | number>;
}

// Mirror of the server's publish rules (src/utils/listingPolicy.js) with i18n
// messages, so the wizard can jump to the field that needs attention.
function validateStep(step: number, f: FormState): ValidationIssue | null {
  if (step === 1) {
    if (!f.name.trim()) return { step, key: 'addListing.errName' };
    if (f.name.trim().length > 200) return { step, key: 'addListing.errNameLong' };
    if (f.description.length > 5000) return { step, key: 'addListing.errDescLong' };
    if (!f.categoryId) return { step, key: 'addListing.errCategory' };
    if (!f.condition) return { step, key: 'addListing.errCondition' };
    if (flawNotesRequired(f.condition) && !f.flawNotes.trim()) {
      return { step, key: 'addListing.errFlaws' };
    }
    if (f.flawNotes.length > 2000) return { step, key: 'addListing.errFlawsLong' };
    return null;
  }
  if (step === 2) {
    if (f.sku.length > 60) return { step, key: 'addListing.errSkuLong' };
    if (f.hasVariants) {
      if (f.variants.length === 0) return { step, key: 'addListing.errVariantsEmpty' };
      if (f.variants.length > MAX_VARIANTS) {
        return { step, key: 'addListing.errVariantLimit', params: { max: MAX_VARIANTS } };
      }
      for (const v of f.variants) {
        const p = parseFloat(v.price);
        if (isNaN(p) || p < MIN_PRICE || p > MAX_PRICE) {
          return { step, key: 'addListing.errVariantPrice', params: { min: MIN_PRICE, max: MAX_PRICE } };
        }
        const s = parseInt(v.stock, 10);
        if (isNaN(s)) return { step, key: 'addListing.errVariantStockMissing' };
        if (s < 0) return { step, key: 'addListing.errVariantStock' };
      }
      const total = f.variants.reduce((n, v) => n + (parseInt(v.stock, 10) || 0), 0);
      if (total < 1) return { step, key: 'addListing.errVariantStockTotal' };
    } else {
      const p = parseFloat(f.price);
      if (isNaN(p) || p < MIN_PRICE || p > MAX_PRICE) {
        return { step, key: 'addListing.errPrice', params: { min: MIN_PRICE, max: MAX_PRICE } };
      }
      const s = parseInt(f.stock, 10);
      if (isNaN(s) || s < 1) return { step, key: 'addListing.errStock' };
    }
    if (f.salePrice) {
      if (f.hasVariants) return { step, key: 'addListing.errSaleVariants' };
      const sp = parseFloat(f.salePrice);
      const op = parseFloat(f.price);
      if (isNaN(sp) || sp <= 0) return { step, key: 'addListing.errSalePrice' };
      if (!isNaN(op) && sp >= op) return { step, key: 'addListing.errSaleLower' };
      if (!isNaN(op) && Math.round((1 - sp / op) * 100) > 25) {
        return { step, key: 'addListing.errSaleDiscount' };
      }
      if (!f.saleEndDate) return { step, key: 'addListing.errSaleDate' };
      if (new Date(f.saleEndDate) <= new Date()) return { step, key: 'addListing.errSaleFuture' };
    }
    if (f.lowStockThreshold !== '' && f.lowStockThreshold !== undefined) {
      const n = parseInt(f.lowStockThreshold, 10);
      if (isNaN(n) || n < 1 || n > 20) return { step, key: 'addListing.errThreshold' };
    }
    return null;
  }
  return null;
}

function validateAll(f: FormState): ValidationIssue | null {
  if (!f.images.length) return { step: 0, key: 'addListing.errNoPhotos' };
  return validateStep(1, f) || validateStep(2, f);
}

function hydrateForm(raw: unknown): FormState {
  const f: FormState = {
    ...EMPTY_FORM,
    attrs: {},
    images: [],
    variantDims: EMPTY_DIMS.map((d) => ({ ...d, values: [] })),
    variants: [],
  };
  if (!raw || typeof raw !== 'object') return f;
  const d = raw as Record<string, any>;
  const images = Array.isArray(d.images)
    ? d.images
        .map((x: unknown) => (typeof x === 'string' ? x : (x as { url?: string })?.url || ''))
        .filter((u: string) => !!u)
    : [];
  const variants: VariantDraft[] = Array.isArray(d.variants)
    ? d.variants.map((v: Record<string, any>) => ({
        options: v?.options && typeof v.options === 'object' ? v.options : {},
        price: v?.price === undefined || v?.price === null ? '' : String(v.price),
        stock: v?.stock === undefined || v?.stock === null ? '' : String(v.stock),
        sku: v?.sku ? String(v.sku) : '',
      }))
    : [];
  const dims = variants.length > 0 ? dimsFromVariants(variants) : f.variantDims;
  return {
    ...f,
    name: d.name ? String(d.name) : '',
    description: d.description ? String(d.description) : '',
    categoryId: d.categoryId ? String(d.categoryId) : '',
    condition: d.condition ? String(d.condition) : '',
    flawNotes: d.flawNotes ? String(d.flawNotes) : '',
    sku: d.sku ? String(d.sku) : '',
    attrs: d.attrs && typeof d.attrs === 'object' && !Array.isArray(d.attrs) ? d.attrs : {},
    languageLabel: d.languageLabel ? String(d.languageLabel) : '',
    images,
    price: d.price === undefined || d.price === null || d.price === '' ? '' : String(d.price),
    stock: d.stock === undefined || d.stock === null ? '1' : String(d.stock),
    salePrice: d.salePrice === undefined || d.salePrice === null || d.salePrice === ''
      ? ''
      : String(d.salePrice),
    saleEndDate: d.saleEndDate ? String(d.saleEndDate) : '',
    offersEnabled: d.offersEnabled !== false,
    meetupEnabled: d.meetupEnabled === undefined || d.meetupEnabled === null ? null : !!d.meetupEnabled,
    deliveryEnabled: d.deliveryEnabled === undefined || d.deliveryEnabled === null ? null : !!d.deliveryEnabled,
    lowStockThreshold:
      d.lowStockThreshold === undefined || d.lowStockThreshold === null || d.lowStockThreshold === ''
        ? ''
        : String(d.lowStockThreshold),
    hasVariants: d.hasVariants === true || (d.hasVariants === undefined && variants.length > 0),
    variantDims: dims,
    variants,
    rightsConfirmed: false,
  };
}

function buildDraftData(f: FormState): Record<string, unknown> {
  const attrs: Record<string, string> = {};
  Object.entries(f.attrs || {}).forEach(([k, v]) => {
    const val = (v || '').trim();
    if (val) attrs[k] = val.slice(0, 100);
  });
  return {
    name: f.name,
    description: f.description,
    categoryId: f.categoryId,
    condition: f.condition,
    flawNotes: f.flawNotes,
    sku: f.sku,
    attrs,
    languageLabel: f.languageLabel,
    images: f.images,
    price: f.price,
    stock: f.stock,
    salePrice: f.salePrice,
    saleEndDate: f.saleEndDate,
    offersEnabled: f.offersEnabled,
    meetupEnabled: f.meetupEnabled,
    deliveryEnabled: f.deliveryEnabled,
    lowStockThreshold: f.lowStockThreshold,
    hasVariants: f.hasVariants,
    variantDims: f.variantDims,
    variants: f.variants,
  };
}

const comboValueKey = (options: Record<string, string>) =>
  Object.values(options || {}).join('\u0001');

const LARGE_MOBILE_UPLOAD_BYTES = 5 * 1024 * 1024;

function formatUploadSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
}

async function estimateSelectedPhotoBytes(uris: string[]) {
  const localUris = uris.filter(uri => !/^https?:\/\//i.test(uri));
  let bytes = 0;
  let unknown = 0;
  if (!localUris.length) return { bytes, unknown };

  try {
    const FileSystem = require('expo-file-system/legacy');
    for (const uri of localUris) {
      try {
        const info = await FileSystem.getInfoAsync(uri, { size: true });
        if (info?.exists && Number.isFinite(info.size) && info.size > 0) bytes += info.size;
        else unknown += 1;
      } catch {
        unknown += 1;
      }
    }
  } catch {
    unknown = localUris.length;
  }
  return { bytes, unknown };
}

export default function AddListingScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const route = useRoute<AddListingRoute>();
  const toast = useToast();
  const { width: winWidth } = useWindowDimensions();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [step, setStep] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [activeCap, setActiveCap] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showPickerSheet, setShowPickerSheet] = useState(false);
  const [uploadReview, setUploadReview] = useState<{ bytes: number; unknown: number } | null>(null);
  const [dimInputs, setDimInputs] = useState<string[]>(['', '']);
  const [published, setPublished] = useState<
    { id: string; moderated: string; name: string; price: number } | null
  >(null);

  const draftIdRef = useRef<string | null>(route.params?.draftId ?? null);
  const hydratedRef = useRef(false);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef(form);
  formRef.current = form;
  const publishedRef = useRef(false);
  publishedRef.current = !!published;

  const isSeller = store.isSeller;
  const needsVerification = !store.user?.id_verified;
  const atCap =
    activeCap !== null && activeCount !== null && activeCount >= activeCap;
  const isCasual = store.user?.seller_tier === 'casual';

  // ───── Initial load: categories, cap meta, optional draft hydration ─────
  useEffect(() => {
    if (!store.isSeller) {
      nav.goBack();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const cats = (await getCategories()) as unknown as { categories?: Category[] };
        if (!cancelled) setCategories(cats.categories || []);
      } catch {
        /* silent — categories reload next time */
      }
      try {
        const meta = (await getSellerListings()) as unknown as {
          counts?: Record<string, number>;
          cap?: number | null;
        };
        if (!cancelled) {
          setActiveCount(meta.counts?.active ?? 0);
          setActiveCap(meta.cap ?? null);
        }
      } catch {
        /* silent — cap enforced server-side */
      }
      const did = route.params?.draftId;
      if (did) {
        try {
          const res = (await getListingDraft(did)) as unknown as {
            draft?: { id?: string; data?: unknown };
          };
          if (!cancelled && res.draft) {
            setForm(hydrateForm(res.draft.data));
            setSaveStatus('saved');
          }
        } catch (e: any) {
          // Draft vanished (deleted elsewhere) — continue as a fresh listing.
          draftIdRef.current = null;
          if (!cancelled && !/not found/i.test(e?.message || '')) {
            toast.error(t('common.error'), e?.message || t('common.tryAgain'));
          }
        }
      }
      if (!cancelled) {
        hydratedRef.current = true;
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    dirtyRef.current = true;
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  // ───── Debounced draft autosave ─────
  const saveDraft = useCallback(async () => {
    if (!hydratedRef.current || savingRef.current || publishedRef.current) return;
    if (!dirtyRef.current) return;
    savingRef.current = true;
    setSaveStatus('saving');
    try {
      const data = buildDraftData(formRef.current);
      if (draftIdRef.current) {
        await updateListingDraft(draftIdRef.current, { data });
      } else {
        const res = (await createListingDraft({ data })) as unknown as {
          draft?: { id?: string };
        };
        if (res.draft?.id) {
          draftIdRef.current = res.draft.id;
          nav.setParams({ draftId: res.draft.id });
        }
      }
      dirtyRef.current = false;
      setSaveStatus('saved');
    } catch (e: any) {
      setSaveStatus('error');
      if (e?.code === 'DRAFT_LIMIT') {
        toast.warning(t('addListing.draftLimitTitle'), e.message);
      }
    } finally {
      savingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydratedRef.current || !dirtyRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveDraft();
    }, 1200);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [form, saveDraft]);

  const flushSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    saveDraft();
  }, [saveDraft]);

  // ───── Navigation ─────
  const handleBack = useCallback(() => {
    if (published) {
      nav.goBack();
      return;
    }
    if (step > 0) {
      flushSave();
      setStep((s) => Math.max(0, s - 1));
    } else {
      flushSave();
      nav.goBack();
    }
  }, [step, published, flushSave, nav]);

  const goNext = useCallback(() => {
    const f = formRef.current;
    if (step < 3) {
      const issue = validateStep(step, f);
      if (issue) {
        toast.warning(t('addListing.missingInfo'), t(issue.key, issue.params));
        return;
      }
      flushSave();
      setStep((s) => s + 1);
      return;
    }
    handlePublish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, flushSave, toast, t]);

  // ───── Photos ─────
  const appendImages = (uris: string[]) => {
    if (!uris.length) return;
    setForm((prev) => {
      const next = [...prev.images, ...uris].slice(0, MAX_PHOTOS);
      return { ...prev, images: next };
    });
    dirtyRef.current = true;
  };

  const pickFromLibrary = async () => {
    setShowPickerSheet(false);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.warning(t('addListing.permission'), t('addListing.allowPhotos'));
      return;
    }
    const remaining = MAX_PHOTOS - formRef.current.images.length;
    if (remaining <= 0) {
      toast.warning(t('addListing.photoMaxTitle'), t('addListing.photoMax', { max: MAX_PHOTOS }));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });
    if (!result.canceled) {
      appendImages(result.assets.map((a) => a.uri).filter(Boolean) as string[]);
    }
  };

  const takePhoto = async () => {
    setShowPickerSheet(false);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      toast.warning(t('addListing.permission'), t('addListing.allowCamera'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled && result.assets?.[0]?.uri) {
      appendImages([result.assets[0].uri]);
    }
  };

  const removeImage = (index: number) => {
    setForm((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));
    dirtyRef.current = true;
  };

  const moveImage = (index: number, dir: -1 | 1) => {
    setForm((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.images.length) return prev;
      const imgs = [...prev.images];
      [imgs[index], imgs[j]] = [imgs[j], imgs[index]];
      return { ...prev, images: imgs };
    });
    dirtyRef.current = true;
  };

  // ───── Variants ─────
  const applyDims = (dims: DimDraft[]) => {
    const combos = generateVariantCombos(dims);
    if (combos.length > MAX_VARIANTS) {
      toast.warning(t('addListing.comboLimitTitle'), t('addListing.comboLimit', { max: MAX_VARIANTS }));
    }
    const limited = combos.slice(0, MAX_VARIANTS);
    const prevVariants = formRef.current.variants;
    const byKey = new Map(prevVariants.map((v) => [comboValueKey(v.options), v] as const));
    const merged: VariantDraft[] = limited.map((c) => {
      const prev = byKey.get(comboValueKey(c.options));
      return prev ? { ...prev, options: c.options } : { options: c.options, price: '', stock: '', sku: '' };
    });
    dirtyRef.current = true;
    setForm((p) => ({ ...p, variantDims: dims, variants: merged }));
  };

  const setDimName = (i: number, name: string) => {
    applyDims(form.variantDims.map((d, idx) => (idx === i ? { ...d, name } : d)));
  };

  const addDimValue = (i: number) => {
    const raw = (dimInputs[i] || '').trim();
    if (!raw) return;
    const dims = form.variantDims.map((d, idx) =>
      idx === i && !d.values.includes(raw) ? { ...d, values: [...d.values, raw] } : d
    );
    setDimInputs((prev) => {
      const n = [...prev];
      n[i] = '';
      return n;
    });
    applyDims(dims);
  };

  const removeDimValue = (i: number, value: string) => {
    applyDims(
      form.variantDims.map((d, idx) =>
        idx === i ? { ...d, values: d.values.filter((v) => v !== value) } : d
      )
    );
  };

  const updateVariantField = (index: number, key: 'price' | 'stock' | 'sku', value: string) => {
    dirtyRef.current = true;
    setForm((prev) => ({
      ...prev,
      variants: prev.variants.map((v, i) => (i === index ? { ...v, [key]: value } : v)),
    }));
  };

  // ───── Publish ─────
  const handlePublish = async (mobileUploadConfirmed = false) => {
    const f = formRef.current;
    const issue = validateAll(f);
    if (issue) {
      setStep(issue.step);
      toast.warning(t('addListing.missingInfo'), t(issue.key, issue.params));
      return;
    }
    if (atCap) {
      toast.warning(
        t('addListing.listingLimit'),
        t('addListing.capReached', { active: activeCount ?? 0, cap: activeCap ?? 0 })
      );
      return;
    }
    if (!f.rightsConfirmed) {
      setStep(3);
      toast.warning(t('addListing.rightsTitle'), t('addListing.rightsRequired'));
      return;
    }
    if (!mobileUploadConfirmed && Platform.OS !== 'web') {
      try {
        const connection = await NetInfo.fetch();
        if (connection.type === NetInfoStateType.cellular) {
          const estimate = await estimateSelectedPhotoBytes(f.images);
          if (estimate.bytes >= LARGE_MOBILE_UPLOAD_BYTES || estimate.unknown > 0) {
            setUploadReview(estimate);
            return;
          }
        }
      } catch {
        // If the connection type or file size cannot be checked, keep publishing available.
      }
    }
    setPublishing(true);
    try {
      const images: Array<{ url: string; width?: number; height?: number }> = [];
      for (let i = 0; i < f.images.length; i++) {
        const uri = f.images[i];
        if (/^https?:\/\//i.test(uri)) {
          images.push({ url: uri });
          continue;
        }
        try {
          const r = await uploadImage(uri);
          if (r?.url) images.push({ url: r.url, width: r.width, height: r.height });
          else throw new Error('empty');
        } catch {
          toast.error(t('common.error'), t('addListing.imageFailed', { n: i + 1 }));
          setStep(0);
          return;
        }
      }

      const attrs: Record<string, string> = {};
      Object.entries(f.attrs || {}).forEach(([k, v]) => {
        const val = (v || '').trim();
        if (val) attrs[k] = val.slice(0, 100);
      });

      const payload: Record<string, unknown> = {
        name: f.name.trim(),
        description: f.description,
        images,
        condition: f.condition,
        flawNotes: f.flawNotes.trim(),
        offersEnabled: f.offersEnabled,
        rightsConfirmed: true,
      };
      if (f.categoryId) payload.categoryId = f.categoryId;
      if (f.sku.trim()) payload.sku = f.sku.trim();
      if (f.languageLabel) payload.languageLabel = f.languageLabel;
      if (Object.keys(attrs).length) payload.attrs = attrs;
      if (f.meetupEnabled !== null) payload.meetupEnabled = f.meetupEnabled;
      if (f.deliveryEnabled !== null) payload.deliveryEnabled = f.deliveryEnabled;
      if (f.lowStockThreshold !== '') payload.lowStockThreshold = f.lowStockThreshold;

      if (f.hasVariants && f.variants.length > 0) {
        payload.variants = f.variants.map((v) => ({
          options: v.options,
          price: parseFloat(v.price),
          stock: parseInt(v.stock, 10) || 0,
          ...(v.sku.trim() ? { sku: v.sku.trim() } : {}),
        }));
        payload.price = Math.min(...f.variants.map((v) => parseFloat(v.price)));
        payload.stock = f.variants.reduce((n, v) => n + (parseInt(v.stock, 10) || 0), 0);
      } else {
        payload.price = parseFloat(f.price);
        payload.stock = parseInt(f.stock, 10) || 1;
        if (f.salePrice) {
          payload.sale_price = parseFloat(f.salePrice);
          payload.sale_ends_at = new Date(f.saleEndDate).toISOString();
        }
      }
      if (draftIdRef.current) payload.draftId = draftIdRef.current;

      const res = (await createProduct(payload)) as unknown as {
        product?: { id?: string; name?: string; price?: number | string };
        moderated?: string;
      };
      const prod = res.product || {};
      const moderated = res.moderated || 'approved';
      setPublished({
        id: prod.id || '',
        moderated,
        name: prod.name || f.name.trim(),
        price: Number(prod.price ?? payload.price ?? 0),
      });
      draftIdRef.current = null; // deleted server-side with the publish
      dirtyRef.current = false;
      setStep(4);
      if (moderated === 'pending_review') {
        toast.success(t('addListing.successPendingTitle'), t('addListing.successPendingBody'));
      } else {
        toast.success(t('addListing.success'), t('addListing.created'));
      }
    } catch (e: any) {
      const code = e?.code;
      if (code === 'TIER_CAP' || code === 'VERIFIED_LISTING_LIMIT') {
        toast.warning(t('addListing.listingLimit'), e.message);
      } else if (code === 'LISTING_RIGHTS_REQUIRED') {
        setStep(3);
        toast.warning(t('addListing.rightsTitle'), t('addListing.rightsRequired'));
      } else {
        toast.error(t('common.error'), e?.message || t('common.tryAgain'));
      }
    } finally {
      setPublishing(false);
    }
  };

  const shareListing = async () => {
    if (!published) return;
    try {
      await Share.share({
        message: t('productDetail.shareMessage', {
          name: published.name,
          price: Math.round(published.price),
        }),
      });
    } catch {
      /* user dismissed */
    }
  };

  // ───── Derived display values ─────
  const selectedCategory = categories.find((c) => c.id === form.categoryId);
  const attrKeys = selectedCategory ? allowedAttrsForCategory(selectedCategory.name) : [];
  const willReview = assessModeration({
    name: form.name,
    description: form.description,
    flawNotes: form.flawNotes,
  }).flagged;

  const effectivePreviewPrice = (() => {
    if (form.hasVariants && form.variants.length > 0) {
      const prices = form.variants.map((v) => parseFloat(v.price)).filter((p) => !isNaN(p));
      if (prices.length) return Math.min(...prices);
      return 0;
    }
    const base = parseFloat(form.price);
    if (!isNaN(base) && form.salePrice) {
      const sp = parseFloat(form.salePrice);
      if (!isNaN(sp) && sp > 0 && sp < base) return sp;
    }
    return isNaN(base) ? 0 : base;
  })();

  // ══════════════════════════════════════════════════════════════════════
  // Gates
  // ══════════════════════════════════════════════════════════════════════
  if (!isSeller && !loading) {
    return <View style={styles.container} />;
  }

  const saveChip =
    saveStatus === 'saving' ? (
      <Text style={styles.saveChipText}>{t('addListing.draftSaving')}</Text>
    ) : saveStatus === 'error' ? (
      <TouchableOpacity onPress={saveDraft} style={styles.saveChip} accessibilityRole="button">
        <MaterialCommunityIcons name="alert-circle-outline" size={12} color={COLORS.coral} />
        <Text style={[styles.saveChipText, { color: COLORS.coral }]}>{t('addListing.draftRetry')}</Text>
      </TouchableOpacity>
    ) : saveStatus === 'saved' ? (
      <View style={styles.saveChip}>
        <MaterialCommunityIcons name="check" size={12} color={COLORS.green} />
        <Text style={[styles.saveChipText, { color: COLORS.green }]}>{t('addListing.draftSaved')}</Text>
      </View>
    ) : null;

  const stepTitle = step <= 3 ? t(STEP_TITLE_KEYS[step]) : '';
  const stepHint = step <= 3 ? t(STEP_HINT_KEYS[step]) : '';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <View style={styles.container}>
        <ScreenHeader
          title={t('addListing.title')}
          subtitle={step <= 3 ? t('addListing.stepOf', { step: step + 1, total: 4 }) : undefined}
          onBack={handleBack}
        />

        {loading ? (
          <View style={styles.centerBlock}>
            <ActivityIndicator color={COLORS.coral} size="large" />
          </View>
        ) : needsVerification ? (
          <ScrollView contentContainerStyle={styles.wallWrap}>
            <View style={styles.wallIcon}>
              <MaterialCommunityIcons name="shield-lock-outline" size={40} color={COLORS.coral} />
            </View>
            <Text style={styles.wallTitle}>{t('addListing.verifyTitle')}</Text>
            <Text style={styles.wallBody}>{t('addListing.verifyBody')}</Text>
            <TouchableOpacity
              style={styles.wallPrimaryBtn}
              onPress={() => nav.navigate('Verification')}
              accessibilityRole="button"
              accessibilityLabel={t('addListing.verifyCta')}
            >
              <MaterialCommunityIcons name="shield-check-outline" size={18} color={COLORS.white} />
              <Text style={styles.wallPrimaryText}>{t('addListing.verifyCta')}</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : published ? (
          <ScrollView contentContainerStyle={styles.wallWrap}>
            <View
              style={[
                styles.wallIcon,
                { backgroundColor: (published.moderated === 'pending_review' ? COLORS.yellow : COLORS.green) + '18' },
              ]}
            >
              <MaterialCommunityIcons
                name={published.moderated === 'pending_review' ? 'clock-outline' : 'check-circle-outline'}
                size={44}
                color={published.moderated === 'pending_review' ? COLORS.yellow : COLORS.green}
              />
            </View>
            <Text style={styles.wallTitle}>
              {published.moderated === 'pending_review'
                ? t('addListing.successPendingTitle')
                : t('addListing.successTitle')}
            </Text>
            <Text style={styles.wallBody}>
              {published.moderated === 'pending_review'
                ? t('addListing.successPendingBody')
                : t('addListing.successBody')}
            </Text>
            <TouchableOpacity
              style={styles.wallPrimaryBtn}
              onPress={() => {
                if (published.moderated === 'pending_review') {
                  nav.replace('MyListings');
                } else {
                  nav.navigate('ProductDetail', { productId: published.id });
                }
              }}
              accessibilityRole="button"
            >
              <Text style={styles.wallPrimaryText}>{t('addListing.viewListing')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.wallSecondaryBtn}
              onPress={() => nav.replace('MyListings')}
              accessibilityRole="button"
            >
              <Text style={styles.wallSecondaryText}>{t('addListing.manageListings')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.wallGhostBtn} onPress={shareListing} accessibilityRole="button">
              <MaterialCommunityIcons name="share-variant" size={16} color={COLORS.text} />
              <Text style={styles.wallGhostText}>{t('addListing.shareListing')}</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : (
          <>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              {atCap && (
                <View style={styles.capBanner}>
                  <MaterialCommunityIcons name="information-outline" size={16} color={COLORS.yellow} />
                  <Text style={styles.capBannerText}>
                    {t('addListing.capUsage', { active: activeCount ?? 0, cap: activeCap ?? 0 })}
                  </Text>
                  <TouchableOpacity onPress={() => nav.navigate('MyListings')} accessibilityRole="button">
                    <Text style={styles.capBannerLink}>{t('addListing.manageListings')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => nav.navigate('SellerToolsSettings')} accessibilityRole="button">
                    <Text style={styles.capBannerLink}>{t('addListing.viewTiers')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              <Text style={styles.stepTitle}>{stepTitle}</Text>
              <Text style={styles.stepHint}>{stepHint}</Text>

              {/* ── Step 0 · Photos ── */}
              {step === 0 && (
                <View>
                  <View style={styles.photoGrid}>
                    {form.images.map((uri, idx) => (
                      <View
                        key={`${uri}-${idx}`}
                        style={[
                          styles.photoTile,
                          { width: Math.floor((winWidth - SPACING.md * 2 - 16) / 3) },
                        ]}
                      >
                        <Image source={{ uri }} style={styles.photoImg} />
                        {idx === 0 && (
                          <View style={styles.coverBadge}>
                            <MaterialCommunityIcons name="star" size={9} color={COLORS.white} />
                            <Text style={styles.coverBadgeText}>{t('addListing.cover')}</Text>
                          </View>
                        )}
                        <TouchableOpacity
                          style={styles.photoRemove}
                          onPress={() => removeImage(idx)}
                          accessibilityRole="button"
                          accessibilityLabel={`${t('addListing.removePhoto')} ${idx + 1}`}
                        >
                          <MaterialCommunityIcons name="close-circle" size={20} color={COLORS.coral} />
                        </TouchableOpacity>
                        <View style={styles.photoOrderRow}>
                          <TouchableOpacity
                            style={[styles.photoOrderBtn, idx === 0 && styles.photoOrderBtnOff]}
                            onPress={() => moveImage(idx, -1)}
                            disabled={idx === 0}
                            accessibilityRole="button"
                            accessibilityLabel={`${t('addListing.moveLeft')} ${idx + 1}`}
                          >
                            <MaterialCommunityIcons name="chevron-left" size={18} color={COLORS.white} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.photoOrderBtn,
                              idx === form.images.length - 1 && styles.photoOrderBtnOff,
                            ]}
                            onPress={() => moveImage(idx, 1)}
                            disabled={idx === form.images.length - 1}
                            accessibilityRole="button"
                            accessibilityLabel={`${t('addListing.moveRight')} ${idx + 1}`}
                          >
                            <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.white} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                    {form.images.length < MAX_PHOTOS && (
                      <TouchableOpacity
                        style={[styles.photoTile, styles.photoAdd, { width: Math.floor((winWidth - SPACING.md * 2 - 16) / 3) }]}
                        onPress={() => setShowPickerSheet(true)}
                        accessibilityRole="button"
                        accessibilityLabel={t('addListing.addPhoto')}
                      >
                        <MaterialCommunityIcons name="camera-plus-outline" size={26} color={COLORS.text2} />
                        <Text style={styles.photoAddText}>{t('addListing.addPhoto')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={styles.photosCount}>
                    {t('addListing.photosCount', { count: form.images.length, max: MAX_PHOTOS })}
                  </Text>
                </View>
              )}

              {/* ── Step 1 · Details ── */}
              {step === 1 && (
                <View>
                  <Text style={styles.fieldLabel}>{t('addListing.category')}</Text>
                  <View style={styles.chipWrap}>
                    {categories.map((cat) => {
                      const on = form.categoryId === cat.id;
                      return (
                        <TouchableOpacity
                          key={cat.id}
                          style={[styles.chip, on && styles.chipOn]}
                          onPress={() => setField('categoryId', on ? '' : cat.id)}
                          accessibilityRole="button"
                          accessibilityLabel={cat.name.toLowerCase()}
                          accessibilityState={{ selected: on }}
                        >
                          <Text style={[styles.chipText, on && styles.chipTextOn]}>{cat.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={styles.fieldLabel}>{t('addListing.productName')}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={t('addListing.productName')}
                    placeholderTextColor={COLORS.text2}
                    value={form.name}
                    onChangeText={(v) => setField('name', v)}
                    maxLength={200}
                    accessibilityLabel={t('addListing.productName')}
                  />

                  <Text style={styles.fieldLabel}>{t('addListing.description')}</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder={t('addListing.description')}
                    placeholderTextColor={COLORS.text2}
                    value={form.description}
                    onChangeText={(v) => setField('description', v)}
                    multiline
                    numberOfLines={4}
                    maxLength={5000}
                    accessibilityLabel={t('addListing.description')}
                  />

                  <Text style={styles.fieldLabel}>{t('addListing.condition')}</Text>
                  <View style={styles.chipWrap}>
                    {CONDITIONS.map((c) => {
                      const on = form.condition === c;
                      return (
                        <TouchableOpacity
                          key={c}
                          style={[styles.chip, on && styles.chipOn]}
                          onPress={() => setField('condition', on ? '' : c)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                        >
                          <Text style={[styles.chipText, on && styles.chipTextOn]}>
                            {t(CONDITION_LABEL_KEYS[c])}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {!!form.condition && (
                    <View>
                      <Text style={styles.fieldLabel}>
                        {t('addListing.flawsLabel')}
                        {!flawNotesRequired(form.condition) ? (
                          <Text style={styles.labelMuted}> {t('addListing.flawsOptional')}</Text>
                        ) : null}
                      </Text>
                      <TextInput
                        style={[styles.input, styles.textArea]}
                        placeholder={t('addListing.flawsPlaceholder')}
                        placeholderTextColor={COLORS.text2}
                        value={form.flawNotes}
                        onChangeText={(v) => setField('flawNotes', v)}
                        multiline
                        numberOfLines={3}
                        maxLength={2000}
                        accessibilityLabel={t('addListing.flawsLabel')}
                      />
                    </View>
                  )}

                  <Text style={styles.fieldLabel}>{t('addListing.languageLabel')}</Text>
                  <View style={styles.chipWrap}>
                    {LISTING_LANGUAGES.map((l) => {
                      const on = form.languageLabel === l;
                      return (
                        <TouchableOpacity
                          key={l}
                          style={[styles.chip, styles.chipSmall, on && styles.chipOn]}
                          onPress={() => setField('languageLabel', on ? '' : l)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                        >
                          <Text style={[styles.chipText, on && styles.chipTextOn]}>
                            {t(LANGUAGE_LABEL_KEYS[l] || l)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {attrKeys.length > 0 && (
                    <View>
                      <Text style={styles.fieldLabel}>{t('addListing.attrTitle')}</Text>
                      {attrKeys.map((k) => (
                        <TextInput
                          key={k}
                          style={styles.input}
                          placeholder={t(`addListing.attr.${k}`)}
                          placeholderTextColor={COLORS.text2}
                          value={form.attrs[k] || ''}
                          onChangeText={(v) =>
                            setField('attrs', { ...form.attrs, [k]: v.slice(0, 100) })
                          }
                          maxLength={100}
                          accessibilityLabel={t(`addListing.attr.${k}`)}
                        />
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* ── Step 2 · Price & stock ── */}
              {step === 2 && (
                <View>
                  {!form.hasVariants && (
                    <>
                      <Text style={styles.fieldLabel}>{t('addListing.price')}</Text>
                      <TextInput
                        style={styles.input}
                        placeholder={`${t('addListing.price')} (${MIN_PRICE}-${MAX_PRICE} G)`}
                        placeholderTextColor={COLORS.text2}
                        value={form.price}
                        onChangeText={(v) => {
                          const num = v.replace(/[^0-9]/g, '');
                          if (!num || Number(num) <= MAX_PRICE) setField('price', num);
                        }}
                        keyboardType="numeric"
                        maxLength={5}
                        accessibilityLabel={t('addListing.price')}
                      />

                      {form.price && Number(form.price) >= MIN_PRICE && (() => {
                        const tier = store.user?.seller_tier || 'casual';
                        const rate = tier === 'business' ? 0.03 : tier === 'verified' ? 0.05 : 0.08;
                        const moncash = 0.079;
                        const net = Math.round(Number(form.price) * (1 - rate) * (1 - moncash));
                        return (
                          <View style={styles.netPreview}>
                            <View style={styles.netPreviewRow}>
                              <Text style={styles.netPreviewLabel}>
                                MaurMaket fee ({Math.round(rate * 100)}%)
                              </Text>
                              <Text style={styles.netPreviewValue}>
                                -{Math.round(Number(form.price) * rate)} G
                              </Text>
                            </View>
                            <View style={styles.netPreviewRow}>
                              <Text style={styles.netPreviewLabel}>MonCash fee (~7.9%)</Text>
                              <Text style={styles.netPreviewValue}>
                                ~-{Math.round(Number(form.price) * moncash)} G
                              </Text>
                            </View>
                            <View style={[styles.netPreviewRow, styles.netPreviewTotal]}>
                              <Text style={styles.netPreviewTotalLabel}>{t('addListing.youReceive')}</Text>
                              <Text style={styles.netPreviewTotalValue}>{net} G</Text>
                            </View>
                          </View>
                        );
                      })()}

                      <TouchableOpacity
                        style={styles.toggleRow}
                        onPress={() => setField('salePrice', form.salePrice ? '' : '0')}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: !!form.salePrice }}
                      >
                        <MaterialCommunityIcons
                          name={form.salePrice ? 'checkbox-marked' : 'checkbox-blank-outline'}
                          size={20}
                          color={form.salePrice ? COLORS.coral : COLORS.text2}
                        />
                        <Text style={styles.toggleText}>{t('addListing.saleToggle')}</Text>
                      </TouchableOpacity>

                      {!!form.salePrice && (
                        <SaleSection
                          originalPrice={form.price}
                          salePrice={form.salePrice === '0' ? '' : form.salePrice}
                          saleEndDate={form.saleEndDate}
                          onSalePriceChange={(v) => setField('salePrice', v)}
                          onSaleEndDateChange={(v) => setField('saleEndDate', v)}
                        />
                      )}

                      <Text style={styles.fieldLabel}>{t('addListing.quantity')}</Text>
                      <TextInput
                        style={styles.input}
                        placeholder={t('addListing.quantity')}
                        placeholderTextColor={COLORS.text2}
                        value={form.stock}
                        onChangeText={(v) => setField('stock', v.replace(/[^0-9]/g, ''))}
                        keyboardType="numeric"
                        accessibilityLabel={t('addListing.quantity')}
                      />
                    </>
                  )}

                  {/* Variants */}
                  <TouchableOpacity
                    style={styles.toggleRow}
                    onPress={() => {
                      const next = !form.hasVariants;
                      dirtyRef.current = true;
                      setForm((p) => ({
                        ...p,
                        hasVariants: next,
                        variants: next
                          ? (() => {
                              const combos = generateVariantCombos(p.variantDims);
                              const byKey = new Map(
                                p.variants.map((v) => [comboValueKey(v.options), v] as const)
                              );
                              return combos.slice(0, MAX_VARIANTS).map((c) => {
                                const prev = byKey.get(comboValueKey(c.options));
                                return prev
                                  ? { ...prev, options: c.options }
                                  : { options: c.options, price: '', stock: '', sku: '' };
                              });
                            })()
                          : p.variants,
                      }));
                    }}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: form.hasVariants }}
                  >
                    <MaterialCommunityIcons
                      name={form.hasVariants ? 'checkbox-marked' : 'checkbox-blank-outline'}
                      size={20}
                      color={form.hasVariants ? COLORS.coral : COLORS.text2}
                    />
                    <Text style={styles.toggleText}>{t('addListing.variantsLabel')}</Text>
                  </TouchableOpacity>

                  {form.hasVariants ? (
                    <View>
                      <Text style={styles.hint}>{t('addListing.variantsHint')}</Text>
                      {form.variantDims.map((dim, i) => (
                        <View key={`dim-${i}`} style={styles.dimCard}>
                          <TextInput
                            style={styles.inputFlat}
                            placeholder={t('addListing.dimName')}
                            placeholderTextColor={COLORS.text2}
                            value={dim.name}
                            onChangeText={(v) => setDimName(i, v.slice(0, 30))}
                            maxLength={30}
                          />
                          <View style={styles.chipWrap}>
                            {dim.values.map((val) => (
                              <TouchableOpacity
                                key={val}
                                style={[styles.chip, styles.chipOn]}
                                onPress={() => removeDimValue(i, val)}
                                accessibilityRole="button"
                                accessibilityLabel={`${t('addListing.dimRemove')} ${val}`}
                              >
                                <Text style={[styles.chipText, styles.chipTextOn]}>{val}</Text>
                                <MaterialCommunityIcons name="close" size={12} color={COLORS.white} />
                              </TouchableOpacity>
                            ))}
                          </View>
                          <View style={styles.dimInputRow}>
                            <TextInput
                              style={[styles.inputFlat, { flex: 1 }]}
                              placeholder={t('addListing.dimValue')}
                              placeholderTextColor={COLORS.text2}
                              value={dimInputs[i] || ''}
                              onChangeText={(v) =>
                                setDimInputs((prev) => {
                                  const n = [...prev];
                                  n[i] = v.slice(0, 30);
                                  return n;
                                })
                              }
                              maxLength={30}
                              onSubmitEditing={() => addDimValue(i)}
                            />
                            <TouchableOpacity
                              style={styles.dimAddBtn}
                              onPress={() => addDimValue(i)}
                              accessibilityRole="button"
                            >
                              <Text style={styles.dimAddText}>{t('addListing.dimAdd')}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}

                      {form.variants.length > 0 && (
                        <Text style={styles.variantCount}>
                          {t('addListing.comboCount', { count: form.variants.length })}
                        </Text>
                      )}
                      {form.variants.map((v, i) => (
                        <View key={`var-${i}`} style={styles.variantCard}>
                          <Text style={styles.variantLabel}>
                            {Object.values(v.options).join(' · ') || variantComboLabel(v.options)}
                          </Text>
                          <View style={styles.variantInputsRow}>
                            <View style={styles.variantField}>
                              <Text style={styles.variantFieldLabel}>{t('addListing.vPrice')}</Text>
                              <TextInput
                                style={styles.inputFlat}
                                placeholder={String(MIN_PRICE)}
                                placeholderTextColor={COLORS.text2}
                                value={v.price}
                                onChangeText={(val) =>
                                  updateVariantField(i, 'price', val.replace(/[^0-9]/g, ''))
                                }
                                keyboardType="numeric"
                                maxLength={5}
                              />
                            </View>
                            <View style={styles.variantField}>
                              <Text style={styles.variantFieldLabel}>{t('addListing.vStock')}</Text>
                              <TextInput
                                style={styles.inputFlat}
                                placeholder="0"
                                placeholderTextColor={COLORS.text2}
                                value={v.stock}
                                onChangeText={(val) =>
                                  updateVariantField(i, 'stock', val.replace(/[^0-9]/g, ''))
                                }
                                keyboardType="numeric"
                                maxLength={5}
                              />
                            </View>
                            <View style={[styles.variantField, { flex: 1.2 }]}>
                              <Text style={styles.variantFieldLabel}>{t('addListing.vSku')}</Text>
                              <TextInput
                                style={styles.inputFlat}
                                placeholder={t('addListing.optional')}
                                placeholderTextColor={COLORS.text2}
                                value={v.sku}
                                onChangeText={(val) => updateVariantField(i, 'sku', val.slice(0, 60))}
                                maxLength={60}
                              />
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View>
                      <Text style={styles.fieldLabel}>{t('addListing.skuLabel')}</Text>
                      <TextInput
                        style={styles.input}
                        placeholder={t('addListing.skuHint')}
                        placeholderTextColor={COLORS.text2}
                        value={form.sku}
                        onChangeText={(v) => setField('sku', v.slice(0, 60))}
                        maxLength={60}
                        autoCapitalize="characters"
                      />
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.toggleRow}
                    onPress={() => setField('offersEnabled', !form.offersEnabled)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: form.offersEnabled }}
                  >
                    <MaterialCommunityIcons
                      name={form.offersEnabled ? 'checkbox-marked' : 'checkbox-blank-outline'}
                      size={20}
                      color={form.offersEnabled ? COLORS.coral : COLORS.text2}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.toggleText}>{t('addListing.offersLabel')}</Text>
                      <Text style={styles.hint}>{t('addListing.offersHint')}</Text>
                    </View>
                  </TouchableOpacity>

                  <Text style={styles.fieldLabel}>{t('addListing.fulfillTitle')}</Text>
                  <TouchableOpacity
                    style={styles.toggleRow}
                    onPress={() => setField('meetupEnabled', form.meetupEnabled === false ? true : false)}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: form.meetupEnabled !== false }}
                  >
                    <MaterialCommunityIcons
                      name={form.meetupEnabled !== false ? 'checkbox-marked' : 'checkbox-blank-outline'}
                      size={20}
                      color={form.meetupEnabled !== false ? COLORS.coral : COLORS.text2}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.toggleText}>{t('addListing.fulfillMeetup')}</Text>
                      <Text style={styles.hint}>
                        {form.meetupEnabled === null
                          ? t('addListing.fulfillInherit')
                          : form.meetupEnabled
                          ? t('addListing.fulfillOn')
                          : t('addListing.fulfillOff')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.toggleRow}
                    onPress={() =>
                      setField('deliveryEnabled', form.deliveryEnabled === false ? true : false)
                    }
                    accessibilityRole="switch"
                    accessibilityState={{ checked: form.deliveryEnabled !== false }}
                  >
                    <MaterialCommunityIcons
                      name={form.deliveryEnabled !== false ? 'checkbox-marked' : 'checkbox-blank-outline'}
                      size={20}
                      color={form.deliveryEnabled !== false ? COLORS.coral : COLORS.text2}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.toggleText}>{t('addListing.fulfillDelivery')}</Text>
                      <Text style={styles.hint}>
                        {form.deliveryEnabled === null
                          ? t('addListing.fulfillInherit')
                          : form.deliveryEnabled
                          ? t('addListing.fulfillOn')
                          : t('addListing.fulfillOff')}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <Text style={styles.fieldLabel}>{t('addListing.thresholdLabel')}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={t('addListing.thresholdHint', { def: DEFAULT_LOW_STOCK_THRESHOLD })}
                    placeholderTextColor={COLORS.text2}
                    value={form.lowStockThreshold}
                    onChangeText={(v) => setField('lowStockThreshold', v.replace(/[^0-9]/g, '').slice(0, 2))}
                    keyboardType="numeric"
                    maxLength={2}
                  />
                  <Text style={styles.hint}>{t('addListing.thresholdDesc')}</Text>
                </View>
              )}

              {/* ── Step 3 · Preview ── */}
              {step === 3 && (
                <View>
                  {willReview && (
                    <View style={styles.reviewBanner}>
                      <MaterialCommunityIcons name="shield-search" size={16} color={COLORS.yellow} />
                      <Text style={styles.reviewBannerText}>{t('addListing.previewReview')}</Text>
                    </View>
                  )}

                  <Text style={styles.previewSectionLabel}>{t('addListing.previewCard')}</Text>
                  <View style={styles.previewCard}>
                    <View style={styles.previewCardImgWrap}>
                      {form.images[0] ? (
                        <Image source={{ uri: form.images[0] }} style={styles.previewCardImg} />
                      ) : (
                        <View style={styles.previewCardImgEmpty}>
                          <MaterialCommunityIcons name="image-off-outline" size={28} color={COLORS.text2} />
                        </View>
                      )}
                      {form.salePrice && parseFloat(form.salePrice) > 0 && (
                        <View style={styles.previewSaleBadge}>
                          <Text style={styles.previewSaleBadgeText}>{t('addListing.saleBadge')}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.previewPrice}>{formatPrice(effectivePreviewPrice)} G</Text>
                    <Text style={styles.previewName} numberOfLines={2}>
                      {form.name || t('addListing.previewUntitled')}
                    </Text>
                    <View style={styles.previewMetaRow}>
                      {!!selectedCategory && <Text style={styles.previewMeta}>{selectedCategory.name}</Text>}
                      {!!form.condition && (
                        <Text style={styles.previewMeta}>{t(CONDITION_LABEL_KEYS[form.condition])}</Text>
                      )}
                    </View>
                  </View>

                  <Text style={styles.previewSectionLabel}>{t('addListing.previewDetail')}</Text>
                  <View style={styles.previewDetail}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={styles.previewThumbRow}>
                        {form.images.length > 0 ? (
                          form.images.map((uri, i) => (
                            <Image key={`${uri}-${i}`} source={{ uri }} style={styles.previewThumb} />
                          ))
                        ) : (
                          <Text style={styles.hint}>{t('addListing.previewNoPhotos')}</Text>
                        )}
                      </View>
                    </ScrollView>
                    <Text style={styles.previewDetailName}>{form.name || '—'}</Text>
                    <Text style={styles.previewDetailPrice}>
                      {formatPrice(effectivePreviewPrice)} G
                      {!!form.salePrice && parseFloat(form.salePrice) > 0 && !form.hasVariants ? (
                        <Text style={styles.previewOriginalPrice}>  {formatPrice(Number(form.price))} G</Text>
                      ) : null}
                    </Text>
                    {!!form.condition && (
                      <View style={styles.previewTag}>
                        <Text style={styles.previewTagText}>{t(CONDITION_LABEL_KEYS[form.condition])}</Text>
                      </View>
                    )}
                    {!!form.description && (
                      <Text style={styles.previewBody} numberOfLines={5}>
                        {form.description}
                      </Text>
                    )}
                    {!!form.flawNotes.trim() && (
                      <View style={styles.previewFlaws}>
                        <Text style={styles.previewFlawsLabel}>{t('addListing.flawsLabel')}</Text>
                        <Text style={styles.previewFlawsText} numberOfLines={4}>
                          {form.flawNotes}
                        </Text>
                      </View>
                    )}
                    {form.hasVariants && form.variants.length > 0 && (
                      <View style={styles.previewOptions}>
                        {form.variants.map((v, i) => (
                          <View key={i} style={styles.previewOptionRow}>
                            <Text style={styles.previewOptionLabel}>
                              {Object.values(v.options).join(' · ')}
                            </Text>
                            <Text style={styles.previewOptionMeta}>
                              {formatPrice(parseFloat(v.price) || 0)} G · {t('addListing.vStock')}{' '}
                              {v.stock || 0}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {!form.hasVariants && (
                      <Text style={styles.previewStock}>
                        {t('addListing.previewStock', { count: parseInt(form.stock, 10) || 0 })}
                      </Text>
                    )}
                    <View style={styles.previewMetaRow}>
                      <Text style={styles.previewMeta}>
                        {form.meetupEnabled === false ? '✕ ' : '✓ '}
                        {t('addListing.fulfillMeetup')}
                      </Text>
                      <Text style={styles.previewMeta}>
                        {form.deliveryEnabled === false ? '✕ ' : '✓ '}
                        {t('addListing.fulfillDelivery')}
                      </Text>
                      <Text style={styles.previewMeta}>
                        {form.offersEnabled ? t('addListing.offersLabel') : t('addListing.offersOff')}
                      </Text>
                    </View>
                  </View>

                  {/* APP-Q541: sellers confirm they may use the listing material */}
                  <TouchableOpacity
                    style={styles.toggleRow}
                    onPress={() => setField('rightsConfirmed', !form.rightsConfirmed)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: form.rightsConfirmed }}
                  >
                    <MaterialCommunityIcons
                      name={form.rightsConfirmed ? 'checkbox-marked' : 'checkbox-blank-outline'}
                      size={20}
                      color={form.rightsConfirmed ? COLORS.coral : COLORS.text2}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.toggleText}>{t('addListing.rightsLabel')}</Text>
                      <Text style={styles.hint}>{t('addListing.rightsHint')}</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>

            {/* Bottom action bar */}
            <View style={styles.bottomBar}>
              <View style={styles.dotsRow}>
                {[0, 1, 2, 3].map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      i === step && styles.dotActive,
                      i < step && styles.dotDone,
                    ]}
                  />
                ))}
              </View>
              {saveStatus !== 'idle' && saveStatus !== 'saved' ? saveChip : null}
              <TouchableOpacity
                style={[styles.nextBtn, (publishing || loading) && styles.nextBtnOff]}
                onPress={goNext}
                disabled={publishing || loading}
                accessibilityRole="button"
                accessibilityLabel={step === 3 ? t('addListing.publish') : t('addListing.next')}
              >
                {publishing ? (
                  <ActivityIndicator color={COLORS.white} size="small" />
                ) : (
                  <>
                    <Text style={styles.nextBtnText}>
                      {step === 3
                        ? willReview
                          ? t('addListing.sendReview')
                          : t('addListing.publish')
                        : t('addListing.next')}
                    </Text>
                    <MaterialCommunityIcons
                      name={step === 3 ? 'send' : 'arrow-right'}
                      size={16}
                      color={COLORS.white}
                    />
                  </>
                )}
              </TouchableOpacity>
            </View>

            {saveStatus === 'saved' && <View style={styles.savedStrip}>{saveChip}</View>}

            {/* Camera / library chooser */}
            <ConfirmModal
              visible={uploadReview !== null}
              title={t('addListing.mobileDataUploadTitle')}
              message={uploadReview?.unknown
                ? t('addListing.mobileDataUploadUnknownMessage', { size: formatUploadSize(uploadReview.bytes), count: uploadReview.unknown })
                : t('addListing.mobileDataUploadMessage', { size: formatUploadSize(uploadReview?.bytes ?? 0) })}
              confirmLabel={t('addListing.uploadOnMobileData')}
              cancelLabel={t('addListing.waitForWifi')}
              kind="info"
              onCancel={() => {
                setUploadReview(null);
                void flushSave();
              }}
              onConfirm={() => {
                setUploadReview(null);
                void handlePublish(true);
              }}
            />
            <Modal
              visible={showPickerSheet}
              transparent
              animationType="fade"
              onRequestClose={() => setShowPickerSheet(false)}
            >
              <Pressable style={styles.sheetBackdrop} onPress={() => setShowPickerSheet(false)}>
                <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
                  <Text style={styles.sheetTitle}>{t('addListing.addPhoto')}</Text>
                  <TouchableOpacity
                    style={styles.sheetOption}
                    onPress={takePhoto}
                    accessibilityRole="button"
                  >
                    <MaterialCommunityIcons name="camera-outline" size={22} color={COLORS.coral} />
                    <Text style={styles.sheetOptionText}>{t('addListing.takePhoto')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.sheetOption}
                    onPress={pickFromLibrary}
                    accessibilityRole="button"
                  >
                    <MaterialCommunityIcons name="image-multiple-outline" size={22} color={COLORS.coral} />
                    <Text style={styles.sheetOptionText}>{t('addListing.chooseLibrary')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.sheetCancel}
                    onPress={() => setShowPickerSheet(false)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.sheetCancelText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                </Pressable>
              </Pressable>
            </Modal>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: 40 },
  centerBlock: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  /* Header helpers */
  saveChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  saveChipText: { fontSize: 11, color: COLORS.text2, fontWeight: '600' },

  /* Walls & success */
  wallWrap: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 10 },
  wallIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.surface,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  wallTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  wallBody: { fontSize: 13, color: COLORS.text2, textAlign: 'center', lineHeight: 19 },
  wallPrimaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14,
    paddingHorizontal: 24, paddingVertical: 13, backgroundColor: COLORS.coral,
    borderRadius: RADIUS.button, minWidth: 200, justifyContent: 'center',
  },
  wallPrimaryText: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  wallSecondaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4,
    paddingHorizontal: 24, paddingVertical: 12, backgroundColor: COLORS.surface,
    borderRadius: RADIUS.button, borderWidth: 1, borderColor: COLORS.border, minWidth: 200, justifyContent: 'center',
  },
  wallSecondaryText: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  wallGhostBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12 },
  wallGhostText: { fontSize: 13, fontWeight: '600', color: COLORS.text },

  /* Cap banner */
  capBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10,
    backgroundColor: COLORS.yellow + '10', borderRadius: RADIUS.row,
    borderWidth: 1, borderColor: COLORS.yellow + '30', marginBottom: 12,
  },
  capBannerText: { flex: 1, fontSize: 12, color: COLORS.yellow, fontWeight: '600' },
  capBannerLink: { fontSize: 12, color: COLORS.coral, fontWeight: '800' },

  /* Step chrome */
  stepTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  stepHint: { fontSize: 12.5, color: COLORS.text2, lineHeight: 18, marginBottom: 16 },

  /* Photos */
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoTile: { aspectRatio: 1, borderRadius: RADIUS.row, overflow: 'hidden', backgroundColor: COLORS.surface2 },
  photoImg: { width: '100%', height: '100%' },
  photoAdd: {
    borderWidth: 1.5, borderColor: COLORS.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  photoAddText: { fontSize: 11, color: COLORS.text2, fontWeight: '600' },
  coverBadge: {
    position: 'absolute', top: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: COLORS.coral, paddingHorizontal: 7, paddingVertical: 3, borderRadius: RADIUS.pill,
  },
  coverBadgeText: { fontSize: 9, color: COLORS.white, fontWeight: '800' },
  photoRemove: { position: 'absolute', top: -6, right: -6, backgroundColor: COLORS.bg, borderRadius: 12, zIndex: 2 },
  photoOrderRow: {
    position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row',
    justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.45)', paddingVertical: 2,
  },
  photoOrderBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  photoOrderBtnOff: { opacity: 0.3 },
  photosCount: { fontSize: 11, color: COLORS.text2, marginTop: 10, fontWeight: '600' },

  /* Fields */
  fieldLabel: {
    fontSize: 11, color: COLORS.text2, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.5, marginTop: 14, marginBottom: 7,
  },
  labelMuted: { color: COLORS.text2, fontWeight: '500', textTransform: 'none', letterSpacing: 0 },
  input: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.row, padding: 12, color: COLORS.text, fontSize: 14, marginBottom: 4,
  },
  inputFlat: {
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.sm, padding: 10, color: COLORS.text, fontSize: 13,
  },
  textArea: { minHeight: 84, textAlignVertical: 'top', fontSize: 13 },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  chipSmall: { paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { backgroundColor: COLORS.coral, borderColor: COLORS.coral },
  chipText: { fontSize: 12.5, color: COLORS.text2, fontWeight: '600' },
  chipTextOn: { color: COLORS.white, fontWeight: '700' },

  hint: { fontSize: 12, color: COLORS.text2, lineHeight: 17, marginBottom: 6 },

  /* Toggles */
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.row, paddingHorizontal: 12, marginBottom: 8,
  },
  toggleText: { fontSize: 13.5, color: COLORS.text, fontWeight: '600' },

  /* Net preview */
  netPreview: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.row, padding: 12, marginBottom: 8,
  },
  netPreviewRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  netPreviewLabel: { fontSize: 12, color: COLORS.text2 },
  netPreviewValue: { fontSize: 12, fontWeight: '600', color: COLORS.text2 },
  netPreviewTotal: {
    marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: COLORS.border, marginBottom: 0,
  },
  netPreviewTotalLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  netPreviewTotalValue: { fontSize: 13, fontWeight: '800', color: COLORS.green },

  /* Variants */
  dimCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.row, padding: 10, marginBottom: 8, gap: 8,
  },
  dimInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dimAddBtn: {
    paddingHorizontal: 14, paddingVertical: 10, backgroundColor: COLORS.coral,
    borderRadius: RADIUS.sm, minHeight: 40, justifyContent: 'center',
  },
  dimAddText: { fontSize: 12.5, color: COLORS.white, fontWeight: '700' },
  variantCount: { fontSize: 11.5, color: COLORS.text2, fontWeight: '700', marginBottom: 6 },
  variantCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.row, padding: 10, marginBottom: 8, gap: 8,
  },
  variantLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  variantInputsRow: { flexDirection: 'row', gap: 8 },
  variantField: { flex: 1 },
  variantFieldLabel: {
    fontSize: 9.5, color: COLORS.text2, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.4, marginBottom: 4,
  },

  /* Preview */
  reviewBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12,
    backgroundColor: COLORS.yellow + '12', borderRadius: RADIUS.row,
    borderWidth: 1, borderColor: COLORS.yellow + '40', marginBottom: 14,
  },
  reviewBannerText: { flex: 1, fontSize: 12.5, color: COLORS.yellow, fontWeight: '600', lineHeight: 17 },
  previewSectionLabel: {
    fontSize: 11, color: COLORS.text2, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 8,
  },
  previewCard: {
    width: 200, backgroundColor: COLORS.surface, borderRadius: RADIUS.card || RADIUS.row,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', marginBottom: 18, padding: 8,
  },
  previewCardImgWrap: { width: '100%', aspectRatio: 1, borderRadius: RADIUS.sm, overflow: 'hidden', backgroundColor: COLORS.surface2 },
  previewCardImg: { width: '100%', height: '100%' },
  previewCardImgEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  previewSaleBadge: {
    position: 'absolute', top: 6, left: 6, backgroundColor: COLORS.coral,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill,
  },
  previewSaleBadgeText: { fontSize: 9, color: COLORS.white, fontWeight: '800' },
  previewPrice: { fontSize: 14, fontWeight: '800', color: COLORS.text, marginTop: 8 },
  previewName: { fontSize: 12.5, color: COLORS.text, marginTop: 2, fontWeight: '600' },
  previewMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  previewMeta: { fontSize: 11, color: COLORS.text2, fontWeight: '600' },
  previewDetail: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.row, borderWidth: 1,
    borderColor: COLORS.border, padding: 12, gap: 8,
  },
  previewThumbRow: { flexDirection: 'row', gap: 6 },
  previewThumb: { width: 56, height: 56, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface2 },
  previewDetailName: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  previewDetailPrice: { fontSize: 15, fontWeight: '800', color: COLORS.coral },
  previewOriginalPrice: { fontSize: 12, color: COLORS.text2, textDecorationLine: 'line-through', fontWeight: '600' },
  previewTag: {
    alignSelf: 'flex-start', backgroundColor: COLORS.surface2, borderWidth: 1,
    borderColor: COLORS.border, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill,
  },
  previewTagText: { fontSize: 11, color: COLORS.text, fontWeight: '700' },
  previewBody: { fontSize: 13, color: COLORS.text2, lineHeight: 19 },
  previewFlaws: { backgroundColor: COLORS.yellow + '10', borderRadius: RADIUS.sm, padding: 8, gap: 2 },
  previewFlawsLabel: { fontSize: 10, fontWeight: '800', color: COLORS.yellow, textTransform: 'uppercase', letterSpacing: 0.5 },
  previewFlawsText: { fontSize: 12, color: COLORS.text2, lineHeight: 17 },
  previewOptions: { gap: 4 },
  previewOptionRow: { flexDirection: 'row', justifyContent: 'space-between' },
  previewOptionLabel: { fontSize: 12.5, color: COLORS.text, fontWeight: '600' },
  previewOptionMeta: { fontSize: 12, color: COLORS.text2 },
  previewStock: { fontSize: 12, color: COLORS.text2, fontWeight: '600' },

  /* Bottom bar */
  bottomBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: SPACING.md, paddingTop: 10,
    paddingBottom: Math.max(SPACING.md, 14),
    borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.bg,
  },
  dotsRow: { flexDirection: 'row', gap: 6, flex: 1 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.border },
  dotActive: { backgroundColor: COLORS.coral, width: 18 },
  dotDone: { backgroundColor: COLORS.coral + '70' },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.coral,
    paddingHorizontal: 22, paddingVertical: 13, borderRadius: RADIUS.button, minHeight: 46,
  },
  nextBtnOff: { opacity: 0.6 },
  nextBtnText: { fontSize: 14, color: COLORS.white, fontWeight: '800' },
  savedStrip: { position: 'absolute', bottom: 74, alignSelf: 'center', opacity: 0.9 },

  /* Sheet */
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 32, gap: 6,
  },
  sheetTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  sheetOption: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.row, paddingHorizontal: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  sheetOptionText: { fontSize: 14.5, fontWeight: '700', color: COLORS.text },
  sheetCancel: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  sheetCancelText: { fontSize: 14, fontWeight: '700', color: COLORS.text2 },
});
