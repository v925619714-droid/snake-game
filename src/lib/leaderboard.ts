import { type Profile } from './profile';
import { hasSupabase, supabase } from './supabase';

export interface LeaderRow {
  id: string;
  name: string;
  rating: number;
  wins: number;
  losses: number;
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
