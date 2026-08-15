import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

type Listener = (online: boolean) => void;

let _online = true;
let _initialized = false;
let _listeners: Listener[] = [];
let _unsub: (() => void) | null = null;

function notify() {
  _listeners.forEach(fn => fn(_online));
}

async function init() {
  if (_initialized) return;
  _initialized = true;

  const state = await NetInfo.fetch();
  _online = isReachable(state);

  _unsub = NetInfo.addEventListener((state: NetInfoState) => {
    const nowOnline = isReachable(state);
    if (nowOnline !== _online) {
      _online = nowOnline;
      notify();
    }
  });
}

function isReachable(state: NetInfoState): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

export const network = {
  /** Must be called once at app boot (before any screens render). */
  async init() { await init(); },

  /** Synchronous check — safe to call anywhere. */
  get isOnline() { return _online; },
  get isOffline() { return !_online; },

  /** Subscribe to connectivity changes. Returns unsubscribe function. */
  onChange(fn: Listener): () => void {
    _listeners.push(fn);
    return () => { _listeners = _listeners.filter(l => l !== fn); };
  },

  /** Promise-based: resolves when back online, or immediately if already online. */
  async waitForOnline(): Promise<void> {
    if (_online) return;
    return new Promise(resolve => {
      const unsub = network.onChange(online => {
        if (online) { unsub(); resolve(); }
      });
    });
  },
};
