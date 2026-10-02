import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Tracks the OS "Reduce Motion" accessibility preference.
 *
 * Profile motion (identity collapse, tile fade-in, follow/save feedback) is a
 * courtesy, not information — when the user asks the system to reduce motion we
 * skip the animation instead of shortening it. Defaults to `false` so the first
 * paint is never blocked on the async query, and updates live if the setting
 * changes while the app is open.
 */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((enabled: boolean) => {
        if (mounted) setReduceMotion(!!enabled);
      })
      .catch(() => { /* Not supported (web/older runtimes) — keep default. */ });

    const subscription = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      (enabled: boolean) => setReduceMotion(!!enabled),
    );

    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  return reduceMotion;
}
