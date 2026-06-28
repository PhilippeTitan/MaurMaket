import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, Image, KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '../theme';
import { useTranslation } from '../i18n';
import { createProduct, getCategories, uploadImage, getSellerProducts } from '../api';
import { store } from '../store';
import type { Category } from '../types';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const MAX_IMAGES = 8;
const THUMB_SIZE = 80;

export default function AddListingScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('1');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listingCount, setListingCount] = useState<number | null>(null);
  const isCasualSeller = store.user?.seller_tier === 'casual';
  const atListingLimit = isCasualSeller && listingCount !== null && listingCount >= 10;

  useEffect(() => {
    if (!store.isSeller) {
      nav.goBack();
      return;
    }
    (async () => {
      try {
        const res = await getCategories() as { categories: Category[] };
        setCategories(res.categories || []);
      } catch { /* silent */ }
      if (isCasualSeller) {
        try {
          const prods = await getSellerProducts() as { products?: unknown[] };
          setListingCount(prods.products?.length || 0);
        } catch { /* silent */ }
      }
    })();
  }, []);

  const pickImages = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('addListing.permission'), t('addListing.allowPhotos'));
      return;
    }
    const remaining = MAX_IMAGES - imageUris.length;
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
      setImageUris(prev => [...prev, ...uris].slice(0, MAX_IMAGES));
    }
  };

  const removeImage = (index: number) => {
    setImageUris(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!name || !price) {
      Alert.alert(t('addListing.missingInfo'), t('addListing.fillFields'));
      return;
    }

    setLoading(true);
    try {
      const uploadedUrls: string[] = [];
      if (imageUris.length > 0) {
        setUploading(true);
        const results = await Promise.all(imageUris.map(uri => uploadImage(uri)));
        results.forEach(r => { if (r.url) uploadedUrls.push(r.url); });
        setUploading(false);
      }

      const productData: Record<string, unknown> = {
        name,
        description,
        price: parseFloat(price),
        stock: parseInt(stock, 10) || 1,
      };
      if (categoryId) productData.categoryId = categoryId;
      if (uploadedUrls.length > 0) productData.images = uploadedUrls;

      await createProduct(productData);
      Alert.alert(t('addListing.success'), t('addListing.created'), [
        { text: t('common.ok'), onPress: () => nav.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.topBar, { paddingTop: insets.top + SPACING.sm }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => nav.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('addListing.title')}</Text>
      </View>

      {atListingLimit ? (
        <View style={styles.limitBlock}>
          <View style={styles.limitIcon}>
            <MaterialCommunityIcons name="package-variant" size={40} color={COLORS.text2} />
          </View>
          <Text style={styles.limitTitle}>{t('addListing.listingLimit')}</Text>
          <Text style={styles.limitHint}>
            {t('addListing.casualLimit', { count: listingCount })}
          </Text>
          <Text style={styles.limitHint}>
            {t('addListing.upgradeHint')}
          </Text>
          <TouchableOpacity
            style={styles.upgradeBtn}
            onPress={() => { nav.navigate('SellerOnboarding'); }}
          >
            <MaterialCommunityIcons name="shield-check-outline" size={18} color={COLORS.white} />
            <Text style={styles.upgradeBtnText}>{t('addListing.upgradeToVerified')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {isCasualSeller && listingCount !== null && (
            <View style={styles.limitBanner}>
              <MaterialCommunityIcons name="information-outline" size={16} color={COLORS.yellow} />
              <Text style={styles.limitBannerText}>
                {t('addListing.listingsUsed', { count: listingCount })}
              </Text>
            </View>
          )}

          <Text style={styles.imageLabel}>{t('addListing.photos')} ({imageUris.length}/{MAX_IMAGES})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageRow}>
            {imageUris.map((uri, idx) => (
              <View key={idx} style={styles.thumbWrap}>
                <Image source={{ uri }} style={styles.thumbImg} />
                <TouchableOpacity style={styles.thumbRemove} onPress={() => removeImage(idx)}>
                  <MaterialCommunityIcons name="close-circle" size={20} color={COLORS.coral} />
                </TouchableOpacity>
              </View>
            ))}
            {imageUris.length < MAX_IMAGES && (
              <TouchableOpacity style={styles.addBtn} onPress={pickImages}>
                <MaterialCommunityIcons name="camera-plus" size={28} color={COLORS.text2} />
              </TouchableOpacity>
            )}
          </ScrollView>

          <TextInput style={styles.input} placeholder={t('addListing.productName')} placeholderTextColor={COLORS.text2} value={name} onChangeText={setName} />
          <TextInput style={[styles.input, styles.textArea]} placeholder={t('addListing.description')} placeholderTextColor={COLORS.text2} value={description} onChangeText={setDescription} multiline numberOfLines={3} />
          <TextInput style={styles.input} placeholder={t('addListing.price')} placeholderTextColor={COLORS.text2} value={price} onChangeText={setPrice} keyboardType="numeric" />
          <TextInput style={styles.input} placeholder={t('addListing.quantity')} placeholderTextColor={COLORS.text2} value={stock} onChangeText={setStock} keyboardType="numeric" />

          <Text style={styles.sectionLabel}>{t('addListing.category')}</Text>
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
            style={[styles.submitBtn, (loading || uploading) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading || uploading}
          >
            {loading || uploading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.submitText}>{t('addListing.publish')}</Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingBottom: 40 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 16, color: COLORS.text, fontWeight: '700' },
  imageLabel: { fontSize: 11, color: COLORS.text2, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: SPACING.md, marginTop: 12, marginBottom: 6 },
  imageRow: { paddingHorizontal: SPACING.md, marginBottom: 8 },
  thumbWrap: { width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: 8, overflow: 'hidden', marginRight: 8, backgroundColor: COLORS.surface2 },
  thumbImg: { width: '100%', height: '100%' },
  thumbRemove: { position: 'absolute', top: -6, right: -6, backgroundColor: COLORS.bg, borderRadius: 10 },
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
  sectionLabel: { fontSize: 11, color: COLORS.text2, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: SPACING.md, marginTop: 8, marginBottom: 6 },
  catScroll: { paddingHorizontal: SPACING.md, marginBottom: 12 },
  catPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginRight: 8 },
  catPillActive: { backgroundColor: COLORS.coral, borderColor: COLORS.coral },
  catPillText: { fontSize: 12, color: COLORS.text2 },
  catPillTextActive: { color: COLORS.white, fontWeight: '700' },
  submitBtn: { marginHorizontal: SPACING.md, backgroundColor: COLORS.coral, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 8 },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { fontSize: 14, color: COLORS.white, fontWeight: '700' },

  /* Listing Limit */
  limitBlock: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20, gap: 8 },
  limitIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  limitTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  limitHint: { fontSize: 13, color: COLORS.text2, textAlign: 'center', lineHeight: 18 },
  upgradeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 12, paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: COLORS.green, borderRadius: 12,
  },
  upgradeBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  limitBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: SPACING.md, marginBottom: 10, padding: 10,
    backgroundColor: COLORS.yellow + '10', borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.yellow + '30',
  },
  limitBannerText: { fontSize: 12, color: COLORS.yellow, fontWeight: '600' },
});
