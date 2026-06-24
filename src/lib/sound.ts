// Звуковые эффекты (expo-audio). Один плеер на эффект, переигрывается seekTo(0)+play().
// Полностью офлайн/безопасно: при ошибке — no-op. Глушилка хранится в AsyncStorage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

const MUTED_KEY = 'snake:muted';

const sources = {
  eat: require('../../assets/sfx/eat.wav'),
  crash: require('../../assets/sfx/crash.wav'),
  win: require('../../assets/sfx/win.wav'),
  lose: require('../../assets/sfx/lose.wav'),
  boost: require('../../assets/sfx/boost.wav'),
  ui: require('../../assets/sfx/ui.wav'),
};
export type Sfx = keyof typeof sources;

let muted = false;
let loaded = false;
const players: Partial<Record<Sfx, AudioPlayer>> = {};

// Загрузить плееры и прочитать настройку звука (вызывать один раз на старте).
export async function initSound(): Promise<void> {
  try {
    const v = await AsyncStorage.getItem(MUTED_KEY);
    muted = v === '1';
  } catch {}
  if (loaded) return;
  loaded = true;
  try {
    (Object.keys(sources) as Sfx[]).forEach((k) => {
      const p = createAudioPlayer(sources[k]);
      p.volume = 0.5;
      players[k] = p;
    });
  } catch {}
}

export function isMuted(): boolean {
  return muted;
}

export async function setMuted(m: boolean): Promise<void> {
  muted = m;
  try {
    await AsyncStorage.setItem(MUTED_KEY, m ? '1' : '0');
  } catch {}
}

// Переключить звук, вернуть новое состояние (muted?).
export function toggleMuted(): boolean {
  void setMuted(!muted);
  return muted;
}

export function play(name: Sfx): void {
  if (muted) return;
  const p = players[name];
  if (!p) return;
  try {
    p.seekTo(0);
    p.play();
  } catch {}
}
