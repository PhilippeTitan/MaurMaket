import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, Dimensions, Image, Animated, PanResponder,
  TextInput} from 'react-native';
import { Map, Camera, Marker, UserLocation, OfflineManager } from '@maplibre/maplibre-react-native';
import type { MapRef, CameraRef } from '@maplibre/maplibre-react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, getDisplayName, getSellerAvatar, formatPrice, TIER_COLORS } from '../theme';
import UserAvatar from '../components/UserAvatar';
import { store } from '../store';
import { useTranslation } from '../i18n';
import {
  getNearbySellers, setSellerLocation, getImageUrl,
  getProducts, toggleFollow, getFollowing, getFollowerCount,
  getSellerLocation, toggleSellerVisibility,
} from '../api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import type { Product } from '../types';
import * as Location from 'expo-location';

/* ─── Map styles ─── */
const LIGHT_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

/* ─── Haiti center ─── */
const HAITI_CENTER: [number, number] = [-72.3074, 18.5944] as const;

/* ─── Offline tile regions ─── */
type LngLatBounds = [number, number, number, number];
const HAITI_BOUNDS: LngLatBounds = [-74.5, 17.9, -71.6, 20.1]; // full country
const CAP_HAITIEN_BOUNDS: LngLatBounds = [-72.35, 19.65, -72.15, 19.85]; // Cap-Haïtien metro
const LES_CAYES_BOUNDS: LngLatBounds = [-73.85, 18.15, -73.65, 18.35]; // Les Cayes metro

interface NearbySeller {
  id: string;
  full_name: string;
  avatar_url: string | null;
  store_name: string | null;
  store_logo_url: string | null;
  seller_tier: string;
  use_store_identity: boolean;
  username: string | null;
  lat: number;
  lng: number;
  distance_km: number;
  product_count: number;
  primary_image: string | null;
  avg_rating: number;
  review_count: number;
}

const CACHE_KEY_LOCATION = 'mm_map_last_location';
const CACHE_KEY_SELLERS = 'mm_map_last_sellers';
const CACHE_TTL = 5 * 60 * 1000;

