import { AppState } from 'react-native';
import { getToken, getRealtimeUrl, getRealtimeTopic } from './api';
import { realtimeClient } from './realtimeClient';

// ───── Realtime client ─────
// Two coexisting layers:
// 1) Authenticated WebSocket (`onRealtime`) — full chat payloads for instant
//    message/typing/read/reaction delivery (tranche 5).
// 2) Supabase broadcast hints (`subscribeToUserEvents`) — content-free pings;
//    callers refetch via the API (payments, notifications). Polling remains
//    the fallback for both.

export type RealtimeEvent = { type: string } & Record<string, any>;

type Listener = (event: RealtimeEvent) => void;

const listeners = new Set<Listener>();

let socket: WebSocket | null = null;
let wantConnected = false;
let ready = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;

function notify(event: RealtimeEvent) {
  for (const cb of listeners) {
    try { cb(event); } catch { /* listener errors must not kill the socket */ }
  }
}

function clearReconnect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
}

function scheduleReconnect() {
  if (!wantConnected || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    open();
  }, reconnectDelay);
}

async function open() {
  if (!wantConnected) return;
  if (socket && (socket.readyState === 0 || socket.readyState === 1)) return;
  clearReconnect();
  const token = await getToken();
  if (!token) { scheduleReconnect(); return; }
  let ws: WebSocket;
  try {
    ws = new WebSocket(getRealtimeUrl());
  } catch {
    scheduleReconnect();
    return;
  }
  socket = ws;
  ws.onopen = () => {
    try { ws.send(JSON.stringify({ type: 'auth', token })); } catch { /* onclose follows */ }
  };
  ws.onmessage = (ev) => {
    let event: RealtimeEvent;
    try { event = JSON.parse(typeof ev.data === 'string' ? ev.data : ''); } catch { return; }
    if (!event || typeof event.type !== 'string') return;
    if (event.type === 'ready') {
      if (!ready) { ready = true; reconnectDelay = 1000; notify({ type: '_connected' }); }
      return;
    }
    if (event.type === 'pong') return;
    notify(event);
  };
  ws.onclose = () => {
    const wasReady = ready;
    ready = false;
    if (socket === ws) socket = null;
    if (wasReady) notify({ type: '_disconnected' });
    if (wantConnected) scheduleReconnect();
  };
  ws.onerror = () => { /* onclose always follows */ };
}

/**
 * Subscribe to realtime chat events. Auto-connects on first subscription.
 * Returns an unsubscribe function.
 */
export function onRealtime(cb: Listener): () => void {
  listeners.add(cb);
  wantConnected = true;
  open();
  return () => { listeners.delete(cb); };
}

/** Force an immediate reconnection attempt (e.g. app returned to foreground). */
export function reconnectRealtime() {
  if (!wantConnected) return;
  clearReconnect();
  reconnectDelay = 1000;
  if (socket && (socket.readyState === 0 || socket.readyState === 1)) return;
  open();
}

export function isRealtimeReady(): boolean {
  return ready;
}

// Reconnect when the app returns to foreground (sockets die silently in background)
AppState.addEventListener('change', (next) => {
  if (next === 'active') reconnectRealtime();
});

/** Subscribe to private, content-free hints; the caller refetches via the API. */
export function subscribeToUserEvents(
  onEvent: (type: string) => void,
  onStatus?: (connected: boolean) => void,
): () => void {
  let cancelled = false;
  let channel: ReturnType<typeof realtimeClient.channel> | null = null;

  void (async () => {
    try {
      const result = await getRealtimeTopic();
      if (cancelled || !result.enabled || !result.topic) {
        if (!cancelled) onStatus?.(false);
        return;
      }

      channel = realtimeClient
        .channel(result.topic, { config: { broadcast: { self: false } } })
        .on('broadcast', { event: 'ping' }, ({ payload }) => {
          if (!cancelled) onEvent(String(payload?.type || 'changed'));
        })
        .subscribe(status => {
          if (cancelled) return;
          if (status === 'SUBSCRIBED') {
            onStatus?.(true);
            onEvent('reconnected');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            onStatus?.(false);
          }
        });
    } catch {
      if (!cancelled) onStatus?.(false);
    }
  })();

  return () => {
    cancelled = true;
    if (channel) {
      void realtimeClient.removeChannel(channel);
      channel = null;
    }
  };
}
