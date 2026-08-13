import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, Dimensions, Image, Animated, PanResponder,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SkeletonBlock } from '../components/Skeleton';
import { COLORS, SPACING, RADIUS, getDisplayName, getSellerAvatar, formatPrice, TIER_COLORS } from '../theme';
import UserAvatar from '../components/UserAvatar';
import { store } from '../store';
import { useTranslation } from '../i18n';
import {
  API_BASE, getNearbySellers, setSellerLocation, getImageUrl,
  getProducts, toggleFollow, getFollowing, getFollowerCount,
  getSellerLocation, toggleSellerVisibility,
} from '../api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import type { Product } from '../types';
import * as Location from 'expo-location';


const SCREEN_W = Dimensions.get('window').width;

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

function buildMapHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#map{width:100%;height:100%;background:#0D1117;overflow:hidden}
.leaflet-control-zoom{display:none}
.leaflet-control-attribution{display:none!important}
.seller-ring{border-radius:50%;border:3px solid #fff;display:flex;align-items:center;justify-content:center}
.seller-tail{width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent}
.user-dot{width:16px;height:16px;border-radius:50%;border:3px solid #4A9EFF;background:#fff;box-shadow:0 0 8px rgba(74,158,255,0.5)}
.user-tail{width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:8px solid #4A9EFF}
</style>
</head>
<body>
<div id="map"></div>
<script>
var LIGHT_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
var DARK_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
var currentTile = null;
var map = L.map("map",{zoomControl:false,attributionControl:false,maxBounds:[[16.5,-76],[21,-67]],maxBoundsViscosity:1.0,minZoom:8,maxZoom:20}).setView([18.5944,-72.3074],12);
currentTile = L.tileLayer(LIGHT_URL,{maxZoom:20,subdomains:"abcd",crossOrigin:true,keepBuffer:8,updateWhenZooming:false,updateWhenIdle:true}).addTo(map);
setTimeout(function(){map.invalidateSize()},200);
setTimeout(function(){map.invalidateSize()},1000);
window.addEventListener("load",function(){map.invalidateSize()});

function setDarkMode(isDark){
  if(currentTile) map.removeLayer(currentTile);
  currentTile = L.tileLayer(isDark?DARK_URL:LIGHT_URL,{maxZoom:20,subdomains:"abcd",crossOrigin:true}).addTo(map);
  document.querySelector('.leaflet-tile-pane').style.filter = isDark ? 'brightness(1.4) contrast(1.1)' : '';
}

var sellerLayer = L.layerGroup().addTo(map);
var userMarker = null;
var highlightedId = null;
var knownSellers = {};

function buildSellerIcon(s) {
  var isBiz = s.tier==='business';
  var isVer = s.tier==='verified';
  var color = isBiz?'#E04050':isVer?'#1D9E75':'#F5A623';
  var size = isVer?50:isBiz?56:44;
  var shape = isBiz?'14px':'50%';
  var badge = isVer?'<div style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:'+color+';border:2px solid #fff;display:flex;align-items:center;justify-content:center;z-index:10"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>':'';
  var inner = s.avatar
    ? '<img src="'+s.avatar+'" style="width:'+(size-6)+'px;height:'+(size-6)+'px;border-radius:'+shape+';object-fit:cover"/>'
    : (isBiz
      ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M3 9l1-5h16l1 5M4 9v11h16V9M4 9h16M9 21v-6h6v6"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-7 8-7s8 3 8 7"/></svg>');
  return L.divIcon({
    className:'',
    iconSize:[64,size+16],iconAnchor:[32,size+16],
    html:'<div style="display:flex;flex-direction:column;align-items:center;position:relative">' +
      '<div style="position:relative;width:'+size+'px;height:'+size+'px">'+badge+'<div style="position:relative;width:'+size+'px;height:'+size+'px;border-radius:'+shape+';background:'+color+';border:3px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);overflow:hidden">'+inner+'</div></div>' +
      '<div class="seller-tail" style="border-top:9px solid '+color+'"></div></div>'
  });
}

function setSellerMarkers(sellers) {
  sellers.forEach(function(s) {
    if(knownSellers[s.id]) {
      knownSellers[s.id].setLatLng([s.lat,s.lng]);
    } else {
      var icon = buildSellerIcon(s);
      var marker = L.marker([s.lat,s.lng],{icon:icon});
      marker._sellerId = s.id;
      marker.on('click',function(){
        highlightedId = s.id;
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'tap',id:s.id}));
      });
      marker.addTo(sellerLayer);
      knownSellers[s.id] = marker;
    }
  });
}

function removeSeller(id) {
  if(knownSellers[id]) {
    sellerLayer.removeLayer(knownSellers[id]);
    delete knownSellers[id];
  }
}

function setUserMarker(lat,lng) {
  if(userMarker) map.removeLayer(userMarker);
  var icon = L.divIcon({
    className:'',iconSize:[20,28],iconAnchor:[10,28],
    html:'<div style="display:flex;flex-direction:column;align-items:center"><div class="user-dot"></div><div class="user-tail"></div></div>'
  });
  userMarker = L.marker([lat,lng],{icon:icon,zIndexOffset:1000}).addTo(map);
  if(!map._userLocated){map.setView([lat,lng],11);map._userLocated=true;}
}

function centerOn(lat,lng){ map.setView([lat,lng],13); }
</script>
</body>
</html>`;
}

const CACHE_KEY_LOCATION = 'mm_map_last_location';
const CACHE_KEY_SELLERS = 'mm_map_last_sellers';
const CACHE_TTL = 5 * 60 * 1000;

export default function MapScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const webViewRef = useRef<WebView>(null);
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const webviewReady = useRef(false);
  const pendingInjection = useRef<string | null>(null);

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
  const [sellersLoaded, setSellersLoaded] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [splashMsg, setSplashMsg] = useState('Loading map...');
  const [splashPctText, setSplashPctText] = useState('0%');
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const iconSpin = useRef(new Animated.Value(0)).current;
  const iconPulse = useRef(new Animated.Value(0.6)).current;
  const progressBar = useRef(new Animated.Value(0)).current;
  const [, setStoreTick] = useState(0);

  // Splash animations — spin + pulse loop
  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(iconSpin, { toValue: 1, duration: 1800, useNativeDriver: true })
    );
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(iconPulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(iconPulse, { toValue: 0.6, duration: 800, useNativeDriver: true }),
      ])
    );
    spin.start();
    pulse.start();
    return () => { spin.stop(); pulse.stop(); };
  }, []);

  const fetchIdRef = useRef(0);

  useEffect(() => {
    const unsub = store.onChange(() => setStoreTick(t => t + 1));
    return unsub;
  }, []);
  const detailFetchIdRef = useRef(0);

  const dbg = useCallback((_msg: string) => {}, []);

  const injectMarkers = useCallback((list: NearbySeller[]) => {
    if (!webViewRef.current || !webviewReady.current) return;
    const data = list.map(s => {
      const raw = s.use_store_identity ? s.store_logo_url : s.avatar_url;
      const isMe = store.user && s.id === store.user.id;
      return {
        id: s.id, lat: (isMe && myLocation) ? myLocation.lat : s.lat, lng: (isMe && myLocation) ? myLocation.lng : s.lng, tier: s.seller_tier,
        name: s.use_store_identity ? s.store_name : (s.username ? `@${s.username}` : s.full_name),
        avatar: raw ? getImageUrl(raw) : null,
      };
    });
    webViewRef.current.injectJavaScript(`setSellerMarkers(${JSON.stringify(data)});`);
  }, [myLocation]);

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

  const fetchSellers = useCallback(async (lat: number, lng: number) => {
    const thisFetch = ++fetchIdRef.current;
    try {
      const res = await getNearbySellers(lat, lng) as { sellers: NearbySeller[] };
      if (thisFetch !== fetchIdRef.current) return;
      const list = res.sellers || [];
      setSellers(prev => {
        const merged = new Map(prev.map(s => [s.id, s]));
        list.forEach(s => merged.set(s.id, s));
        return Array.from(merged.values());
      });
      injectMarkers(list);
      setSellersLoaded(true);
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        await AsyncStorage.setItem(CACHE_KEY_SELLERS, JSON.stringify({ ts: Date.now(), sellers: list }));
      } catch {}
    } catch {
      setSellersLoaded(true);
    }
  }, [injectMarkers]);

  const loadCachedSellers = useCallback(async () => {
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      const raw = await AsyncStorage.getItem(CACHE_KEY_SELLERS);
      if (!raw) return false;
      const { ts, sellers: cached } = JSON.parse(raw);
      if (Date.now() - ts > CACHE_TTL) return false;
      setSellers(prev => {
        const merged = new Map(prev.map(s => [s.id, s]));
        cached.forEach((s: NearbySeller) => merged.set(s.id, s));
        return Array.from(merged.values());
      });
      injectMarkers(cached);
      return true;
    } catch { return false; }
  }, [injectMarkers]);

  useEffect(() => {
    (async () => {
      if (Platform.OS === 'web') {
        fetchSellers(18.5944, -72.3074);
        return;
      }
      try {
        const Location = await import('expo-location');
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;

        let cachedLoc: { lat: number; lng: number } | null = null;
        try {
          const raw = await AsyncStorage.getItem(CACHE_KEY_LOCATION);
          if (raw) cachedLoc = JSON.parse(raw);
        } catch {}

        if (cachedLoc) {
          setMyLocation(cachedLoc);
          await loadCachedSellers();
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

  // Re-inject seller markers when myLocation changes so own marker follows GPS
  useEffect(() => {
    if (myLocation && sellers.length > 0) {
      injectMarkers(sellers);
    }
  }, [myLocation]);

  // Progressive crawl: tick up ~1% every 80ms toward a "virtual ceiling"
  // that rises as real milestones hit. Feels smooth, never lies.
  const progressCeiling = useRef(0);
  const progressTarget = useRef(0);

  useEffect(() => {
    // Raise the ceiling when milestones hit — leave room for sellers crawl
    if (mapReady && sellersLoaded) progressCeiling.current = 1;
    else if (mapReady) progressCeiling.current = Math.max(progressCeiling.current, 0.48);
    else progressCeiling.current = Math.max(progressCeiling.current, 0.25);
  }, [mapReady, sellersLoaded]);

  useEffect(() => {
    let raf: number;
    let last = Date.now();
    const tick = () => {
      const now = Date.now();
      const dt = now - last;
      last = now;
      // Move toward ceiling — faster when closer to it, slower at start (feels like real work)
      const gap = progressCeiling.current - progressTarget.current;
      if (gap > 0.001) {
        // Ease-in: speed proportional to remaining gap (satisfying deceleration)
        const speed = 0.0003 + gap * 0.002;
        progressTarget.current = Math.min(progressCeiling.current, progressTarget.current + speed * dt);
        progressBar.setValue(progressTarget.current);
        setSplashPctText(`${Math.round(progressTarget.current * 100)}%`);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Update step message as ceiling changes
  useEffect(() => {
    if (mapReady && sellersLoaded) {
      const count = sellers.length;
      setSplashMsg(count > 0 ? `${count} seller${count !== 1 ? 's' : ''} nearby` : 'Map ready');
    } else if (mapReady) {
      setSplashMsg('Finding sellers...');
    }
  }, [mapReady, sellersLoaded]);

  // Dismiss splash screen once both map and sellers are loaded
  useEffect(() => {
    if (mapReady && sellersLoaded) {
      setTimeout(() => {
        Animated.timing(splashOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => setShowSplash(false));
      }, 600);
    }
  }, [mapReady, sellersLoaded]);

  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'tap') {
        const seller = sellers.find(s => s.id === data.id);
        if (seller) openSheet(seller);
      }
    } catch {}
  }, [sellers, openSheet]);

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
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        await AsyncStorage.setItem(CACHE_KEY_LOCATION, JSON.stringify({ lat, lng }));
      } catch {}
    } catch {}
    setRefreshing(false);
  }, [refreshing, fetchSellers]);

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
    const next = !darkMode;
    setDarkMode(next);
    if (webViewRef.current && webviewReady.current) {
      webViewRef.current.injectJavaScript(`setDarkMode(${next});`);
    }
  }, [darkMode]);

  const handleFindMe = useCallback(() => {
    if (myLocation && webViewRef.current && webviewReady.current) {
      webViewRef.current.injectJavaScript(`centerOn(${myLocation.lat},${myLocation.lng});`);
    }
  }, [myLocation]);

  // ── Radial FAB (Pinterest-style hold-drag-release) ──
  const RADIAL_RADIUS = 82;
  const FAB_SIZE = 52;
  const LONG_PRESS_MS = 120;
  const isSeller = store.user?.role === 'seller';

  // Height of the floating tab bar's top edge above the true screen bottom.
  // Must exactly match App.tsx MainTabs tabBarStyle:
  //   height: 56,  marginBottom: insets.bottom > 0 ? insets.bottom + 8 : 16
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

  // Refs so PanResponder reads fresh values (no stale closures)
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

  const sheetOpacity = sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  const toggleSheet = () => {
    if (sheetExpanded) {
      setSheetExpanded(false);
    } else {
      setSheetExpanded(true);
    }
    Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: false, tension: 80, friction: 12 }).start();
  };

  const sellerAvatar = selectedSeller ? getImageUrl(getSellerAvatar(selectedSeller)) : null;

  return (
    <View style={styles.container}>
      {showSplash && (
        <Animated.View style={[styles.splash, { opacity: splashOpacity }]}>
          <Animated.View style={{ transform: [{ rotate: iconSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }, { scale: iconPulse }] }}>
            <MaterialCommunityIcons name="map-marker-radius" size={52} color={COLORS.coral} />
          </Animated.View>
          <Text style={styles.splashTitle}>Nearby Market</Text>
          <Text style={styles.splashMsg}>{splashMsg}</Text>
          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, {
              width: progressBar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) as any,
            }]} />
          </View>
          <Text style={styles.splashPct}>{splashPctText}</Text>
          {/* Skeleton placeholder blocks */}
          <View style={styles.skeletonRow}>
            <SkeletonBlock width={44} height={44} radius={22} />
            <View style={{ flex: 1, marginLeft: 12, gap: 8 }}>
              <SkeletonBlock width="65%" height={14} />
              <SkeletonBlock width="40%" height={11} />
            </View>
          </View>
          <View style={styles.skeletonRow}>
            <SkeletonBlock width={44} height={44} radius={22} />
            <View style={{ flex: 1, marginLeft: 12, gap: 8 }}>
              <SkeletonBlock width="55%" height={14} />
              <SkeletonBlock width="35%" height={11} />
            </View>
          </View>
          <View style={styles.skeletonRow}>
            <SkeletonBlock width={44} height={44} radius={22} />
            <View style={{ flex: 1, marginLeft: 12, gap: 8 }}>
              <SkeletonBlock width="70%" height={14} />
              <SkeletonBlock width="45%" height={11} />
            </View>
          </View>
        </Animated.View>
      )}
      <WebView
        ref={webViewRef}
        source={{ html: buildMapHtml() }}
        style={styles.map}
        onMessage={handleWebViewMessage}
        onLoadEnd={() => {
          webviewReady.current = true;
          setMapReady(true);
          if (pendingInjection.current) {
            webViewRef.current?.injectJavaScript(pendingInjection.current);
            pendingInjection.current = null;
          }
        }}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        originWhitelist={['*']}
        allowUniversalAccessFromFileURLs
        allowFileAccess
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        scrollEnabled={false}
        bounces={false}
      />

      {/* ── Radial FAB (Pinterest hold-drag-release) ── */}
      {fanOpen && (
        <TouchableOpacity activeOpacity={1} onPress={closeFan} style={styles.mapOverlay} />
      )}
      <View style={[styles.fabAnchor, { bottom: TAB_BAR_TOP_OFFSET + FAB_SIZE / 2 + 8 }]}>
        {/* Fanned icons */}
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

        {/* FAB trigger — uses PanResponder for hold-drag-release */}
        <View {...panResponder.panHandlers} style={{ width: FAB_SIZE, height: FAB_SIZE, alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <Animated.View style={[styles.fab, { width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2 }, {
            transform: [{ rotate: fabRotation }],
          }]}>
            <View style={styles.triggerDot} />
          </Animated.View>
        </View>
      </View>

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
  splash: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: COLORS.bg,
    zIndex: 9999, elevation: 9999,
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  splashTitle: { color: COLORS.text, fontSize: 22, fontWeight: '800', letterSpacing: 0.5 },
  splashMsg: { color: COLORS.text2, fontSize: 14, fontWeight: '500' },
  progressTrack: {
    width: '60%', height: 4, borderRadius: 2,
    backgroundColor: COLORS.surface2, overflow: 'hidden', marginTop: 8,
  },
  progressFill: {
    height: '100%', borderRadius: 2,
    backgroundColor: COLORS.coral,
  },
  splashPct: { color: COLORS.text2, fontSize: 11, fontWeight: '600', marginTop: 4 },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', width: '75%', marginTop: 14 },
  map: { flex: 1 },
  mapOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  refreshBtn: {
    position: 'absolute', right: SPACING.md,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.surface + 'DD', borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4,
  },

  /* Radial FAB */
  fabAnchor: {
    position: 'absolute', alignSelf: 'center',
    width: 0, height: 0, alignItems: 'center', justifyContent: 'center',
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
});