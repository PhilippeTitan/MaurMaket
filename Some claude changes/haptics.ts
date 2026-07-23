import { Platform } from 'react-native';

let Haptics: typeof import('expo-haptics') | null = null;
try {
  // Optional dependency — guarded so the app still works before
  // `expo-haptics` is installed, and no-ops gracefully on web.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Haptics = require('expo-haptics');
} catch {
  Haptics = null;
}

function safe(fn: () => void) {
  if (Platform.OS === 'web' || !Haptics) return;
  try { fn(); } catch { /* ignore */ }
}

/** Light tap — use for toggles like like/wishlist/follow buttons. */
export function tapLight() {
  safe(() => Haptics!.impactAsync(Haptics!.ImpactFeedbackStyle.Light));
}

/** Medium tap — use for more significant actions like add-to-cart. */
export function tapMedium() {
  safe(() => Haptics!.impactAsync(Haptics!.ImpactFeedbackStyle.Medium));
}

/** Success notification — use after an action completes, e.g. order placed. */
export function notifySuccess() {
  safe(() => Haptics!.notificationAsync(Haptics!.NotificationFeedbackType.Success));
}

/** Error/warning notification — use when an action fails. */
export function notifyError() {
  safe(() => Haptics!.notificationAsync(Haptics!.NotificationFeedbackType.Error));
}
