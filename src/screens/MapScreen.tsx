import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform,
  Animated, FlatList, Image, PanResponder, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { COLORS, SPACING, getDisplayName, getSellerAvatar } from '../theme';
import { store } from '../store';
import { getNearbySellers, setSellerLocation, getImageUrl } from '../api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

const TIER_COLORS: Record<string, string> = {
  casual: 'transparent',
  verified: COLORS.green,
  business: COLORS.yellow,
};

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

function buildMapHtml(sellers: NearbySeller[], myLocation: { lat: number; lng: number } | null, failedImages: Set<string>) {
  const centerLat = myLocation?.lat ?? 18.5944;
  const centerLng = myLocation?.lng ?? -72.3074;
  const zoom = myLocation ? 14 : 12;

  const sellerMarkers = sellers.map(s => {
    const avatarUrl = getImageUrl(getSellerAvatar(s)) || '';
    const ringColor = TIER_COLORS[s.seller_tier] || '#555';
    const hasImage = avatarUrl && !failedImages.has(`wv_${s.id}`);
    const name = s.use_store_identity && s.store_name ? s.store_name : s.full_name;
    const escapedName = name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const escapedAvatar = hasImage ? avatarUrl.replace(/'/g, "\\'") : '';
    return `
      L.marker([${s.lat}, ${s.lng}], {
        icon: L.divIcon({
          className: '',
          html: '<div class="marker-bubble" style="border-color:${ringColor};" onclick="window.ReactNativeWebView.postMessage(JSON.stringify({type:\'tap\',id:\'${s.id}\'}))">' +
            (${hasImage} ? '<img src="${escapedAvatar}" class="marker-img" onerror="this.style.display=none;this.nextElementSibling.style.display=flex"/>' : '') +
            '<div class="marker-fallback" style="display:${hasImage ? 'none' : 'flex'}"><svg viewBox="0 0 24 24" width="16" height="16" fill="#8B949E"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>' +
            '</div>',
          iconSize: [40, 48],
          iconAnchor: [20, 48],
        })
      }).addTo(map);
    `;
  }).join('\n    ');

  const userMarker = myLocation ? `
    L.marker([${myLocation.lat}, ${myLocation.lng}], {
      icon: L.divIcon({
        className: '',
        html: '<div class="user-dot"><div class="user-dot-inner"></div></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      })
    }).addTo(map);
  ` : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body, #map { width:100%; height:100%; background:#0D1117; }
  .leaflet-control-zoom { display:none; }
  .leaflet-control-attribution { background:rgba(13,17,23,0.7) !important; color:#555 !important; font-size:9px !important; }
  .leaflet-control-attribution a { color:#555 !important; }

  .marker-bubble {
    width:40px; height:40px; border-radius:20px; border:2.5px solid #555;
    background:#161B22; overflow:hidden; cursor:pointer;
    display:flex; align-items:center; justify-content:center;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
  }
  .marker-img { width:34px; height:34px; border-radius:17px; object-fit:cover; }
  .marker-fallback { display:flex; align-items:center; justify-content:center; width:34px; height:34px; }

  .user-dot {
    width:20px; height:20px; border-radius:10px;
    background:rgba(59,130,246,0.25);
    display:flex; align-items:center; justify-content:center;
  }
  .user-dot-inner {
    width:10px; height:10px; border-radius:5px;
    background:#3B82F6; border:2px solid #fff;
    box-shadow: 0 1px 4px rgba(0,0,0,0.3);
  }
</style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map', {
    zoomControl: false,
    attributionControl: true
  }).setView([${centerLat}, ${centerLng}], ${zoom});

  L.tileLayer('https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    subdomains: 'abcd',
    maxZoom: 20,
  }).addTo(map);

    ${userMarker}

    ${sellerMarkers}

  map.on('moveend', function() {
    var c = map.getCenter();
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'move',
      lat: c.lat,
      lng: c.lng
    }));
  });
</script>
</body>
</html>`;
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const webViewRef = useRef<WebView>(null);
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
  const locationWatcher = useRef<any>(null);

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
              html: '<div class="user-dot"><div class="user-dot-inner"></div></div>',
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            })
          }).addTo(map);` : 'null'}

          ${filteredSellers.map(s => {
            const avatarUrl = getImageUrl(getSellerAvatar(s)) || '';
            const ringColor = TIER_COLORS[s.seller_tier] || '#555';
            const hasImage = avatarUrl && !failedImages.has(`wv_${s.id}`);
            const escapedAvatar = hasImage ? avatarUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'") : '';
            return `L.marker([${s.lat}, ${s.lng}], {
              icon: L.divIcon({
                className: '',
                html: '<div class="marker-bubble" style="border-color:${ringColor};" onclick="window.ReactNativeWebView.postMessage(JSON.stringify({type:\\'tap\\',id:\\'${s.id}\\'}))">' +
                  ${hasImage} ? '<img src="${escapedAvatar}" class="marker-img" onerror="this.style.display=none;this.nextElementSibling.style.display=flex"/>' +
                  '<div class="marker-fallback" style="display:${hasImage ? 'none' : 'flex'}"><svg viewBox="0 0 24 24" width="16" height="16" fill="#8B949E"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>' +
                  '</div>',
                iconSize: [40, 48],
                iconAnchor: [20, 48],
              })
            }).addTo(map);`;
          }).join('\n          ')}

          if (myLoc) map.setView([${myLocation?.lat ?? 18.5944}, ${myLocation?.lng ?? -72.3074}], 14);
        })();
        true;
      `);
    }
  }, [mapReady, filteredSellers, failedImages, myLocation]);

  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'tap') {
        const seller = filteredSellers.find(s => s.id === data.id);
        if (seller) setSelectedSeller(seller);
      } else if (data.type === 'move') {
        fetchSellers(data.lat, data.lng, 20);
      }
    } catch {}
  }, [filteredSellers, fetchSellers]);

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
  const mapHtml = buildMapHtml(filteredSellers, myLocation, failedImages);

  return (
    <View style={styles.container}>
      {Platform.OS !== 'web' ? (
        <WebView
          ref={webViewRef}
          source={{ html: mapHtml }}
          style={styles.map}
          onMessage={handleWebViewMessage}
          onLoadEnd={() => setMapReady(true)}
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={['*']}
          scrollEnabled={false}
          bounces={false}
        />
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
                    source={{ uri: getAvatarUrl(selectedSeller)! }}
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
