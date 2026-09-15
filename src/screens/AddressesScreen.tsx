import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert, TextInput, Modal,
  KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS, TOUCH } from '../theme';
import { useTranslation } from '../i18n';
import { getAddresses, createAddress, updateAddress, deleteAddress } from '../api';
import type { Address } from '../types';
import type { RootStackParamList } from '../navigation';
import ScreenHeader from '../components/ScreenHeader';
import EmptyState from '../components/EmptyState';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const EMPTY_FORM = { label: '', name: '', phone: '', address: '', city: '' };

const ADDRESSES_CACHE_TTL = 60_000;
let _addressesCache: { data: any; timestamp: number } | null = null;

export default function AddressesScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const listAnim = useRef(new Animated.Value(0)).current;

  const fetchData = useCallback(async (force = false) => {
    if (!force && _addressesCache && Date.now() - _addressesCache.timestamp < ADDRESSES_CACHE_TTL) {
      setAddresses(_addressesCache.data.addresses);
      setLoading(false);
      return;
    }
    try {
      const res = await getAddresses() as { addresses: Address[] };
      const addresses = res.addresses || [];
      setAddresses(addresses);
      _addressesCache = { timestamp: Date.now(), data: { addresses } };
    } catch { Alert.alert(t('common.error'), t('addresses.loadFailed')); }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    fetchData();
    Animated.timing(listAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, []));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData(true);
    setRefreshing(false);
  }, []);

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  };

  const openEdit = (addr: Address) => {
    setEditingId(addr.id);
    setForm({ label: addr.label, name: addr.name, phone: addr.phone, address: addr.address, city: addr.city });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!form.label.trim() || !form.name.trim() || !form.address.trim()) {
      Alert.alert(t('addresses.required'), t('addresses.requiredFields'));
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        const res = await updateAddress(editingId, form) as { address: Address };
        setAddresses(prev => prev.map(a => a.id === editingId ? res.address : a));
      } else {
        const res = await createAddress(form) as { address: Address };
        setAddresses(prev => [...prev, res.address]);
      }
      setModalVisible(false);
    } catch (err: unknown) {
      Alert.alert(t('common.error'), err instanceof Error ? err.message : t('common.error'));
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    Alert.alert(t('addresses.deleteTitle'), t('addresses.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: async () => {
        try {
          await deleteAddress(id);
          setAddresses(prev => prev.filter(a => a.id !== id));
    } catch { Alert.alert(t('common.error'), t('addresses.deleteFailed')); }
      }},
    ]);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t('addresses.title')}
        onBack={() => nav.goBack()}
        right={
          <TouchableOpacity
            onPress={openAdd}
            accessibilityLabel="add address"
            accessibilityRole="button"
            style={styles.addButton}
          >
            <MaterialCommunityIcons name="plus" size={20} color={COLORS.coral} />
          </TouchableOpacity>
        }
      />

      <Animated.View style={{ flex: 1, opacity: listAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) }}>
        <FlatList
          data={addresses}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={[styles.addressCard, index === 0 && styles.addressCardFirst]}
              activeOpacity={0.7}
              onPress={() => openEdit(item)}
            >
              <View style={styles.cardIcon}>
                <MaterialCommunityIcons
                  name={item.is_default ? 'home-map-marker' : 'map-marker-outline'}
                  size={20}
                  color={item.is_default ? COLORS.coral : COLORS.text2}
                />
              </View>
              <View style={styles.cardContent}>
                <View style={styles.cardTopRow}>
                  <Text style={styles.cardLabel}>{item.label}</Text>
                  {item.is_default ? (
                    <View style={styles.defaultBadge}>
                      <Text style={styles.defaultBadgeText}>Default</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.cardName}>{item.name} · {item.phone}</Text>
                <Text style={styles.cardAddress} numberOfLines={2}>
                  {item.address}, {item.city}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDelete(item.id)}
                accessibilityLabel="delete address"
                accessibilityRole="button"
              >
                <MaterialCommunityIcons name="trash-can-outline" size={18} color={COLORS.coral} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.coral} />}
          ListEmptyComponent={
            !refreshing ? (
              <EmptyState
                icon="map-marker-outline"
                title={t('addresses.empty')}
                actionLabel={t('addresses.addFirst')}
                onAction={openAdd}
                size={56}
              />
            ) : null
          }
        />
      </Animated.View>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              {/* Handle bar */}
              <View style={styles.modalHandle} />

              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingId ? t('addresses.editAddress') : t('addresses.addAddress')}
                </Text>
                <TouchableOpacity
                  style={styles.modalClose}
                  onPress={() => setModalVisible(false)}
                  accessibilityLabel="close modal"
                  accessibilityRole="button"
                >
                  <MaterialCommunityIcons name="close" size={20} color={COLORS.text2} />
                </TouchableOpacity>
              </View>

              <View style={styles.modalFields}>
                {[
                  { key: 'label', placeholder: t('addresses.label'), icon: 'tag-outline' },
                  { key: 'name', placeholder: t('addresses.fullName'), icon: 'account-outline' },
                  { key: 'phone', placeholder: t('addresses.phone'), icon: 'phone-outline', keyboard: 'phone-pad' as const },
                  { key: 'address', placeholder: t('addresses.address'), icon: 'map-marker-outline' },
                  { key: 'city', placeholder: t('addresses.city'), icon: 'city-variant-outline' },
                ].map((field, i) => (
                  <View key={field.key}>
                    <View style={styles.modalInputRow}>
                      <MaterialCommunityIcons name={field.icon as any} size={18} color={COLORS.text3} />
                      <TextInput
                        style={styles.modalInput}
                        placeholder={field.placeholder}
                        placeholderTextColor={COLORS.text3}
                        value={(form as any)[field.key]}
                        onChangeText={v => setForm(p => ({ ...p, [field.key]: v }))}
                        keyboardType={field.keyboard}
                        accessibilityLabel={field.key}
                      />
                    </View>
                    {i < 4 ? <View style={styles.modalDivider} /> : null}
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.modalSaveBtn, saving && { opacity: 0.5 }]}
                onPress={handleSave}
                disabled={saving}
                accessibilityLabel="save address"
                accessibilityRole="button"
              >
                {saving ? (
                  <Text style={styles.modalSaveText}>{t('addresses.saving')}</Text>
                ) : (
                  <Text style={styles.modalSaveText}>{t('addresses.saveAddress')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  addButton: {
    width: TOUCH.min,
    height: TOUCH.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { padding: SPACING.lg, paddingBottom: SPACING.page },

  /* Address cards */
  addressCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
    gap: SPACING.md,
  },
  addressCardFirst: { marginTop: 0 },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: { flex: 1 },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: 4,
  },
  cardLabel: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  defaultBadge: {
    backgroundColor: COLORS.coralMuted,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  defaultBadgeText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.coral,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  cardName: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text2,
    marginBottom: 2,
  },
  cardAddress: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text3,
    lineHeight: 18,
  },
  deleteButton: {
    width: TOUCH.min,
    height: TOUCH.min,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -SPACING.xs,
  },

  /* Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.text3,
    alignSelf: 'center',
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  modalTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
  },
  modalClose: {
    width: TOUCH.min,
    height: TOUCH.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalFields: {
    paddingHorizontal: SPACING.lg,
    gap: 0,
  },
  modalInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    minHeight: 52,
  },
  modalInput: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    paddingVertical: SPACING.md,
  },
  modalDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 18 + SPACING.md,
  },
  modalSaveBtn: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
    backgroundColor: COLORS.coral,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  modalSaveText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
});