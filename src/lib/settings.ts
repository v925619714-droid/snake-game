// Настройки игры: хаптики и дальтоник-режим. Значения держим в памяти (sync-геттеры),
// грузим из AsyncStorage один раз на старте. Звук — отдельно в sound.ts.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const HAPTICS_KEY = 'snake:haptics';
const CB_KEY = 'snake:colorblind';

let haptics = true; // по умолчанию вкл
let colorblind = true; // по умолчанию вкл (разная форма еды в дуэли — доступность)

export async function initSettings(): Promise<void> {
  try {
    const [h, c] = await Promise.all([AsyncStorage.getItem(HAPTICS_KEY), AsyncStorage.getItem(CB_KEY)]);
    haptics = h !== '0';
    colorblind = c !== '0';
  } catch {}
}

export const hapticsOn = (): boolean => haptics;
export const colorblindOn = (): boolean => colorblind;

export async function setHaptics(v: boolean): Promise<void> {
  haptics = v;
  try {
    await AsyncStorage.setItem(HAPTICS_KEY, v ? '1' : '0');
  } catch {}
}

export async function setColorblind(v: boolean): Promise<void> {
  colorblind = v;
  try {
    await AsyncStorage.setItem(CB_KEY, v ? '1' : '0');
  } catch {}
}

// Хаптик-обёртки (уважают настройку + только на устройстве).
const enabled = () => haptics && Platform.OS !== 'web';
export const hLight = () => {
  if (enabled()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};
export const hMedium = () => {
  if (enabled()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
};
export const hSelect = () => {
  if (enabled()) Haptics.selectionAsync().catch(() => {});
};
export const hSuccess = () => {
  if (enabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
};
export const hError = () => {
  if (enabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
};
