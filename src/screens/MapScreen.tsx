import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../theme';

const filters = ['Nearby', 'Open now', 'Accepts offers', 'Delivery'];

export default function MapScreen() {
  const [activeFilter, setActiveFilter] = useState(filters[0]);

  return (
    <View style={styles.container}>
      <View style={styles.mapCanvas}>
        <View style={[styles.zone, styles.zoneOne]} />
        <View style={[styles.zone, styles.zoneTwo]} />
        <View style={[styles.zone, styles.zoneThree]} />

        <View style={[styles.pin, styles.pinPrimary]}>
          <MaterialCommunityIcons name="storefront-outline" size={18} color={COLORS.white} />
        </View>
        <View style={[styles.pin, styles.pinSecondary]}>
          <MaterialCommunityIcons name="tshirt-crew-outline" size={16} color={COLORS.white} />
        </View>
        <View style={[styles.pin, styles.pinTertiary]}>
          <MaterialCommunityIcons name="basket-outline" size={16} color={COLORS.white} />
        </View>

        <View style={styles.topOverlay}>
          <Text style={styles.title}>Nearby Market</Text>
          <Text style={styles.subtitle}>Find sellers, offers, and safe meetup zones around you.</Text>
        </View>
      </View>

      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.filterRow}>
          {filters.map(filter => (
            <TouchableOpacity
              key={filter}
              style={[styles.filterChip, activeFilter === filter && styles.filterChipActive]}
              onPress={() => setActiveFilter(filter)}
            >
              <Text style={[styles.filterText, activeFilter === filter && styles.filterTextActive]}>{filter}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.card}>
          <View style={styles.cardIcon}>
            <MaterialCommunityIcons name="map-marker-radius-outline" size={20} color={COLORS.blue} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>Map discovery starts here</Text>
            <Text style={styles.cardText}>
              Showing {activeFilter.toLowerCase()} sellers as approximate zones first, then opt-in live delivery and meetup sharing for active orders.
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardIcon}>
            <MaterialCommunityIcons name="shield-check-outline" size={20} color={COLORS.green} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>Privacy-first locations</Text>
            <Text style={styles.cardText}>
              Public discovery should use areas and service radius. Exact pins should appear only when buyer and seller agree.
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  mapCanvas: {
    flex: 1,
    backgroundColor: '#08131A',
    overflow: 'hidden',
    position: 'relative',
  },
  zone: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
  },
  zoneOne: {
    width: 260,
    height: 260,
    left: -60,
    top: 110,
    backgroundColor: 'rgba(0,194,255,0.08)',
    borderColor: 'rgba(0,194,255,0.24)',
  },
  zoneTwo: {
    width: 320,
    height: 320,
    right: -110,
    top: 260,
    backgroundColor: 'rgba(255,77,106,0.08)',
    borderColor: 'rgba(255,77,106,0.22)',
  },
  zoneThree: {
    width: 180,
    height: 180,
    left: 95,
    bottom: 170,
    backgroundColor: 'rgba(0,229,160,0.07)',
    borderColor: 'rgba(0,229,160,0.2)',
  },
  pin: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  pinPrimary: { left: '42%', top: '34%', backgroundColor: COLORS.coral },
  pinSecondary: { left: '20%', top: '54%', backgroundColor: COLORS.blue },
  pinTertiary: { right: '22%', top: '48%', backgroundColor: COLORS.green },
  topOverlay: {
    position: 'absolute',
    left: SPACING.lg,
    right: SPACING.lg,
    top: SPACING.xl + 38,
  },
  title: { color: COLORS.text, fontSize: 26, fontWeight: '800' },
  subtitle: { color: COLORS.text2, fontSize: 13, lineHeight: 19, marginTop: 4 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: SPACING.md,
    paddingBottom: 96,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: SPACING.md },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterChipActive: {
    backgroundColor: COLORS.blue,
    borderColor: COLORS.blue,
  },
  filterText: { color: COLORS.text, fontSize: 12, fontWeight: '600' },
  filterTextActive: { color: COLORS.white },
  card: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  cardIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1 },
  cardTitle: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  cardText: { color: COLORS.text2, fontSize: 12, lineHeight: 17, marginTop: 2 },
});
