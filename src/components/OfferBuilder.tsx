import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, formatPrice } from '../theme';
import { sendOffer, getImageUrl } from '../api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from './Toast';
import { useTranslation } from '../i18n';
import { Icon } from './icons/Icon';

type Item = { id: string; name: string; price: number; image_url?: string | null };

type Props = {
  visible: boolean;
  item: Item | null;
  conversationId: string;
  onClose: () => void;
  onSent: () => void;
};

const PRESET_PERCENTAGES = [10, 20, 30, 40];
const MAX_PRICE = 99999;

export default function OfferBuilder({ visible, item, conversationId, onClose, onSent }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const toast = useToast();
  const [price, setPrice] = useState('');
  const [sending, setSending] = useState(false);

  const listPrice = item?.price || 0;
  const offerPrice = parseFloat(price) || 0;
  const isValid = offerPrice > 0 && offerPrice < listPrice && offerPrice <= MAX_PRICE;
  const discount = listPrice > 0 && offerPrice > 0 ? Math.round(((listPrice - offerPrice) / listPrice) * 100) : 0;

  const applyPreset = (pct: number) => {
    const p = Math.round(listPrice * (1 - pct / 100));
    setPrice(p > 0 ? String(p) : '');
  };

  const handleSend = async () => {
    if (!isValid || !item) return;
    setSending(true);
    try {
      await sendOffer(conversationId, {
        productId: item.id,
        productName: item.name,
        offeredPrice: offerPrice,
        listPrice,
      });
      toast.success('Offer sent', `Your offer of G ${formatPrice(offerPrice)} has been sent.`);
      setPrice('');
      onSent();
    } catch (err: any) {
      toast.error('Offer not sent', err?.message || 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => { setPrice(''); onClose(); };

  if (!item) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} accessibilityLabel="close" accessibilityRole="button" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.md }]}>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Make an offer</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn} accessibilityLabel="close" accessibilityRole="button">
              <MaterialCommunityIcons name="close" size={22} color={COLORS.text2} />
            </TouchableOpacity>
          </View>

          <View style={styles.itemRow}>
            {item.image_url ? (
              <Image source={{ uri: getImageUrl(item.image_url) }} style={styles.itemImage} />
            ) : (
              <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
                <MaterialCommunityIcons name="image-off-outline" size={24} color={COLORS.text2} />
              </View>
            )}
            <View style={styles.itemInfo}>
              <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
              <Text style={styles.listPrice}>Listed: {formatPrice(listPrice)} G</Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>Your offer</Text>
          <View style={styles.priceInputWrap}>
            <Text style={styles.currencySymbol}>G</Text>
            <TextInput
              style={styles.priceInput}
              value={price}
              onChangeText={(t) => { const v = t.replace(/[^0-9.]/g, ''); setPrice(v); }}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={COLORS.text2}
              maxLength={6}
              accessibilityLabel="offer price"
            />
          </View>
          {offerPrice > 0 && (
            <Text style={[styles.discountText, discount > 0 ? styles.discountPositive : styles.discountNegative]}>
              {discount > 0 ? `${discount}% off` : 'Above listed price'}
            </Text>
          )}

          <Text style={styles.sectionLabel}>Quick pick</Text>
          <View style={styles.presets}>
            {PRESET_PERCENTAGES.map((pct) => {
              const p = Math.round(listPrice * (1 - pct / 100));
              return (
                <TouchableOpacity key={pct} style={styles.presetChip} onPress={() => applyPreset(pct)} accessibilityLabel={`${pct} percent off`} accessibilityRole="button">
                  <Text style={styles.presetText}>-{pct}%</Text>
                  <Text style={styles.presetPrice}>{formatPrice(p)} G</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.sendBtn, (!isValid || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!isValid || sending}
            accessibilityLabel={sending ? 'sending offer' : 'send offer'}
            accessibilityRole="button"
          >
            <Icon name="sale-tag" size={18} color={COLORS.white} />
            <Text style={styles.sendBtnText}>{sending ? 'Sending...' : `Send offer — G ${formatPrice(offerPrice || 0)}`}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.sm },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

  itemRow: { flexDirection: 'row', gap: 12, marginBottom: SPACING.md },
  itemImage: { width: 64, height: 64, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface2 },
  itemImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  itemInfo: { flex: 1, justifyContent: 'center' },
  itemName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  listPrice: { fontSize: 13, color: COLORS.text2, marginTop: 4 },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: COLORS.text2, textTransform: 'uppercase', marginBottom: 6 },

  priceInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, marginBottom: 4 },
  currencySymbol: { fontSize: 16, fontWeight: '700', color: COLORS.coral, marginRight: 6 },
  priceInput: { flex: 1, fontSize: 22, fontWeight: '700', color: COLORS.text, paddingVertical: 10 },

  discountText: { fontSize: 12, fontWeight: '600', marginBottom: SPACING.sm },
  discountPositive: { color: COLORS.green },
  discountNegative: { color: COLORS.coral },

  presets: { flexDirection: 'row', gap: 8, marginBottom: SPACING.md },
  presetChip: {
    flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  presetText: { fontSize: 11, fontWeight: '700', color: COLORS.coral },
  presetPrice: { fontSize: 10, color: COLORS.text2, marginTop: 2 },

  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.coral, borderRadius: RADIUS.pill, paddingVertical: 14,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.white },
});
