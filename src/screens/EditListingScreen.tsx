import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import { Icon } from '../components/icons/Icon';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, RADIUS } from '../theme';
import { useTranslation } from '@/localization';
import { useToast } from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import { reviewCategoryKey } from '../utils/listingReview';
import {
  getProduct, updateProduct, deleteProduct, getCategories, uploadImage, getImageUrl,
  getSellerListingStats, resubmitListing,
} from '../api';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import type { Category, ProductImage } from '../types';
import { store } from '../store';
import ScreenHeader from '../components/ScreenHeader';
import SaleSection from '../components/SaleSection';
import { SkeletonBlock } from '../components/Skeleton';
import { network } from '../network';
import {
  CONDITIONS, MIN_PRICE, MAX_PRICE, MAX_VARIANTS, LISTING_LANGUAGES,
  DEFAULT_LOW_STOCK_THRESHOLD, allowedAttrsForCategory, flawNotesRequired,
  generateVariantCombos, variantComboLabel, dimsFromVariants,
} from '../utils/listingConstants';

type Props = NativeStackScreenProps<RootStackParamList, 'EditListing'>;

const MAX_IMAGES = 8;
const THUMB_SIZE = 80;

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

const EMPTY_DIMS: DimDraft[] = [
  { name: '', values: [] },
  { name: '', values: [] },
];

const comboValueKey = (options: Record<string, string>) =>
  Object.values(options).join('\u0001');

interface EditValidationIssue {
  key: string;
  params?: Record<string, string | number>;
}

function validateEdit(f: {
  name: string; condition: string; flawNotes: string; sku: string;
  hasVariants: boolean; variants: VariantDraft[];
  price: string; stock: string;
  lowStockThreshold: string;
}): EditValidationIssue | null {
  if (!f.name.trim()) return { key: 'addListing.errName' };
  if (f.name.trim().length > 200) return { key: 'addListing.errNameLong' };
  if (!f.condition) return { key: 'addListing.errCondition' };
  if (flawNotesRequired(f.condition) && !f.flawNotes.trim()) return { key: 'addListing.errFlaws' };
  if (f.flawNotes.length > 2000) return { key: 'addListing.errFlawsLong' };
  if (f.sku.length > 60) return { key: 'addListing.errSkuLong' };
  if (f.hasVariants) {
    if (f.variants.length === 0) return { key: 'addListing.errVariantsEmpty' };
    if (f.variants.length > MAX_VARIANTS) {
      return { key: 'addListing.errVariantLimit', params: { max: MAX_VARIANTS } };
    }
    for (const v of f.variants) {
      const p = parseFloat(v.price);
      if (isNaN(p) || p < MIN_PRICE || p > MAX_PRICE) {
        return { key: 'addListing.errVariantPrice', params: { min: MIN_PRICE, max: MAX_PRICE } };
      }
      if (v.stock === '') return { key: 'addListing.errVariantStockMissing' };
      const s = parseInt(v.stock, 10);
      if (isNaN(s) || s < 0) return { key: 'addListing.errVariantStock' };
    }
  } else {
    const p = parseFloat(f.price);
    if (isNaN(p) || p < MIN_PRICE || p > MAX_PRICE) {
      return { key: 'addListing.errPrice', params: { min: MIN_PRICE, max: MAX_PRICE } };
    }
    if (f.stock === '') return { key: 'addListing.errStock' };
    const s = parseInt(f.stock, 10);
    if (isNaN(s) || s < 0) return { key: 'addListing.errStock' };
  }
  if (f.lowStockThreshold !== '') {
    const n = parseInt(f.lowStockThreshold, 10);
    if (isNaN(n) || n < 1 || n > 20) return { key: 'addListing.errThreshold' };
  }
  return null;
}

