import { NativeModules, Platform } from 'react-native';

interface UssdResult {
  success: boolean;
  response?: string;
  request?: string;
  errorMessage?: string;
  failureCode?: number;
  message?: string;
}

interface UssdSupport {
  supported: boolean;
  apiLevel: number;
}

export interface SimSubscription {
  subscriptionId: number;
  carrier: string;
  displayName: string;
  number: string;      // masked: "••••1234"
  simSlotIndex: number;
  carrierKey: string;  // lowercase carrier for matching
}

const { UssdModule } = NativeModules;

// ═══════════════════════════════════════════════════════════════════════════
// SIM SUBSCRIPTION ENUMERATION (carrier-aware payment routing)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Enumerate active SIM subscriptions.
 * Returns carrier info for each SIM (no sensitive data — numbers are masked).
 */
export async function getSimSubscriptions(): Promise<SimSubscription[]> {
  if (Platform.OS !== 'android' || !UssdModule) {
    return [];
  }
  try {
    return await UssdModule.getSimSubscriptions();
  } catch {
    return [];
  }
}

/**
 * Find SIMs matching a required carrier.
 * carrierName: "natcom" or "digicel" (case-insensitive).
 * Returns: { matches: SimSubscription[], autoSelect: SimSubscription | null }
 */
export function findMatchingSims(subs: SimSubscription[], carrierName: string): {
  matches: SimSubscription[];
  autoSelect: SimSubscription | null;
} {
  const key = carrierName.toLowerCase().trim();
  const matches = subs.filter(s => s.carrierKey.includes(key) || key.includes(s.carrierKey));
  return {
    matches,
    autoSelect: matches.length === 1 ? matches[0] : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// USSD (existing methods)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Dial a USSD code using ACTION_CALL intent.
 * Opens the system USSD dialog ON TOP of the current app.
 * The user interacts with the native popup, then returns to the app.
 * This is the primary method — works on all carriers.
 */
export async function dialUssd(code: string): Promise<UssdResult> {
  if (Platform.OS !== 'android' || !UssdModule) {
    return { success: false, errorMessage: 'USSD only supported on Android' };
  }
  try {
    return await UssdModule.dialUssd(code);
  } catch (e: any) {
    return { success: false, errorMessage: e?.message || 'Failed to dial USSD' };
  }
}

/**
 * Dial USSD on a specific SIM subscription (carrier-aware routing).
 * Targets the specified subscriptionId via TelephonyManager.createForSubscriptionId().
 * Falls back to system dialer if in-app USSD fails.
 */
export async function dialUssdOnSubscription(code: string, subscriptionId: number): Promise<UssdResult> {
  if (Platform.OS !== 'android' || !UssdModule) {
    return { success: false, errorMessage: 'USSD only supported on Android' };
  }
  try {
    return await UssdModule.dialUssdOnSubscription(code, subscriptionId);
  } catch (e: any) {
    return { success: false, errorMessage: e?.message || 'Failed to dial USSD' };
  }
}

/**
 * Check if the device supports in-app USSD via sendUssdRequest.
 */
export async function isUssdSupported(): Promise<UssdSupport> {
  if (Platform.OS !== 'android' || !UssdModule) {
    return { supported: false, apiLevel: 0 };
  }
  try {
    return await UssdModule.isSupported();
  } catch {
    return { supported: false, apiLevel: 0 };
  }
}
