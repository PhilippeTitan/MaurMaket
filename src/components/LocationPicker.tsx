import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator, Modal, TouchableOpacity, TextInput, FlatList } from 'react-native';
import { WebView } from 'react-native-webview';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { searchAreasHybrid, cancelSearch, type HaitiArea } from '../data/haiti-areas';

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
var LIGHT_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
var DARK_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
var currentTile = null;
var map = L.map("map",{zoomControl:false,attributionControl:false,maxBounds:[[16.5,-76],[21,-67]],maxBoundsViscosity:1.0,minZoom:8,maxZoom:18}).setView([${centerLat},${centerLng}],15);
currentTile = L.tileLayer(LIGHT_URL,{maxZoom:20,subdomains:"abcd",crossOrigin:true}).addTo(map);
setTimeout(function(){map.invalidateSize()},200);

var markerIcon = L.divIcon({className:'',html:'<div class="pick-marker"><div class="pick-marker-inner"></div></div>',iconSize:[32,32],iconAnchor:[16,16]});

var circle = null;
${markerJs}

function setDarkMode(isDark){
  if(currentTile) map.removeLayer(currentTile);
  currentTile = L.tileLayer(isDark?DARK_URL:LIGHT_URL,{maxZoom:20,subdomains:"abcd",crossOrigin:true}).addTo(map);
}

// Listen for commands from React Native
window.addEventListener('message', function(e) {
  try {
    var cmd = JSON.parse(e.data);
    if (cmd.type === 'flyTo') {
      map.flyTo([cmd.lat, cmd.lng], cmd.zoom || 14, {duration: 1.2});
    } else if (cmd.type === 'drawCircle') {
      if (circle) map.removeLayer(circle);
      circle = L.circle([cmd.lat, cmd.lng], {
        radius: cmd.radius || 400,
        color: '#00C2FF',
        fillColor: '#00C2FF',
        fillOpacity: 0.12,
        weight: 2,
        dashArray: '6 4'
      }).addTo(map);
      map.flyTo([cmd.lat, cmd.lng], cmd.zoom || 14, {duration: 1.2});
    } else if (cmd.type === 'clearCircle') {
      if (circle) { map.removeLayer(circle); circle = null; }
    } else if (cmd.type === 'setMarker') {
      if (marker) { marker.setLatLng([cmd.lat, cmd.lng]); }
      else { marker = L.marker([cmd.lat, cmd.lng],{draggable:true,icon:markerIcon}).addTo(map); }
    }
  } catch(err) {}
});

map.on('click',function(e){
  var lat = e.latlng.lat;
  var lng = e.latlng.lng;
  if(marker){
    marker.setLatLng([lat,lng]);
  } else {
    marker = L.marker([lat,lng],{draggable:true,icon:markerIcon}).addTo(map);
  }
  // Clear any search circle when user taps manually
  if (circle) { map.removeLayer(circle); circle = null; }
  document.getElementById('hint').textContent = 'Tap again to move';
  window.ReactNativeWebView.postMessage(JSON.stringify({type:'location',lat:lat,lng:lng}));
});

if(marker){
  marker.on('dragend',function(e){
    var pos = e.target.getLatLng();
    if (circle) { map.removeLayer(circle); circle = null; }
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'location',lat:pos.lat,lng:pos.lng}));
  });
}

