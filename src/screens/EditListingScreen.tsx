import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Icon } from '../components/icons/Icon';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, RADIUS, formatPrice } from '../theme';
import { useTranslation } from '../i18n';
import { useToast } from '../components/Toast';
import { getProduct, updateProduct, deleteProduct, getCategories, uploadImage, getImageUrl } from '../api';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import type { Category, ProductImage } from '../types';
import { store } from '../store';
import ScreenHeader from '../components/ScreenHeader';
import SaleSection from '../components/SaleSection';
import { SkeletonBlock } from '../components/Skeleton';

type Props = NativeStackScreenProps<RootStackParamList, 'EditListing'>;

const MAX_IMAGES = 8;
const THUMB_SIZE = 80;

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
  const [salePrice, setSalePrice] = useState('');
  const [saleEndDate, setSaleEndDate] = useState('');
  const [currentlyOnSale, setCurrentlyOnSale] = useState(false);

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
        if (p.sale_price) {
          setShowSale(true);
          setSalePrice(String(p.sale_price));
          setCurrentlyOnSale(p.is_on_sale || false);
        }
        if (p.sale_ends_at) {
          setSaleEndDate(p.sale_ends_at.split('T')[0]);
        }
      } catch {
        toast.error(t('common.error'), t('editListing.loadError'));
        navigation.goBack();
      }
      setLoading(false);
    })();
  }, [productId]);

  const totalImages = existingImages.filter(i => !removedExistingImageIds.includes(i.id)).length + newImageUris.length;

  const pickImages = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.warning(t('editListing.permission'), t('editListing.allowPhotos'));
      return;
    }
    const remaining = MAX_IMAGES - totalImages;
    if (remaining <= 0) {
      toast.warning('Max images', `Maximum ${MAX_IMAGES} images allowed`);
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
    setRemovedExistingImageIds(prev => [...prev, id]);
  };

  const handleSave = async () => {
    if (!name || !price) {
      toast.error(t('editListing.missingInfo'), t('editListing.fillFields'));
      return;
    }
    if (parseInt(stock, 10) < 1) {
      toast.error(t('editListing.missingInfo'), 'Stock must be at least 1');
      return;
    }
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 100) {
      toast.error(t('editListing.missingInfo'), 'Minimum price is 100 G');
      return;
    }
    if (priceNum > 99999) {
      toast.error(t('editListing.missingInfo'), 'Maximum price is 99,999 G');
      return;
    }
    setSaving(true);
    try {
      const uploadedUrls: string[] = [];
      if (newImageUris.length > 0) {
        setUploading(true);
        for (let i = 0; i < newImageUris.length; i++) {
          try {
            const r = await uploadImage(newImageUris[i]);
            if (r.url) uploadedUrls.push(r.url);
          } catch (e: any) {
            toast.error(t('common.error'), `Image ${i + 1} failed: ${e.message}`);
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
      const allImageUrls = [...keptExisting, ...uploadedUrls];
      const data: Record<string, unknown> = {
        name,
        description,
        price: parseFloat(price),
        stock: parseInt(stock, 10) || 1,
        isAvailable,
      };
      if (categoryId) data.categoryId = categoryId;
      if (allImageUrls.length > 0) data.images = allImageUrls;

      if (showSale && salePrice && saleEndDate) {
        const origP = parseFloat(price);
        const saleP = parseFloat(salePrice);
        if (saleP >= origP) {
          toast.error(t('common.error'), 'Sale price must be lower than the original price');
          setSaving(false); setUploading(false); return;
        }
        const discountPct = Math.round((1 - saleP / origP) * 100);
        if (discountPct > 25) {
          toast.error(t('common.error'), 'Maximum discount is 25%');
          setSaving(false); setUploading(false); return;
        }
        data.sale_price = saleP;
        data.sale_ends_at = new Date(saleEndDate).toISOString();
      } else {
        data.clearSale = true;
      }

      await updateProduct(productId, data);
      toast.success(t('editListing.saved'), t('editListing.productUpdated'));
      navigation.goBack();
    } catch (e: any) {
            toast.error(t('common.error'), e.message);
    }
    setSaving(false);
  };

  const handleDelete = () => {
    const doDelete = async () => {
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
    if (Platform.OS === 'web') {
      if (window.confirm(t('editListing.deleteConfirm'))) doDelete();
    } else {
      toast.show({
        kind: 'warning',
        title: t('editListing.deleteTitle'),
        message: t('editListing.deleteConfirm'),
        actionLabel: t('common.delete'),
        onAction: doDelete,
      });
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

  if (store.user?.seller_tier === 'casual') {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <ScreenHeader title={t('editListing.title')} onBack={() => navigation.goBack()} />
        <View style={styles.limitBlock}>
          <View style={styles.limitIcon}>
            <MaterialCommunityIcons name="shield-lock-outline" size={40} color={COLORS.coral} />
          </View>
          <Text style={styles.limitTitle}>Verification Required</Text>
          <Text style={styles.limitHint}>
            You need to verify your identity before editing products on MaurMaket. This helps keep our marketplace safe and trustworthy.
          </Text>
          <TouchableOpacity
            style={styles.upgradeBtn}
            onPress={() => { navigation.navigate('Settings'); }}
            accessibilityRole="button"
            accessibilityLabel="go to verification settings"
          >
            <MaterialCommunityIcons name="shield-check-outline" size={18} color={COLORS.white} />
            <Text style={styles.upgradeBtnText}>Go to Settings</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
    <ScreenHeader title={t('editListing.title')} onBack={() => navigation.goBack()} />
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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

      <TextInput style={styles.input} placeholder={t('editListing.productName')} placeholderTextColor={COLORS.text2} value={name} onChangeText={setName} accessibilityLabel="product name" />
      <TextInput style={[styles.input, styles.textArea]} placeholder={t('editListing.description')} placeholderTextColor={COLORS.text2} value={description} onChangeText={setDescription} multiline numberOfLines={3} accessibilityLabel="description" />
      <TextInput style={styles.input} placeholder={`${t('editListing.price')} (100-99,999 G)`} placeholderTextColor={COLORS.text2} value={price} onChangeText={(v) => { const num = v.replace(/[^0-9]/g, ''); if (!num || Number(num) <= 99999) setPrice(num); }} keyboardType="numeric" accessibilityLabel="price" maxLength={5} />

      {price && Number(price) >= 100 && (() => {
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
              <Text style={styles.netPreviewTotalLabel}>You receive</Text>
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

      <TextInput style={styles.input} placeholder={t('editListing.quantity')} placeholderTextColor={COLORS.text2} value={stock} onChangeText={setStock} keyboardType="numeric" accessibilityLabel="quantity" />

      <TouchableOpacity
        style={styles.toggleRow}
        onPress={() => setIsAvailable(!isAvailable)}
        accessibilityRole="button"
        accessibilityLabel="available"
        accessibilityState={{ checked: isAvailable }}
      >
        <MaterialCommunityIcons
          name={isAvailable ? 'checkbox-marked' : 'checkbox-blank-outline'}
          size={20}
          color={isAvailable ? COLORS.green : COLORS.text2}
        />
        <Text style={styles.toggleText}>{t('editListing.available')}</Text>
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
        onPress={handleSave}
        disabled={saving}
        accessibilityRole="button"
        accessibilityLabel="save changes"
      >
        {saving ? <ActivityIndicator color={COLORS.white} /> : (
          <Text style={styles.saveBtnText}>{t('editListing.saveChanges')}</Text>
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
    </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  editSkeletonHeader: { height: 62, paddingHorizontal: SPACING.lg, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: COLORS.surface },
  editSkeleton: { padding: SPACING.lg, gap: SPACING.md },
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingBottom: 60 },
  loading: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' },

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
  netPreview: { marginHorizontal: SPACING.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.row, padding: 12, marginBottom: 8 },
  netPreviewRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  netPreviewLabel: { fontSize: 12, color: COLORS.text2 },
  netPreviewValue: { fontSize: 12, fontWeight: '600', color: COLORS.text2 },
  netPreviewTotal: { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: COLORS.border + '60', marginBottom: 0 },
  netPreviewTotalLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  netPreviewTotalValue: { fontSize: 13, fontWeight: '800', color: COLORS.green },
  netPreviewTip: { fontSize: 11, color: COLORS.coral, marginTop: 6, fontStyle: 'italic' },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: SPACING.md, marginBottom: 8,
  },
  toggleText: { fontSize: 13, color: COLORS.text },
  sectionLabel: { fontSize: 11, color: COLORS.text2, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: SPACING.md, marginTop: 8, marginBottom: 6 },
  catScroll: { paddingHorizontal: SPACING.md, marginBottom: 12 },
  catPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.media, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginRight: 8 },
  catPillActive: { backgroundColor: COLORS.coral, borderColor: COLORS.coral },
  catPillText: { fontSize: 12, color: COLORS.text2 },
  catPillTextActive: { color: COLORS.white, fontWeight: '700' },
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
  saleSection: { marginHorizontal: SPACING.md, marginBottom: 8, gap: 4 },
  saleHint: { fontSize: 12, color: '#00E5A0', fontWeight: '600', paddingHorizontal: 4 },
  limitBlock: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20, gap: 8 },
  limitIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  limitTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  limitHint: { fontSize: 13, color: COLORS.text2, textAlign: 'center', lineHeight: 18 },
  upgradeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 12, paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: COLORS.green, borderRadius: RADIUS.button,
  },
  upgradeBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.white },
});
