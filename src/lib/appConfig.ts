// Гейт минимальной версии: на старте спрашиваем у бэкенда min_supported_version.
// Если версия приложения ниже — показываем блокирующий экран «обновите». Ретроактивно
// НЕ форсит уже установленные (до-гейтовые) версии, но делает все БУДУЩИЕ смены бэкенда
// чистым cutover (поднять min_version → старые версии просят обновиться).
import Constants from 'expo-constants';
import { supabase } from './supabase';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

// Сравнение semver a<b => -1. Без пререлизов (нам достаточно X.Y.Z).
function cmpVersion(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export interface VersionGate {
  blocked: boolean; // версия ниже минимально поддерживаемой → блок
  latest?: string; // последняя версия (для подсказки)
}

// Офлайн-безопасно: при ошибке сети НЕ блокируем (returns blocked:false).
export async function checkVersionGate(): Promise<VersionGate> {
  try {
    const { data, error } = await supabase.from('app_config').select('key,value');
    if (error || !data) return { blocked: false };
    const rows = data as { key: string; value: string }[];
    const min = rows.find((r) => r.key === 'min_version')?.value;
    const latest = rows.find((r) => r.key === 'latest_version')?.value;
    if (min && cmpVersion(APP_VERSION, min) < 0) return { blocked: true, latest };
    return { blocked: false, latest };
  } catch {
    return { blocked: false };
  }
}