export default function EditListingScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const { productId } = route.params;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [existingImages, setExistingImages] = useState<ProductImage[]>([]);
  const [newImageUris, setNewImageUris] = useState<string[]>([]);
  const [removedExistingImageIds, setRemovedExistingImageIds] = useState<string[]>([]);
  const [isAvailable, setIsAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showSale, setShowSale] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [salePrice, setSalePrice] = useState('');
  const [saleEndDate, setSaleEndDate] = useState('');

  const [condition, setCondition] = useState('');
  const [flawNotes, setFlawNotes] = useState('');
  const [sku, setSku] = useState('');
  const [offersEnabled, setOffersEnabled] = useState(true);
  const [languageLabel, setLanguageLabel] = useState('');
  const [attrs, setAttrs] = useState<Record<string, string>>({});
  const [meetupEnabled, setMeetupEnabled] = useState<boolean | null>(null);
  const [deliveryEnabled, setDeliveryEnabled] = useState<boolean | null>(null);
  const [lowStockThreshold, setLowStockThreshold] = useState('');
  const [hasVariants, setHasVariants] = useState(false);
  const [variantDims, setVariantDims] = useState<DimDraft[]>(EMPTY_DIMS.map((d) => ({ ...d, values: [] })));
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [dimInputs, setDimInputs] = useState<string[]>(['', '']);
  const [variantsDirty, setVariantsDirty] = useState(false);

  const [locked, setLocked] = useState(false);
  const [listingStatus, setListingStatus] = useState<string>('active');
  const [moderationReason, setModerationReason] = useState<string | null>(null);
  const [moderationCategory, setModerationCategory] = useState<string | null>(null);
  const [moderationDetail, setModerationDetail] = useState<string | null>(null);
  const [pausedReason, setPausedReason] = useState<string | null>(null);
  const [resubmitting, setResubmitting] = useState(false);

  const needsVerification = !store.user?.id_verified;

  useEffect(() => {
    (async () => {
      try {
        const [prodRes, catRes] = await Promise.all([
          getProduct(productId) as Promise<{ product: any }>,
          getCategories() as Promise<{ categories: Category[] }>,
        ]);
        const p = prodRes.product;
        setName(p.name || '');
        setDescription(p.description || '');
        setPrice(String(p.price || ''));
        setStock(String(p.stock ?? ''));
        setCategoryId(p.category_id || null);
        setIsAvailable(p.is_available !== false);
        setExistingImages(p.images || []);
        setCategories(catRes.categories || []);
        setCondition(p.condition || '');
        setFlawNotes(p.flaw_notes || '');
        setSku(p.sku || '');
        setOffersEnabled(p.offers_enabled !== false);
        setLanguageLabel(p.language_label || '');
        setAttrs(p.attrs && typeof p.attrs === 'object' && !Array.isArray(p.attrs) ? p.attrs : {});
        setMeetupEnabled(p.meetup_enabled === undefined ? null : p.meetup_enabled);
        setDeliveryEnabled(p.delivery_enabled === undefined ? null : p.delivery_enabled);
        setLowStockThreshold(
          p.low_stock_threshold === undefined || p.low_stock_threshold === null
            ? ''
            : String(p.low_stock_threshold)
        );
        const vs: VariantDraft[] = Array.isArray(p.variants)
          ? p.variants.map((v: Record<string, any>) => ({
              options: v?.options && typeof v.options === 'object' ? v.options : {},
              price: v?.price === undefined || v?.price === null ? '' : String(v.price),
              stock: v?.stock === undefined || v?.stock === null ? '' : String(v.stock),
              sku: v?.sku ? String(v.sku) : '',
            }))
          : [];
        const effectiveHasVariants = !!p.has_variants && vs.length > 0;
        setHasVariants(effectiveHasVariants);
        setVariants(vs);
        setVariantDims(vs.length > 0 ? dimsFromVariants(vs) : EMPTY_DIMS.map((d) => ({ ...d, values: [] })));
        setListingStatus(p.listing_status || 'active');
        setModerationReason(p.moderation_reason || null);
        setModerationCategory((p as any).moderation_category || null);
        setModerationDetail((p as any).moderation_detail || null);
        setPausedReason((p as any).paused_reason || null);
        if (p.sale_price) {
          setShowSale(true);
          setSalePrice(String(p.sale_price));
        }
        if (p.sale_ends_at) {
          setSaleEndDate(p.sale_ends_at.split('T')[0]);
        }
        getSellerListingStats(productId)
          .then((s: any) => setLocked(!!s?.locked))
          .catch(() => {});
      } catch {
        toast.error(t('common.error'), t('editListing.loadError'));
        navigation.goBack();
      }
      setLoading(false);
    })();
  }, [productId]);

  const totalImages = existingImages.filter(i => !removedExistingImageIds.includes(i.id)).length + newImageUris.length;

  const selectedCategory = categories.find(c => c.id === categoryId);
  const attrKeys = selectedCategory ? allowedAttrsForCategory(selectedCategory.name) : [];

  const pickImages = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.warning(t('editListing.permission'), t('editListing.allowPhotos'));
      return;
    }
    const remaining = MAX_IMAGES - totalImages;
    if (remaining <= 0) {
      toast.warning(t('editListing.permission'), t('addListing.photosLimit', { max: MAX_IMAGES }));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });
    if (!result.canceled) {
      const uris = result.assets.map(a => a.uri).filter(Boolean) as string[];
      setNewImageUris(prev => [...prev, ...uris].slice(0, MAX_IMAGES));
    }
  };

  const removeNewImage = (index: number) => {
    setNewImageUris(prev => prev.filter((_, i) => i !== index));
  };

  const removeExistingImage = (id: string) => {
    if (!id) return;
    setRemovedExistingImageIds(prev => [...prev, id]);
  };

  // ── Variants helpers (mirror of the wizard) ──
  const applyDims = (dims: DimDraft[]) => {
    const combos = generateVariantCombos(dims);
    if (combos.length > MAX_VARIANTS) {
      toast.warning(t('addListing.comboLimitTitle'), t('addListing.comboLimit', { max: MAX_VARIANTS }));
    }
    const limited = combos.slice(0, MAX_VARIANTS);
    const byKey = new Map(variants.map((v) => [comboValueKey(v.options), v] as const));
    const merged: VariantDraft[] = limited.map((c) => {
      const prev = byKey.get(comboValueKey(c.options));
      return prev ? { ...prev, options: c.options } : { options: c.options, price: '', stock: '', sku: '' };
    });
    setVariantsDirty(true);
    setVariantDims(dims);
    setVariants(merged);
  };

  const setDimName = (i: number, dimName: string) => {
    applyDims(variantDims.map((d, idx) => (idx === i ? { ...d, name: dimName } : d)));
  };

  const addDimValue = (i: number) => {
    const raw = (dimInputs[i] || '').trim();
    if (!raw) return;
    const dims = variantDims.map((d, idx) =>
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
      variantDims.map((d, idx) =>
        idx === i ? { ...d, values: d.values.filter((v) => v !== value) } : d
      )
    );
  };

  const updateVariantField = (index: number, key: 'price' | 'stock' | 'sku', value: string) => {
    setVariantsDirty(true);
    setVariants(prev => prev.map((v, i) => (i === index ? { ...v, [key]: value } : v)));
  };

  const toggleVariants = () => {
    if (locked) return;
    const next = !hasVariants;
    setVariantsDirty(true);
    setHasVariants(next);
    if (next) {
      const combos = generateVariantCombos(variantDims);
      const byKey = new Map(variants.map((v) => [comboValueKey(v.options), v] as const));
      setVariants(combos.slice(0, MAX_VARIANTS).map((c) => {
        const prev = byKey.get(comboValueKey(c.options));
        return prev ? { ...prev, options: c.options } : { options: c.options, price: '', stock: '', sku: '' };
      }));
    }
  };

  const handleSave = async (alsoResubmit = false) => {
    if (network.isOffline) {
      toast.error(t('network.offline'), t('editListing.offlineHint'));
      return;
    }
    const issue = validateEdit({
      name, condition, flawNotes, sku, hasVariants, variants,
      price, stock, lowStockThreshold,
    });
    if (issue) {
      toast.warning(t('addListing.missingInfo'), t(issue.key, issue.params));
      return;
    }
    if (alsoResubmit && !categoryId) {
      toast.warning(t('addListing.missingInfo'), t('addListing.errCategory'));
      return;
    }
    if (totalImages === 0) {
      toast.warning(t('addListing.missingInfo'), t('addListing.errNoPhotos'));
      return;
    }
    if (!hasVariants && showSale && salePrice && saleEndDate) {
      const origP = parseFloat(price);
      const saleP = parseFloat(salePrice);
      if (saleP >= origP) {
        toast.error(t('common.error'), t('addListing.errSaleLower'));
        return;
      }
      if (Math.round((1 - saleP / origP) * 100) > 25) {
        toast.error(t('common.error'), t('addListing.errSaleDiscount'));
        return;
      }
    }
    setSaving(true);
    try {
      const uploadedImages: Array<{ url: string; width?: number; height?: number }> = [];
      if (newImageUris.length > 0) {
        setUploading(true);
        for (let i = 0; i < newImageUris.length; i++) {
          try {
            const r = await uploadImage(newImageUris[i]);
            if (r.url) uploadedImages.push({ url: r.url, width: r.width, height: r.height });
          } catch (e: any) {
            toast.error(t('common.error'), e.message);
            setSaving(false);
            setUploading(false);
            return;
          }
        }
        setUploading(false);
      }
      const keptExisting = existingImages
        .filter(i => !removedExistingImageIds.includes(i.id))
        .map(i => i.image_url);
      const allImages = [...keptExisting, ...uploadedImages];
      const data: Record<string, unknown> = {
        name,
        description,
        isAvailable,
        condition,
        flawNotes,
        sku,
        offersEnabled,
        languageLabel,
        attrs,
        meetupEnabled,
        deliveryEnabled,
      };
      if (!hasVariants) {
        data.price = parseFloat(price);
        data.stock = parseInt(stock, 10) || 0;
      }
      data.categoryId = categoryId;
      if (allImages.length > 0) data.images = allImages;
      if (lowStockThreshold !== '') data.lowStockThreshold = lowStockThreshold;
      if (variantsDirty) {
        data.variants = hasVariants
          ? variants.map(v => ({ options: v.options, price: v.price, stock: v.stock, sku: v.sku || null }))
          : [];
      }
      if (!hasVariants && showSale && salePrice && saleEndDate) {
        data.sale_price = parseFloat(salePrice);
        data.sale_ends_at = new Date(saleEndDate).toISOString();
      } else {
        data.clearSale = true;
      }

      const resp = (await updateProduct(productId, data)) as { product?: { listing_status?: string } } | undefined;
      if (alsoResubmit) {
        try {
          await resubmitListing(productId, {});
        } catch (e: any) {
          toast.error(t('common.error'), e.message);
          setSaving(false);
          return;
        }
        toast.success(t('editListing.resubmit'), t('editListing.resubmitted'));
        navigation.goBack();
        return;
      }
      if (resp?.product?.listing_status === 'pending_review') {
        toast.warning(t('editListing.saved'), t('editListing.reviewNotice'));
      } else {
        toast.success(t('editListing.saved'), t('editListing.productUpdated'));
      }
      navigation.goBack();
    } catch (e: any) {
      if (e?.code === 'PRICE_STOCK_LOCKED') {
        setLocked(true);
        toast.warning(t('editListing.lockedTitle'), t('editListing.bannerLocked'));
      } else if (e?.code === 'LISTING_REJECTED' || e?.code === 'LISTING_PENDING') {
        toast.warning(t('common.error'), e.message);
      } else {
        toast.error(t('common.error'), e.message);
      }
    }
    setSaving(false);
  };

  const handleDeleteConfirmed = async () => {
    setDeleting(true);
    try {
      await deleteProduct(productId);
      toast.success(t('editListing.deleted'), t('editListing.productRemoved'));
      navigation.goBack();
    } catch (e: any) {
      toast.error(t('common.error'), e.message);
    }
    setDeleting(false);
  };

  const handleDelete = () => {
    if (network.isOffline) {
      toast.error(t('network.offline'), t('editListing.offlineHint'));
      return;
    }
    if (Platform.OS === 'web') {
      if (window.confirm(t('editListing.deleteConfirm'))) handleDeleteConfirmed();
    } else {
      setShowDeleteModal(true);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.editSkeletonHeader}><SkeletonBlock width={38} height={38} radius={19} /><SkeletonBlock width="34%" height={16} /></View>
        <ScrollView contentContainerStyle={styles.editSkeleton}>
          <SkeletonBlock height={112} radius={RADIUS.card} />
          <SkeletonBlock height={18} width="30%" />
          <SkeletonBlock height={48} radius={RADIUS.row} />
          <SkeletonBlock height={18} width="30%" />
          <SkeletonBlock height={110} radius={RADIUS.row} />
          <SkeletonBlock height={54} radius={RADIUS.button} />
        </ScrollView>
      </View>
    );
  }

  if (needsVerification) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <ScreenHeader title={t('editListing.title')} onBack={() => navigation.goBack()} />
        <ScrollView contentContainerStyle={styles.wallWrap}>
          <View style={styles.wallIcon}>
            <MaterialCommunityIcons name="shield-lock-outline" size={40} color={COLORS.coral} />
          </View>
          <Text style={styles.wallTitle}>{t('addListing.verifyTitle')}</Text>
          <Text style={styles.wallBody}>{t('addListing.verifyBody')}</Text>
          <TouchableOpacity
            style={styles.wallPrimaryBtn}
            onPress={() => navigation.navigate('Verification')}
            accessibilityRole="button"
            accessibilityLabel={t('addListing.verifyCta')}
          >
            <MaterialCommunityIcons name="shield-check-outline" size={18} color={COLORS.white} />
            <Text style={styles.wallPrimaryText}>{t('addListing.verifyCta')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  const statusBlocked = listingStatus !== 'active';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
    <ScreenHeader title={t('editListing.title')} onBack={() => navigation.goBack()} />
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {listingStatus === 'pending_review' && (
        <View style={[styles.banner, styles.bannerPending]}>
          <MaterialCommunityIcons name="shield-search" size={16} color={COLORS.yellow} />
          <Text style={[styles.bannerText, { color: COLORS.yellow }]}>
            {moderationCategory ? t('editListing.bannerPendingReview') : t('editListing.bannerPending')}
          </Text>
        </View>
      )}

      {listingStatus === 'under_review' && (
        <View style={[styles.banner, styles.bannerRejected]}>
          <MaterialCommunityIcons name="shield-search" size={16} color={COLORS.blue} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerText, { color: COLORS.blue }]}>{
              t('editListing.bannerUnderReview', { category: t(reviewCategoryKey(moderationCategory)) })
            }</Text>
            {!!moderationDetail && (
              <Text style={styles.bannerSub}>{t('editListing.underReviewAffected', { detail: moderationDetail })}</Text>
            )}
            <Text style={styles.bannerSub}>
              {!isAvailable && pausedReason === 'content_review'
                ? t('editListing.underReviewRestrictedHidden')
                : t('editListing.underReviewRestrictedVisible')}
            </Text>
            <Text style={styles.bannerSub}>{t('editListing.underReviewResponsePath')}</Text>
          </View>
        </View>
      )}

      {listingStatus === 'rejected' && (
        <View style={[styles.banner, styles.bannerRejected]}>
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color={COLORS.coral} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerText, { color: COLORS.coral }]}>{t('editListing.bannerRejected')}</Text>
            {!!moderationReason && (
              <Text style={styles.bannerSub}>{t('editListing.rejectedReason', { reason: moderationReason })}</Text>
            )}
          </View>
        </View>
      )}

      {listingStatus === 'active' && !isAvailable && (
        <View style={[styles.banner, styles.bannerPaused]}>
          <MaterialCommunityIcons name="pause-circle-outline" size={16} color={COLORS.text2} />
          <Text style={styles.bannerText}>{t('editListing.bannerPaused')}</Text>
        </View>
      )}

      {locked && (
        <View style={[styles.banner, styles.bannerLocked]}>
          <MaterialCommunityIcons name="lock-outline" size={16} color={COLORS.text2} />
          <Text style={styles.bannerText}>{t('editListing.bannerLocked')}</Text>
        </View>
      )}

      <Text style={styles.imageLabel}>{t('addListing.photos')} ({totalImages}/{MAX_IMAGES})</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageRow}>
        {existingImages
          .filter(i => !removedExistingImageIds.includes(i.id))
          .map((img, idx) => (
            <View key={img.id || `existing-${idx}`} style={styles.thumbWrap}>
              <Image source={{ uri: getImageUrl(img.image_url) || '' }} style={styles.thumbImg} />
              <TouchableOpacity style={styles.thumbRemove} onPress={() => removeExistingImage(img.id)} accessibilityRole="button" accessibilityLabel="remove image">
                <Icon name="close-circle" size={20} color={COLORS.coral} />
              </TouchableOpacity>
            </View>
          ))}
        {newImageUris.map((uri, idx) => (
          <View key={`new-${idx}`} style={styles.thumbWrap}>
            <Image source={{ uri }} style={styles.thumbImg} />
            <TouchableOpacity style={styles.thumbRemove} onPress={() => removeNewImage(idx)} accessibilityRole="button" accessibilityLabel="remove image">
              <Icon name="close-circle" size={20} color={COLORS.coral} />
            </TouchableOpacity>
          </View>
        ))}
        {totalImages < MAX_IMAGES && (
          <TouchableOpacity style={styles.addBtn} onPress={pickImages} accessibilityRole="button" accessibilityLabel="add image">
            <Icon name="add-photo" size={28} color={COLORS.text2} />
          </TouchableOpacity>
        )}
      </ScrollView>

      <TextInput style={styles.input} placeholder={t('editListing.productName')} placeholderTextColor={COLORS.text2} value={name} onChangeText={setName} maxLength={200} accessibilityLabel="product name" />
      <TextInput style={[styles.input, styles.textArea]} placeholder={t('editListing.description')} placeholderTextColor={COLORS.text2} value={description} onChangeText={setDescription} multiline numberOfLines={3} maxLength={5000} accessibilityLabel="description" />

      <Text style={styles.fieldLabel}>{t('addListing.condition')}</Text>
      <View style={styles.chipWrap}>
        {CONDITIONS.map((c) => {
          const on = condition === c;
          return (
            <TouchableOpacity
              key={c}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => setCondition(on ? '' : c)}
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

      {!!condition && (
        <View>
          <Text style={styles.fieldLabel}>
            {t('addListing.flawsLabel')}
            {!flawNotesRequired(condition) ? (
              <Text style={styles.labelMuted}> {t('addListing.flawsOptional')}</Text>
            ) : null}
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder={t('addListing.flawsPlaceholder')}
            placeholderTextColor={COLORS.text2}
            value={flawNotes}
            onChangeText={setFlawNotes}
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
          const on = languageLabel === l;
          return (
            <TouchableOpacity
              key={l}
              style={[styles.chip, styles.chipSmall, on && styles.chipOn]}
              onPress={() => setLanguageLabel(on ? '' : l)}
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
              value={attrs[k] || ''}
              onChangeText={(v) => setAttrs(prev => ({ ...prev, [k]: v.slice(0, 100) }))}
              maxLength={100}
              accessibilityLabel={t(`addListing.attr.${k}`)}
            />
          ))}
        </View>
      )}

      {!hasVariants && (
        <>
          <Text style={styles.fieldLabel}>{t('editListing.price')}</Text>
          <TextInput
            style={styles.input}
            placeholder={`${t('editListing.price')} (${MIN_PRICE}-${MAX_PRICE} G)`}
            placeholderTextColor={COLORS.text2}
            value={price}
            onChangeText={(v) => { const num = v.replace(/[^0-9]/g, ''); if (!num || Number(num) <= MAX_PRICE) setPrice(num); }}
            keyboardType="numeric"
            maxLength={5}
            editable={!locked}
            accessibilityLabel="price"
          />
          {locked && <Text style={styles.hint}>{t('editListing.bannerLocked')}</Text>}

          {price && Number(price) >= MIN_PRICE && (() => {
            const tier = store.user?.seller_tier || 'casual';
            const rate = tier === 'business' ? 0.03 : tier === 'verified' ? 0.05 : 0.08;
            const moncash = 0.079;
            const net = Math.round(Number(price) * (1 - rate) * (1 - moncash));
            return (
              <View style={styles.netPreview}>
                <View style={styles.netPreviewRow}>
                  <Text style={styles.netPreviewLabel}>MaurMaket fee ({Math.round(rate * 100)}%)</Text>
                  <Text style={styles.netPreviewValue}>-{Math.round(Number(price) * rate)} G</Text>
                </View>
                <View style={styles.netPreviewRow}>
                  <Text style={styles.netPreviewLabel}>MonCash fee (~7.9%)</Text>
                  <Text style={styles.netPreviewValue}>~-{Math.round(Number(price) * moncash)} G</Text>
                </View>
                <View style={[styles.netPreviewRow, styles.netPreviewTotal]}>
                  <Text style={styles.netPreviewTotalLabel}>{t('addListing.youReceive')}</Text>
                  <Text style={styles.netPreviewTotalValue}>{net} G</Text>
                </View>
                <Text style={styles.netPreviewTip}>Tip: price ~{Math.round((rate + moncash) * 100)}% above your target to cover fees</Text>
              </View>
            );
          })()}

          <TouchableOpacity style={styles.saleToggle} onPress={() => setShowSale(!showSale)} accessibilityRole="button" accessibilityLabel="run a sale" accessibilityState={{ checked: showSale }}>
            <MaterialCommunityIcons name={showSale ? 'checkbox-marked' : 'checkbox-blank-outline'} size={20} color={showSale ? COLORS.coral : COLORS.text2} />
            <Icon name="sale-tag" size={16} color={showSale ? COLORS.coral : COLORS.text2} />
            <Text style={styles.saleToggleText}> Run a sale</Text>
          </TouchableOpacity>

          {showSale && (
            <SaleSection
              originalPrice={price}
              salePrice={salePrice}
              saleEndDate={saleEndDate}
              onSalePriceChange={setSalePrice}
              onSaleEndDateChange={setSaleEndDate}
            />
          )}

          <Text style={styles.fieldLabel}>{t('editListing.quantity')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('editListing.quantity')}
            placeholderTextColor={COLORS.text2}
            value={stock}
            onChangeText={(v) => setStock(v.replace(/[^0-9]/g, ''))}
            keyboardType="numeric"
            editable={!locked}
            accessibilityLabel="quantity"
          />
          <Text style={styles.hint}>{t('editListing.stockHint')}</Text>
        </>
      )}

      {/* Variants */}
      <TouchableOpacity
        style={styles.toggleRow}
        onPress={toggleVariants}
        disabled={locked}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: hasVariants, disabled: locked }}
      >
        <MaterialCommunityIcons
          name={hasVariants ? 'checkbox-marked' : 'checkbox-blank-outline'}
          size={20}
          color={hasVariants ? COLORS.coral : COLORS.text2}
        />
        <Text style={[styles.toggleText, locked && { color: COLORS.text2 }]}>{t('addListing.variantsLabel')}</Text>
      </TouchableOpacity>

      {hasVariants && (
        <View>
          <Text style={styles.hint}>{t('addListing.variantsHint')}</Text>
          {variantDims.map((dim, i) => (
            <View key={`dim-${i}`} style={styles.dimCard}>
              <TextInput
                style={styles.inputFlat}
                placeholder={t('addListing.dimName')}
                placeholderTextColor={COLORS.text2}
                value={dim.name}
                onChangeText={(v) => setDimName(i, v.slice(0, 30))}
                maxLength={30}
                editable={!locked}
              />
              <View style={styles.chipWrap}>
                {dim.values.map((val) => (
                  <TouchableOpacity
                    key={val}
                    style={[styles.chip, styles.chipOn]}
                    onPress={() => removeDimValue(i, val)}
                    disabled={locked}
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
                  editable={!locked}
                  onSubmitEditing={() => addDimValue(i)}
                />
                <TouchableOpacity
                  style={[styles.dimAddBtn, locked && { opacity: 0.4 }]}
                  onPress={() => addDimValue(i)}
                  disabled={locked}
                  accessibilityRole="button"
                >
                  <Text style={styles.dimAddText}>{t('addListing.dimAdd')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {variants.length > 0 && (
            <Text style={styles.variantCount}>
              {t('addListing.comboCount', { count: variants.length })}
            </Text>
          )}
          {variants.map((v, i) => (
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
                    onChangeText={(val) => updateVariantField(i, 'price', val.replace(/[^0-9]/g, ''))}
                    keyboardType="numeric"
                    maxLength={5}
                    editable={!locked}
                  />
                </View>
                <View style={styles.variantField}>
                  <Text style={styles.variantFieldLabel}>{t('addListing.vStock')}</Text>
                  <TextInput
                    style={styles.inputFlat}
                    placeholder="0"
                    placeholderTextColor={COLORS.text2}
                    value={v.stock}
                    onChangeText={(val) => updateVariantField(i, 'stock', val.replace(/[^0-9]/g, ''))}
                    keyboardType="numeric"
                    maxLength={5}
                    editable={!locked}
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
                    editable={!locked}
                  />
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {!hasVariants && (
        <View>
          <Text style={styles.fieldLabel}>{t('addListing.skuLabel')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('addListing.skuHint')}
            placeholderTextColor={COLORS.text2}
            value={sku}
            onChangeText={(v) => setSku(v.slice(0, 60))}
            maxLength={60}
            autoCapitalize="characters"
            accessibilityLabel={t('addListing.skuLabel')}
          />
        </View>
      )}

      <TouchableOpacity
        style={styles.toggleRow}
        onPress={() => setOffersEnabled(!offersEnabled)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: offersEnabled }}
      >
        <MaterialCommunityIcons
          name={offersEnabled ? 'checkbox-marked' : 'checkbox-blank-outline'}
          size={20}
          color={offersEnabled ? COLORS.coral : COLORS.text2}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleText}>{t('addListing.offersLabel')}</Text>
          <Text style={styles.hint}>{t('addListing.offersHint')}</Text>
        </View>
      </TouchableOpacity>

      <Text style={styles.fieldLabel}>{t('addListing.fulfillTitle')}</Text>
      <TouchableOpacity
        style={styles.toggleRow}
        onPress={() => setMeetupEnabled(meetupEnabled === false ? true : false)}
        accessibilityRole="switch"
        accessibilityState={{ checked: meetupEnabled !== false }}
      >
        <MaterialCommunityIcons
          name={meetupEnabled !== false ? 'checkbox-marked' : 'checkbox-blank-outline'}
          size={20}
          color={meetupEnabled !== false ? COLORS.coral : COLORS.text2}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleText}>{t('addListing.fulfillMeetup')}</Text>
          <Text style={styles.hint}>
            {meetupEnabled === null
              ? t('addListing.fulfillInherit')
              : meetupEnabled
              ? t('addListing.fulfillOn')
              : t('addListing.fulfillOff')}
          </Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.toggleRow}
        onPress={() => setDeliveryEnabled(deliveryEnabled === false ? true : false)}
        accessibilityRole="switch"
        accessibilityState={{ checked: deliveryEnabled !== false }}
      >
        <MaterialCommunityIcons
          name={deliveryEnabled !== false ? 'checkbox-marked' : 'checkbox-blank-outline'}
          size={20}
          color={deliveryEnabled !== false ? COLORS.coral : COLORS.text2}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleText}>{t('addListing.fulfillDelivery')}</Text>
          <Text style={styles.hint}>
            {deliveryEnabled === null
              ? t('addListing.fulfillInherit')
              : deliveryEnabled
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
        value={lowStockThreshold}
        onChangeText={(v) => setLowStockThreshold(v.replace(/[^0-9]/g, '').slice(0, 2))}
        keyboardType="numeric"
        maxLength={2}
        accessibilityLabel={t('addListing.thresholdLabel')}
      />
      <Text style={styles.hint}>{t('addListing.thresholdDesc')}</Text>

      <TouchableOpacity
        style={styles.toggleRow}
        onPress={() => statusBlocked ? undefined : setIsAvailable(!isAvailable)}
        disabled={statusBlocked}
        accessibilityRole="button"
        accessibilityLabel="available"
        accessibilityState={{ checked: isAvailable, disabled: statusBlocked }}
      >
        <MaterialCommunityIcons
          name={isAvailable ? 'checkbox-marked' : 'checkbox-blank-outline'}
          size={20}
          color={statusBlocked ? COLORS.text2 : isAvailable ? COLORS.green : COLORS.text2}
        />
        <Text style={[styles.toggleText, statusBlocked && { color: COLORS.text2 }]}>{t('editListing.available')}</Text>
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>{t('editListing.category')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
        {categories.map((cat, idx) => (
          <TouchableOpacity
            key={cat.id || `cat-${idx}`}
            style={[styles.catPill, categoryId === cat.id && styles.catPillActive]}
            onPress={() => setCategoryId(categoryId === cat.id ? null : cat.id)}
            accessibilityRole="button"
            accessibilityLabel={cat.name.toLowerCase()}
            accessibilityState={{ selected: categoryId === cat.id }}
          >
            <Text style={[styles.catPillText, categoryId === cat.id && styles.catPillTextActive]}>
              {cat.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity
        style={[styles.saveBtn, saving && { opacity: 0.5 }]}
        onPress={() => handleSave(listingStatus === 'rejected' || listingStatus === 'under_review')}
        disabled={saving || resubmitting}
        accessibilityRole="button"
        accessibilityLabel={listingStatus === 'rejected' || listingStatus === 'under_review' ? t('editListing.saveResubmit') : t('editListing.saveChanges')}
      >
        {saving || resubmitting ? <ActivityIndicator color={COLORS.white} /> : (
          <Text style={styles.saveBtnText}>
            {listingStatus === 'rejected' || listingStatus === 'under_review' ? t('editListing.saveResubmit') : t('editListing.saveChanges')}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.deleteBtn, deleting && { opacity: 0.5 }]}
        onPress={handleDelete}
        disabled={deleting}
        accessibilityRole="button"
        accessibilityLabel="delete product"
      >
        {deleting ? <ActivityIndicator color={COLORS.coral} /> : (
          <Text style={styles.deleteBtnText}>{t('editListing.deleteProduct')}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>

    <ConfirmModal
      visible={showDeleteModal}
      title={t('editListing.deleteTitle')}
      message={t('editListing.deleteConfirm')}
      confirmLabel={t('common.delete')}
      cancelLabel={t('common.cancel')}
      kind="danger"
      onConfirm={() => {
        setShowDeleteModal(false);
        handleDeleteConfirmed();
      }}
      onCancel={() => setShowDeleteModal(false)}
    />
    </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  editSkeletonHeader: { height: 62, paddingHorizontal: SPACING.lg, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: COLORS.surface },
  editSkeleton: { padding: SPACING.lg, gap: SPACING.md },
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingBottom: 60 },

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

  banner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10,
    marginHorizontal: SPACING.md, marginTop: 10, borderRadius: RADIUS.row,
    borderWidth: 1,
  },
  bannerPending: { backgroundColor: COLORS.yellow + '10', borderColor: COLORS.yellow + '40' },
  bannerRejected: { backgroundColor: COLORS.coral + '10', borderColor: COLORS.coral + '40' },
  bannerPaused: { backgroundColor: COLORS.surface, borderColor: COLORS.border },
  bannerLocked: { backgroundColor: COLORS.surface, borderColor: COLORS.border },
  bannerText: { flex: 1, fontSize: 12.5, color: COLORS.text, fontWeight: '600', lineHeight: 17 },
  bannerSub: { fontSize: 11.5, color: COLORS.text2, marginTop: 3, lineHeight: 16 },

  imageLabel: { fontSize: 11, color: COLORS.text2, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: SPACING.md, marginTop: 12, marginBottom: 6 },
  imageRow: { paddingHorizontal: SPACING.md, marginBottom: 8, paddingTop: 6 },
  thumbWrap: { width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: RADIUS.row, overflow: 'visible', marginRight: 8, backgroundColor: COLORS.surface2, position: 'relative' },
  thumbImg: { width: '100%', height: '100%', borderRadius: RADIUS.row },
  thumbRemove: { position: 'absolute', top: -4, right: -4, backgroundColor: COLORS.bg, borderRadius: RADIUS.row, zIndex: 1 },
  addBtn: {
    width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: RADIUS.row, borderWidth: 1,
    borderColor: COLORS.border, borderStyle: 'dashed', alignItems: 'center',
    justifyContent: 'center', backgroundColor: COLORS.surface,
  },
  input: {
    marginHorizontal: SPACING.md, backgroundColor: COLORS.surface, borderWidth: 1,
    borderColor: COLORS.border, borderRadius: RADIUS.row, padding: 12, color: COLORS.text, fontSize: 13, marginBottom: 8,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  inputFlat: {
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.sm, padding: 10, color: COLORS.text, fontSize: 13,
  },

  fieldLabel: {
    fontSize: 11, color: COLORS.text2, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.5, marginTop: 14, marginBottom: 7, paddingHorizontal: SPACING.md,
  },
  labelMuted: { color: COLORS.text2, fontWeight: '500', textTransform: 'none', letterSpacing: 0 },
  hint: { fontSize: 12, color: COLORS.text2, lineHeight: 17, marginBottom: 6, paddingHorizontal: SPACING.md },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4, paddingHorizontal: SPACING.md },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  chipSmall: { paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { backgroundColor: COLORS.coral, borderColor: COLORS.coral },
  chipText: { fontSize: 12.5, color: COLORS.text2, fontWeight: '600' },
  chipTextOn: { color: COLORS.white, fontWeight: '700' },

  netPreview: { marginHorizontal: SPACING.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.row, padding: 12, marginBottom: 8 },
  netPreviewRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  netPreviewLabel: { fontSize: 12, color: COLORS.text2 },
  netPreviewValue: { fontSize: 12, fontWeight: '600', color: COLORS.text2 },
  netPreviewTotal: { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: COLORS.border, marginBottom: 0 },
  netPreviewTotalLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  netPreviewTotalValue: { fontSize: 13, fontWeight: '800', color: COLORS.green },
  netPreviewTip: { fontSize: 11, color: COLORS.coral, marginTop: 6, fontStyle: 'italic' },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.row, paddingHorizontal: 12, marginBottom: 8,
    marginHorizontal: SPACING.md,
  },
  toggleText: { fontSize: 13.5, color: COLORS.text, fontWeight: '600' },
  sectionLabel: { fontSize: 11, color: COLORS.text2, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: SPACING.md, marginTop: 8, marginBottom: 6 },
  catScroll: { paddingHorizontal: SPACING.md, marginBottom: 12 },
  catPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.media, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginRight: 8 },
  catPillActive: { backgroundColor: COLORS.coral, borderColor: COLORS.coral },
  catPillText: { fontSize: 12, color: COLORS.text2 },
  catPillTextActive: { color: COLORS.white, fontWeight: '700' },

  dimCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.row, padding: 10, marginBottom: 8, gap: 8,
    marginHorizontal: SPACING.md,
  },
  dimInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dimAddBtn: {
    paddingHorizontal: 14, paddingVertical: 10, backgroundColor: COLORS.coral,
    borderRadius: RADIUS.sm, minHeight: 40, justifyContent: 'center',
  },
  dimAddText: { fontSize: 12.5, color: COLORS.white, fontWeight: '700' },
  variantCount: { fontSize: 11.5, color: COLORS.text2, fontWeight: '700', marginBottom: 6, paddingHorizontal: SPACING.md },
  variantCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.row, padding: 10, marginBottom: 8, gap: 8,
    marginHorizontal: SPACING.md,
  },
  variantLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  variantInputsRow: { flexDirection: 'row', gap: 8 },
  variantField: { flex: 1 },
  variantFieldLabel: {
    fontSize: 9.5, color: COLORS.text2, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.4, marginBottom: 4,
  },

  saveBtn: {
    marginHorizontal: SPACING.md, backgroundColor: COLORS.coral, borderRadius: RADIUS.button,
    padding: 14, alignItems: 'center', marginTop: 8,
  },
  saveBtnText: { fontSize: 14, color: COLORS.white, fontWeight: '700' },
  deleteBtn: {
    marginHorizontal: SPACING.md, marginTop: 10, borderRadius: RADIUS.button,
    padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.coral,
  },
  deleteBtnText: { fontSize: 14, color: COLORS.coral, fontWeight: '600' },
  saleToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: SPACING.md, marginBottom: 8, padding: 12,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.row,
  },
  saleToggleText: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
});
