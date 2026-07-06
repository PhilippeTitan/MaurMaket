import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { COLORS, SPACING } from '../theme';
import { store } from '../store';
import { API_BASE, getNearbySellers, setSellerLocation } from '../api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

const TIER_COLORS: Record<string, string> = {
  casual: '#F5A623',
  verified: '#1D9E75',
  business: '#E04050',
};

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
html,body,#map{width:100%;height:100%;background:#0D1117;overflow:hidden}
.leaflet-control-zoom{display:none}
.leaflet-control-attribution{background:rgba(13,17,23,0.7)!important;color:#555!important;font-size:9px!important}
.leaflet-control-attribution a{color:#555!important}
.seller-marker{position:relative;display:flex;flex-direction:column;align-items:center}
.seller-ring{border-radius:50%;border:3px solid #fff;display:flex;align-items:center;justify-content:center}
.seller-icon{font-size:16px;color:#fff}
.seller-tail{width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent}
.user-marker{position:relative;display:flex;flex-direction:column;align-items:center}
.user-dot{width:16px;height:16px;border-radius:50%;border:3px solid #4A9EFF;background:#fff;box-shadow:0 0 8px rgba(74,158,255,0.5)}
.user-tail{width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:8px solid #4A9EFF}
</style>
</head>
<body>
<div id="map"></div>
<script>
var map = L.map("map",{zoomControl:false,attributionControl:true}).setView([18.5944,-72.3074],12);
L.tileLayer("https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",{
  attribution:"&copy;CARTO&copy;OSM",maxZoom:20
}).addTo(map);
setTimeout(function(){map.invalidateSize()},200);
setTimeout(function(){map.invalidateSize()},1000);
document.addEventListener("DOMContentLoaded",function(){map.invalidateSize()});
window.addEventListener("load",function(){map.invalidateSize()});

var sellerLayer = L.layerGroup().addTo(map);
var userMarker = null;

function setSellerMarkers(sellers) {
  sellerLayer.clearLayers();
  sellers.forEach(function(s) {
    var color = s.tier === 'business' ? '#E04050' : s.tier === 'verified' ? '#1D9E75' : '#F5A623';
    var icon = L.divIcon({
      className: '',
      iconSize: [40, 52],
      iconAnchor: [20, 52],
      html: '<div class="seller-marker">' +
        '<div class="seller-ring" style="background:'+color+';width:36px;height:36px">' +
          '<span class="seller-icon">👤</span>' +
        '</div>' +
        '<div class="seller-tail" style="border-top:8px solid '+color+'"></div>' +
      '</div>'
    });
    var marker = L.marker([s.lat, s.lng], {icon: icon});
    marker.bindPopup('<b>' + (s.store_name || s.name) + '</b><br>' + s.tier);
    marker.addTo(sellerLayer);
  });
}

function setUserMarker(lat, lng) {
  if (userMarker) map.removeLayer(userMarker);
  var icon = L.divIcon({
    className: '',
    iconSize: [20, 28],
    iconAnchor: [10, 28],
    html: '<div class="user-marker"><div class="user-dot"></div><div class="user-tail"></div></div>'
  });
  userMarker = L.marker([lat, lng], {icon: icon, zIndexOffset: 1000}).addTo(map);
  map.setView([lat, lng], 14);
}

function centerOn(lat, lng) {
  map.setView([lat, lng], 14);
}

map.on("moveend", function() {
  var c = map.getCenter();
  try { window.ReactNativeWebView.postMessage(JSON.stringify({type:"move",lat:c.lat,lng:c.lng})); } catch(e) {}
});
</script>
</body>
</html>`;
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [sellers, setSellers] = useState<NearbySeller[]>([]);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const debugLogsRef = useRef<string[]>([]);
  const fetchIdRef = useRef(0);
  const lastInjectedRef = useRef<string>('');

  const dbg = useCallback((msg: string) => {
    const ts = new Date().toISOString().slice(11, 23);
    const entry = `[${ts}] ${msg}`;
    debugLogsRef.current = [...debugLogsRef.current.slice(-15), entry];
    setDebugLogs([...debugLogsRef.current]);
  }, []);

  const sendReport = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/debug/map-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs: debugLogsRef.current, platform: Platform.OS, timestamp: new Date().toISOString() }),
      });
    } catch {}
  }, []);

  const injectMarkers = useCallback((sellerList: NearbySeller[]) => {
    if (!webViewRef.current) return;
    const data = sellerList.map(s => ({
      id: s.id,
      lat: s.lat,
      lng: s.lng,
      tier: s.seller_tier,
      name: s.use_store_identity ? s.store_name : s.full_name,
      store_name: s.store_name,
    }));
    const json = JSON.stringify(data);
    if (json === lastInjectedRef.current) return;
    lastInjectedRef.current = json;
    webViewRef.current.injectJavaScript(`setSellerMarkers(${json});`);
  }, []);

  const injectUserMarker = useCallback((lat: number, lng: number) => {
    if (!webViewRef.current) return;
    webViewRef.current.injectJavaScript(`setUserMarker(${lat},${lng});`);
  }, []);

  const centerOnMe = useCallback(() => {
    if (!myLocation || !webViewRef.current) return;
    webViewRef.current.injectJavaScript(`centerOn(${myLocation.lat},${myLocation.lng});`);
  }, [myLocation]);

  const fetchSellers = useCallback(async (lat: number, lng: number, radius = 20) => {
    const thisFetch = ++fetchIdRef.current;
    try {
      const res = await getNearbySellers(lat, lng, radius) as { sellers: NearbySeller[] };
      if (thisFetch !== fetchIdRef.current) return;
      const list = res.sellers || [];
      setSellers(list);
      dbg(`Loaded ${list.length} sellers`);
      injectMarkers(list);
    } catch (e: any) {
      dbg('Fetch sellers failed: ' + (e?.message || String(e)));
    }
    setLoading(false);
  }, [dbg, injectMarkers]);

  useEffect(() => {
    dbg('MapScreen mounted, Platform=' + Platform.OS);
    (async () => {
      if (Platform.OS === 'web') {
        fetchSellers(18.5944, -72.3074);
        return;
      }
      try {
        const Location = await import('expo-location');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          dbg('Location permission denied');
          fetchSellers(18.5944, -72.3074);
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        dbg(`GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        setMyLocation({ lat, lng });
        injectUserMarker(lat, lng);
        fetchSellers(lat, lng);
        try {
          await setSellerLocation(lat, lng);
          dbg('Seller location saved');
        } catch {}
      } catch (e: any) {
        dbg('Location error: ' + (e?.message || String(e)));
        fetchSellers(18.5944, -72.3074);
      }
    })();
  }, []);

  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'move') {
        fetchSellers(data.lat, data.lng);
      }
    } catch {}
  }, [fetchSellers]);

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: buildMapHtml() }}
        style={styles.map}
        onMessage={handleWebViewMessage}
        onLoadStart={() => dbg('WebView onLoadStart')}
        onLoadEnd={() => dbg('WebView onLoadEnd OK')}
        onError={(e: any) => dbg('WebView ERROR: ' + (e?.nativeEvent?.description || '?'))}
        onHttpError={(e: any) => dbg('WebView HTTP ' + (e?.nativeEvent?.statusCode || '?'))}
        onContentProcessDidTerminate={() => dbg('WebView PROCESS TERMINATED')}
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

      {debugLogs.length > 0 && (
        <View style={[styles.debugOverlay, { top: insets.top + 50 }]}>
          {debugLogs.slice(-8).map((l, i) => (
            <Text key={i} style={styles.debugText} numberOfLines={1}>{l}</Text>
          ))}
          <View style={styles.debugRow}>
            <Text style={styles.debugSendBtn} onPress={sendReport}>Send Report</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  map: { flex: 1 },
  debugOverlay: {
    position: 'absolute', left: SPACING.sm, right: SPACING.sm,
    maxHeight: 160, backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 8, padding: 8, zIndex: 99,
  },
  debugText: { color: '#8B949E', fontSize: 10, fontFamily: 'Courier', lineHeight: 14 },
  debugRow: { marginTop: 4, alignItems: 'flex-end' },
  debugSendBtn: { color: COLORS.coral, fontSize: 11, fontWeight: '700' },
});
