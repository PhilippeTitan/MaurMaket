import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert, TextInput, Modal,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING } from '../theme';
import { useTranslation } from '../i18n';
import { getAddresses, createAddress, updateAddress, deleteAddress } from '../api';
import type { Address } from '../types';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const EMPTY_FORM = { label: '', name: '', phone: '', address: '', city: '' };

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

  const fetchData = useCallback(async () => {
    try {
      const res = await getAddresses() as { addresses: Address[] };
      setAddresses(res.addresses || []);
    } catch { Alert.alert(t('common.error'), t('addresses.loadFailed')); }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
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
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => nav.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.text2} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('addresses.title')}</Text>
        <TouchableOpacity onPress={openAdd}>
          <MaterialCommunityIcons name="plus" size={22} color={COLORS.coral} />
        </TouchableOpacity>
      </View>
      <FlatList
        data={addresses}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <MaterialCommunityIcons name="map-marker" size={16} color={COLORS.text2} />
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{item.label}</Text>
                <Text style={styles.detail}>{item.name} · {item.phone}</Text>
                <Text style={styles.detail}>{item.address}, {item.city}</Text>
              </View>
            </View>
            <View style={styles.rowActions}>
              <TouchableOpacity onPress={() => openEdit(item)}>
                <MaterialCommunityIcons name="pencil-outline" size={18} color={COLORS.text2} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item.id)}>
                <MaterialCommunityIcons name="trash-can-outline" size={18} color={COLORS.text2} />
              </TouchableOpacity>
            </View>
          </View>
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.coral} />}
        ListEmptyComponent={
          !refreshing ? (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="map-marker-outline" size={40} color={COLORS.text2} />
              <Text style={styles.emptyText}>{t('addresses.empty')}</Text>
              <TouchableOpacity onPress={openAdd}>
                <Text style={styles.addLink}>{t('addresses.addFirst')}</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
      />

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? t('addresses.editAddress') : t('addresses.addAddress')}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={20} color={COLORS.text2} />
              </TouchableOpacity>
            </View>
            <TextInput style={styles.input} placeholder={t('addresses.label')} placeholderTextColor={COLORS.text2} value={form.label} onChangeText={v => setForm(p => ({ ...p, label: v }))} />
            <TextInput style={styles.input} placeholder={t('addresses.fullName')} placeholderTextColor={COLORS.text2} value={form.name} onChangeText={v => setForm(p => ({ ...p, name: v }))} />
            <TextInput style={styles.input} placeholder={t('addresses.phone')} placeholderTextColor={COLORS.text2} value={form.phone} onChangeText={v => setForm(p => ({ ...p, phone: v }))} keyboardType="phone-pad" />
            <TextInput style={styles.input} placeholder={t('addresses.address')} placeholderTextColor={COLORS.text2} value={form.address} onChangeText={v => setForm(p => ({ ...p, address: v }))} />
            <TextInput style={styles.input} placeholder={t('addresses.city')} placeholderTextColor={COLORS.text2} value={form.city} onChangeText={v => setForm(p => ({ ...p, city: v }))} />
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              <Text style={styles.saveBtnText}>{saving ? t('addresses.saving') : t('addresses.saveAddress')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { flex: 1, fontSize: 16, color: COLORS.text, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rowLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 },
  rowActions: { flexDirection: 'row', gap: 12 },
  label: { fontSize: 13, color: COLORS.text, fontWeight: '700', marginBottom: 2 },
  detail: { fontSize: 11, color: COLORS.text2 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyText: { fontSize: 14, color: COLORS.text2 },
  addLink: { fontSize: 13, color: COLORS.coral, fontWeight: '600', marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: SPACING.lg, gap: 10, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  input: { backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, color: COLORS.text, fontSize: 14 },
  saveBtn: { backgroundColor: COLORS.coral, padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 14 },
});
