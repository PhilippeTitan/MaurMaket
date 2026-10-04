import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, RADIUS, SPACING, TOUCH } from '../theme';
import { getSellerLocation, setSellerLocation, toggleSellerVisibility } from '../api';
import ScreenHeader from '../components/ScreenHeader';
import LocationPicker from '../components/LocationPicker';
import PrimaryButton from '../components/PrimaryButton';
import SettingsToggle from '../components/SettingsToggle';
import { useToast } from '../components/Toast';
import { useTranslation } from '@/localization';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'SellerMapVisibility'>;
type PublicArea = { lat: number; lng: number; label: string };

export default function SellerMapVisibilityScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState(false);
  const [savedPoint, setSavedPoint] = useState<PublicArea | null>(null);
  const [selection, setSelection] = useState<PublicArea | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getSellerLocation() as { lat: number | null; lng: number | null; isVisible: boolean; areaConfirmed?: boolean };
      if (result.areaConfirmed && result.lat != null && result.lng != null) {
        const point = { lat: Number(result.lat), lng: Number(result.lng), label: t('sellerMapVisibility.savedArea') };
        setSavedPoint(point);
      } else setSavedPoint(null);
      setVisible(Boolean(result.isVisible));
    } catch (error) {
      toast.error(t('settings.error'), error instanceof Error ? error.message : t('settings.failed'));
    } finally { setLoading(false); }
  }, [t, toast]);

  useEffect(() => { load(); }, [load]);

  const onPick = useCallback((lat: number, lng: number, label: string) => {
    setSelection({ lat, lng, label });
  }, []);

  const saveArea = async () => {
    if (!selection) return;
    setSaving(true);
    try {
      const result = await setSellerLocation(selection.lat, selection.lng, visible) as { lat: number; lng: number; isVisible: boolean };
      const point = { lat: Number(result.lat), lng: Number(result.lng), label: selection.label };
      setSavedPoint(point);
      setSelection(null);
      setVisible(Boolean(result.isVisible));
      toast.show({ kind: 'success', title: t('sellerMapVisibility.saved') });
    } catch (error) {
      toast.error(t('settings.error'), error instanceof Error ? error.message : t('settings.failed'));
    } finally { setSaving(false); }
  };

  const changeVisibility = async (next: boolean) => {
    if (next && !savedPoint) {
      toast.warning(t('sellerMapVisibility.title'), t('sellerMapVisibility.chooseFirst'));
      return;
    }
    setSaving(true);
    try {
      await toggleSellerVisibility(next);
      setVisible(next);
    } catch (error) {
      toast.error(t('settings.error'), error instanceof Error ? error.message : t('settings.failed'));
    } finally { setSaving(false); }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('sellerMapVisibility.title')} onBack={() => navigation.goBack()} />
      {loading ? <View style={styles.loading}><ActivityIndicator color={COLORS.coral} /></View> : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <Text style={styles.heading}>{t('sellerMapVisibility.visibilityTitle')}</Text>
            <Text style={styles.body}>{t('sellerMapVisibility.visibilityDescription')}</Text>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{t('sellerMapVisibility.showOnMap')}</Text>
                <Text style={styles.caption}>{visible ? t('sellerMapVisibility.onSummary') : t('sellerMapVisibility.offSummary')}</Text>
              </View>
              <SettingsToggle value={visible} onValueChange={changeVisibility} disabled={saving} accessibilityLabel={t('sellerMapVisibility.showOnMap')} />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.heading}>{t('sellerMapVisibility.areaTitle')}</Text>
            <Text style={styles.body}>{t('sellerMapVisibility.areaDescription')}</Text>
            {savedPoint && !selection && <Text style={styles.saved}>{t('sellerMapVisibility.areaSaved')}</Text>}
            <LocationPicker
              allowCurrentLocation={false}
              initialLat={selection?.lat ?? savedPoint?.lat}
              initialLng={selection?.lng ?? savedPoint?.lng}
              onLocationSelect={onPick}
              height={230}
            />
            {selection && <Text style={styles.selection}>{t('sellerMapVisibility.selectionReady')}</Text>}
            <PrimaryButton onPress={saveArea} disabled={!selection || saving} loading={saving} accessibilityLabel={t('sellerMapVisibility.saveArea')}>
              {t('sellerMapVisibility.saveArea')}
            </PrimaryButton>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 40 },
  card: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 1, borderRadius: RADIUS.card, padding: SPACING.md, gap: SPACING.sm },
  heading: { color: COLORS.text, fontSize: FONT_SIZES.lg, fontWeight: FONT_WEIGHTS.bold },
  body: { color: COLORS.text2, fontSize: FONT_SIZES.sm, lineHeight: 20 },
  toggleRow: { minHeight: TOUCH.min, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border, marginTop: SPACING.xs, paddingTop: SPACING.sm },
  rowTitle: { color: COLORS.text, fontSize: FONT_SIZES.md, fontWeight: FONT_WEIGHTS.semibold },
  caption: { color: COLORS.text2, fontSize: FONT_SIZES.xs, marginTop: 2 },
  saved: { color: COLORS.green, fontSize: FONT_SIZES.sm, fontWeight: FONT_WEIGHTS.semibold },
  selection: { color: COLORS.text, fontSize: FONT_SIZES.sm },
});
