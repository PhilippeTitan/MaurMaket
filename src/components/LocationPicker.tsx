import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../theme';

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

${markerJs}

function setDarkMode(isDark){
  if(currentTile) map.removeLayer(currentTile);
  currentTile = L.tileLayer(isDark?DARK_URL:LIGHT_URL,{maxZoom:20,subdomains:"abcd",crossOrigin:true}).addTo(map);
}

map.on('click',function(e){
  var lat = e.latlng.lat;
  var lng = e.latlng.lng;
  if(marker){
    marker.setLatLng([lat,lng]);
  } else {
    marker = L.marker([lat,lng],{draggable:true,icon:markerIcon}).addTo(map);
  }
  document.getElementById('hint').textContent = 'Tap again to move';
  window.ReactNativeWebView.postMessage(JSON.stringify({type:'location',lat:lat,lng:lng}));
});

if(marker){
  marker.on('dragend',function(e){
    var pos = e.target.getLatLng();
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'location',lat:pos.lat,lng:pos.lng}));
  });
}

// Signal ready
window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));
</script>
</body>
</html>`;
}

export default function LocationPicker({ onLocationSelect, initialLat, initialLng, height = 260 }: LocationPickerProps) {
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const webViewRef = useRef<WebView>(null);

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
    <View style={[styles.container, { height }]}>
      <WebView
        ref={webViewRef}
        source={{ html: buildPickerHtml(initialLat ?? undefined, initialLng ?? undefined) }}
        style={styles.webview}
        onMessage={handleMessage}
        scrollEnabled={false}
        bounces={false}
      />
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={COLORS.coral} />
          <Text style={styles.loadingText}>Getting address...</Text>
        </View>
      )}
      {selectedAddress && !loading && (
        <View style={styles.addressBar}>
          <MaterialCommunityIcons name="map-marker" size={14} color={COLORS.coral} />
          <Text style={styles.addressText} numberOfLines={2}>{selectedAddress}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: RADIUS.md,
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
  loadingText: {
    color: '#fff',
    fontSize: 12,
  },
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
  addressText: {
    color: '#fff',
    fontSize: 12,
    flex: 1,
  },
});
