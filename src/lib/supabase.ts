import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const normalizeSupabaseUrl = (value?: string) => {
  const trimmedValue = value?.trim() ?? '';
  if (!trimmedValue) {
    return '';
  }
  try {
    const parsedUrl = new URL(trimmedValue);
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return '';
    }
    return parsedUrl.toString().replace(/\/$/, '');
  } catch (error) {
    console.warn('URL Supabase invalide ignorée', error);
    return '';
  }
};

const supabaseUrl = normalizeSupabaseUrl(process.env.EXPO_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const createAlloSupabaseClient = (storageKey: string) => createClient(supabaseUrl || 'https://example.supabase.co', supabaseAnonKey || 'anon-key', {
  auth: {
    storage: AsyncStorage,
    storageKey,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export const supabase = createAlloSupabaseClient('allocouscous-client-auth');
export const adminSupabase = createAlloSupabaseClient('allocouscous-admin-auth');
