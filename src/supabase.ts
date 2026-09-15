import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { setCachedToken } from './api';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
}

// Supabase client kept for database access (storage, realtime, etc.)
// Auth is now handled exclusively by Better Auth
export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder-anon-key', {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

/**
 * Restore session from a URL callback (e.g., after OAuth redirect or password reset).
 * Better Auth sets session tokens in cookies or URL params.
 * Returns 'recovery' for password reset, 'confirmation' for email verification, or false.
 */
export async function restoreSessionFromUrl(url: string): Promise<'recovery' | 'confirmation' | false> {
  // Check URL hash fragment for Better Auth tokens
  const fragment = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
  const hashParams = new URLSearchParams(fragment);

  // Check query params
  const queryStr = url.includes('?') ? url.split('?')[1]?.split('#')[0] || '' : '';
  const queryParams = new URLSearchParams(queryStr);

  // Better Auth may set session_token in hash or query
  const sessionToken = hashParams.get('session_token') || hashParams.get('token')
    || queryParams.get('session_token') || queryParams.get('token');

  if (sessionToken) {
    setCachedToken(sessionToken);
    return queryParams.get('type') === 'recovery' ? 'recovery' : 'confirmation';
  }

  // Legacy Supabase callback: check for access_token/refresh_token
  const accessToken = hashParams.get('access_token') || queryParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token') || queryParams.get('refresh_token');
  if (accessToken) {
    // Store the access token as a fallback during migration
    setCachedToken(accessToken);
    return queryParams.get('type') === 'recovery' ? 'recovery' : 'confirmation';
  }

  return false;
}
