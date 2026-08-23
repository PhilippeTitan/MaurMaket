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

const { UssdModule } = NativeModules;

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
 * Send a USSD code in-app (Android 8.0+).
 * Uses TelephonyManager.sendUssdRequest — many carriers block this.
 * Prefer dialUssd() for reliable operation.
 */
export async function sendUssd(code: string, subscriptionId: number = -1): Promise<UssdResult> {
  if (Platform.OS !== 'android' || !UssdModule) {
    return { success: false, errorMessage: 'USSD only supported on Android' };
  }
  try {
    return await UssdModule.sendUssd(code, subscriptionId);
  } catch (e: any) {
    return { success: false, errorMessage: e?.message || 'USSD failed' };
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
