import { realtimeClient } from './realtimeClient';
import { getRealtimeTopic } from './api';

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
