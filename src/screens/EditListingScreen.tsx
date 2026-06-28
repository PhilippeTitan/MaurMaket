import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, Image, KeyboardAvoidingView, Platform,
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
  const [newImageUri, setNewImageUri] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('editListing.permission'), t('editListing.allowPhotos'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setNewImageUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!name || !price) {
      Alert.alert(t('editListing.missingInfo'), t('editListing.fillFields'));
      return;
    }
    setSaving(true);
    try {
      let imageUrl: string | null = null;
      if (newImageUri) {
        const uploadRes = await uploadImage(newImageUri);
        imageUrl = uploadRes.url;
      }
      const data: Record<string, unknown> = {
        name,
        description,
        price: parseFloat(price),
        stock: parseInt(stock, 10) || 0,
        isAvailable,
      };
      if (categoryId) data.categoryId = categoryId;
      if (imageUrl) data.images = [imageUrl];
      await updateProduct(productId, data);
      Alert.alert(t('editListing.saved'), t('editListing.productUpdated'), [
        { text: t('common.ok'), onPress: () => navigation.goBack() },
      ]);
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
            Alert.alert(t('editListing.deleted'), t('editListing.productRemoved'), [
              { text: t('common.ok'), onPress: () => navigation.goBack() },
            ]);
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

      <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
        {newImageUri ? (
          <Image source={{ uri: newImageUri }} style={styles.imagePreview} resizeMode="contain" />
        ) : existingImages.length > 0 ? (
          <Image
            source={{ uri: getImageUrl(existingImages.find(i => i.is_primary)?.image_url || existingImages[0].image_url) || '' }}
            style={styles.imagePreview}
            resizeMode="contain"
          />
        ) : (
          <>
            <MaterialCommunityIcons name="camera-plus" size={32} color={COLORS.text2} />
            <Text style={styles.imageHint}>{t('editListing.changePhoto')}</Text>
          </>
        )}
      </TouchableOpacity>

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
  imagePicker: {
    margin: SPACING.md, height: 160, borderRadius: 12, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 8, overflow: 'hidden',
  },
  imageHint: { fontSize: 12, color: COLORS.text2 },
  imagePreview: { width: '100%', height: '100%', borderRadius: 12 },
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
