import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, Platform, Modal,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SPACING, RADIUS } from '../theme';
import { useTranslation } from '../i18n';
import { getMyPromos, createPromo, togglePromo } from '../api';
import type { PromoCode } from '../types';
import ScreenHeader from '../components/ScreenHeader';

const DISCOUNT_TYPES = ['percentage', 'fixed'] as const;

function generateCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const part = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${part()}-${part()}`;
}

function formatTimeLeft(validUntil: string | null): string {
  if (!validUntil) return 'No expiry';
  const diff = new Date(validUntil).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days > 0) return `Expires in ${days}d`;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  return `Expires in ${hours}h`;
}

export default function PromoManagementScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  // Create form state
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [validUntil, setValidUntil] = useState('');

  const fetchPromos = useCallback(async () => {
    try {
      const res = await getMyPromos() as { promos: PromoCode[] };
      setPromos(res.promos || []);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchPromos(); }, [fetchPromos]);

  const handleCreate = async () => {
    if (!code || !discountValue) {
      Alert.alert(t('common.error'), 'Code and discount value are required');
      return;
    }
    const dv = parseFloat(discountValue);
    if (isNaN(dv) || dv <= 0) {
      Alert.alert(t('common.error'), 'Discount value must be positive');
      return;
    }
    if (discountType === 'percentage' && dv > 25) {
      Alert.alert(t('common.error'), 'Maximum percentage discount is 25%');
      return;
    }

    setCreating(true);
    try {
      const data: Record<string, unknown> = {
        code: code.toUpperCase(),
        discountType,
        discountValue: dv,
      };
      if (minOrder) data.minOrderAmount = parseFloat(minOrder);
      if (maxUses) data.maxUses = parseInt(maxUses, 10);
      if (validUntil) data.validUntil = new Date(validUntil).toISOString();

      await createPromo(data);
      Alert.alert('Success', `Promo code ${code.toUpperCase()} created`);
      setShowCreate(false);
      setCode(''); setDiscountValue(''); setMinOrder(''); setMaxUses(''); setValidUntil('');
      fetchPromos();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    }
    setCreating(false);
  };

  const handleToggle = async (promo: PromoCode) => {
    try {
      await togglePromo(promo.id);
      fetchPromos();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    }
  };

  const activePromos = promos.filter(p => p.is_active && (!p.valid_until || new Date(p.valid_until) > new Date()));
  const inactivePromos = promos.filter(p => !p.is_active || (p.valid_until && new Date(p.valid_until) <= new Date()));

  const renderPromoCard = (promo: PromoCode) => {
    const isExpired = promo.valid_until ? new Date(promo.valid_until) <= new Date() : false;
    const discountLabel = promo.discount_type === 'percentage' ? `${promo.discount_value}% off` : `Rs ${promo.discount_value} off`;

    return (
      <View key={promo.id} style={styles.promoCard}>
        <View style={styles.promoHeader}>
          <Text style={styles.promoCode}>{promo.code}</Text>
          <View style={[styles.statusBadge, isExpired ? styles.expiredBadge : promo.is_active ? styles.activeBadge : styles.pausedBadge]}>
            <Text style={[styles.statusText, isExpired ? styles.expiredText : promo.is_active ? styles.activeText : styles.pausedText]}>
              {isExpired ? 'Expired' : promo.is_active ? 'Active' : 'Paused'}
            </Text>
          </View>
        </View>

        <Text style={styles.promoDiscount}>{discountLabel}{promo.min_order_amount ? ` · Min Rs ${promo.min_order_amount}` : ''}</Text>
        <Text style={styles.promoMeta}>
          {promo.uses_count} uses{promo.max_uses ? `/${promo.max_uses}` : ''} · {formatTimeLeft(promo.valid_until)}
        </Text>

        <TouchableOpacity style={styles.toggleBtn} onPress={() => handleToggle(promo)}>
          <MaterialCommunityIcons name={promo.is_active ? 'pause' : 'play'} size={14} color={promo.is_active ? COLORS.yellow : COLORS.green} />
          <Text style={[styles.toggleBtnText, { color: promo.is_active ? COLORS.yellow : COLORS.green }]}>
            {promo.is_active ? 'Pause' : 'Reactivate'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.coral} /></View>;
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ScreenHeader title="Promotions" onBack={() => nav.goBack()} />

        {activePromos.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>ACTIVE ({activePromos.length})</Text>
            {activePromos.map(renderPromoCard)}
          </>
        )}

        {inactivePromos.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>EXPIRED / PAUSED ({inactivePromos.length})</Text>
            {inactivePromos.map(renderPromoCard)}
          </>
        )}

        {promos.length === 0 && (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="tag-outline" size={40} color={COLORS.text2} />
            <Text style={styles.emptyText}>No promo codes yet</Text>
            <Text style={styles.emptyHint}>Create your first promo code to attract buyers</Text>
          </View>
        )}
      </ScrollView>

      {/* Create button */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
        <TouchableOpacity style={styles.createBtn} onPress={() => setShowCreate(true)}>
          <MaterialCommunityIcons name="plus" size={18} color={COLORS.white} />
          <Text style={styles.createBtnText}>Create Promo Code</Text>
        </TouchableOpacity>
      </View>

      {/* Create modal */}
      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowCreate(false)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Create Promo Code</Text>
              <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={styles.fieldLabel}>Code</Text>
              <View style={styles.codeRow}>
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="XKMP-2B7N" placeholderTextColor={COLORS.text2} value={code} onChangeText={setCode} autoCapitalize="characters" />
                <TouchableOpacity style={styles.generateBtn} onPress={() => setCode(generateCode())}>
                  <MaterialCommunityIcons name="dice-5-outline" size={20} color={COLORS.coral} />
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>Discount Type</Text>
              <View style={styles.typeRow}>
                {DISCOUNT_TYPES.map(dt => (
                  <TouchableOpacity key={dt} style={[styles.typeBtn, discountType === dt && styles.typeBtnActive]} onPress={() => setDiscountType(dt)}>
                    <Text style={[styles.typeBtnText, discountType === dt && styles.typeBtnTextActive]}>{dt === 'percentage' ? '%' : 'Rs'}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Discount Value</Text>
              <TextInput style={styles.input} placeholder={discountType === 'percentage' ? '10' : '100'} placeholderTextColor={COLORS.text2} value={discountValue} onChangeText={setDiscountValue} keyboardType="numeric" />

              <Text style={styles.fieldLabel}>Minimum order (optional)</Text>
              <TextInput style={styles.input} placeholder="Rs 500" placeholderTextColor={COLORS.text2} value={minOrder} onChangeText={setMinOrder} keyboardType="numeric" />

              <Text style={styles.fieldLabel}>Max uses (optional)</Text>
              <TextInput style={styles.input} placeholder="100" placeholderTextColor={COLORS.text2} value={maxUses} onChangeText={setMaxUses} keyboardType="numeric" />

              <Text style={styles.fieldLabel}>Expires (optional, YYYY-MM-DD)</Text>
              <TextInput style={styles.input} placeholder="2026-12-31" placeholderTextColor={COLORS.text2} value={validUntil} onChangeText={setValidUntil} />

              <TouchableOpacity style={[styles.submitBtn, creating && { opacity: 0.5 }]} onPress={handleCreate} disabled={creating}>
                {creating ? <ActivityIndicator color={COLORS.white} /> : (
                  <Text style={styles.submitBtnText}>Create Code</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingBottom: 100 },
  loading: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.text2,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginHorizontal: SPACING.lg, marginTop: 20, marginBottom: 8,
  },

  promoCard: {
    marginHorizontal: SPACING.lg, marginBottom: 10,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.card, padding: 14,
  },
  promoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  promoCode: { fontSize: 16, fontWeight: '800', color: COLORS.text, fontFamily: 'monospace' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  activeBadge: { backgroundColor: 'rgba(0,229,160,0.15)' },
  pausedBadge: { backgroundColor: 'rgba(239,159,39,0.15)' },
  expiredBadge: { backgroundColor: 'rgba(139,148,158,0.15)' },
  statusText: { fontSize: 11, fontWeight: '600' },
  activeText: { color: '#00E5A0' },
  pausedText: { color: '#EF9F27' },
  expiredText: { color: '#8B949E' },

  promoDiscount: { fontSize: 13, color: COLORS.text, fontWeight: '600', marginBottom: 2 },
  promoMeta: { fontSize: 12, color: COLORS.text2, marginBottom: 8 },

  toggleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8,
    backgroundColor: COLORS.surface2, alignSelf: 'flex-start',
  },
  toggleBtnText: { fontSize: 12, fontWeight: '600' },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  emptyHint: { fontSize: 13, color: COLORS.text2 },

  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: SPACING.md, backgroundColor: COLORS.bg,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.coral, borderRadius: RADIUS.button, padding: 14,
  },
  createBtnText: { fontSize: 14, color: COLORS.white, fontWeight: '700' },

  /* Modal */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  modalScroll: { padding: SPACING.md, paddingBottom: 40 },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: COLORS.text2, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.row, padding: 12, color: COLORS.text, fontSize: 14,
  },
  codeRow: { flexDirection: 'row', gap: 8 },
  generateBtn: {
    width: 48, height: 48, borderRadius: RADIUS.row, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center',
  },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeBtn: {
    flex: 1, padding: 12, borderRadius: RADIUS.row, borderWidth: 1,
    borderColor: COLORS.border, backgroundColor: COLORS.surface, alignItems: 'center',
  },
  typeBtnActive: { backgroundColor: COLORS.coral, borderColor: COLORS.coral },
  typeBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.text2 },
  typeBtnTextActive: { color: COLORS.white },

  submitBtn: {
    marginTop: 20, backgroundColor: COLORS.coral, borderRadius: RADIUS.button,
    padding: 14, alignItems: 'center',
  },
  submitBtnText: { fontSize: 14, color: COLORS.white, fontWeight: '700' },
});
