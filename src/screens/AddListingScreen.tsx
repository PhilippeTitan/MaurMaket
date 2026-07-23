import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, Image, KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Icon } from '../components/icons/Icon';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, RADIUS, formatPrice } from '../theme';
import { useTranslation } from '../i18n';
import { createProduct, getCategories, uploadImage, getSellerProducts } from '../api';
import { store } from '../store';
import type { Category } from '../types';
import type { RootStackParamList } from '../navigation';
import ScreenHeader from '../components/ScreenHeader';
import SaleSection from '../components/SaleSection';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const MAX_IMAGES = 8;
const THUMB_SIZE = 80;

export default function AddListingScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
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
  const [showSale, setShowSale] = useState(false);
  const [salePrice, setSalePrice] = useState('');
  const [saleEndDate, setSaleEndDate] = useState('');
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
    if (parseInt(stock, 10) < 1) {
      Alert.alert(t('addListing.missingInfo'), 'Stock must be at least 1');
      return;
    }

    setLoading(true);
    try {
      const uploadedUrls: string[] = [];
      if (imageUris.length > 0) {
        setUploading(true);
        for (let i = 0; i < imageUris.length; i++) {
          try {
            const r = await uploadImage(imageUris[i]);
            if (r.url) uploadedUrls.push(r.url);
          } catch (e: any) {
            Alert.alert(t('common.error'), `Image ${i + 1} failed: ${e.message}`);
            setLoading(false);
            setUploading(false);
            return;
          }
        }
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

      if (showSale && salePrice && saleEndDate) {
        const origP = parseFloat(price);
        const saleP = parseFloat(salePrice);
        if (saleP >= origP) {
          Alert.alert(t('common.error'), 'Sale price must be lower than the original price');
          setLoading(false); setUploading(false); return;
        }
        const discountPct = Math.round((1 - saleP / origP) * 100);
        if (discountPct > 25) {
          Alert.alert(t('common.error'), 'Maximum discount is 25%');
          setLoading(false); setUploading(false); return;
        }
        productData.sale_price = saleP;
        productData.sale_ends_at = new Date(saleEndDate).toISOString();
      }

      await createProduct(productData);
      Alert.alert(t('addListing.success'), t('addListing.created'));
      nav.goBack();
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
      <ScreenHeader title={t('addListing.title')} onBack={() => nav.goBack()} />

      {atListingLimit ? (
        <View style={styles.limitBlock}>
          <View style={styles.limitIcon}>
            <Icon name="package" size={40} color={COLORS.text2} />
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
            accessibilityRole="button"
            accessibilityLabel="upgrade to verified"
          >
            <MaterialCommunityIcons name="shield-check-outline" size={18} color={COLORS.white} />
            <Text style={styles.upgradeBtnText}>{t('addListing.upgradeToVerified')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {isCasualSeller && listingCount !== null && (
            <View style={styles.limitBanner}>
              <Icon name="info" size={16} color={COLORS.yellow} />
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
                <TouchableOpacity style={styles.thumbRemove} onPress={() => removeImage(idx)} accessibilityRole="button" accessibilityLabel="remove image">
                  <Icon name="close-circle" size={20} color={COLORS.coral} />
                </TouchableOpacity>
              </View>
            ))}
            {imageUris.length < MAX_IMAGES && (
              <TouchableOpacity style={styles.addBtn} onPress={pickImages} accessibilityRole="button" accessibilityLabel="add image">
                <Icon name="add-photo" size={28} color={COLORS.text2} />
              </TouchableOpacity>
            )}
          </ScrollView>

          <TextInput style={styles.input} placeholder={t('addListing.productName')} placeholderTextColor={COLORS.text2} value={name} onChangeText={setName} accessibilityLabel="product name" />
          <TextInput style={[styles.input, styles.textArea]} placeholder={t('addListing.description')} placeholderTextColor={COLORS.text2} value={description} onChangeText={setDescription} multiline numberOfLines={3} accessibilityLabel="description" />
          <TextInput style={styles.input} placeholder={t('addListing.price')} placeholderTextColor={COLORS.text2} value={price} onChangeText={setPrice} keyboardType="numeric" accessibilityLabel="price" />

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

          <TextInput style={styles.input} placeholder={t('addListing.quantity')} placeholderTextColor={COLORS.text2} value={stock} onChangeText={setStock} keyboardType="numeric" accessibilityLabel="quantity" />

          <Text style={styles.sectionLabel}>{t('addListing.category')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
            {categories.map(cat => (
              <TouchableOpacity
                key={cat.id}
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
            style={[styles.submitBtn, (loading || uploading) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading || uploading}
            accessibilityRole="button"
            accessibilityLabel="publish listing"
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
  sectionLabel: { fontSize: 11, color: COLORS.text2, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: SPACING.md, marginTop: 8, marginBottom: 6 },
  catScroll: { paddingHorizontal: SPACING.md, marginBottom: 12 },
  catPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.pill, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginRight: 8 },
  catPillActive: { backgroundColor: COLORS.coral, borderColor: COLORS.coral },
  catPillText: { fontSize: 12, color: COLORS.text2 },
  catPillTextActive: { color: COLORS.white, fontWeight: '700' },
  submitBtn: { marginHorizontal: SPACING.md, backgroundColor: COLORS.coral, borderRadius: RADIUS.button, padding: 14, alignItems: 'center', marginTop: 8 },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { fontSize: 14, color: COLORS.white, fontWeight: '700' },

  /* Listing Limit */
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
  limitBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: SPACING.md, marginBottom: 10, padding: 10,
    backgroundColor: COLORS.yellow + '10', borderRadius: RADIUS.row,
    borderWidth: 1, borderColor: COLORS.yellow + '30',
  },
  limitBannerText: { fontSize: 12, color: COLORS.yellow, fontWeight: '600' },
  saleToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: SPACING.md, marginBottom: 8, padding: 12,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.row,
  },
  saleToggleText: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  saleSection: { marginHorizontal: SPACING.md, marginBottom: 8, gap: 4 },
  saleHint: { fontSize: 12, color: '#00E5A0', fontWeight: '600', paddingHorizontal: 4 },
});