export default function MapScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const sheetAnim = useRef(new Animated.Value(0)).current;

  const [sellers, setSellers] = useState<NearbySeller[]>([]);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedSeller, setSelectedSeller] = useState<NearbySeller | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const [latestItems, setLatestItems] = useState<Product[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sellerVisible, setSellerVisible] = useState(true);
  const [visibilityLoading, setVisibilityLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [offlineProgress, setOfflineProgress] = useState<Record<string, number>>({});
  const [offlineComplete, setOfflineComplete] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<TextInput>(null);
  const [, setStoreTick] = useState(0);

  useEffect(() => {
    const unsub = store.onChange(() => setStoreTick(t => t + 1));
    return unsub;
  }, []);
  const detailFetchIdRef = useRef(0);
  const fetchIdRef = useRef(0);

  /* ─── Camera control ─── */
  const centerOn = useCallback((lat: number, lng: number, zoom = 13) => {
    cameraRef.current?.easeTo({ center: [lng, lat], zoom, duration: 800 });
  }, []);

  /* ─── Seller sheet ─── */
  const openSheet = useCallback((seller: NearbySeller) => {
    if (store.user && seller.id === store.user.id) return;
    setSelectedSeller(seller);
    setSheetExpanded(false);
    setLatestItems([]);
    setFollowerCount(null);
    Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: false, tension: 80, friction: 12 }).start();

    const thisDetail = ++detailFetchIdRef.current;
    setLoadingDetail(true);

    getProducts({ seller: seller.id, limit: '5' } as any).then((res: any) => {
      if (thisDetail !== detailFetchIdRef.current) return;
      setLatestItems((res?.products || []).slice(0, 5));
    }).catch(() => {}).finally(() => setLoadingDetail(false));

    getFollowerCount(seller.id).then((res: any) => {
      if (thisDetail !== detailFetchIdRef.current) return;
      setFollowerCount(res?.count ?? 0);
    }).catch(() => {});

    if (store.token && !store.followedSellerIds.size) {
      getFollowing().then((res: any) => {
        const list = Array.isArray(res) ? res : (res?.following || []);
        const ids = list.map((f: any) => f.seller_id || f.id).filter(Boolean);
        store.setFollowingList(ids);
      }).catch(() => {});
    }
  }, [sheetAnim]);

  const closeSheet = useCallback(() => {
    Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: false, tension: 80, friction: 12 }).start(() => {
      setSelectedSeller(null);
      setSheetExpanded(false);
    });
  }, [sheetAnim]);

  const handleFollowToggle = useCallback(async () => {
    if (!selectedSeller || followBusy) return;
    const wasFollowing = store.isFollowing(selectedSeller.id);
    store.toggleFollowing(selectedSeller.id, !wasFollowing);
    setFollowBusy(true);
    try {
      const res = await toggleFollow(selectedSeller.id) as { following?: boolean };
      if (res.following !== undefined) store.toggleFollowing(selectedSeller.id, res.following);
      const countRes = await getFollowerCount(selectedSeller.id) as any;
      setFollowerCount(countRes?.count ?? 0);
    } catch { store.toggleFollowing(selectedSeller.id, wasFollowing); }
    setFollowBusy(false);
  }, [selectedSeller, followBusy]);

  /* ─── Data fetching ─── */
  const fetchSellers = useCallback(async (lat: number, lng: number) => {
    const thisFetch = ++fetchIdRef.current;
    try {
      const res = await getNearbySellers(lat, lng) as { sellers: NearbySeller[] };
      if (thisFetch !== fetchIdRef.current) return;
      const list = res.sellers || [];
      setSellers(prev => {
        const merged = new global.Map(prev.map(s => [s.id, s]));
        list.forEach(s => merged.set(s.id, s));
        return Array.from(merged.values());
      });
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        await AsyncStorage.setItem(CACHE_KEY_SELLERS, JSON.stringify({ ts: Date.now(), sellers: list }));
      } catch {}
    } catch {}
  }, []);

  const loadCachedSellers = useCallback(async () => {
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      const raw = await AsyncStorage.getItem(CACHE_KEY_SELLERS);
      if (!raw) return false;
      const { ts, sellers: cached } = JSON.parse(raw);
      if (Date.now() - ts > CACHE_TTL) return false;
      setSellers(prev => {
        const merged = new global.Map(prev.map(s => [s.id, s]));
        cached.forEach((s: NearbySeller) => merged.set(s.id, s));
        return Array.from(merged.values());
      });
      return true;
    } catch { return false; }
  }, []);

  /* ─── Location init ─── */
  useEffect(() => {
    (async () => {
      if (Platform.OS === 'web') {
        fetchSellers(18.5944, -72.3074);
        return;
      }
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;

        let cachedLoc: { lat: number; lng: number } | null = null;
        try {
          const raw = await AsyncStorage.getItem(CACHE_KEY_LOCATION);
          if (raw) cachedLoc = JSON.parse(raw);
        } catch {}

        if (cachedLoc) {
          setMyLocation(cachedLoc);
          await loadCachedSellers();
          setTimeout(() => centerOn(cachedLoc!.lat, cachedLoc!.lng, 11), 300);
        }

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cachedLoc) fetchSellers(18.5944, -72.3074);
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setMyLocation({ lat, lng });
        setSellerLocation(lat, lng).catch(() => {});
        AsyncStorage.setItem(CACHE_KEY_LOCATION, JSON.stringify({ lat, lng })).catch(() => {});
        fetchSellers(lat, lng);
        if (!cachedLoc) centerOn(lat, lng, 11);
      } catch {
        fetchSellers(18.5944, -72.3074);
      }
    })();
  }, []);

  useEffect(() => {
    if (!store.user || store.user.role !== 'seller') return;
    (async () => {
      try {
        const res = await getSellerLocation() as { lat: number | null; lng: number | null; isVisible: boolean };
        setSellerVisible(res.isVisible);
      } catch {}
    })();
  }, []);


  /* ─── Offline tile download ─── */
  useEffect(() => {
    if (!mapReady || offlineComplete) return;
    const regions = [
      { name: 'Haiti', bounds: HAITI_BOUNDS, minZoom: 5, maxZoom: 14 },
      { name: 'Cap-Haitien', bounds: CAP_HAITIEN_BOUNDS, minZoom: 12, maxZoom: 18 },
      { name: 'Les Cayes', bounds: LES_CAYES_BOUNDS, minZoom: 12, maxZoom: 18 },
    ];

    (async () => {
      try {
        for (const region of regions) {
          const pack = await OfflineManager.createPack(
            {
              mapStyle: LIGHT_STYLE,
              bounds: region.bounds,
              minZoom: region.minZoom,
              maxZoom: region.maxZoom,
              metadata: { name: region.name },
            },
            (_pack: any, status: any) => {
              setOfflineProgress((prev: any) => ({
                ...prev,
                [region.name]: status.percentage,
              }));
            },
            (_pack: any, error: any) => {
              console.warn('Offline tile error:', region.name, error.message);
            }
          );
          await pack.resume();
        }
        setOfflineComplete(true);
      } catch {
        setOfflineComplete(true);
      }
    })();
  }, [mapReady, offlineComplete]);

  /* ─── Seller search filter ─── */
  const filteredSellers = useMemo(() => {
    if (!searchQuery.trim()) return sellers;
    const q = searchQuery.toLowerCase().trim();
    return sellers.filter((s: NearbySeller) => {
      const name = (s.use_store_identity ? (s.store_name || '') : (s.full_name || '') || '').toLowerCase();
      const store = (s.store_name || '').toLowerCase();
      return name.includes(q) || store.includes(q);
    });
  }, [sellers, searchQuery]);

  /* ─── Handler callbacks ─── */
  const handleRefreshLocation = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setRefreshing(false); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setMyLocation({ lat, lng });
      setSellerLocation(lat, lng).catch(() => {});
      fetchSellers(lat, lng);
      centerOn(lat, lng);
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        await AsyncStorage.setItem(CACHE_KEY_LOCATION, JSON.stringify({ lat, lng }));
      } catch {}
    } catch {}
    setRefreshing(false);
  }, [refreshing, fetchSellers, centerOn]);

  const handleToggleVisibility = useCallback(async () => {
    if (visibilityLoading) return;
    setVisibilityLoading(true);
    const newVisible = !sellerVisible;
    try {
      await toggleSellerVisibility(newVisible);
      setSellerVisible(newVisible);
    } catch {}
    setVisibilityLoading(false);
  }, [sellerVisible, visibilityLoading]);

  const handleToggleDarkMode = useCallback(() => {
    setDarkMode(prev => !prev);
  }, []);

  const handleFindMe = useCallback(() => {
    if (myLocation) centerOn(myLocation.lat, myLocation.lng, 14);
  }, [myLocation, centerOn]);

  /* ─── Marker helpers ─── */
  const getMarkerColor = (tier: string) => {
    if (tier === 'business') return '#E04050';
    if (tier === 'verified') return '#1D9E75';
    return '#F5A623';
  };

  const getMarkerSize = (tier: string) => {
    if (tier === 'business') return 52;
    if (tier === 'verified') return 46;
    return 42;
  };

  /* ─── Radial FAB ─── */
  const RADIAL_RADIUS = 82;
  const FAB_SIZE = 52;
  const LONG_PRESS_MS = 120;
  const isSeller = store.user?.role === 'seller';
  const TAB_BAR_TOP_OFFSET = (insets.bottom > 0 ? insets.bottom + 8 : 16) + 56;

  const fanProgress = useRef(new Animated.Value(0)).current;
  const iconScales = useRef(
    Array.from({ length: 4 }, () => new Animated.Value(0))
  ).current;
  const fabRotation = fanProgress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });
  const [fanOpen, setFanOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState<number>(-1);

  const menuItems = useMemo(() => {
    const items = [
      { icon: 'crosshairs-gps', color: COLORS.blue, action: handleFindMe, label: 'Find me' },
      { icon: refreshing ? 'loading' : 'refresh', color: COLORS.text, action: handleRefreshLocation, label: 'Refresh' },
    ];
    if (isSeller) {
      items.push({
        icon: sellerVisible ? 'eye' : 'eye-off',
        color: sellerVisible ? COLORS.green : COLORS.coral,
        action: handleToggleVisibility,
        label: 'Visibility',
      });
    }
    items.push({
      icon: darkMode ? 'weather-sunny' : 'weather-night',
      color: COLORS.yellow,
      action: handleToggleDarkMode,
      label: 'Theme',
    });
    return items;
  }, [isSeller, refreshing, sellerVisible, darkMode, handleFindMe, handleRefreshLocation, handleToggleVisibility, handleToggleDarkMode]);

  const totalItems = menuItems.length;

  const getArcPosition = useCallback((index: number, count: number) => {
    const spread = Math.PI * 0.8;
    const startAngle = Math.PI / 2 + spread / 2;
    const angle = count > 1 ? startAngle - (spread / (count - 1)) * index : Math.PI / 2;
    return { x: Math.cos(angle) * RADIAL_RADIUS, y: -Math.sin(angle) * RADIAL_RADIUS };
  }, []);

  const openFan = useCallback(() => {
    setFanOpen(true);
    Animated.spring(fanProgress, { toValue: 1, useNativeDriver: false, tension: 120, friction: 12 }).start();
    iconScales.forEach((s, i) => {
      Animated.spring(s, { toValue: 1, useNativeDriver: false, tension: 120, friction: 12, delay: i * 40 }).start();
    });
  }, [fanProgress, iconScales]);

  const closeFan = useCallback(() => {
    setFanOpen(false);
    setHighlightedIdx(-1);
    Animated.spring(fanProgress, { toValue: 0, useNativeDriver: false, tension: 120, friction: 14 }).start();
    iconScales.forEach(s => {
      Animated.spring(s, { toValue: 0, useNativeDriver: false, tension: 120, friction: 14 }).start();
    });
  }, [fanProgress, iconScales]);

  const menuItemsRef = useRef(menuItems);
  menuItemsRef.current = menuItems;
  const fanOpenRef = useRef(fanOpen);
  fanOpenRef.current = fanOpen;
  const openFanRef = useRef(openFan);
  openFanRef.current = openFan;
  const closeFanRef = useRef(closeFan);
  closeFanRef.current = closeFan;
  const getArcPositionRef = useRef(getArcPosition);
  getArcPositionRef.current = getArcPosition;
  const iconScalesRef = useRef(iconScales);
  iconScalesRef.current = iconScales;

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const highlightedIdxRef = useRef(-1);

  const findNearestItem = useCallback((dx: number, dy: number): number => {
    const count = menuItemsRef.current.length;
    let closest = -1;
    let closestDist = Infinity;
    for (let i = 0; i < count; i++) {
      const pos = getArcPositionRef.current(i, count);
      const dist = Math.sqrt((dx - pos.x) ** 2 + (dy - pos.y) ** 2);
      if (dist < 44 && dist < closestDist) {
        closest = i;
        closestDist = dist;
      }
    }
    return closest;
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: () => {
        longPressFired.current = false;
        highlightedIdxRef.current = -1;
        longPressTimer.current = setTimeout(() => {
          longPressFired.current = true;
          openFanRef.current();
        }, LONG_PRESS_MS);
      },
      onPanResponderMove: (_evt, gestureState) => {
        if (!longPressFired.current) return;
        const idx = findNearestItem(gestureState.dx, gestureState.dy);
        if (idx !== highlightedIdxRef.current) {
          highlightedIdxRef.current = idx;
          setHighlightedIdx(idx);
          iconScalesRef.current.forEach((s, i) => {
            Animated.spring(s, {
              toValue: i === idx ? 1.25 : 0.85,
              useNativeDriver: false,
              tension: 300,
              friction: 12,
            }).start();
          });
        }
      },
      onPanResponderRelease: (_evt, gestureState) => {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
        if (longPressFired.current) {
          const idx = findNearestItem(gestureState.dx, gestureState.dy);
          closeFanRef.current();
          if (idx >= 0) {
            const items = menuItemsRef.current;
            if (idx < items.length) items[idx].action();
          }
        } else {
          if (fanOpenRef.current) closeFanRef.current();
          else openFanRef.current();
        }
        longPressFired.current = false;
        highlightedIdxRef.current = -1;
      },
      onPanResponderTerminate: () => {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
        closeFanRef.current();
        longPressFired.current = false;
        highlightedIdxRef.current = -1;
      },
    })
  ).current;

  /* ─── Sheet animation ─── */
  const sheetOpacity = sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  const toggleSheet = () => {
    if (sheetExpanded) {
      setSheetExpanded(false);
    } else {
      setSheetExpanded(true);
    }
    Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: false, tension: 80, friction: 12 }).start();
  };

  const mapStyleUrl = darkMode ? DARK_STYLE : LIGHT_STYLE;

  return (
    <View style={styles.container}>
      {/* ── Native MapLibre map ── */}
      <Map
        ref={mapRef}
        mapStyle={mapStyleUrl}
        logo={false}
        attribution={false}
        compass={false}
        scaleBar={false}
        style={styles.map}
        onDidFinishLoadingMap={() => setMapReady(true)}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: HAITI_CENTER,
            zoom: 12,
          }}
        />

        {/* User location dot */}
        <UserLocation animated />

        {/* Seller markers */}
        {filteredSellers.map(seller => {
          const isMe = store.user && seller.id === store.user.id;
          const lat = (isMe && myLocation) ? myLocation.lat : seller.lat;
          const lng = (isMe && myLocation) ? myLocation.lng : seller.lng;
          const color = getMarkerColor(seller.seller_tier);
          const size = getMarkerSize(seller.seller_tier);
          const raw = seller.use_store_identity ? seller.store_logo_url : seller.avatar_url;
          const avatarUrl = raw ? getImageUrl(raw) : null;
          const isVerified = seller.seller_tier === 'verified' || seller.seller_tier === 'business';

          return (
            <Marker
              key={seller.id}
              id={seller.id}
              lngLat={[lng, lat] as [number, number]}
              anchor="bottom"
              onPress={() => openSheet(seller)}
            >
              <View style={styles.markerContainer}>
                {/* Badge */}
                {isVerified && (
                  <View style={[styles.markerBadge, { backgroundColor: color }]}>
                    <MaterialCommunityIcons name="check" size={10} color="#fff" />
                  </View>
                )}
                {/* Avatar ring */}
                <View style={[
                  styles.markerRing,
                  {
                    width: size, height: size, borderRadius: seller.seller_tier === 'business' ? 14 : size / 2,
                    borderColor: color, borderWidth: 3,
                  },
                ]}>
                  {avatarUrl ? (
                    <Image
                      source={{ uri: avatarUrl }}
                      style={[
                        styles.markerImage,
                        {
                          width: size - 6, height: size - 6,
                          borderRadius: seller.seller_tier === 'business' ? 11 : (size - 6) / 2,
                        },
                      ]}
                    />
                  ) : (
                    <View style={[
                      styles.markerFallback,
                      {
                        width: size - 6, height: size - 6,
                        borderRadius: seller.seller_tier === 'business' ? 11 : (size - 6) / 2,
                        backgroundColor: color,
                      },
                    ]}>
                      <MaterialCommunityIcons
                        name={seller.seller_tier === 'business' ? 'store' : 'account'}
                        size={size * 0.4}
                        color="#fff"
                      />
                    </View>
                  )}
                </View>
                {/* Pin tail */}
                <View style={[styles.markerTail, { borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8, borderTopColor: color }]} />
              </View>
            </Marker>
          );
        })}
      </Map>

      {/* ── Search bar ── */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={20} color={COLORS.text2} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search sellers..."
            placeholderTextColor={COLORS.text2}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchQuery(''); searchInputRef.current?.blur(); }}>
              <MaterialCommunityIcons name="close-circle" size={18} color={COLORS.text2} />
            </TouchableOpacity>
          )}
        </View>
        {searchQuery.length > 0 && (
          <Text style={styles.searchCount}>{filteredSellers.length} seller{filteredSellers.length !== 1 ? 's' : ''}</Text>
        )}
      </View>

      {/* ── Radial FAB ── */}
      {fanOpen && (
        <TouchableOpacity activeOpacity={1} onPress={closeFan} style={styles.mapOverlay} />
      )}
      <View style={[styles.fabAnchor, { bottom: TAB_BAR_TOP_OFFSET + FAB_SIZE / 2 + 8 }]}>
        {menuItems.map((item, i) => {
          const pos = getArcPosition(i, totalItems);
          const tx = fanProgress.interpolate({ inputRange: [0, 1], outputRange: [0, pos.x] });
          const ty = fanProgress.interpolate({ inputRange: [0, 1], outputRange: [0, pos.y] });
          const isHighlighted = highlightedIdx === i;
          return (
            <Animated.View
              key={item.label}
              style={[styles.radialItem, {
                transform: [{ translateX: tx }, { translateY: ty }, { scale: iconScales[i] }],
                opacity: fanProgress,
              }]}
            >
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => { closeFan(); item.action(); }}
                style={[styles.radialItemBtn, {
                  backgroundColor: isHighlighted ? item.color + '44' : COLORS.surface + 'EE',
                  borderColor: isHighlighted ? item.color : COLORS.border,
                }]}
              >
                <MaterialCommunityIcons name={item.icon as any} size={20} color={item.color} />
              </TouchableOpacity>
            </Animated.View>
          );
        })}

        <View {...panResponder.panHandlers} style={{ width: FAB_SIZE, height: FAB_SIZE, alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <Animated.View style={[styles.fab, { width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2 }, {
            transform: [{ rotate: fabRotation }],
          }]}>
            <View style={styles.triggerDot} />
          </Animated.View>
        </View>
      </View>

      {/* ── Seller bottom sheet ── */}
      {selectedSeller && (
        <>
          <TouchableOpacity activeOpacity={1} onPress={() => { setSelectedSeller(null); setSheetExpanded(false); }} style={styles.mapOverlay} />
          <Animated.View style={[styles.sheet, {
            bottom: TAB_BAR_TOP_OFFSET,
            maxHeight: '60%',
            opacity: sheetOpacity,
          }]}>
            <TouchableOpacity activeOpacity={0.9} onPress={toggleSheet} style={styles.chevronRow} accessibilityLabel={sheetExpanded ? 'collapse seller details' : 'expand seller details'} accessibilityRole="button">
              <MaterialCommunityIcons name={sheetExpanded ? 'chevron-down' : 'chevron-up'} size={30} color={COLORS.text2} />
            </TouchableOpacity>

            <View style={styles.sheetContent}>
              <View style={styles.sheetTop}>
                <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.navigate('Storefront', { sellerId: selectedSeller.id, preloadedSeller: selectedSeller })} accessibilityLabel="visit seller profile" accessibilityRole="button">
                  <UserAvatar seller={selectedSeller} size={50} animated={true} />
                </TouchableOpacity>
                <View style={styles.sheetInfo}>
                  <Text style={styles.sheetName} numberOfLines={1}>{getDisplayName(selectedSeller)}</Text>
                  <View style={styles.sheetMeta}>
                    <View style={[styles.tierDot, { backgroundColor: TIER_COLORS[selectedSeller.seller_tier] || '#F5A623' }]} />
                    <Text style={styles.sheetTier}>{selectedSeller.seller_tier}</Text>
                    {followerCount !== null && <Text style={styles.sheetFollower}>{followerCount} follower{followerCount !== 1 ? 's' : ''}</Text>}
                  </View>
                </View>
                <TouchableOpacity onPress={handleFollowToggle} disabled={followBusy} style={[styles.followBtn, store.isFollowing(selectedSeller?.id || '') && styles.followBtnActive]} accessibilityLabel={store.isFollowing(selectedSeller?.id || '') ? 'unfollow seller' : 'follow seller'} accessibilityRole="button">
                  <Text style={[styles.followText, store.isFollowing(selectedSeller?.id || '') && styles.followTextActive]}>{store.isFollowing(selectedSeller?.id || '') ? 'Following' : 'Follow'}</Text>
                </TouchableOpacity>
              </View>

              {sheetExpanded && (
                <View style={styles.sheetItems}>
                  <Text style={styles.sheetItemsLabel}>Latest items</Text>
                  {loadingDetail ? (
                    <Text style={styles.sheetItemsEmpty}>Loading...</Text>
                  ) : latestItems.length > 0 ? (
                    <Animated.ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.itemsScroll}>
                      {latestItems.map(item => {
                        const img = getImageUrl(item.images?.[0]?.image_url);
                        return (
                          <TouchableOpacity key={item.id} style={styles.itemCard} onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}>
                            {img ? (
                              <Image source={{ uri: img }} style={styles.itemImg} />
                            ) : (
                              <View style={[styles.itemImg, styles.itemImgFallback]}>
                                <MaterialCommunityIcons name="image-outline" size={20} color={COLORS.text2} />
                              </View>
                            )}
                            <Text style={styles.itemPrice} numberOfLines={1}>{formatPrice(item.sale_price ?? item.price ?? 0)} G</Text>
                            <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </Animated.ScrollView>
                  ) : (
                    <Text style={styles.sheetItemsEmpty}>No products listed yet</Text>
                  )}
                </View>
              )}
            </View>
          </Animated.View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  map: { flex: 1 },
  mapOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 },

  /* Markers */
  markerContainer: { alignItems: 'center', width: 64 },
  markerBadge: {
    position: 'absolute', top: -4, right: 4,
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },
  markerRing: {
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 4,
    overflow: 'hidden',
  },
  markerImage: { overflow: 'hidden' },
  markerFallback: { alignItems: 'center', justifyContent: 'center' },
  markerTail: { width: 0, height: 0, borderLeftColor: 'transparent', borderRightColor: 'transparent' },

  /* Radial FAB */
  fabAnchor: {
    position: 'absolute', alignSelf: 'center',
    width: 0, height: 0, alignItems: 'center', justifyContent: 'center',
    zIndex: 50,
  },
  fab: {
    backgroundColor: COLORS.surface + 'EE', borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 6,
  },
  triggerDot: {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 2, borderColor: COLORS.text,
  },
  radialItem: {
    position: 'absolute',
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  radialItemBtn: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4,
  },

  /* Seller sheet */
  sheet: {
    position: 'absolute', left: 12, right: 12,
    backgroundColor: COLORS.surface || '#161B22',
    borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border || '#30363D',
    overflow: 'hidden',
    zIndex: 200, elevation: 20,
  },
  chevronRow: { alignItems: 'center', paddingVertical: 6 },
  sheetContent: {},
  sheetTop: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingBottom: 10, gap: 10 },
  sheetInfo: { flex: 1 },
  sheetName: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  sheetMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  tierDot: { width: 8, height: 8, borderRadius: 4 },
  sheetTier: { color: COLORS.text2, fontSize: 11, textTransform: 'capitalize' },
  sheetFollower: { color: COLORS.text2, fontSize: 11 },

  followBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: RADIUS.row, borderWidth: 1, borderColor: COLORS.coral },
  followBtnActive: { backgroundColor: COLORS.coral, borderColor: COLORS.coral },
  followText: { color: COLORS.coral, fontSize: 12, fontWeight: '700' },
  followTextActive: { color: '#fff' },

  sheetItems: { paddingHorizontal: SPACING.md, paddingBottom: 12 },
  sheetItemsLabel: { color: COLORS.text2, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  sheetItemsEmpty: { color: COLORS.text2, fontSize: 12 },

  itemsScroll: { flexDirection: 'row' },
  itemCard: { width: 80, marginRight: 10 },
  itemImg: { width: 80, height: 80, borderRadius: 10 },
  itemImgFallback: { backgroundColor: COLORS.surface2 || '#21262D', alignItems: 'center', justifyContent: 'center' },
  itemPrice: { color: COLORS.text, fontSize: 11, fontWeight: '700', marginTop: 4 },
  itemName: { color: COLORS.text2, fontSize: 10 },

  /* Search */
  searchContainer: {
    position: 'absolute', top: 50, left: 16, right: 16,
    zIndex: 100, elevation: 10,
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface + 'EE', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.border,
    elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4,
  },
  searchInput: {
    flex: 1, marginLeft: 8, color: COLORS.text, fontSize: 14,
  },
  searchCount: {
    color: COLORS.text2, fontSize: 11, textAlign: 'center',
    marginTop: 6, fontWeight: '600',
  },
});
