import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';

export const hasSupabase = Boolean(url && key);

// ВАЖНО: createClient('', '') кидает исключение на уровне модуля → если ключей нет
// (напр. сборка без env), весь бандл не инициализируется и приложение виснет на сплеше.
// Поэтому при отсутствии конфига подставляем безвредные плейсхолдеры; вся реальная
// работа всё равно отсечена флагом hasSupabase (офлайн-безопасно).
const safeUrl = url || 'https://placeholder.supabase.co';
const safeKey = key || 'placeholder-anon-key';

// Клиент для Realtime Broadcast (мультиплеер), таблицы лидерборда и Auth (сессии/аккаунты).
// Сессия хранится в AsyncStorage (на web — localStorage) и автообновляется.
// detectSessionInUrl=false — вход по коду (OTP), без разбора URL-хэша (важно для GitHub Pages).
export const supabase = createClient(safeUrl, safeKey, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  realtime: { params: { eventsPerSecond: 30 } },
});
