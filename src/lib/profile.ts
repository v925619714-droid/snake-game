import AsyncStorage from '@react-native-async-storage/async-storage';
import { START_RATING } from '../game/rating';

const KEY = 'snake:profile';

export interface Profile {
  id: string;
  rating: number;
  wins: number;
  losses: number;
}

function newId(): string {
  return 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function defaultProfile(): Profile {
  return { id: newId(), rating: START_RATING, wins: 0, losses: 0 };
}

export async function loadProfile(): Promise<Profile> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p.id === 'string' && typeof p.rating === 'number') {
        return {
          id: p.id,
          rating: Math.max(0, Math.round(p.rating)),
          wins: typeof p.wins === 'number' ? p.wins : 0,
          losses: typeof p.losses === 'number' ? p.losses : 0,
        };
      }
    }
  } catch {}
  const p = defaultProfile();
  AsyncStorage.setItem(KEY, JSON.stringify(p)).catch(() => {});
  return p;
}

export async function saveProfile(p: Profile): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
}
