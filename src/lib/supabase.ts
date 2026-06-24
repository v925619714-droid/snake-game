import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';

export const hasSupabase = Boolean(url && key);

// Клиент для Realtime Broadcast (мультиплеер), таблицы лидерборда и Auth (сессии/аккаунты).
// Сессия хранится в AsyncStorage (на web — localStorage) и автообновляется.
// detectSessionInUrl=false — вход по коду (OTP), без разбора URL-хэша (важно для GitHub Pages).
export const supabase = createClient(url, key, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  realtime: { params: { eventsPerSecond: 30 } },
});
