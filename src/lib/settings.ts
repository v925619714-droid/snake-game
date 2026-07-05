// Настройки игры: хаптики, дальтоник-режим и схема управления. Значения держим в памяти
// (sync-геттеры), грузим из AsyncStorage один раз на старте. Звук — отдельно в sound.ts.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const HAPTICS_KEY = 'snake:haptics';
const CB_KEY = 'snake:colorblind';
const CTRL_SCHEME_KEY = 'snake:ctrlScheme';
const CTRL_SIDE_KEY = 'snake:ctrlSide';

export type CtrlScheme = 'dpad' | 'split' | 'swipe';
export type CtrlSide = 'left' | 'center' | 'right';

let haptics = true; // по умолчанию вкл
let colorblind = true; // по умолчанию вкл (разная форма еды в дуэли — доступность)
let ctrlScheme: CtrlScheme = 'dpad'; // кнопки — надёжный дефолт; свайп работает параллельно всегда
let ctrlSide: CtrlSide = 'center';

export async function initSettings(): Promise<void> {
  try {
    const [h, c, cs, cd] = await Promise.all([
      AsyncStorage.getItem(HAPTICS_KEY),
      AsyncStorage.getItem(CB_KEY),
      AsyncStorage.getItem(CTRL_SCHEME_KEY),
      AsyncStorage.getItem(CTRL_SIDE_KEY),
    ]);
    haptics = h !== '0';
    colorblind = c !== '0';
    if (cs === 'dpad' || cs === 'split' || cs === 'swipe') ctrlScheme = cs;
    if (cd === 'left' || cd === 'center' || cd === 'right') ctrlSide = cd;
  } catch {}
}

export const hapticsOn = (): boolean => haptics;
export const colorblindOn = (): boolean => colorblind;
export const getCtrlScheme = (): CtrlScheme => ctrlScheme;
export const getCtrlSide = (): CtrlSide => ctrlSide;

export async function setCtrlScheme(v: CtrlScheme): Promise<void> {
  ctrlScheme = v;
  try {
    await AsyncStorage.setItem(CTRL_SCHEME_KEY, v);
  } catch {}
}

export async function setCtrlSide(v: CtrlSide): Promise<void> {
  ctrlSide = v;
  try {
    await AsyncStorage.setItem(CTRL_SIDE_KEY, v);
  } catch {}
}

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
