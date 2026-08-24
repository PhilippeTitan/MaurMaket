import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator, Modal, TouchableOpacity, TextInput, FlatList, Animated, Dimensions, PanResponder } from 'react-native';
import { WebView } from 'react-native-webview';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { searchAreasHybrid, type HaitiArea } from '../data/haiti-areas';

interface LocationPickerProps {
  onLocationSelect: (lat: number, lng: number, address: string) => void;
  initialLat?: number | null;
  initialLng?: number | null;
  height?: number;
}

function buildPickerHtml(initialLat?: number, initialLng?: number): string {
  const centerLat = initialLat || 18.5944;
  const centerLng = initialLng || -72.3074;
  const markerJs = initialLat && initialLng
    ? `var marker = L.marker([${centerLat},${centerLng}],{draggable:true}).addTo(map);`
    : 'var marker = null;';

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
.pick-marker{width:32px;height:32px;border-radius:50%;background:#FF6B6B;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center}
.pick-marker-inner{width:10px;height:10px;border-radius:50%;background:#fff}
.crosshair{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:1000}
.crosshair-inner{width:24px;height:24px;border:2px solid rgba(255,107,107,0.8);border-radius:50%}
.crosshair-dot{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:6px;height:6px;border-radius:50%;background:#FF6B6B}
.hint{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.7);color:#fff;padding:8px 16px;border-radius:20px;font-size:13px;z-index:1000;white-space:nowrap}
</style>
</head>
<body>
<div id="map"></div>
<div class="crosshair"><div class="crosshair-inner"><div class="crosshair-dot"></div></div></div>
<div class="hint" id="hint">Tap anywhere to set meetup spot</div>
<script>
var LIGHT_URL="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
var DARK_URL="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
var currentTile=null;
var map=L.map("map",{zoomControl:false,attributionControl:false,maxBounds:[[16.5,-76],[21,-67]],maxBoundsViscosity:1.0,minZoom:8,maxZoom:18}).setView([${centerLat},${centerLng}],15);
currentTile=L.tileLayer(LIGHT_URL,{maxZoom:20,subdomains:"abcd",crossOrigin:true}).addTo(map);
setTimeout(function(){map.invalidateSize()},200);
var markerIcon=L.divIcon({className:'',html:'<div class="pick-marker"><div class="pick-marker-inner"></div></div>',iconSize:[32,32],iconAnchor:[16,16]});
var circle=null;
${markerJs}
window.addEventListener('message',function(e){
  try{var cmd=JSON.parse(e.data);
    if(cmd.type==='flyTo'){map.flyTo([cmd.lat,cmd.lng],cmd.zoom||14,{duration:1.2});}
    else if(cmd.type==='drawCircle'){if(circle)map.removeLayer(circle);circle=L.circle([cmd.lat,cmd.lng],{radius:cmd.radius||400,color:'#00C2FF',fillColor:'#00C2FF',fillOpacity:0.12,weight:2,dashArray:'6 4'}).addTo(map);map.flyTo([cmd.lat,cmd.lng],cmd.zoom||14,{duration:1.2});}
    else if(cmd.type==='clearCircle'){if(circle){map.removeLayer(circle);circle=null;}}
    else if(cmd.type==='setMarker'){if(marker){marker.setLatLng([cmd.lat,cmd.lng]);}else{marker=L.marker([cmd.lat,cmd.lng],{draggable:true,icon:markerIcon}).addTo(map);}}
  }catch(err){console.log('cmd error',err);}
});
map.on('click',function(e){
  var lat=e.latlng.lat,lng=e.latlng.lng;
  if(marker){marker.setLatLng([lat,lng]);}else{marker=L.marker([lat,lng],{draggable:true,icon:markerIcon}).addTo(map);}
  if(circle){map.removeLayer(circle);circle=null;}
  document.getElementById('hint').textContent='Tap again to move';
  window.ReactNativeWebView.postMessage(JSON.stringify({type:'location',lat:lat,lng:lng}));
});
if(marker){marker.on('dragend',function(e){var pos=e.target.getLatLng();if(circle){map.removeLayer(circle);circle=null;}window.ReactNativeWebView.postMessage(JSON.stringify({type:'location',lat:pos.lat,lng:pos.lng}));});}
window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));
</script>
</body>
</html>`;
}

const COLLAPSED_HEIGHT = 56;
const HANDLE_HEIGHT = 32;

export default function LocationPicker({ onLocationSelect, initialLat, initialLng, height = 260 }: LocationPickerProps) {
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [expandedAddress, setExpandedAddress] = useState<string | null>(null);
  const [pendingCoords, setPendingCoords] = useState<{lat: number; lng: number} | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArea, setSelectedArea] = useState<HaitiArea | null>(null);
  const [searchResults, setSearchResults] = useState<HaitiArea[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const webViewRef = useRef<WebView>(null);
  const expandedWebViewRef = useRef<WebView>(null);
  const searchInputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const SCREEN_H = Dimensions.get('window').height;
  const EXPANDED_HEIGHT = SCREEN_H * 0.55;

  // Curtain height driven by gesture
  const curtainHeightAnim = useRef(new Animated.Value(COLLAPSED_HEIGHT)).current;
  const [curtainH, setCurtainH] = useState(COLLAPSED_HEIGHT);

  useEffect(() => {
    const id = curtainHeightAnim.addListener(({ value }) => setCurtainH(value));
    return () => curtainHeightAnim.removeListener(id);
  }, [curtainHeightAnim]);

  const curtainOpacity = curtainHeightAnim.interpolate({
    inputRange: [COLLAPSED_HEIGHT, COLLAPSED_HEIGHT + 40, EXPANDED_HEIGHT],
    outputRange: [0, 0.5, 1],
    extrapolate: 'clamp',
  });
  const pillOpacity = curtainHeightAnim.interpolate({
    inputRange: [COLLAPSED_HEIGHT, COLLAPSED_HEIGHT + 30],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // PanResponder for drag-to-resize
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 5,
      onPanResponderMove: (_, g) => {
        const target = searchExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
        const raw = target - g.dy;
        const clamped = Math.max(COLLAPSED_HEIGHT, Math.min(EXPANDED_HEIGHT, raw));
        curtainHeightAnim.setValue(clamped);
      },
      onPanResponderRelease: (_, g) => {
        // If dragged down >80px or velocity is downward → collapse
        const shouldCollapse = g.dy > 80 || g.vy > 0.5;
        const target = shouldCollapse ? COLLAPSED_HEIGHT : EXPANDED_HEIGHT;
        Animated.spring(curtainHeightAnim, {
          toValue: target,
          useNativeDriver: false,
          damping: 20,
          stiffness: 200,
        }).start(() => {
          if (shouldCollapse && searchExpanded) {
            setSearchExpanded(false);
            setSearchQuery('');
            setSelectedArea(null);
            searchInputRef.current?.blur();
          } else if (!shouldCollapse && !searchExpanded) {
            setSearchExpanded(true);
            setTimeout(() => searchInputRef.current?.focus(), 100);
          }
        });
      },
    })
  ).current;

  const expandSearch = () => {
    setSearchExpanded(true);
    Animated.spring(curtainHeightAnim, { toValue: EXPANDED_HEIGHT, useNativeDriver: false, damping: 18, stiffness: 200 }).start(() => {
      searchInputRef.current?.focus();
    });
  };

  const collapseSearch = () => {
    Animated.spring(curtainHeightAnim, { toValue: COLLAPSED_HEIGHT, useNativeDriver: false, damping: 18, stiffness: 200 }).start(() => {
      setSearchExpanded(false);
      setSearchQuery('');
      setSelectedArea(null);
      searchInputRef.current?.blur();
    });
  };

  // Debounced hybrid search
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

  // Send a message to WebView with retry until map is ready
  const postToMap = useCallback((wv: WebView | null, msg: object, retries = 5) => {
    if (!wv) return;
    wv.postMessage(JSON.stringify(msg));
    if (retries > 0) {
      setTimeout(() => wv.postMessage(JSON.stringify(msg)), 600);
    }
  }, []);

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

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'ready') { setMapReady(true); }
      if (data.type === 'location') {
        setLoading(true);
        reverseGeocode(data.lat, data.lng).finally(() => setLoading(false));
      }
    } catch {}
  }, [reverseGeocode]);

  const handleExpandedMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'ready') { setMapReady(true); }
      if (data.type === 'location') {
        setExpandedLoading(true);
        setPendingCoords({ lat: data.lat, lng: data.lng });
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${data.lat}&lon=${data.lng}&zoom=18&addressdetails=1`, { headers: { 'Accept-Language': 'en' } })
          .then(r => r.json())
          .then(d => setExpandedAddress(d.display_name || `${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}`))
          .catch(() => setExpandedAddress(`${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}`))
          .finally(() => setExpandedLoading(false));
      }
    } catch {}
  }, []);

  const selectArea = useCallback((area: HaitiArea) => {
    const wv = expandedWebViewRef.current;
    // Draw circle + fly to area
    postToMap(wv, { type: 'drawCircle', lat: area.lat, lng: area.lng, radius: area.radius, zoom: area.radius < 500 ? 15 : 13 });
    // Set marker with a delay
    setTimeout(() => postToMap(wv, { type: 'setMarker', lat: area.lat, lng: area.lng }), 400);
    setSelectedArea(area);
    setPendingCoords({ lat: area.lat, lng: area.lng });
    setExpandedAddress(area.name);
    setSearchQuery(area.name);
  }, [postToMap]);

  const confirmExpanded = useCallback(() => {
    if (pendingCoords && expandedAddress) {
      setSelectedAddress(expandedAddress);
      onLocationSelect(pendingCoords.lat, pendingCoords.lng, expandedAddress);
    }
    setExpanded(false);
    setPendingCoords(null);
    setExpandedAddress(null);
    setSearchQuery('');
    setSelectedArea(null);
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
      {/* ── Small map (tappable to expand) ── */}
      <TouchableOpacity
        style={[styles.container, { height }]}
        onPress={() => setExpanded(true)}
        activeOpacity={0.9}
        accessibilityLabel="expand map"
        accessibilityRole="button"
      >
        <WebView
          ref={webViewRef}
          source={{ html: buildPickerHtml(initialLat ?? undefined, initialLng ?? undefined) }}
          style={styles.webview}
          onMessage={handleMessage}
          scrollEnabled={false}
          bounces={false}
          pointerEvents="none"
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
          <WebView
            ref={expandedWebViewRef}
            source={{ html: buildPickerHtml(initialLat ?? undefined, initialLng ?? undefined) }}
            style={styles.expandedWebview}
            onMessage={handleExpandedMessage}
            scrollEnabled={false}
            bounces={false}
          />

          {/* Top close button */}
          <View style={[styles.expandedTopBar, { top: insets.top + 8 }]}>
            <TouchableOpacity style={styles.expandedCloseBtn} onPress={() => setExpanded(false)} accessibilityLabel="close map" accessibilityRole="button">
              <MaterialCommunityIcons name="close" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {/* ── Floating search pill (collapsed state) ── */}
          <Animated.View
            style={[styles.floatingPill, { bottom: insets.bottom + 16, opacity: pillOpacity }]}
            pointerEvents={searchExpanded ? 'none' : 'auto'}
          >
            <TouchableOpacity style={styles.pillTouch} onPress={expandSearch} accessibilityLabel="search for area" accessibilityRole="button">
              <MaterialCommunityIcons name="magnify" size={20} color={COLORS.coral} />
              <Text style={styles.pillText}>{searchQuery || 'Search for an area...'}</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* ── Draggable search curtain ── */}
          <Animated.View
            style={[styles.searchCurtain, {
              height: curtainHeightAnim,
              bottom: 0,
              opacity: curtainOpacity,
              paddingBottom: insets.bottom + 12,
            }]}
            pointerEvents={curtainH > COLLAPSED_HEIGHT + 40 ? 'auto' : 'none'}
            {...panResponder.panHandlers}
          >
            {/* Drag handle */}
            <View style={styles.dragHandle}>
              <View style={styles.dragBar} />
            </View>

            {/* Chevron collapse button */}
            <TouchableOpacity style={styles.curtainCollapseBtn} onPress={collapseSearch} accessibilityLabel="close search" accessibilityRole="button">
              <MaterialCommunityIcons name="chevron-down" size={24} color={COLORS.text2} />
            </TouchableOpacity>

            {/* Search input */}
            <View style={styles.curtainSearchRow}>
              <MaterialCommunityIcons name="magnify" size={20} color={COLORS.coral} />
              <TextInput
                ref={searchInputRef}
                style={styles.curtainSearchInput}
                placeholder="Search area... (e.g. Delmas 33)"
                placeholderTextColor={COLORS.text2}
                value={searchQuery}
                onChangeText={(t) => {
                  setSearchQuery(t);
                  expandedWebViewRef.current?.postMessage(JSON.stringify({ type: 'clearCircle' }));
                  setSelectedArea(null);
                }}
                returnKeyType="search"
                accessibilityLabel="search meetup area"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => { setSearchQuery(''); setSelectedArea(null); expandedWebViewRef.current?.postMessage(JSON.stringify({ type: 'clearCircle' })); }} accessibilityLabel="clear search" accessibilityRole="button">
                  <MaterialCommunityIcons name="close-circle" size={18} color={COLORS.text2} />
                </TouchableOpacity>
              )}
            </View>

            {searching && searchResults.length === 0 && (
              <View style={styles.curtainLoading}>
                <ActivityIndicator size="small" color={COLORS.coral} />
                <Text style={styles.curtainLoadingText}>Searching...</Text>
              </View>
            )}

            {searchResults.length > 0 && (
              <FlatList
                data={searchResults}
                keyExtractor={item => item.id}
                style={styles.curtainResults}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.curtainResultItem, selectedArea?.id === item.id && styles.curtainResultActive]}
                    onPress={() => { selectArea(item); collapseSearch(); }}
                    accessibilityLabel={`select ${item.name}`}
                    accessibilityRole="button"
                  >
                    <MaterialCommunityIcons name="map-marker-outline" size={18} color={COLORS.coral} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.curtainResultName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.curtainResultCity} numberOfLines={1}>{item.city}</Text>
                    </View>
                    <Text style={styles.curtainResultArrow}>›</Text>
                  </TouchableOpacity>
                )}
              />
            )}

            {expandedAddress && (
              <View style={styles.curtainAddressRow}>
                <MaterialCommunityIcons name="map-marker" size={16} color={COLORS.coral} />
                <Text style={styles.curtainAddressText} numberOfLines={2}>{expandedAddress}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.curtainConfirmBtn, (!pendingCoords || expandedLoading) && { opacity: 0.5 }]}
              onPress={() => { collapseSearch(); confirmExpanded(); }}
              disabled={!pendingCoords || expandedLoading}
              accessibilityLabel="confirm location"
              accessibilityRole="button"
            >
              {expandedLoading ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Text style={styles.curtainConfirmText}>Confirm Location</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: RADIUS.card, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  webview: { flex: 1 },
  webFallback: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.surface, padding: 20 },
  webFallbackText: { color: COLORS.text2, fontSize: 14, marginTop: 8, textAlign: 'center' },
  expandHint: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  expandHintText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  addressBar: { position: 'absolute', bottom: 8, left: 8, right: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, gap: 6 },
  addressText: { color: '#fff', fontSize: 12, flex: 1 },

  /* Expanded modal */
  expandedContainer: { flex: 1, backgroundColor: COLORS.bg },
  expandedWebview: { flex: 1 },
  expandedTopBar: { position: 'absolute', right: 14, flexDirection: 'row', alignItems: 'center' },
  expandedCloseBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center', elevation: 4 },

  /* Floating pill */
  floatingPill: { position: 'absolute', left: 16, right: 16, zIndex: 15 },
  pillTouch: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 28, paddingHorizontal: 18, paddingVertical: 14,
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
  },
  pillText: { flex: 1, fontSize: 15, color: COLORS.text2, fontWeight: '500' },

  /* Draggable search curtain */
  searchCurtain: {
    position: 'absolute', left: 0, right: 0,
    backgroundColor: COLORS.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingTop: 0,
    elevation: 12, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.3, shadowRadius: 12,
    zIndex: 20,
    overflow: 'hidden',
  },
  dragHandle: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  dragBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.text2 },
  curtainCollapseBtn: { alignSelf: 'center', padding: 6, marginBottom: 4 },
  curtainSearchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.row, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
  },
  curtainSearchInput: { flex: 1, color: COLORS.text, fontSize: 16, padding: 0 },
  curtainLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  curtainLoadingText: { fontSize: 13, color: COLORS.text2 },
  curtainResults: { flex: 1, maxHeight: 200, borderRadius: RADIUS.card, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  curtainResultItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  curtainResultActive: { backgroundColor: COLORS.coral + '10' },
  curtainResultName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  curtainResultCity: { fontSize: 12, color: COLORS.text2, marginTop: 2 },
  curtainResultArrow: { fontSize: 20, color: COLORS.text2, fontWeight: '300' },
  curtainAddressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  curtainAddressText: { flex: 1, color: COLORS.text2, fontSize: 13 },
  curtainConfirmBtn: { backgroundColor: COLORS.coral, borderRadius: RADIUS.button, padding: 14, alignItems: 'center', marginTop: 8 },
  curtainConfirmText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
});
