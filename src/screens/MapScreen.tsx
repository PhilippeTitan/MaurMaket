import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform,
  Animated, FlatList, Image, Pressable, PanResponder, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, getDisplayName, getSellerAvatar } from '../theme';
import { store } from '../store';
import { getNearbySellers, setSellerLocation, getImageUrl } from '../api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

let MapView: any = null;
let Marker: any = null;
let ExpoLocation: any = null;
if (Platform.OS !== 'web') {
  try {
    const maps = require('react-native-maps');
    MapView = maps.default;
    Marker = maps.Marker;
    ExpoLocation = require('expo-location');
  } catch {}
}

const TIER_COLORS: Record<string, string> = {
  casual: 'transparent',
  verified: COLORS.green,
  business: COLORS.yellow,
};

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0D1117' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8B949E' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0D1117' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1C2235' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8B949E' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#1C2235' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0D1117' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#161B22' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#8B949E' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1C2235' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#161B22' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#0D1117' }] },
];

const FILTERS = ['Nearby', 'Verified', 'Business', 'Top rated'];
const SCREEN_W = Dimensions.get('window').width;

interface NearbySeller {
  id: string;
  full_name: string;
  avatar_url: string | null;
  store_name: string | null;
  store_logo_url: string | null;
  seller_tier: string;
  use_store_identity: boolean;
  lat: number;
  lng: number;
  distance_km: number;
  product_count: number;
  primary_image: string | null;
  avg_rating: number;
  review_count: number;
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const mapRef = useRef<any>(null);
  const sheetAnim = useRef(new Animated.Value(1)).current;
  const sheetY = useRef(new Animated.Value(0)).current;
  const previewAnim = useRef(new Animated.Value(0)).current;

  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [sellers, setSellers] = useState<NearbySeller[]>([]);
  const [filteredSellers, setFilteredSellers] = useState<NearbySeller[]>([]);
  const [selectedSeller, setSelectedSeller] = useState<NearbySeller | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('Nearby');
  const [settingLocation, setSettingLocation] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [locationSaved, setLocationSaved] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [region, setRegion] = useState({
    latitude: 18.5944,
    longitude: -72.3074,
    latitudeDelta: 0.15,
    longitudeDelta: 0.15,
  });
  const locationWatcher = useRef<any>(null);
  const didAnimateToUser = useRef(false);

  const isSeller = store.isSeller;
  const fetchIdRef = useRef(0);

