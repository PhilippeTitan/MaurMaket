import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, Image, KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING } from '../theme';
import { useTranslation } from '../i18n';
import { getProduct, updateProduct, deleteProduct, getCategories, uploadImage, getImageUrl } from '../api';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import type { Category, ProductImage } from '../types';

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
        stock: parseInt(stock, 10) || 0,
        isAvailable,
      };
      if (categoryId) data.categoryId = categoryId;
      if (allImageUrls.length > 0) data.images = allImageUrls;
      await updateProduct(productId, data);
      Alert.alert(t('editListing.saved'), t('editListing.productUpdated'));
      navigation.goBack();
    } catch (e: any) {
            Alert.alert(t('common.error'), e.message);
    }
    setSaving(false);
  };

  const handleDelete = () => {
    Alert.alert(t('editListing.deleteTitle'), t('editListing.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive', onPress: async () => {
          setDeleting(true);
          try {
            await deleteProduct(productId);
            Alert.alert(t('editListing.deleted'), t('editListing.productRemoved'));
            navigation.goBack();
          } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
          }
          setDeleting(false);
        },
      },
    ]);
  };

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.coral} /></View>;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.text2} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('editListing.title')}</Text>
        <TouchableOpacity onPress={handleDelete} disabled={deleting}>
          <MaterialCommunityIcons name="delete-outline" size={20} color={COLORS.coral} />
        </TouchableOpacity>
      </View>

      <Text style={styles.imageLabel}>{t('addListing.photos')} ({totalImages}/{MAX_IMAGES})</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageRow}>
        {existingImages
          .filter(i => !removedExistingImageIds.includes(i.id))
          .map(img => (
            <View key={img.id} style={styles.thumbWrap}>
              <Image source={{ uri: getImageUrl(img.image_url) || '' }} style={styles.thumbImg} />
              <TouchableOpacity style={styles.thumbRemove} onPress={() => removeExistingImage(img.id)}>
                <MaterialCommunityIcons name="close-circle" size={20} color={COLORS.coral} />
              </TouchableOpacity>
            </View>
          ))}
        {newImageUris.map((uri, idx) => (
          <View key={`new-${idx}`} style={styles.thumbWrap}>
            <Image source={{ uri }} style={styles.thumbImg} />
            <TouchableOpacity style={styles.thumbRemove} onPress={() => removeNewImage(idx)}>
              <MaterialCommunityIcons name="close-circle" size={20} color={COLORS.coral} />
            </TouchableOpacity>
          </View>
        ))}
        {totalImages < MAX_IMAGES && (
          <TouchableOpacity style={styles.addBtn} onPress={pickImages}>
            <MaterialCommunityIcons name="camera-plus" size={28} color={COLORS.text2} />
          </TouchableOpacity>
        )}
      </ScrollView>

      <TextInput style={styles.input} placeholder={t('editListing.productName')} placeholderTextColor={COLORS.text2} value={name} onChangeText={setName} />
      <TextInput style={[styles.input, styles.textArea]} placeholder={t('editListing.description')} placeholderTextColor={COLORS.text2} value={description} onChangeText={setDescription} multiline numberOfLines={3} />
      <TextInput style={styles.input} placeholder={t('editListing.price')} placeholderTextColor={COLORS.text2} value={price} onChangeText={setPrice} keyboardType="numeric" />
      <TextInput style={styles.input} placeholder={t('editListing.quantity')} placeholderTextColor={COLORS.text2} value={stock} onChangeText={setStock} keyboardType="numeric" />

      <TouchableOpacity
        style={styles.toggleRow}
        onPress={() => setIsAvailable(!isAvailable)}
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
        {categories.map(cat => (
          <TouchableOpacity
            key={cat.id}
            style={[styles.catPill, categoryId === cat.id && styles.catPillActive]}
            onPress={() => setCategoryId(categoryId === cat.id ? null : cat.id)}
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
      >
        {saving ? <ActivityIndicator color={COLORS.white} /> : (
          <Text style={styles.saveBtnText}>{t('editListing.saveChanges')}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.deleteBtn, deleting && { opacity: 0.5 }]}
        onPress={handleDelete}
        disabled={deleting}
      >
        {deleting ? <ActivityIndicator color={COLORS.coral} /> : (
          <Text style={styles.deleteBtnText}>{t('editListing.deleteProduct')}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingBottom: 60 },
  loading: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  title: { fontSize: 16, color: COLORS.text, fontWeight: '700', flex: 1, textAlign: 'center' },
  imageLabel: { fontSize: 11, color: COLORS.text2, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: SPACING.md, marginTop: 12, marginBottom: 6 },
  imageRow: { paddingHorizontal: SPACING.md, marginBottom: 8 },
  thumbWrap: { width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: 8, overflow: 'visible', marginRight: 8, backgroundColor: COLORS.surface2, position: 'relative' },
  thumbImg: { width: '100%', height: '100%', borderRadius: 8 },
  thumbRemove: { position: 'absolute', top: -4, right: -4, backgroundColor: COLORS.bg, borderRadius: 10, zIndex: 1 },
  addBtn: {
    width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: 8, borderWidth: 1,
    borderColor: COLORS.border, borderStyle: 'dashed', alignItems: 'center',
    justifyContent: 'center', backgroundColor: COLORS.surface,
  },
  input: {
    marginHorizontal: SPACING.md, backgroundColor: COLORS.surface, borderWidth: 1,
    borderColor: COLORS.border, borderRadius: 10, padding: 12, color: COLORS.text, fontSize: 13, marginBottom: 8,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: SPACING.md, marginBottom: 8,
  },
  toggleText: { fontSize: 13, color: COLORS.text },
  sectionLabel: { fontSize: 11, color: COLORS.text2, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: SPACING.md, marginTop: 8, marginBottom: 6 },
  catScroll: { paddingHorizontal: SPACING.md, marginBottom: 12 },
  catPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginRight: 8 },
  catPillActive: { backgroundColor: COLORS.coral, borderColor: COLORS.coral },
  catPillText: { fontSize: 12, color: COLORS.text2 },
  catPillTextActive: { color: COLORS.white, fontWeight: '700' },
  saveBtn: {
    marginHorizontal: SPACING.md, backgroundColor: COLORS.coral, borderRadius: 12,
    padding: 14, alignItems: 'center', marginTop: 8,
  },
  saveBtnText: { fontSize: 14, color: COLORS.white, fontWeight: '700' },
  deleteBtn: {
    marginHorizontal: SPACING.md, marginTop: 10, borderRadius: 12,
    padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.coral,
  },
  deleteBtnText: { fontSize: 14, color: COLORS.coral, fontWeight: '600' },
});
