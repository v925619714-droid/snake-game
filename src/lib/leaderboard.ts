import { type Profile } from './profile';
import { hasSupabase, supabase } from './supabase';

export interface LeaderRow {
  id: string;
  name: string;
  rating: number;
  wins: number;
  losses: number;
}

// Полный облачный профиль: рейтинг + кошелёк/прогресс (кросс-девайс).
export interface CloudProfile extends LeaderRow {
  coins: number;
  owned: string[];
  selected: string;
  best: number;
}

// Записать профиль в облако (через RPC upsert_profile).
export async function pushProfile(p: Profile): Promise<void> {
  if (!hasSupabase) return;
  try {
    await supabase.rpc('upsert_profile', {
      p_id: p.id,
      p_name: p.name,
      p_rating: p.rating,
      p_wins: p.wins,
      p_losses: p.losses,
    });
  } catch {}
}

// Облачный профиль по id аккаунта (auth.uid()). null — если нет строки/офлайн.
export async function fetchProfileById(id: string): Promise<CloudProfile | null> {
  if (!hasSupabase || !id) return null;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,name,rating,wins,losses,coins,owned,selected,best')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    const r = data as Record<string, unknown>;
    return {
      id: String(r.id),
      name: String(r.name ?? 'Player'),
      rating: Number(r.rating ?? 1000),
      wins: Number(r.wins ?? 0),
      losses: Number(r.losses ?? 0),
      coins: Number(r.coins ?? 0),
      owned: Array.isArray(r.owned) ? (r.owned as string[]) : ['classic'],
      selected: String(r.selected ?? 'classic'),
      best: Number(r.best ?? 0),
    };
  } catch {
    return null;
  }
}

// Отправить результат матча на СЕРВЕРНЫЙ ELO (RPC submit_match). Сервер сам берёт
// хранимый рейтинг игрока, считает дельту (K=32, кламп ±32), применяет кулдаун и пишет
// в строку auth.uid(). Возвращает авторитетный новый рейтинг (или null — офлайн/no-op).
export async function submitMatch(
  result: 'win' | 'loss' | 'draw',
  oppRating: number,
  vsBot: boolean,
): Promise<{ rating: number; delta: number } | null> {
  if (!hasSupabase) return null;
  try {
    const { data, error } = await supabase.rpc('submit_match', {
      p_result: result,
      p_opp_rating: Math.round(oppRating) || 1000,
      p_vs_bot: vsBot,
    });
    if (error || !data) return null;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.rating !== 'number') return null;
    return { rating: row.rating, delta: typeof row.delta === 'number' ? row.delta : 0 };
  } catch {
    return null;
  }
}

// Записать кошелёк/прогресс в облако (через RPC upsert_wallet). best — только вверх.
export async function pushWallet(
  id: string,
  coins: number,
  owned: string[],
  selected: string,
  best: number,
): Promise<void> {
  if (!hasSupabase || !id) return;
  try {
    await supabase.rpc('upsert_wallet', {
      p_id: id,
      p_coins: Math.max(0, Math.round(coins) || 0),
      p_owned: owned && owned.length ? owned : ['classic'],
      p_selected: selected || 'classic',
      p_best: Math.max(0, Math.round(best) || 0),
    });
  } catch {}
}

// Топ игроков по рейтингу.
export async function fetchLeaderboard(limit = 50): Promise<LeaderRow[]> {
  if (!hasSupabase) return [];
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,name,rating,wins,losses')
      .order('rating', { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as LeaderRow[];
  } catch {
    return [];
  }
}