  const SHEET_HEIGHT = 340;
  const sheetBottom = 56 + (insets.bottom > 0 ? insets.bottom : 0) + 8;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8,
      onPanResponderRelease: (_, g) => {
        const open = g.vy < -0.3;
        toggleSheet(open);
      },
    })
  ).current;

  const fetchSellers = useCallback(async (lat: number, lng: number, radius: number = 20) => {
    const thisFetch = ++fetchIdRef.current;
    try {
      const res = await getNearbySellers(lat, lng, radius) as { sellers: NearbySeller[] };
      if (thisFetch !== fetchIdRef.current) return;
      setSellers(res.sellers || []);
    } catch {
      if (thisFetch !== fetchIdRef.current) return;
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' || !ExpoLocation) {
      setLoading(false);
      fetchSellers(region.latitude, region.longitude);
      return;
    }
    let active = true;
    (async () => {
      const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
      if (status !== 'granted' || !active) {
        setLoading(false);
        fetchSellers(region.latitude, region.longitude);
        return;
      }
      try {
        const loc = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced });
        if (!active) return;
        const lat = loc.coords.latitude;
        const lng = loc.coords.longitude;
        setMyLocation({ lat, lng });
        setRegion(prev => ({ ...prev, latitude: lat, longitude: lng }));
        if (mapRef.current && !didAnimateToUser.current) {
          didAnimateToUser.current = true;
          mapRef.current.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.08, longitudeDelta: 0.08 }, 600);
        }
        await fetchSellers(lat, lng);
      } catch {
        fetchSellers(region.latitude, region.longitude);
      }
      setLoading(false);

      locationWatcher.current = await ExpoLocation.watchPositionAsync(
        { accuracy: ExpoLocation.Accuracy.Balanced, distanceInterval: 200, timeInterval: 15000 },
        (pos: any) => {
          if (!active) return;
          setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }
      );
    })();
    return () => { active = false; locationWatcher.current?.remove(); };
  }, []);

  useEffect(() => {
    let result = [...sellers];
    if (activeFilter === 'Verified') {
      result = result.filter(s => s.seller_tier === 'verified' || s.seller_tier === 'business');
    } else if (activeFilter === 'Business') {
      result = result.filter(s => s.seller_tier === 'business');
    } else if (activeFilter === 'Top rated') {
      result = result.filter(s => s.avg_rating >= 4.0 && s.review_count >= 3);
    }
    setFilteredSellers(result);
  }, [sellers, activeFilter]);

  useEffect(() => {
    if (selectedSeller) {
      Animated.spring(previewAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 12 }).start();
    } else {
      previewAnim.setValue(0);
    }
  }, [selectedSeller]);

  const handleRegionChangeComplete = useCallback((newRegion: any) => {
    setRegion(newRegion);
    fetchSellers(newRegion.latitude, newRegion.longitude, 20);
  }, [fetchSellers]);

  const centerOnMe = () => {
    if (myLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: myLocation.lat,
        longitude: myLocation.lng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 400);
    }
  };

  const handleSetMyLocation = async () => {
    if (!myLocation) return;
    setSettingLocation(true);
    try {
      await setSellerLocation(myLocation.lat, myLocation.lng);
      setLocationSaved(true);
      setTimeout(() => setLocationSaved(false), 2000);
    } catch {}
    setSettingLocation(false);
  };

  const toggleSheet = (open: boolean) => {
    Animated.spring(sheetAnim, {
      toValue: open ? 1 : 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
    Animated.spring(sheetY, {
      toValue: open ? 0 : SHEET_HEIGHT - 80,
      useNativeDriver: false,
      tension: 65,
      friction: 11,
    }).start();
  };

  const navigateToStorefront = (sellerId: string) => {
    navigation.navigate('Storefront', { sellerId });
  };

  const getAvatarUrl = (seller: NearbySeller) => {
    return getImageUrl(getSellerAvatar(seller));
  };

  const markImageFailed = (id: string) => setFailedImages(prev => new Set(prev).add(id));

  const renderSellerMarker = (seller: NearbySeller) => {
    const ringColor = TIER_COLORS[seller.seller_tier] || 'transparent';
    return (
      <Marker
        key={seller.id}
        coordinate={{ latitude: seller.lat, longitude: seller.lng }}
        onPress={() => setSelectedSeller(seller)}
        tracksViewChanges={false}
      >
        <View style={styles.markerOuter}>
          <View style={[styles.markerRing, ringColor !== 'transparent' && { borderColor: ringColor, borderWidth: 2.5 }]}>
            {getAvatarUrl(seller) && !failedImages.has(`m_${seller.id}`) ? (
              <Image
                source={{ uri: getAvatarUrl(seller)! }}
                style={styles.markerAvatar}
                onError={() => markImageFailed(`m_${seller.id}`)}
              />
            ) : (
              <View style={[styles.markerAvatar, styles.markerAvatarFallback]}>
                <MaterialCommunityIcons name="account" size={18} color={COLORS.text2} />
              </View>
            )}
          </View>
          <View style={styles.markerDot} />
        </View>
      </Marker>
    );
  };

  const renderSellerCard = ({ item }: { item: NearbySeller }) => {
    const avatarUrl = getAvatarUrl(item);
    const name = getDisplayName(item);
    const ringColor = TIER_COLORS[item.seller_tier] || 'transparent';
    const cardFailed = failedImages.has(`c_${item.id}`);
    return (
      <TouchableOpacity
        style={styles.sellerCard}
        activeOpacity={0.8}
        onPress={() => navigateToStorefront(item.id)}
      >
        {item.primary_image && !cardFailed ? (
          <Image
            source={{ uri: getImageUrl(item.primary_image) || '' }}
            style={styles.sellerCardImage}
            resizeMode="cover"
            onError={() => markImageFailed(`c_${item.id}`)}
          />
        ) : (
          <View style={[styles.sellerCardImage, styles.sellerCardImageFallback]}>
            <MaterialCommunityIcons name="image-outline" size={24} color={COLORS.text2} />
          </View>
        )}
        <View style={styles.sellerCardContent}>
          <View style={styles.sellerCardHeader}>
            <View style={[styles.sellerCardAvatar, ringColor !== 'transparent' && { borderColor: ringColor, borderWidth: 1.5 }]}>
              {avatarUrl && !failedImages.has(`a_${item.id}`) ? (
                <Image source={{ uri: avatarUrl }} style={styles.sellerCardAvatarImg} onError={() => markImageFailed(`a_${item.id}`)} />
              ) : (
                <MaterialCommunityIcons name="account" size={12} color={COLORS.text2} />
              )}
            </View>
            <View style={styles.sellerCardInfo}>
              <Text style={styles.sellerCardName} numberOfLines={1}>{name}</Text>
              <Text style={styles.sellerCardDist}>{item.distance_km < 1 ? '<1' : item.distance_km.toFixed(1)} km</Text>
            </View>
          </View>
          <View style={styles.sellerCardStats}>
            {item.avg_rating > 0 && (
              <View style={styles.statRow}>
                <MaterialCommunityIcons name="star" size={11} color={COLORS.yellow} />
                <Text style={styles.statText}>{item.avg_rating.toFixed(1)}</Text>
              </View>
            )}
            <View style={styles.statRow}>
              <MaterialCommunityIcons name="package-variant" size={11} color={COLORS.text2} />
              <Text style={styles.statText}>{item.product_count}</Text>
            </View>
            {item.seller_tier !== 'casual' && item.seller_tier !== 'none' && (
              <View style={[styles.tierBadge, item.seller_tier === 'business' && styles.tierBadgeGold]}>
                <MaterialCommunityIcons
                  name={item.seller_tier === 'business' ? 'crown' : 'shield-check'}
                  size={10}
                  color={item.seller_tier === 'business' ? COLORS.yellow : COLORS.green}
                />
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.coral} />
      </View>
    );
  }

  const previewBottom = sheetBottom + SHEET_HEIGHT + 12;

  return (
    <View style={styles.container}>
      {Platform.OS !== 'web' && MapView ? (
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={region}
          customMapStyle={DARK_MAP_STYLE}
          showsUserLocation={!!myLocation}
          showsMyLocationButton={false}
          onRegionChangeComplete={handleRegionChangeComplete}
          onMapReady={() => setMapReady(true)}
        >
          {mapReady && filteredSellers.map(renderSellerMarker)}
        </MapView>
      ) : (
        <View style={[styles.map, styles.webFallback]}>
          <MaterialCommunityIcons name="map-marker-radius" size={48} color={COLORS.coral} />
          <Text style={styles.webFallbackTitle}>Nearby Market</Text>
          <Text style={styles.webFallbackText}>
            {filteredSellers.length} seller{filteredSellers.length !== 1 ? 's' : ''} found nearby
          </Text>
          <View style={styles.webSellerList}>
            {filteredSellers.map(s => (
              <TouchableOpacity
                key={s.id}
                style={styles.webSellerItem}
                onPress={() => navigateToStorefront(s.id)}
              >
                <Text style={styles.webSellerName}>{getDisplayName(s)}</Text>
                <Text style={styles.webSellerDist}>{s.distance_km < 1 ? '<1' : s.distance_km.toFixed(1)} km</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <LinearGradient
        colors={['rgba(13,17,23,0.95)', 'rgba(13,17,23,0.6)', 'transparent']}
        style={[styles.topGradient, { paddingTop: insets.top + SPACING.sm }]}
        pointerEvents="none"
      >
        <View style={styles.topBar}>
          <Text style={styles.topTitle}>Nearby Market</Text>
          <View style={styles.topRight}>
            {filteredSellers.length > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{filteredSellers.length}</Text>
              </View>
            )}
          </View>
        </View>
      </LinearGradient>

      {Platform.OS !== 'web' && (
        <TouchableOpacity
          style={[styles.myLocationBtn, { bottom: sheetBottom + SHEET_HEIGHT + 12 }]}
          onPress={centerOnMe}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="crosshairs-gps" size={20} color={COLORS.blue} />
        </TouchableOpacity>
      )}

      {isSeller && Platform.OS !== 'web' && (
        <TouchableOpacity
          style={[styles.setLocationBtn, { bottom: sheetBottom + SHEET_HEIGHT + 64 }, locationSaved && styles.setLocationBtnSaved]}
          onPress={handleSetMyLocation}
          disabled={settingLocation || locationSaved}
          activeOpacity={0.7}
        >
          {settingLocation ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <MaterialCommunityIcons name={locationSaved ? 'check' : 'map-marker-plus'} size={20} color={COLORS.white} />
          )}
        </TouchableOpacity>
      )}

      <Animated.View
        style={[
          styles.sheet,
          {
            bottom: sheetBottom,
            paddingBottom: insets.bottom + 20,
            transform: [{
              translateY: sheetAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [SHEET_HEIGHT - 80, 0],
              }),
            }],
          },
        ]}
      >
        <View {...panResponder.panHandlers}>
          <View style={styles.handle} />
        </View>
        <View style={styles.filterRow}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, activeFilter === f && styles.filterChipActive]}
              onPress={() => setActiveFilter(f)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <FlatList
          data={filteredSellers}
          keyExtractor={item => item.id}
          renderItem={renderSellerCard}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sellerList}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="map-marker-off-outline" size={32} color={COLORS.text2} />
              <Text style={styles.emptyText}>No sellers nearby</Text>
              <Text style={styles.emptySubtext}>Sellers appear here after setting their location</Text>
              {isSeller && (
                <TouchableOpacity style={styles.emptyAction} onPress={handleSetMyLocation} activeOpacity={0.7}>
                  <MaterialCommunityIcons name="map-marker-plus" size={14} color={COLORS.white} />
                  <Text style={styles.emptyActionText}>Set my location</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      </Animated.View>

      {selectedSeller && Platform.OS !== 'web' && (
        <Animated.View
          style={[styles.previewCardContainer, { bottom: previewBottom }]}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[styles.previewCard, { left: SPACING.lg, right: SPACING.lg, opacity: previewAnim, transform: [{ scale: previewAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }]}
          >
            <View style={styles.previewHeader}>
              <View style={styles.previewAvatarWrap}>
                {getAvatarUrl(selectedSeller) && !failedImages.has(`p_${selectedSeller.id}`) ? (
                  <Image
                    source={{ uri: getAvatarUrl(selectedSeller)! }
                  }
                    style={styles.previewAvatar}
                    onError={() => markImageFailed(`p_${selectedSeller.id}`)}
                  />
                ) : (
                  <View style={[styles.previewAvatar, styles.previewAvatarFallback]}>
                    <MaterialCommunityIcons name="account" size={24} color={COLORS.text2} />
                  </View>
                )}
              </View>
              <View style={styles.previewInfo}>
                <Text style={styles.previewName} numberOfLines={1}>{getDisplayName(selectedSeller)}</Text>
                <Text style={styles.previewDist}>{selectedSeller.distance_km < 1 ? '<1' : selectedSeller.distance_km.toFixed(1)} km away</Text>
              </View>
              <TouchableOpacity
                style={styles.previewVisitBtn}
                onPress={() => {
                  setSelectedSeller(null);
                  navigateToStorefront(selectedSeller.id);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.previewVisitText}>Visit</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.previewStats}>
              {selectedSeller.avg_rating > 0 && (
                <View style={styles.previewStat}>
                  <MaterialCommunityIcons name="star" size={14} color={COLORS.yellow} />
                  <Text style={styles.previewStatText}>{selectedSeller.avg_rating.toFixed(1)}</Text>
                  <Text style={styles.previewStatDim}>({selectedSeller.review_count})</Text>
                </View>
              )}
              <View style={styles.previewStat}>
                <MaterialCommunityIcons name="package-variant" size={14} color={COLORS.text2} />
                <Text style={styles.previewStatText}>{selectedSeller.product_count} items</Text>
              </View>
              {selectedSeller.seller_tier !== 'casual' && selectedSeller.seller_tier !== 'none' && (
                <View style={styles.previewStat}>
                  <MaterialCommunityIcons
                    name={selectedSeller.seller_tier === 'business' ? 'crown' : 'shield-check'}
                    size={14}
                    color={selectedSeller.seller_tier === 'business' ? COLORS.yellow : COLORS.green}
                  />
                  <Text style={[styles.previewStatText, { color: selectedSeller.seller_tier === 'business' ? COLORS.yellow : COLORS.green }]}>
                    {selectedSeller.seller_tier === 'business' ? 'Business' : 'Verified'}
                  </Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              style={styles.previewCloseBtn}
              onPress={() => setSelectedSeller(null)}
              hitSlop={12}
            >
              <MaterialCommunityIcons name="close" size={14} color={COLORS.text2} />
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

const AVATAR_SIZE = 38;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loading: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' },
  map: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  webFallback: {
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  webFallbackTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800', marginTop: 12 },
  webFallbackText: { color: COLORS.text2, fontSize: 13, marginTop: 6 },
  webSellerList: { marginTop: 20, width: '100%', maxWidth: 400 },
  webSellerItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 12, backgroundColor: COLORS.bg, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 8,
  },
  webSellerName: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  webSellerDist: { color: COLORS.text2, fontSize: 12 },
  topGradient: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg,
    zIndex: 10,
  },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  topTitle: {
    fontFamily: 'Syne', fontSize: 22, fontWeight: '800', color: COLORS.text,
  },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countBadge: {
    backgroundColor: COLORS.coral, borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  countBadgeText: { color: COLORS.white, fontSize: 12, fontWeight: '700' },
  markerOuter: { alignItems: 'center' },
  markerRing: {
    width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2,
    borderWidth: 2, borderColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  markerAvatar: { width: AVATAR_SIZE - 6, height: AVATAR_SIZE - 6, borderRadius: (AVATAR_SIZE - 6) / 2 },
  markerAvatarFallback: {
    backgroundColor: COLORS.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  markerDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.coral,
    marginTop: -1,
  },
  myLocationBtn: {
    position: 'absolute', right: SPACING.lg,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6,
    zIndex: 5,
  },
  setLocationBtn: {
    position: 'absolute', right: SPACING.lg,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.coral,
    alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6,
    zIndex: 5,
  },
  setLocationBtnSaved: { backgroundColor: COLORS.green },
  sheet: {
    position: 'absolute', left: 0, right: 0,
    height: 340,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    elevation: 12, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.4, shadowRadius: 12,
    zIndex: 10,
  },
  handle: {
    alignSelf: 'center', width: 42, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border, marginBottom: SPACING.md,
  },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: SPACING.md },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  filterChipActive: { backgroundColor: COLORS.blue, borderColor: COLORS.blue },
  filterText: { color: COLORS.text, fontSize: 12, fontWeight: '600' },
  filterTextActive: { color: COLORS.white },
  sellerList: { paddingBottom: SPACING.sm },
  sellerCard: {
    width: 200, backgroundColor: COLORS.surface, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, marginRight: SPACING.md, overflow: 'hidden',
  },
  sellerCardImage: { width: 200, height: 100 },
  sellerCardImageFallback: {
    backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center',
  },
  sellerCardContent: { padding: 10 },
  sellerCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  sellerCardAvatar: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: 'transparent',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  sellerCardAvatarImg: { width: 26, height: 26, borderRadius: 13 },
  sellerCardInfo: { flex: 1 },
  sellerCardName: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  sellerCardDist: { color: COLORS.text2, fontSize: 11 },
  sellerCardStats: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statText: { color: COLORS.text2, fontSize: 11, fontWeight: '600' },
  tierBadge: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,229,160,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  tierBadgeGold: { backgroundColor: 'rgba(255,209,102,0.12)' },
  emptyState: {
    width: SCREEN_W - 80, alignItems: 'center', justifyContent: 'center', paddingVertical: 24,
  },
  emptyText: { color: COLORS.text, fontSize: 14, fontWeight: '700', marginTop: 10 },
  emptySubtext: { color: COLORS.text2, fontSize: 12, marginTop: 4, textAlign: 'center' },
  emptyAction: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 14, paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: COLORS.coral, borderRadius: 12,
  },
  emptyActionText: { color: COLORS.white, fontSize: 13, fontWeight: '700' },
  previewCardContainer: {
    position: 'absolute',
    left: 0, right: 0,
    alignItems: 'center',
    zIndex: 15,
  },
  previewCard: {
    backgroundColor: COLORS.surface, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, padding: 14,
    elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12,
  },
  previewCloseBtn: {
    position: 'absolute', top: 8, right: 8,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: COLORS.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewAvatarWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.surface2, overflow: 'hidden',
  },
  previewAvatar: { width: 44, height: 44, borderRadius: 22 },
  previewAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  previewInfo: { flex: 1 },
  previewName: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  previewDist: { color: COLORS.text2, fontSize: 12, marginTop: 1 },
  previewVisitBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12,
    backgroundColor: COLORS.coral,
  },
  previewVisitText: { color: COLORS.white, fontSize: 13, fontWeight: '700' },
  previewStats: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  previewStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  previewStatText: { color: COLORS.text, fontSize: 12, fontWeight: '600' },
  previewStatDim: { color: COLORS.text2, fontSize: 11 },
});
