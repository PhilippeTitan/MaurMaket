import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, Dimensions, Animated, Image, PanResponder,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, getDisplayName, getSellerAvatar } from '../theme';
import { store } from '../store';
import {
  API_BASE, getNearbySellers, setSellerLocation, getImageUrl,
  getProducts, toggleFollow, getFollowing, getFollowerCount,
} from '../api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import type { Product } from '../types';

const TIER_COLORS: Record<string, string> = {
  casual: '#F5A623', verified: '#1D9E75', business: '#E04050',
};
const SCREEN_W = Dimensions.get('window').width;
const COLLAPSED_H = 64;
const EXPANDED_H = 200;

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
html,body,#map{width:100%;height:100%;background:#F2F1ED;overflow:hidden}
.leaflet-control-zoom{display:none}
.leaflet-control-attribution{background:rgba(255,255,255,0.7)!important;color:#666!important;font-size:9px!important}
.leaflet-control-attribution a{color:#666!important}
.seller-ring{border-radius:50%;border:3px solid #fff;display:flex;align-items:center;justify-content:center}
.seller-tail{width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent}
.user-dot{width:16px;height:16px;border-radius:50%;border:3px solid #4A9EFF;background:#fff;box-shadow:0 0 8px rgba(74,158,255,0.5)}
.user-tail{width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:8px solid #4A9EFF}
</style>
</head>
<body>
<div id="map"></div>
<script>
var map = L.map("map",{zoomControl:false,attributionControl:true}).setView([18.5944,-72.3074],12);
L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",{
  attribution:"&copy;CARTO&copy;OSM",maxZoom:20,subdomains:"abcd",crossOrigin:true
}).addTo(map);
setTimeout(function(){map.invalidateSize()},200);
setTimeout(function(){map.invalidateSize()},1000);
window.addEventListener("load",function(){map.invalidateSize()});

var sellerLayer = L.layerGroup().addTo(map);
var userMarker = null;
var highlightedId = null;

function setSellerMarkers(sellers) {
  sellerLayer.clearLayers();
  sellers.forEach(function(s) {
    var isBiz = s.tier==='business';
    var isVer = s.tier==='verified';
    var color = isBiz?'#E04050':isVer?'#1D9E75':'#F5A623';
    var size = isVer?50:isBiz?56:44;
    var shape = isBiz?'14px':'50%';
    var badge = isVer?'<div style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:'+color+';border:2px solid #fff;display:flex;align-items:center;justify-content:center"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>':'';
    var inner = s.avatar
      ? '<img src="'+s.avatar+'" style="width:'+(size-6)+'px;height:'+(size-6)+'px;border-radius:'+shape+';object-fit:cover"/>'
      : (isBiz
        ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M3 9l1-5h16l1 5M4 9v11h16V9M4 9h16M9 21v-6h6v6"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-7 8-7s8 3 8 7"/></svg>');
    var icon = L.divIcon({
      className:'',
      iconSize:[64,size+16],iconAnchor:[32,size+16],
      html:'<div style="display:flex;flex-direction:column;align-items:center;position:relative">' +
        '<div style="position:relative;width:'+size+'px;height:'+size+'px;border-radius:'+shape+';background:'+color+';border:3px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);overflow:hidden">'+inner+badge+'</div>' +
        '<div class="seller-tail" style="border-top:9px solid '+color+'"></div></div>'
    });
    var marker = L.marker([s.lat,s.lng],{icon:icon});
    marker.on('click',function(){
      highlightedId = s.id;
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'tap',id:s.id}));
    });
    marker.addTo(sellerLayer);
  });
}

function setUserMarker(lat,lng) {
  if(userMarker) map.removeLayer(userMarker);
  var icon = L.divIcon({
    className:'',iconSize:[20,28],iconAnchor:[10,28],
    html:'<div style="display:flex;flex-direction:column;align-items:center"><div class="user-dot"></div><div class="user-tail"></div></div>'
  });
  userMarker = L.marker([lat,lng],{icon:icon,zIndexOffset:1000}).addTo(map);
  map.setView([lat,lng],14);
}

function centerOn(lat,lng){ map.setView([lat,lng],14); }

map.on("moveend",function(){
  var c=map.getCenter();
  try{window.ReactNativeWebView.postMessage(JSON.stringify({type:"move",lat:c.lat,lng:c.lng}))}catch(e){}
});
</script>
</body>
</html>`;
}

const CACHE_KEY_LOCATION = 'mm_map_last_location';
const CACHE_KEY_SELLERS = 'mm_map_last_sellers';
const CACHE_TTL = 5 * 60 * 1000;

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const webViewRef = useRef<WebView>(null);
  const sheetAnim = useRef(new Animated.Value(0)).current;

  const [sellers, setSellers] = useState<NearbySeller[]>([]);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedSeller, setSelectedSeller] = useState<NearbySeller | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  useEffect(() => { sheetExpandedRef.current = sheetExpanded; }, [sheetExpanded]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const [latestItems, setLatestItems] = useState<Product[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchIdRef = useRef(0);
  const detailFetchIdRef = useRef(0);
  const sheetExpandedRef = useRef(false);

  const dbg = useCallback((_msg: string) => {}, []);

  const injectMarkers = useCallback((list: NearbySeller[]) => {
    if (!webViewRef.current) return;
    const data = list.map(s => {
      const raw = s.use_store_identity ? s.store_logo_url : s.avatar_url;
      return {
        id: s.id, lat: s.lat, lng: s.lng, tier: s.seller_tier,
        name: s.use_store_identity ? s.store_name : s.full_name,
        avatar: raw ? getImageUrl(raw) : null,
      };
    });
    webViewRef.current.injectJavaScript(`setSellerMarkers(${JSON.stringify(data)});`);
  }, []);

  const injectUserMarker = useCallback((lat: number, lng: number) => {
    if (!webViewRef.current) return;
    webViewRef.current.injectJavaScript(`setUserMarker(${lat},${lng});`);
  }, []);

  const openSheet = useCallback((seller: NearbySeller) => {
    setSelectedSeller(seller);
    setSheetExpanded(false);
    setLatestItems([]);
    setFollowerCount(null);
    setIsFollowing(false);
    Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: false, tension: 80, friction: 12 }).start();

    const thisDetail = ++detailFetchIdRef.current;
    setLoadingDetail(true);

    const followingList = store.user ? (store as any)._followingIds : [];
    if (followingList?.includes?.(seller.id)) setIsFollowing(true);

    getProducts({ seller: seller.id, limit: '5' } as any).then((res: any) => {
      if (thisDetail !== detailFetchIdRef.current) return;
      setLatestItems((res?.products || []).slice(0, 5));
    }).catch(() => {}).finally(() => setLoadingDetail(false));

    getFollowerCount(seller.id).then((res: any) => {
      if (thisDetail !== detailFetchIdRef.current) return;
      setFollowerCount(res?.count ?? 0);
    }).catch(() => {});

    if (store.token) {
      getFollowing().then((res: any) => {
        if (thisDetail !== detailFetchIdRef.current) return;
        const list = Array.isArray(res) ? res : [];
        setIsFollowing(list.some((f: any) => f.seller_id === seller.id || f.id === seller.id));
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
    const prev = isFollowing;
    setIsFollowing(!prev);
    setFollowBusy(true);
    try {
      const res = await toggleFollow(selectedSeller.id) as { following?: boolean };
      if (res.following !== undefined) setIsFollowing(res.following);
      const countRes = await getFollowerCount(selectedSeller.id) as any;
      setFollowerCount(countRes?.count ?? 0);
    } catch { setIsFollowing(prev); }
    setFollowBusy(false);
  }, [selectedSeller, isFollowing, followBusy]);

  const fetchSellers = useCallback(async (lat: number, lng: number, radius = 20) => {
    const thisFetch = ++fetchIdRef.current;
    try {
      const res = await getNearbySellers(lat, lng, radius) as { sellers: NearbySeller[] };
      if (thisFetch !== fetchIdRef.current) return;
      const list = res.sellers || [];
      setSellers(list);
      injectMarkers(list);
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        await AsyncStorage.setItem(CACHE_KEY_SELLERS, JSON.stringify({ ts: Date.now(), sellers: list }));
      } catch {}
    } catch {}
  }, [injectMarkers]);

  const loadCachedSellers = useCallback(async () => {
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      const raw = await AsyncStorage.getItem(CACHE_KEY_SELLERS);
      if (!raw) return false;
      const { ts, sellers: cached } = JSON.parse(raw);
      if (Date.now() - ts > CACHE_TTL) return false;
      setSellers(cached);
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
          injectUserMarker(cachedLoc.lat, cachedLoc.lng);
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
        injectUserMarker(lat, lng);
        AsyncStorage.setItem(CACHE_KEY_LOCATION, JSON.stringify({ lat, lng })).catch(() => {});
        setSellerLocation(lat, lng).catch(() => {});
        fetchSellers(lat, lng);
      } catch {
        fetchSellers(18.5944, -72.3074);
      }
    })();
  }, []);

  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'move') fetchSellers(data.lat, data.lng);
      if (data.type === 'tap') {
        const seller = sellers.find(s => s.id === data.id);
        if (seller) openSheet(seller);
      }
    } catch {}
  }, [sellers, fetchSellers, openSheet]);

  const sheetHeight = sheetAnim.interpolate({
    inputRange: [0, 1], outputRange: [0, sheetExpanded ? EXPANDED_H : COLLAPSED_H],
  });
  const sheetOpacity = sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  const dragStartExpanded = useRef(false);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dy) > 6,
      onPanResponderGrant: () => { dragStartExpanded.current = sheetExpandedRef.current; },
      onPanResponderRelease: (_evt, gesture) => {
        const draggedUp = gesture.dy < -20;
        const draggedDown = gesture.dy > 20;
        if (draggedUp && !dragStartExpanded.current) {
          setSheetExpanded(true);
          Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: false, tension: 80, friction: 12 }).start();
        } else if (draggedDown && dragStartExpanded.current) {
          setSheetExpanded(false);
          Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: false, tension: 80, friction: 12 }).start();
        }
      },
    })
  ).current;

  const sellerAvatar = selectedSeller ? getImageUrl(getSellerAvatar(selectedSeller)) : null;

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: buildMapHtml() }}
        style={styles.map}
        onMessage={handleWebViewMessage}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        allowUniversalAccessFromFileURLs
        allowFileAccess
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        scrollEnabled={false}
        bounces={false}
      />

      {selectedSeller && (
        <Animated.View style={[styles.sheet, {
          bottom: 56 + (insets.bottom > 0 ? insets.bottom : 0) + (insets.bottom > 0 ? 8 : 16),
          height: sheetHeight,
          opacity: sheetOpacity,
        }]}>
          <View {...panResponder.panHandlers} style={styles.dragHandleArea}>
            <TouchableOpacity activeOpacity={0.9} onPress={() => {
              if (sheetExpanded) { setSheetExpanded(false); Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: false, tension: 80, friction: 12 }).start(); }
              else { setSheetExpanded(true); Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: false, tension: 80, friction: 12 }).start(); }
            }} style={styles.chevronRow} accessibilityLabel={sheetExpanded ? 'collapse seller details' : 'expand seller details'} accessibilityRole="button">
              <View style={styles.dragBar} />
              <MaterialCommunityIcons name={sheetExpanded ? 'chevron-down' : 'chevron-up'} size={20} color={COLORS.text2} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('Storefront', { sellerId: selectedSeller.id })} style={styles.sheetTop}>
            {sellerAvatar ? (
              <Image source={{ uri: sellerAvatar }} style={styles.sheetAvatar} />
            ) : (
              <View style={[styles.sheetAvatar, styles.sheetAvatarFallback]}>
                <Text style={styles.sheetAvatarText}>{(selectedSeller.full_name || '?')[0]}</Text>
              </View>
            )}
            <View style={styles.sheetInfo}>
              <Text style={styles.sheetName} numberOfLines={1}>{getDisplayName(selectedSeller)}</Text>
              <View style={styles.sheetMeta}>
                <View style={[styles.tierDot, { backgroundColor: TIER_COLORS[selectedSeller.seller_tier] || '#F5A623' }]} />
                <Text style={styles.sheetTier}>{selectedSeller.seller_tier}</Text>
                {followerCount !== null && <Text style={styles.sheetFollower}>{followerCount} follower{followerCount !== 1 ? 's' : ''}</Text>}
              </View>
            </View>
            <TouchableOpacity onPress={handleFollowToggle} disabled={followBusy} style={[styles.followBtn, isFollowing && styles.followBtnActive]}>
              <Text style={[styles.followText, isFollowing && styles.followTextActive]}>{isFollowing ? 'Following' : 'Follow'}</Text>
            </TouchableOpacity>
          </TouchableOpacity>

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
                        <Text style={styles.itemPrice} numberOfLines={1}>Rs {(item.sale_price ?? item.price)?.toLocaleString?.() ?? item.price}</Text>
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
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  map: { flex: 1 },

  sheet: {
    position: 'absolute', left: 0, right: 0,
    backgroundColor: COLORS.surface || '#161B22',
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    overflow: 'hidden',
    borderTopWidth: 1, borderTopColor: COLORS.border || '#30363D',
  },
  dragHandleArea: { width: '100%' },
  dragBar: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border || '#30363D', marginBottom: 4 },
  chevronRow: { alignItems: 'center', paddingVertical: 6 },
  sheetTop: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingBottom: 10, gap: 10 },
  sheetAvatar: { width: 44, height: 44, borderRadius: 22 },
  sheetAvatarFallback: { backgroundColor: COLORS.coral, alignItems: 'center', justifyContent: 'center' },
  sheetAvatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
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