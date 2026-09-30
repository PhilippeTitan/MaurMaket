import { WebSocketServer } from 'ws';
import { getAuth } from './config/auth.js';

// ───── Realtime (WebSocket) layer ─────
// WhatsApp-style instant delivery on top of the existing 5s polling safety net.
// Protocol:
//   client -> { type: 'auth', token: <better-auth session token> }
//   server -> { type: 'ready' }            on successful auth
//   server -> { type: 'message_new' | 'typing' | 'messages_read' | 'message_updated'
//               | 'message_deleted' | 'message_reactions', ... }
// Failed auth closes the socket (4003); unauthenticated sockets are culled after 5s.

const clients = new Map(); // userId -> Set<socket>
let wss = null;
let heartbeatTimer = null;

async function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || token.length > 4096) return null;
  try {
    const auth = getAuth();
    const ctx = await auth.$context;
    const cookieName = ctx.authCookies.sessionToken.name;
    const headers = new Headers();
    headers.set('cookie', `${cookieName}=${token}`);
    const session = await auth.api.getSession({ headers });
    return session?.user?.id || null;
  } catch {
    return null;
  }
}

function addClient(userId, socket) {
  let set = clients.get(userId);
  if (!set) { set = new Set(); clients.set(userId, set); }
  set.add(socket);
}

function removeClient(socket) {
  if (!socket.userId) return;
  const set = clients.get(socket.userId);
  if (!set) return;
  set.delete(socket);
  if (set.size === 0) clients.delete(socket.userId);
}

export function initRealtime(httpServer) {
  if (wss) return;
  wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: 64 * 1024 });

  wss.on('connection', (socket) => {
    socket.userId = null;
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });

    const authTimeout = setTimeout(() => {
      if (!socket.userId) { try { socket.close(4001, 'auth timeout'); } catch { /* ignore */ } }
    }, 5000);

    socket.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'auth') {
        if (socket.userId) return;
        const userId = await verifySessionToken(msg.token);
        if (!userId) { try { socket.close(4003, 'unauthorized'); } catch { /* ignore */ } return; }
        clearTimeout(authTimeout);
        socket.userId = userId;
        addClient(userId, socket);
        try { socket.send(JSON.stringify({ type: 'ready' })); } catch { /* ignore */ }
      }
    });

    socket.on('close', () => { clearTimeout(authTimeout); removeClient(socket); });
    socket.on('error', () => { /* handled via close */ });
  });

  heartbeatTimer = setInterval(() => {
    if (!wss) return;
    for (const socket of wss.clients) {
      if (!socket.isAlive) { try { socket.terminate(); } catch { /* ignore */ } continue; }
      socket.isAlive = false;
      try { socket.ping(); } catch { /* ignore */ }
    }
  }, 30000);

  console.log('[REALTIME] WebSocket server listening on /ws');
}

export function emitToUsers(userIds, event) {
  if (!wss) return;
  const payload = JSON.stringify(event);
  const unique = [...new Set(userIds.filter(Boolean))];
  for (const id of unique) {
    const set = clients.get(id);
    if (!set) continue;
    for (const socket of set) {
      if (socket.readyState === 1) {
        try { socket.send(payload); } catch { /* socket will close */ }
      }
    }
  }
}

export function emitToUser(userId, event) {
  emitToUsers([userId], event);
}

export function closeRealtime() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  if (wss) {
    try { for (const socket of wss.clients) socket.terminate(); } catch { /* ignore */ }
    try { wss.close(); } catch { /* ignore */ }
    wss = null;
  }
  clients.clear();
}
