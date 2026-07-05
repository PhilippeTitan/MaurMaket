import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform,
  Animated, Image, PanResponder, Dimensions, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { COLORS, SPACING, RADIUS, getDisplayName, getSellerAvatar } from '../theme';
import { LEAFLET_JS, LEAFLET_CSS } from '../leafletAssets';
import { store } from '../store';
import { getNearbySellers, setSellerLocation, getImageUrl, getProducts, toggleFollow, getFollowing, getFollowerCount } from '../api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import type { Product } from '../types';
import { useTranslation } from '../i18n';

const TIER_MARKER: Record<string, { size: number; gradient: string; tailColor: string; iconColor: string }> = {
  casual:   { size: 42, gradient: '#F5A623',            tailColor: '#F5A623', iconColor: '#F5A623' },
  verified: { size: 46, gradient: '#1D9E75',            tailColor: '#1D9E75', iconColor: '#5DCAA5' },
  business: { size: 50, gradient: '#E04050',            tailColor: '#E04050', iconColor: '#FF6B7A' },
};

const SCREEN_W = Dimensions.get('window').width;
const PEEK_HEIGHT = 152;
const FULL_HEIGHT = 400;

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

let _cachedUri: string | null = null;

async function loadMapHtml(): Promise<string> {
  if (_cachedUri) return _cachedUri;
  const { cacheDirectory, writeAsStringAsync } = await import('expo-file-system/legacy');
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<style>${LEAFLET_CSS}</style>
<script>${LEAFLET_JS}</script>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html, body, #map { width:100%; height:100%; background:#0D1117; }
.leaflet-control-zoom { display:none; }
.leaflet-control-attribution { background:rgba(13,17,23,0.7) !important; color:#555 !important; font-size:9px !important; }
.leaflet-control-attribution a { color:#555 !important; }
.snap-marker { position:relative; cursor:pointer; display:flex; flex-direction:column; align-items:center; }
.snap-img { border-radius:50%; object-fit:cover; }
.snap-fallback { display:flex; align-items:center; justify-content:center; }
.user-marker { position:relative; display:flex; flex-direction:column; align-items:center; }
</style>
</head>
<body>
<div id="map"></div>
<script>
var map = L.map("map", { zoomControl: false, attributionControl: true }).setView([18.5944, -72.3074], 12);
L.tileLayer("https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
  attribution: "&copy; <a href='https://carto.com/'>CARTO</a> &copy; <a href='https://www.openstreetmap.org/copyright'>OSM</a>",
  subdomains: "abcd",
  maxZoom: 20
}).addTo(map);
map.on("moveend", function() {
  var c = map.getCenter();
  window.ReactNativeWebView.postMessage(JSON.stringify({type:"move",lat:c.lat,lng:c.lng}));
});
</script>
</body>
</html>`;
  const path = (cacheDirectory || '') + 'maurmaket_map.html';
  await writeAsStringAsync(path, html);
  _cachedUri = path;
  return _cachedUri;
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t } = useTranslation();
  const webViewRef = useRef<WebView>(null);
  // sheetState: 0 = hidden (below screen), 1 = peek, 2 = full (detail revealed)
  const sheetState = useRef(new Animated.Value(0)).current;
  const dragStartState = useRef(1);

  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [sellers, setSellers] = useState<NearbySeller[]>([]);
  const [selectedSeller, setSelectedSeller] = useState<NearbySeller | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingLocation, setSettingLocation] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [locationSaved, setLocationSaved] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const [latestItems, setLatestItems] = useState<Product[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [avatarViewerUrl, setAvatarViewerUrl] = useState<string | null>(null);
  const [showEmptyBanner, setShowEmptyBanner] = useState(false);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const locationWatcher = useRef<any>(null);

  const isSeller = store.isSeller;
  const fetchIdRef = useRef(0);
  const detailFetchIdRef = useRef(0);

  const sheetBottom = 56 + (insets.bottom > 0 ? insets.bottom : 0) + 8;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8,
      onPanResponderGrant: () => {
        // @ts-ignore - reading the current animated value synchronously
        sheetState.stopAnimation((v: number) => { dragStartState.current = v; });
      },
      onPanResponderMove: (_, g) => {
        const travel = FULL_HEIGHT - PEEK_HEIGHT || 1;
        const delta = (-g.dy) / travel;
        const next = Math.max(0, Math.min(2, dragStartState.current + delta));
        sheetState.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        sheetState.stopAnimation((v: number) => {
          let target: number;
          if (g.vy < -0.5) target = Math.min(2, Math.ceil(v));
          else if (g.vy > 0.5) target = Math.max(0, Math.floor(v));
          else target = Math.round(v);
          if (target === 0) {
            setSelectedSeller(null);
            return;
          }
          Animated.spring(sheetState, { toValue: target, useNativeDriver: true, tension: 70, friction: 12 }).start();
        });
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
    loadMapHtml().then(html => setHtmlContent(html)).catch(() => {});
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      setLoading(false);
      fetchSellers(18.5944, -72.3074);
      return;
    }
    let active = true;
    (async () => {
      const { status } = await (await import('expo-location')).requestForegroundPermissionsAsync();
      if (status !== 'granted' || !active) {
        setLoading(false);
        fetchSellers(18.5944, -72.3074);
        return;
      }
      try {
        const ExpoLoc = await import('expo-location');
        const loc = await ExpoLoc.getCurrentPositionAsync({ accuracy: ExpoLoc.Accuracy.Balanced });
        if (!active) return;
        const lat = loc.coords.latitude;
        const lng = loc.coords.longitude;
        setMyLocation({ lat, lng });
        await fetchSellers(lat, lng);
      } catch {
        fetchSellers(18.5944, -72.3074);
      }
      setLoading(false);

      try {
        const ExpoLoc = await import('expo-location');
        locationWatcher.current = await ExpoLoc.watchPositionAsync(
          { accuracy: ExpoLoc.Accuracy.Balanced, distanceInterval: 200, timeInterval: 15000 },
          (pos: any) => {
            if (!active) return;
            setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          }
        );
      } catch {}
    })();
    return () => { active = false; locationWatcher.current?.remove(); };
  }, []);

  useEffect(() => {
    if (selectedSeller) {
      dragStartState.current = 1;
      Animated.spring(sheetState, { toValue: 1, useNativeDriver: true, tension: 70, friction: 12 }).start();

      const thisDetailFetch = ++detailFetchIdRef.current;
      setIsFollowing(false);
      setFollowerCount(null);
      setLatestItems([]);
      setLoadingDetail(true);

      (async () => {
        try {
          const [productsRes, followingRes, followerRes] = await Promise.allSettled([
            getProducts({ seller: selectedSeller.id, limit: '3' }) as Promise<{ products: Product[] }>,
            getFollowing(),
            getFollowerCount(selectedSeller.id) as Promise<{ count?: number }>,
          ]);
          if (thisDetailFetch !== detailFetchIdRef.current) return;

          if (productsRes.status === 'fulfilled') {
            setLatestItems(productsRes.value.products || []);
          }
          if (followingRes.status === 'fulfilled') {
            const raw = followingRes.value as unknown;
            const list: any[] = Array.isArray(raw)
              ? raw
              : (raw as any)?.sellers || (raw as any)?.following || [];
            setIsFollowing(list.some((s: any) => (s.id || s.seller_id) === selectedSeller.id));
          }
          if (followerRes.status === 'fulfilled') {
            const count = (followerRes.value as any)?.count;
            if (typeof count === 'number') setFollowerCount(count);
          }
        } finally {
          if (thisDetailFetch === detailFetchIdRef.current) setLoadingDetail(false);
        }
      })();
    } else {
      Animated.spring(sheetState, { toValue: 0, useNativeDriver: true, tension: 70, friction: 12 }).start();
    }
  }, [selectedSeller?.id]);

  useEffect(() => {
    if (sellers.length === 0 && !loading && !selectedSeller) {
      setShowEmptyBanner(true);
      const timer = setTimeout(() => setShowEmptyBanner(false), 3000);
      return () => clearTimeout(timer);
    } else {
      setShowEmptyBanner(false);
    }
  }, [sellers.length, loading, selectedSeller?.id]);

  useEffect(() => {
    if (mapReady && webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        (function() {
          map.eachLayer(function(layer) {
            if (layer instanceof L.Marker) map.removeLayer(layer);
          });

          var myLoc = ${myLocation ? `L.marker([${myLocation.lat}, ${myLocation.lng}], {
            icon: L.divIcon({
              className: '',
              html: '<div class="user-marker">' +
                '<div style="position:absolute;top:-9px;left:-9px;width:66px;height:66px;border-radius:50%;background:rgba(55,138,221,0.15)"></div>' +
                '<div style="width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,#378ADD,#185FA5);padding:3px;box-shadow:0 0 0 3px rgba(55,138,221,0.25)">' +
                  '<div style="width:100%;height:100%;border-radius:50%;background:#0D1117;display:flex;align-items:center;justify-content:center;overflow:hidden">' +
                    ${hasUserAvatarForMap ? `'<img src="${escapedUserAvatarForMap}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" onerror="this.style.display=none;this.nextElementSibling.style.display=flex"/>'` : ''} +
                    '<div class="snap-fallback" style="display:${hasUserAvatarForMap ? 'none' : 'flex'};width:100%;height:100%"><svg viewBox="0 0 24 24" width="22" height="22" fill="#378ADD"><path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v2h20v-2c0-3.33-6.67-5-10-5z"/></svg></div>' +
                  '</div>' +
                '</div>' +
                '<div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid #185FA5;margin:0 auto"></div>' +
              '</div>',
              iconSize: [54, 65],
              iconAnchor: [27, 65],
            })
          }).addTo(map);` : 'null'}

          ${sellers.map(s => {
            const avatarUrl = getImageUrl(getSellerAvatar(s)) || '';
            const tier = TIER_MARKER[s.seller_tier] || TIER_MARKER.casual;
            const hasImage = avatarUrl && !failedImages.has(`wv_${s.id}`);
            const escapedAvatar = hasImage ? avatarUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'") : '';
            const sz = tier.size;
            const inner = sz - 4;
            const iconSz = Math.round(sz * 0.4);
            const tailL = Math.round(sz * 0.22);
            return `L.marker([${s.lat}, ${s.lng}], {
              icon: L.divIcon({
                className: '',
                html: '<div class="snap-marker" onclick="window.ReactNativeWebView.postMessage(JSON.stringify({type:\\'tap\\',id:\\'${s.id}\\'}))">' +
                  '<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${tier.gradient};padding:2px;box-shadow:0 2px 8px rgba(0,0,0,0.5)">' +
                    '<div style="width:100%;height:100%;border-radius:50%;background:#0D1117;display:flex;align-items:center;justify-content:center;overflow:hidden">' +
                      (${hasImage} ? '<img src="${escapedAvatar}" class="snap-img" style="width:${inner}px;height:${inner}px;border-radius:${inner/2}px" onerror="this.style.display=none;this.nextElementSibling.style.display=flex"/>' : '') +
                      '<div class="snap-fallback" style="display:${hasImage ? 'none' : 'flex'};width:${inner}px;height:${inner}px"><svg viewBox="0 0 24 24" width="${iconSz}" height="${iconSz}" fill="${tier.iconColor}"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>' +
                    '</div>' +
                  '</div>' +
                  '<div style="width:0;height:0;border-left:${tailL}px solid transparent;border-right:${tailL}px solid transparent;border-top:7px solid ${tier.tailColor};margin:0 auto"></div>' +
                '</div>',
                iconSize: [${sz}, ${sz + 9}],
                iconAnchor: [${sz / 2}, ${sz + 9}],
              })
            }).addTo(map);`;
          }).join('\n          ')}

          if (myLoc) map.setView([${myLocation?.lat ?? 18.5944}, ${myLocation?.lng ?? -72.3074}], 14);
        })();
        true;
      `);
    }
  }, [mapReady, sellers, failedImages, myLocation]);

  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'tap') {
        const seller = sellers.find(s => s.id === data.id);
        if (seller) setSelectedSeller(seller);
      } else if (data.type === 'move') {
        fetchSellers(data.lat, data.lng, 20);
      }
    } catch {}
  }, [sellers, fetchSellers]);

  const centerOnMe = () => {
    if (myLocation && webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        map.setView([${myLocation.lat}, ${myLocation.lng}], 15, {animate:true});
        true;
      `);
    }
  };

  const handleSetMyLocation = async () => {
    if (!myLocation) return;
    setSettingLocation(true);
    try {
      await setSellerLocation(myLocation.lat, myLocation.lng);
      setLocationSaved(true);
      fetchSellers(myLocation.lat, myLocation.lng, 20);
      setTimeout(() => setLocationSaved(false), 2000);
    } catch {}
    setSettingLocation(false);
  };

  const navigateToStorefront = (sellerId: string) => {
    setSelectedSeller(null);
    navigation.navigate('Storefront', { sellerId });
  };

  const getAvatarUrl = (seller: NearbySeller) => {
    return getImageUrl(getSellerAvatar(seller));
  };

  const markImageFailed = (id: string) => setFailedImages(prev => new Set(prev).add(id));

  const handleFollowToggle = async () => {
    if (!selectedSeller || followBusy) return;
    const sellerId = selectedSeller.id;
    const prevFollowing = isFollowing;
    setFollowBusy(true);
    setIsFollowing(!prevFollowing);
    setFollowerCount(c => (c == null ? c : c + (prevFollowing ? -1 : 1)));
    try {
      const res = await toggleFollow(sellerId) as { following?: boolean };
      if (typeof res.following === 'boolean') setIsFollowing(res.following);
    } catch {
      setIsFollowing(prevFollowing);
      setFollowerCount(c => (c == null ? c : c + (prevFollowing ? 1 : -1)));
    } finally {
      setFollowBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.coral} />
      </View>
    );
  }

  if (!htmlContent) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.coral} />
      </View>
    );
  }

  const buttonBottom = sheetBottom + (selectedSeller ? PEEK_HEIGHT : 0) + 12;
  const userAvatarForMap = getImageUrl(store.user?.avatar_url) || null;
  const hasUserAvatarForMap = !!userAvatarForMap;
  const escapedUserAvatarForMap = hasUserAvatarForMap ? userAvatarForMap.replace(/'/g, "\\'") : '';

  return (
    <View style={styles.container}>
      {Platform.OS !== 'web' ? (
        <>
        <WebView
          ref={webViewRef}
          source={{ uri: htmlContent }}
          style={styles.map}
          onMessage={handleWebViewMessage}
          onLoadEnd={() => setMapReady(true)}
          onError={(e) => console.warn('WebView error:', e.nativeEvent)}
          onHttpError={(e) => console.warn('WebView HTTP error:', e.nativeEvent.statusCode)}
          javaScriptEnabled
          domStorageEnabled
          geolocationEnabled
          originWhitelist={['*']}
          allowUniversalAccessFromFileURLs
          allowFileAccess
          mixedContentMode="always"
          setSupportMultipleWindows={false}
          scrollEnabled={false}
          bounces={false}
        />
        </>
      ) : (
        <View style={[styles.map, styles.webFallback]}>
          <MaterialCommunityIcons name="map-marker-radius" size={48} color={COLORS.coral} />
          <Text style={styles.webFallbackTitle}>Nearby Market</Text>
          <Text style={styles.webFallbackText}>
            {sellers.length} seller{sellers.length !== 1 ? 's' : ''} found nearby
          </Text>
          <View style={styles.webSellerList}>
            {sellers.map(s => (
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
            {sellers.length > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{sellers.length}</Text>
              </View>
            )}
          </View>
        </View>
      </LinearGradient>

      {Platform.OS !== 'web' && (
        <TouchableOpacity
          style={[styles.myLocationBtn, { bottom: buttonBottom }]}
          onPress={centerOnMe}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="crosshairs-gps" size={20} color={COLORS.blue} />
        </TouchableOpacity>
      )}

      {isSeller && Platform.OS !== 'web' && (
        <TouchableOpacity
          style={[styles.setLocationBtn, { bottom: buttonBottom + 52 }, locationSaved && styles.setLocationBtnSaved]}
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

      {showEmptyBanner && (
        <View style={[styles.emptyBanner, { top: insets.top + SPACING.sm + 44 }]}>
          <MaterialCommunityIcons name="map-marker-off-outline" size={16} color={COLORS.text2} />
          <Text style={styles.emptyBannerText}>No sellers nearby</Text>
          {isSeller && (
            <TouchableOpacity onPress={handleSetMyLocation} activeOpacity={0.7}>
              <Text style={styles.emptyBannerAction}>Set location</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {selectedSeller && Platform.OS !== 'web' && (
        <Animated.View
          style={[
            styles.dragSheet,
            {
              bottom: sheetBottom,
              height: FULL_HEIGHT,
              paddingBottom: insets.bottom,
              transform: [{
                translateY: sheetState.interpolate({
                  inputRange: [0, 1, 2],
                  outputRange: [FULL_HEIGHT + 40, FULL_HEIGHT - PEEK_HEIGHT, 0],
                }),
              }],
            },
          ]}
        >
          <View {...panResponder.panHandlers} style={styles.dragHandleZone}>
            <View style={styles.handle} />
          </View>

          <View style={styles.sheetHeaderRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                const url = getAvatarUrl(selectedSeller);
                if (url) setAvatarViewerUrl(url);
              }}
            >
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: TIER_MARKER[selectedSeller.seller_tier]?.gradient || '#30363D', padding: 2 }}>
                <View style={{ width: '100%', height: '100%', borderRadius: 22, backgroundColor: COLORS.bg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                  {getAvatarUrl(selectedSeller) && !failedImages.has(`p_${selectedSeller.id}`) ? (
                    <Image
                      source={{ uri: getAvatarUrl(selectedSeller)! }}
                      style={{ width: 44, height: 44, borderRadius: 22 }}
                      onError={() => markImageFailed(`p_${selectedSeller.id}`)}
                    />
                  ) : (
                    <MaterialCommunityIcons name="account" size={20} color={COLORS.text2} />
                  )}
                </View>
              </View>
            </TouchableOpacity>

            <View style={styles.previewInfo}>
              <View style={styles.previewNameRow}>
                <Text style={styles.previewName} numberOfLines={1}>{getDisplayName(selectedSeller)}</Text>
                {selectedSeller.seller_tier !== 'casual' && selectedSeller.seller_tier !== 'none' && (
                  <MaterialCommunityIcons
                    name={selectedSeller.seller_tier === 'business' ? 'crown' : 'shield-check'}
                    size={14}
                    color={TIER_MARKER[selectedSeller.seller_tier]?.iconColor || COLORS.text2}
                  />
                )}
              </View>
              <Text style={styles.previewMeta}>
                {selectedSeller.distance_km < 1 ? '<1' : selectedSeller.distance_km.toFixed(1)} km away
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.followBtn, isFollowing && styles.followBtnActive]}
              onPress={handleFollowToggle}
              disabled={followBusy}
              activeOpacity={0.7}
            >
              <Text style={[styles.followBtnText, isFollowing && styles.followBtnTextActive]}>
                {isFollowing ? t('storefront.following') : t('storefront.follow')}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sheetStatsRow}>
            <Text style={styles.sheetStatText}>
              <Text style={styles.sheetStatValue}>{selectedSeller.product_count}</Text> products
            </Text>
            {selectedSeller.avg_rating > 0 && (
              <Text style={styles.sheetStatText}>
                <Text style={styles.sheetStatValue}>{selectedSeller.avg_rating.toFixed(1)}</Text> rating
              </Text>
            )}
            {followerCount != null && (
              <Text style={styles.sheetStatText}>
                <Text style={styles.sheetStatValue}>{followerCount}</Text> {t('storefront.followers').toLowerCase()}
              </Text>
            )}
          </View>

          <Animated.View
            style={[
              styles.sheetDetail,
              {
                opacity: sheetState.interpolate({ inputRange: [1, 1.4, 2], outputRange: [0, 0, 1], extrapolate: 'clamp' }),
              },
            ]}
            pointerEvents={latestItems.length ? 'auto' : 'none'}
          >
            <Text style={styles.sheetDetailLabel}>Latest items</Text>
            {loadingDetail ? (
              <ActivityIndicator size="small" color={COLORS.text2} style={{ marginTop: 8 }} />
            ) : latestItems.length > 0 ? (
              <View style={styles.latestItemsRow}>
                {latestItems.map(p => {
                  const img = getImageUrl(p.images?.[0]?.image_url) || null;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.latestItem}
                      activeOpacity={0.8}
                      onPress={() => navigateToStorefront(selectedSeller.id)}
                    >
                      {img && !failedImages.has(`li_${p.id}`) ? (
                        <Image source={{ uri: img }} style={styles.latestItemImg} onError={() => markImageFailed(`li_${p.id}`)} />
                      ) : (
                        <View style={[styles.latestItemImg, styles.latestItemImgFallback]}>
                          <MaterialCommunityIcons name="image-outline" size={20} color={COLORS.text2} />
                        </View>
                      )}
                      <Text style={styles.latestItemPrice} numberOfLines={1}>Rs {p.price?.toLocaleString?.() ?? p.price}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.sheetDetailEmpty}>No products listed yet</Text>
            )}

            <TouchableOpacity
              style={styles.previewVisitBtn}
              onPress={() => navigateToStorefront(selectedSeller.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.previewVisitText}>Visit storefront</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}

      <Modal
        visible={!!avatarViewerUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarViewerUrl(null)}
      >
        <TouchableOpacity
          style={styles.avatarViewerBackdrop}
          activeOpacity={1}
          onPress={() => setAvatarViewerUrl(null)}
        >
          {avatarViewerUrl && (
            <Image source={{ uri: avatarViewerUrl }} style={styles.avatarViewerImage} resizeMode="contain" />
          )}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

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
    padding: 12, backgroundColor: COLORS.bg, borderRadius: RADIUS.card,
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
    backgroundColor: COLORS.coral, borderRadius: RADIUS.card,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  countBadgeText: { color: COLORS.white, fontSize: 12, fontWeight: '700' },
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

  emptyBanner: {
    position: 'absolute', left: SPACING.lg, right: SPACING.lg,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(13,17,23,0.85)', borderRadius: RADIUS.card,
    paddingHorizontal: 14, paddingVertical: 10,
    zIndex: 8,
  },
  emptyBannerText: { flex: 1, color: COLORS.text2, fontSize: 13 },
  emptyBannerAction: { color: COLORS.coral, fontSize: 13, fontWeight: '700' },

  dragSheet: {
    position: 'absolute', left: 0, right: 0,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: SPACING.lg,
    elevation: 12, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.4, shadowRadius: 12,
    zIndex: 10,
  },
  dragHandleZone: { paddingTop: SPACING.sm, paddingBottom: 4 },
  handle: {
    alignSelf: 'center', width: 42, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border,
  },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  followBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.row,
    borderWidth: 1, borderColor: COLORS.blue,
  },
  followBtnActive: { backgroundColor: COLORS.blue },
  followBtnText: { color: COLORS.blue, fontSize: 12, fontWeight: '700' },
  followBtnTextActive: { color: COLORS.white },
  sheetStatsRow: {
    flexDirection: 'row', gap: 16, marginTop: SPACING.md,
    paddingBottom: SPACING.sm, borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
  },
  sheetStatText: { color: COLORS.text2, fontSize: 12 },
  sheetStatValue: { color: COLORS.text, fontWeight: '700' },
  sheetDetail: { paddingTop: SPACING.md, paddingBottom: SPACING.md },
  sheetDetailLabel: {
    color: COLORS.text2, fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  sheetDetailEmpty: { color: COLORS.text2, fontSize: 12 },
  latestItemsRow: { flexDirection: 'row', gap: 8 },
  latestItem: { width: 76 },
  latestItemImg: { width: 76, height: 76, borderRadius: 10 },
  latestItemImgFallback: { backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center' },
  latestItemPrice: { color: COLORS.text, fontSize: 11, marginTop: 4 },

  previewInfo: { flex: 1 },
  previewNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  previewName: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  previewMeta: { color: COLORS.text2, fontSize: 11, marginTop: 1 },
  previewVisitBtn: {
    marginTop: SPACING.md,
    paddingVertical: 10, borderRadius: RADIUS.card,
    backgroundColor: COLORS.coral, alignItems: 'center',
  },
  previewVisitText: { color: COLORS.white, fontSize: 13, fontWeight: '700' },

  avatarViewerBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarViewerImage: { width: SCREEN_W - 40, height: SCREEN_W - 40, borderRadius: (SCREEN_W - 40) / 2 },
});
