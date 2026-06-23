import AsyncStorage from '@react-native-async-storage/async-storage';
import { START_RATING } from '../game/rating';

const KEY = 'snake:profile';

export interface Profile {
  id: string;
  name: string;
  rating: number;
  wins: number;
  losses: number;
}

function newId(): string {
  return 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function newName(): string {
  return 'Player-' + Math.random().toString(36).slice(2, 6).toUpperCase();
}

export function defaultProfile(): Profile {
  return { id: newId(), name: newName(), rating: START_RATING, wins: 0, losses: 0 };
}

export async function loadProfile(): Promise<Profile> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p.id === 'string' && typeof p.rating === 'number') {
        const fixed: Profile = {
          id: p.id,
          name: typeof p.name === 'string' && p.name ? p.name : newName(),
          rating: Math.max(0, Math.round(p.rating)),
          wins: typeof p.wins === 'number' ? p.wins : 0,
          losses: typeof p.losses === 'number' ? p.losses : 0,
        };
        if (fixed.name !== p.name) AsyncStorage.setItem(KEY, JSON.stringify(fixed)).catch(() => {});
        return fixed;
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
