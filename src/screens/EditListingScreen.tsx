import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, Image, KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, RADIUS, formatPrice } from '../theme';
import { useTranslation } from '../i18n';
import { getProduct, updateProduct, deleteProduct, getCategories, uploadImage, getImageUrl } from '../api';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import type { Category, ProductImage } from '../types';
import ScreenHeader from '../components/ScreenHeader';

type Props = NativeStackScreenProps<RootStackParamList, 'EditListing'>;

const MAX_IMAGES = 8;
const THUMB_SIZE = 80;

export default function EditListingScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
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
        Alert.alert(t('common.error'), t('editListing.loadError'));
        navigation.goBack();
      }
      setLoading(false);
    })();
  }, [productId]);

  const totalImages = existingImages.filter(i => !removedExistingImageIds.includes(i.id)).length + newImageUris.length;

  const pickImages = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('editListing.permission'), t('editListing.allowPhotos'));
      return;
    }
    const remaining = MAX_IMAGES - totalImages;
    if (remaining <= 0) {
      Alert.alert('', `Maximum ${MAX_IMAGES} images allowed`);
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
      Alert.alert(t('editListing.missingInfo'), t('editListing.fillFields'));
      return;
    }
    if (parseInt(stock, 10) < 1) {
      Alert.alert(t('editListing.missingInfo'), 'Stock must be at least 1');
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
            Alert.alert(t('common.error'), `Image ${i + 1} failed: ${e.message}`);
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
          Alert.alert(t('common.error'), 'Sale price must be lower than the original price');
          setSaving(false); setUploading(false); return;
        }
        const discountPct = Math.round((1 - saleP / origP) * 100);
        if (discountPct > 25) {
          Alert.alert(t('common.error'), 'Maximum discount is 25%');
          setSaving(false); setUploading(false); return;
        }
        data.sale_price = saleP;
        data.sale_ends_at = new Date(saleEndDate).toISOString();
      } else {
        data.clearSale = true;
      }

      await updateProduct(productId, data);
      Alert.alert(t('editListing.saved'), t('editListing.productUpdated'));
      navigation.goBack();
    } catch (e: any) {
            Alert.alert(t('common.error'), e.message);
    }
    setSaving(false);
  };

  const handleDelete = () => {
    const doDelete = async () => {
      setDeleting(true);
      try {
        await deleteProduct(productId);
        Alert.alert(t('editListing.deleted'), t('editListing.productRemoved'));
        navigation.goBack();
      } catch (e: any) {
        Alert.alert(t('common.error'), e.message);
      }
      setDeleting(false);
    };
    if (Platform.OS === 'web') {
      if (window.confirm(t('editListing.deleteConfirm'))) doDelete();
    } else {
      Alert.alert(t('editListing.deleteTitle'), t('editListing.deleteConfirm'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.coral} /></View>;
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
                <MaterialCommunityIcons name="close-circle" size={20} color={COLORS.coral} />
              </TouchableOpacity>
            </View>
          ))}
        {newImageUris.map((uri, idx) => (
          <View key={`new-${idx}`} style={styles.thumbWrap}>
            <Image source={{ uri }} style={styles.thumbImg} />
            <TouchableOpacity style={styles.thumbRemove} onPress={() => removeNewImage(idx)} accessibilityRole="button" accessibilityLabel="remove image">
              <MaterialCommunityIcons name="close-circle" size={20} color={COLORS.coral} />
            </TouchableOpacity>
          </View>
        ))}
        {totalImages < MAX_IMAGES && (
          <TouchableOpacity style={styles.addBtn} onPress={pickImages} accessibilityRole="button" accessibilityLabel="add image">
            <MaterialCommunityIcons name="camera-plus" size={28} color={COLORS.text2} />
          </TouchableOpacity>
        )}
      </ScrollView>

      <TextInput style={styles.input} placeholder={t('editListing.productName')} placeholderTextColor={COLORS.text2} value={name} onChangeText={setName} accessibilityRole="text" accessibilityLabel="product name" />
      <TextInput style={[styles.input, styles.textArea]} placeholder={t('editListing.description')} placeholderTextColor={COLORS.text2} value={description} onChangeText={setDescription} multiline numberOfLines={3} accessibilityRole="text" accessibilityLabel="description" />
      <TextInput style={styles.input} placeholder={t('editListing.price')} placeholderTextColor={COLORS.text2} value={price} onChangeText={setPrice} keyboardType="numeric" accessibilityRole="text" accessibilityLabel="price" />

      <TouchableOpacity style={styles.saleToggle} onPress={() => setShowSale(!showSale)} accessibilityRole="button" accessibilityLabel="run a sale" accessibilityState={{ checked: showSale }}>
        <MaterialCommunityIcons name={showSale ? 'checkbox-marked' : 'checkbox-blank-outline'} size={20} color={showSale ? COLORS.coral : COLORS.text2} />
        <Text style={styles.saleToggleText}>{'🏷️ Run a sale'}</Text>
      </TouchableOpacity>

      {showSale && (
        <View style={styles.saleSection}>
          <TextInput style={styles.input} placeholder="Sale price (Rs)" placeholderTextColor={COLORS.text2} value={salePrice} onChangeText={setSalePrice} keyboardType="numeric" accessibilityRole="text" accessibilityLabel="sale price" />
          <TextInput style={styles.input} placeholder="Sale end date (YYYY-MM-DD)" placeholderTextColor={COLORS.text2} value={saleEndDate} onChangeText={setSaleEndDate} accessibilityRole="text" accessibilityLabel="sale end date" />
          {price && salePrice && parseFloat(salePrice) < parseFloat(price) && (
            <Text style={styles.saleHint}>
              -{Math.round((1 - parseFloat(salePrice) / parseFloat(price)) * 100)}% off · Rs {formatPrice(parseFloat(price) - parseFloat(salePrice))} saved
            </Text>
          )}
        </View>
      )}

      <TextInput style={styles.input} placeholder={t('editListing.quantity')} placeholderTextColor={COLORS.text2} value={stock} onChangeText={setStock} keyboardType="numeric" accessibilityRole="text" accessibilityLabel="quantity" />

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
});