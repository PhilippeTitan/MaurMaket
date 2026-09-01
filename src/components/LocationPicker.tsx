import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator, Modal, TouchableOpacity, TextInput, FlatList } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { searchAreasHybrid, type HaitiArea } from '../data/haiti-areas';
import { getFastLocation } from '../fast-location';
import NativeMap, { MAP_STYLE_LIGHT, type NativeMapRef } from './NativeMap';

interface LocationPickerProps {
  onLocationSelect: (lat: number, lng: number, address: string) => void;
  initialLat?: number | null;
  initialLng?: number | null;
  height?: number;
}

export default function LocationPicker({ onLocationSelect, initialLat, initialLng, height = 260 }: LocationPickerProps) {
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [expandedAddress, setExpandedAddress] = useState<string | null>(null);
  const [pendingCoords, setPendingCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArea, setSelectedArea] = useState<HaitiArea | null>(null);
  const [searchResults, setSearchResults] = useState<HaitiArea[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [expandedMapReady, setExpandedMapReady] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedLat, setSelectedLat] = useState<number | null>(null);
  const [selectedLng, setSelectedLng] = useState<number | null>(null);
  const expandedMapRef = useRef<NativeMapRef>(null);
  const centeredRef = useRef(false);
  const searchInputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();

  // Get user location on mount
  useEffect(() => {
    getFastLocation()
      .then(pos => {
        const loc = { lat: pos.lat, lng: pos.lng };
        setUserLocation(loc);
        // Center map once ready
        if (expandedMapReady && !centeredRef.current) {
          centeredRef.current = true;
          expandedMapRef.current?.centerOn(loc.lat, loc.lng, 14);
        }
      })
      .catch(() => {});
  }, []);

  // Center map when it becomes ready and user location is available
  useEffect(() => {
    if (expandedMapReady && userLocation && !centeredRef.current) {
      centeredRef.current = true;
      expandedMapRef.current?.centerOn(userLocation.lat, userLocation.lng, 14);
    }
  }, [expandedMapReady, userLocation]);

  // Debounced search
  useEffect(() => {
    if (searchQuery.length < 1) { setSearchResults([]); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      const results = await searchAreasHybrid(searchQuery);
      setSearchResults(results);
      setSearching(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, { headers: { 'Accept-Language': 'en' } });
      const data = await res.json();
      const addr = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      setSelectedAddress(addr);
      onLocationSelect(lat, lng, addr);
    } catch {
      const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      setSelectedAddress(fallback);
      onLocationSelect(lat, lng, fallback);
    }
  }, [onLocationSelect]);

  const handleMapPress = useCallback((lat: number, lng: number) => {
    // Update the selected marker immediately
    setSelectedLat(lat);
    setSelectedLng(lng);
    setExpandedLoading(true);
    setPendingCoords({ lat, lng });
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, { headers: { 'Accept-Language': 'en' } })
      .then(r => r.json())
      .then(d => setExpandedAddress(d.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`))
      .catch(() => setExpandedAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`))
      .finally(() => setExpandedLoading(false));
  }, []);

  const selectArea = useCallback((area: HaitiArea) => {
    setSelectedLat(area.lat);
    setSelectedLng(area.lng);
    setPendingCoords({ lat: area.lat, lng: area.lng });
    setExpandedAddress(area.name);
    setSearchFocused(false);
    setSearchResults([]);
    searchInputRef.current?.blur();
    // Fly to area
    const zoom = area.radius < 300 ? 16 : area.radius < 600 ? 15 : area.radius < 1200 ? 14 : 13;
    expandedMapRef.current?.flyTo(area.lat, area.lng, zoom);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedArea(null);
    setSelectedLat(null);
    setSelectedLng(null);
    setPendingCoords(null);
    setExpandedAddress(null);
    setSearchQuery('');
  }, []);

  const confirmExpanded = useCallback(() => {
    if (pendingCoords && expandedAddress) {
      setSelectedAddress(expandedAddress);
      onLocationSelect(pendingCoords.lat, pendingCoords.lng, expandedAddress);
    }
    setExpanded(false);
    setExpandedMapReady(false);
    centeredRef.current = false;
    setPendingCoords(null);
    setExpandedAddress(null);
    setSearchQuery('');
    setSelectedArea(null);
    setSelectedLat(null);
    setSelectedLng(null);
    setSearchFocused(false);
  }, [pendingCoords, expandedAddress, onLocationSelect]);

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, { height }]}>
        <View style={styles.webFallback}>
          <MaterialCommunityIcons name="map-marker-outline" size={32} color={COLORS.coral} />
          <Text style={styles.webFallbackText}>Map picker available on mobile</Text>
        </View>
      </View>
    );
  }

  return (
    <>
      {/* ── Small map preview (tappable to expand) ── */}
      <TouchableOpacity
        style={[styles.container, { height }]}
        onPress={() => setExpanded(true)}
        activeOpacity={0.9}
        accessibilityLabel="expand map"
        accessibilityRole="button"
      >
        <NativeMap
          style={styles.previewMap}
          center={initialLat && initialLng ? [initialLng, initialLat] : undefined}
          zoom={15}
          showUserLocation={false}
          selectedLat={selectedLat ?? initialLat ?? null}
          selectedLng={selectedLng ?? initialLng ?? null}
        />
        <View style={styles.expandHint}>
          <MaterialCommunityIcons name="fullscreen" size={14} color={COLORS.white} />
          <Text style={styles.expandHintText}>Full screen</Text>
        </View>
        {selectedAddress && (
          <View style={styles.addressBar}>
            <MaterialCommunityIcons name="map-marker" size={14} color={COLORS.coral} />
            <Text style={styles.addressText} numberOfLines={2}>{selectedAddress}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* ── Full-screen map modal ── */}
      <Modal visible={expanded} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setExpanded(false)}>
        <View style={styles.expandedContainer}>
          <NativeMap
            ref={expandedMapRef}
            style={styles.expandedMap}
            center={initialLat && initialLng ? [initialLng, initialLat] : undefined}
            zoom={15}
            showUserLocation={true}
            selectedLat={selectedLat}
            selectedLng={selectedLng}
            onPress={handleMapPress}
            onMapReady={() => setExpandedMapReady(true)}
          />

          {/* Close button — top right */}
          <View style={[styles.closeBtnRow, { top: insets.top + 8, right: 14 }]}>
            <TouchableOpacity style={styles.closeBtn} onPress={() => {
              setExpanded(false);
              setExpandedMapReady(false);
              centeredRef.current = false;
              setSearchFocused(false);
              setSearchQuery('');
              setSearchResults([]);
              setSelectedArea(null);
              setSelectedLat(null);
              setSelectedLng(null);
            }} accessibilityLabel="close map" accessibilityRole="button">
              <MaterialCommunityIcons name="close" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {/* ── Bottom pill — two states ── */}
          <View style={[styles.bottomPillContainer, { bottom: insets.bottom + 16 }]}>
            {searchFocused ? (
              /* ── Search mode ── */
              <View style={styles.searchPill}>
                <View style={styles.searchInputRow}>
                  <MaterialCommunityIcons name="magnify" size={20} color={COLORS.coral} />
                  <TextInput
                    ref={searchInputRef}
                    style={styles.searchInput}
                    placeholder="Search area... (e.g. Delmas 33)"
                    placeholderTextColor={COLORS.text2}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    returnKeyType="search"
                    autoFocus
                    accessibilityLabel="search meetup area"
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); }} accessibilityLabel="clear search" accessibilityRole="button">
                      <MaterialCommunityIcons name="close-circle" size={18} color={COLORS.text2} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Results */}
                {searching && searchResults.length === 0 && (
                  <View style={styles.searchLoading}>
                    <ActivityIndicator size="small" color={COLORS.coral} />
                    <Text style={styles.searchLoadingText}>Searching...</Text>
                  </View>
                )}

                {searchResults.length > 0 && (
                  <FlatList
                    data={searchResults}
                    keyExtractor={item => item.id}
                    style={styles.searchResults}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[styles.resultItem, selectedArea?.id === item.id && styles.resultActive]}
                        onPress={() => selectArea(item)}
                        accessibilityLabel={`select ${item.name}`}
                        accessibilityRole="button"
                      >
                        <MaterialCommunityIcons name="map-marker-outline" size={18} color={COLORS.coral} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.resultName} numberOfLines={1}>{item.name}</Text>
                          <Text style={styles.resultCity} numberOfLines={1}>{item.city}</Text>
                        </View>
                        <Text style={styles.resultArrow}>›</Text>
                      </TouchableOpacity>
                    )}
                  />
                )}

                {/* Address from tap */}
                {!selectedArea && expandedAddress && (
                  <View style={styles.addressPreview}>
                    <MaterialCommunityIcons name="map-marker" size={14} color={COLORS.coral} />
                    <Text style={styles.addressPreviewText} numberOfLines={1}>{expandedAddress}</Text>
                  </View>
                )}
              </View>
            ) : selectedArea ? (
              /* ── Selected mode — area name + confirm ── */
              <View style={styles.selectedPill}>
                <MaterialCommunityIcons name="map-marker" size={18} color={COLORS.coral} />
                <Text style={styles.selectedText} numberOfLines={1}>{selectedArea.name}</Text>
                <TouchableOpacity style={styles.clearBtn} onPress={clearSelection} accessibilityLabel="clear selection" accessibilityRole="button">
                  <MaterialCommunityIcons name="close" size={18} color={COLORS.text2} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, expandedLoading && { opacity: 0.5 }]}
                  onPress={confirmExpanded}
                  disabled={expandedLoading}
                  accessibilityLabel="confirm location"
                  accessibilityRole="button"
                >
                  {expandedLoading ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <Text style={styles.confirmText}>Confirm</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              /* ── Default mode — search prompt ── */
              <TouchableOpacity style={styles.searchPrompt} onPress={() => setSearchFocused(true)} accessibilityLabel="search for area" accessibilityRole="button">
                <MaterialCommunityIcons name="magnify" size={20} color={COLORS.coral} />
                <Text style={styles.searchPromptText}>Search for an area...</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: RADIUS.card, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  previewMap: { flex: 1 },
  webFallback: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.surface, padding: 20 },
  webFallbackText: { color: COLORS.text2, fontSize: 14, marginTop: 8, textAlign: 'center' },
  expandHint: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  expandHintText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  addressBar: { position: 'absolute', bottom: 8, left: 8, right: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, gap: 6 },
  addressText: { color: '#fff', fontSize: 12, flex: 1 },

  /* Expanded modal */
  expandedContainer: { flex: 1, backgroundColor: COLORS.bg },
  expandedMap: { flex: 1 },

  /* Close button — top right */
  closeBtnRow: { position: 'absolute', flexDirection: 'row', alignItems: 'center' },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center', elevation: 4 },

  /* Bottom pill container */
  bottomPillContainer: { position: 'absolute', left: 16, right: 16, zIndex: 15 },

  /* Default search prompt pill */
  searchPrompt: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 28, paddingHorizontal: 18, paddingVertical: 14,
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
  },
  searchPromptText: { flex: 1, fontSize: 15, color: COLORS.text2, fontWeight: '500' },

  /* Search mode — expanded card */
  searchPill: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 20, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8,
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
    maxHeight: 360,
  },
  searchInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 16, padding: 0 },
  searchLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  searchLoadingText: { fontSize: 13, color: COLORS.text2 },
  searchResults: { maxHeight: 200 },
  resultItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  resultActive: { backgroundColor: COLORS.coral + '10' },
  resultName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  resultCity: { fontSize: 12, color: COLORS.text2, marginTop: 2 },
  resultArrow: { fontSize: 20, color: COLORS.text2, fontWeight: '300' },
  addressPreview: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, paddingTop: 6 },
  addressPreviewText: { fontSize: 12, color: COLORS.text2, flex: 1 },

  /* Selected mode pill */
  selectedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 28, paddingLeft: 18, paddingRight: 6, paddingVertical: 6,
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
  },
  selectedText: { flex: 1, fontSize: 15, color: COLORS.text, fontWeight: '600' },
  clearBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  confirmBtn: { backgroundColor: COLORS.coral, borderRadius: 22, paddingHorizontal: 20, paddingVertical: 10, marginLeft: 4 },
  confirmText: { color: COLORS.white, fontSize: 14, fontWeight: '700' },
});