window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));
</script>
</body>
</html>`;
}

export default function LocationPicker({ onLocationSelect, initialLat, initialLng, height = 260 }: LocationPickerProps) {
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [expandedAddress, setExpandedAddress] = useState<string | null>(null);
  const [pendingCoords, setPendingCoords] = useState<{lat: number; lng: number} | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArea, setSelectedArea] = useState<HaitiArea | null>(null);
  const webViewRef = useRef<WebView>(null);
  const expandedWebViewRef = useRef<WebView>(null);
  const expandedSearchRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();

  const [searchResults, setSearchResults] = useState<HaitiArea[]>([]);
  const [searching, setSearching] = useState(false);

  // Debounced hybrid search (embedded + Nominatim)
  useEffect(() => {
    if (searchQuery.length < 1) { setSearchResults([]); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      const results = await searchAreasHybrid(searchQuery);
      setSearchResults(results);
      setSearching(false);
    }, 200); // 200ms debounce for Nominatim
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
        headers: { 'Accept-Language': 'en' },
      });
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
      if (data.type === 'location') {
        setLoading(true);
        reverseGeocode(data.lat, data.lng).finally(() => setLoading(false));
      }
    } catch {}
  }, [reverseGeocode]);

  const handleExpandedMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'location') {
        setExpandedLoading(true);
        setPendingCoords({ lat: data.lat, lng: data.lng });
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${data.lat}&lon=${data.lng}&zoom=18&addressdetails=1`, {
          headers: { 'Accept-Language': 'en' },
        })
          .then(r => r.json())
          .then(d => setExpandedAddress(d.display_name || `${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}`))
          .catch(() => setExpandedAddress(`${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}`))
          .finally(() => setExpandedLoading(false));
      }
    } catch {}
  }, []);

  /** Fly to an area, draw blue circle, set marker */
  const selectArea = useCallback((area: HaitiArea, targetWebView?: WebView | null) => {
    const wv = targetWebView || webViewRef.current;
    if (!wv) return;

    // Fly to center and draw circle
    const cmd = JSON.stringify({ type: 'drawCircle', lat: area.lat, lng: area.lng, radius: area.radius, zoom: area.radius < 500 ? 15 : 13 });
    wv.postMessage(cmd);

    // Also place marker at center
    setTimeout(() => {
      wv.postMessage(JSON.stringify({ type: 'setMarker', lat: area.lat, lng: area.lng }));
    }, 300);

    setSelectedArea(area);
    setPendingCoords({ lat: area.lat, lng: area.lng });
    setExpandedAddress(area.name);
    setSearchQuery(area.name);
  }, []);

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

  /** Search bar component — shared between small and expanded views */
  const renderSearchBar = (isExpanded: boolean) => {
    const wv = isExpanded ? expandedWebViewRef.current : webViewRef.current;
    const results = isExpanded ? searchResults : searchResults;
    return (
      <View style={styles.searchWrap}>
        <View style={styles.searchRow}>
          <MaterialCommunityIcons name="magnify" size={18} color={COLORS.text2} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search area... (e.g. Delmas 33)"
            placeholderTextColor={COLORS.text2}
            value={searchQuery}
            onChangeText={(t) => {
              setSearchQuery(t);
              if (isExpanded) {
                // Clear circle when typing new search
                wv?.postMessage(JSON.stringify({ type: 'clearCircle' }));
                setSelectedArea(null);
              }
            }}
            ref={isExpanded ? expandedSearchRef : undefined}
            accessibilityLabel="search meetup area"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => {
              setSearchQuery('');
              setSelectedArea(null);
              wv?.postMessage(JSON.stringify({ type: 'clearCircle' }));
            }} accessibilityLabel="clear search" accessibilityRole="button">
              <MaterialCommunityIcons name="close-circle" size={16} color={COLORS.text2} />
            </TouchableOpacity>
          )}
        </View>
        {searching && results.length === 0 && (
          <View style={styles.searchLoading}>
            <ActivityIndicator size="small" color={COLORS.coral} />
            <Text style={styles.searchLoadingText}>Searching...</Text>
          </View>
        )}
        {results.length > 0 && (
          <FlatList
            data={results}
            keyExtractor={item => item.id}
            style={styles.searchResults}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.searchResultItem, selectedArea?.id === item.id && styles.searchResultActive]}
                onPress={() => {
                  selectArea(item, wv);
                  if (!isExpanded) {
                    // On small map, also set selected address
                    setSelectedAddress(item.name);
                    onLocationSelect(item.lat, item.lng, item.name);
                  }
                }}
                accessibilityLabel={`select ${item.name}`}
                accessibilityRole="button"
              >
                <MaterialCommunityIcons name="map-marker-outline" size={16} color={COLORS.coral} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.searchResultName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.searchResultCity} numberOfLines={1}>{item.city}</Text>
                </View>
                {item.parent && (
                  <Text style={styles.searchResultParent}>↗</Text>
                )}
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    );
  };

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
      <View style={[styles.container, { height }]}>
        {/* Search bar on small map */}
        {renderSearchBar(false)}

        <View style={{ flex: 1 }}>
          <WebView
            ref={webViewRef}
            source={{ html: buildPickerHtml(initialLat ?? undefined, initialLng ?? undefined) }}
            style={styles.webview}
            onMessage={handleMessage}
            scrollEnabled={false}
            bounces={false}
          />
          {/* Expand hint */}
          <TouchableOpacity
            style={styles.expandHint}
            onPress={() => setExpanded(true)}
            accessibilityLabel="expand map"
            accessibilityRole="button"
          >
            <MaterialCommunityIcons name="fullscreen" size={14} color={COLORS.white} />
            <Text style={styles.expandHintText}>Full screen</Text>
          </TouchableOpacity>
        </View>

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color={COLORS.coral} />
            <Text style={styles.loadingText}>Getting address...</Text>
          </View>
        )}
        {selectedAddress && !loading && !searchQuery && (
          <View style={styles.addressBar}>
            <MaterialCommunityIcons name="map-marker" size={14} color={COLORS.coral} />
            <Text style={styles.addressText} numberOfLines={2}>{selectedAddress}</Text>
          </View>
        )}
      </View>

      {/* Full-screen map modal */}
      <Modal visible={expanded} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setExpanded(false)}>
        <View style={styles.expandedContainer}>
          {/* Search bar in expanded view */}
          <View style={[styles.expandedSearchWrap, { paddingTop: insets.top + 8 }]}>
            {renderSearchBar(true)}
          </View>

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

          {/* Bottom bar */}
          <View style={[styles.expandedBottomBar, { paddingBottom: insets.bottom + 12 }]}>
            {expandedAddress && (
              <View style={styles.expandedAddressRow}>
                <MaterialCommunityIcons name="map-marker" size={16} color={COLORS.coral} />
                <Text style={styles.expandedAddressText} numberOfLines={2}>{expandedAddress}</Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.expandedConfirmBtn, (!pendingCoords || expandedLoading) && { opacity: 0.5 }]}
              onPress={confirmExpanded}
              disabled={!pendingCoords || expandedLoading}
              accessibilityLabel="confirm location"
              accessibilityRole="button"
            >
              {expandedLoading ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Text style={styles.expandedConfirmText}>Confirm Location</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: RADIUS.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  webview: {
    flex: 1,
  },
  webFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: 20,
  },
  webFallbackText: {
    color: COLORS.text2,
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  loadingText: { color: '#fff', fontSize: 12 },
  addressBar: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  addressText: { color: '#fff', fontSize: 12, flex: 1 },
  expandHint: {
    position: 'absolute',
    top: 8, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 12,
  },
  expandHintText: { color: '#fff', fontSize: 11, fontWeight: '600' },

  /* Search */
  searchWrap: { zIndex: 10 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.row, paddingHorizontal: 12, paddingVertical: 8,
    marginHorizontal: 0,
  },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 14, padding: 0 },
  searchResults: {
    maxHeight: 240,
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
    borderBottomLeftRadius: RADIUS.row, borderBottomRightRadius: RADIUS.row,
    marginTop: -1,
  },
  searchResultItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  searchResultActive: { backgroundColor: COLORS.coral + '12' },
  searchResultName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  searchResultCity: { fontSize: 11, color: COLORS.text2, marginTop: 1 },
  searchResultParent: { fontSize: 12, color: COLORS.text2 },
  searchLoading: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderTopWidth: 0, borderColor: COLORS.border,
    borderBottomLeftRadius: RADIUS.row, borderBottomRightRadius: RADIUS.row,
  },
  searchLoadingText: { fontSize: 12, color: COLORS.text2 },

  /* Expanded modal */
  expandedContainer: { flex: 1, backgroundColor: COLORS.bg },
  expandedSearchWrap: {
    position: 'absolute', top: 0, left: 0, right: 0,
    zIndex: 20, paddingHorizontal: 14, paddingBottom: 8,
    backgroundColor: 'rgba(13,17,23,0.9)',
  },
  expandedWebview: { flex: 1 },
  expandedTopBar: {
    position: 'absolute', right: 14,
    flexDirection: 'row', alignItems: 'center',
  },
  expandedCloseBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center',
    elevation: 4,
  },
  expandedBottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: 'rgba(13,17,23,0.9)',
  },
  expandedAddressRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 12,
  },
  expandedAddressText: { flex: 1, color: COLORS.text2, fontSize: 13 },
  expandedConfirmBtn: {
    backgroundColor: COLORS.coral, borderRadius: RADIUS.button,
    padding: 14, alignItems: 'center',
  },
  expandedConfirmText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
});
