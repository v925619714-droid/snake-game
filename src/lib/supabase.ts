import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';

export const hasSupabase = Boolean(url && key);

// Клиент только для Realtime Broadcast (БД/таблицы не используются).
export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { params: { eventsPerSecond: 30 } },
});
