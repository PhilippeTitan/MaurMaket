import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator, Modal, TouchableOpacity, TextInput, FlatList } from 'react-native';
import { WebView } from 'react-native-webview';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { searchAreasHybrid, type HaitiArea } from '../data/haiti-areas';
import { getFastLocation } from '../fast-location';

interface LocationPickerProps {
  onLocationSelect: (lat: number, lng: number, address: string) => void;
  initialLat?: number | null;
  initialLng?: number | null;
  height?: number;
}

function buildPickerHtml(initialLat?: number, initialLng?: number): string {
  const centerLat = initialLat || 18.5944;
  const centerLng = initialLng || -72.3074;

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
.user-marker{width:20px;height:20px;border-radius:50%;background:#4A90D9;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4)}
.hint{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.7);color:#fff;padding:8px 16px;border-radius:20px;font-size:13px;z-index:1000;white-space:nowrap}
</style>
</head>
<body>
<div id="map"></div>
<div class="hint" id="hint">Tap the map to set meetup spot</div>
<script>
var mapReady=false;
var cmdQueue=[];
var LIGHT_URL="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
var map=L.map("map",{zoomControl:false,attributionControl:false,maxBounds:[[16.5,-76],[21,-67]],maxBoundsViscosity:1.0,minZoom:8,maxZoom:18}).setView([${centerLat},${centerLng}],15);
var currentTile=L.tileLayer(LIGHT_URL,{maxZoom:20,subdomains:"abcd",crossOrigin:true}).addTo(map);
var markerIcon=L.divIcon({className:'',html:'<div class="pick-marker"><div class="pick-marker-inner"></div></div>',iconSize:[32,32],iconAnchor:[16,16]});
var userIcon=L.divIcon({className:'',html:'<div class="user-marker"></div>',iconSize:[20,20],iconAnchor:[10,10]});
var circle=null;
var userMarker=null;
var pickMarker=null;

function executeCmd(cmd){
  try{
    if(cmd.type==='centerOn'){
      if(userMarker){userMarker.remove();}
      userMarker=L.marker([cmd.lat,cmd.lng],{icon:userIcon,zIndexOffset:-1000}).addTo(map);
      map.setView([cmd.lat,cmd.lng],cmd.zoom||14);
    }
    else if(cmd.type==='flyTo'){map.flyTo([cmd.lat,cmd.lng],cmd.zoom||14,{duration:1.0});}
    else if(cmd.type==='drawCircle'){
      if(circle){map.removeLayer(circle);circle=null;}
      circle=L.circle([cmd.lat,cmd.lng],{radius:cmd.radius||400,color:'#00C2FF',fillColor:'#00C2FF',fillOpacity:0.15,weight:3}).addTo(map);
      map.flyTo([cmd.lat,cmd.lng],cmd.zoom||14,{duration:1.0});
    }
    else if(cmd.type==='clearCircle'){if(circle){map.removeLayer(circle);circle=null;}}
    else if(cmd.type==='setMarker'){
      if(pickMarker){pickMarker.setLatLng([cmd.lat,cmd.lng]);}
      else{pickMarker=L.marker([cmd.lat,cmd.lng],{icon:markerIcon}).addTo(map);}
    }
    else if(cmd.type==='clearMarker'){if(pickMarker){pickMarker.remove();pickMarker=null;}}
  }catch(err){}
}

window.addEventListener('message',function(e){
  try{
    var cmd=JSON.parse(e.data);
    if(mapReady){executeCmd(cmd);}
    else{cmdQueue.push(cmd);}
  }catch(err){}
});

function onMapReady(){
  mapReady=true;
  while(cmdQueue.length>0){executeCmd(cmdQueue.shift());}
  window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));
}

map.whenReady(function(){setTimeout(onMapReady,150);});

map.on('click',function(e){
  var lat=e.latlng.lat,lng=e.latlng.lng;
  if(pickMarker){pickMarker.setLatLng([lat,lng]);}else{pickMarker=L.marker([lat,lng],{icon:markerIcon}).addTo(map);}
  if(circle){map.removeLayer(circle);circle=null;}
  document.getElementById('hint').textContent='Tap again to move';
  window.ReactNativeWebView.postMessage(JSON.stringify({type:'location',lat:lat,lng:lng}));
});
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
  const [pendingCoords, setPendingCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArea, setSelectedArea] = useState<HaitiArea | null>(null);
  const [searchResults, setSearchResults] = useState<HaitiArea[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [expandedMapReady, setExpandedMapReady] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const webViewRef = useRef<WebView>(null);
  const expandedWebViewRef = useRef<WebView>(null);
  const searchInputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();

  // Get user location on mount
  useEffect(() => {
    getFastLocation()
      .then(pos => setUserLocation({ lat: pos.lat, lng: pos.lng }))
      .catch(() => {});
  }, []);

  // Center map on user location once both are ready
  useEffect(() => {
    if (expanded && expandedMapReady && userLocation) {
      setTimeout(() => {
        expandedWebViewRef.current?.postMessage(JSON.stringify({ type: 'centerOn', lat: userLocation.lat, lng: userLocation.lng, zoom: 14 }));
      }, 300);
    }
  }, [expanded, expandedMapReady, userLocation]);

  // Send a message with retries
  const postToMap = useCallback((msg: object) => {
    const wv = expandedWebViewRef.current;
    if (!wv) return;
    wv.postMessage(JSON.stringify(msg));
    [500, 1500].forEach(delay => {
      setTimeout(() => expandedWebViewRef.current?.postMessage(JSON.stringify(msg)), delay);
    });
  }, []);

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
      if (data.type === 'ready') setExpandedMapReady(true);
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
    // Draw circle + fly to area
    const circleCmd = { type: 'drawCircle', lat: area.lat, lng: area.lng, radius: area.radius, zoom: area.radius < 500 ? 15 : 13 };
    const markerCmd = { type: 'setMarker', lat: area.lat, lng: area.lng };
    postToMap(circleCmd);
    setTimeout(() => postToMap(markerCmd), 200);

    setSelectedArea(area);
    setPendingCoords({ lat: area.lat, lng: area.lng });
    setExpandedAddress(area.name);
    setSearchFocused(false);
    searchInputRef.current?.blur();
  }, [postToMap]);

  const clearSelection = useCallback(() => {
    setSelectedArea(null);
    setPendingCoords(null);
    setExpandedAddress(null);
    setSearchQuery('');
    postToMap({ type: 'clearCircle' });
    postToMap({ type: 'clearMarker' });
  }, [postToMap]);

  const confirmExpanded = useCallback(() => {
    if (pendingCoords && expandedAddress) {
      setSelectedAddress(expandedAddress);
      onLocationSelect(pendingCoords.lat, pendingCoords.lng, expandedAddress);
    }
    setExpanded(false);
    setExpandedMapReady(false);
    setPendingCoords(null);
    setExpandedAddress(null);
    setSearchQuery('');
    setSelectedArea(null);
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

          {/* Close button — right side, top-right */}
          <View style={[styles.closeBtnRow, { top: insets.top + 8, right: 14 }]}>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setExpanded(false)} accessibilityLabel="close map" accessibilityRole="button">
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
