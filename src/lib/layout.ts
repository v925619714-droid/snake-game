// Единый расчёт размера игрового поля для solo/duel/party.
// Раньше каждый экран резервировал место под управление по-своему (336/356/330),
// из-за чего поле обрезалось или оставались дыры. Теперь резерв считается из
// РЕАЛЬНЫХ высот блока управления (см. Dpad.tsx: BTN=64, GAP=10) + высоты хрома экрана.
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCtrlScheme } from './settings';

// Десктопный браузер (мышь+клавиатура): D-pad не нужен, поле можно крупнее (B5).
export function useIsDesktopWeb(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width > 768;
}

// Фактические высоты блока управления (Dpad.tsx: BTN=64, GAP=14):
// dpad (ромб) = 3 кнопки × 64 + 2 зазора × 14 = 220; split = 2 × 64 + 14 = 142; swipe = 0.
export const CTRL_HEIGHTS = { dpad: 220, split: 142, swipe: 0 } as const;

export interface BoardPxOpts {
  min?: number; // нижний предел поля
  max?: number; // верхний предел поля
  chrome?: number; // высота остального UI экрана (шапка, хинт, отступы, кнопка выхода)
  sidePad?: number; // суммарные горизонтальные поля вокруг поля
}

export function useBoardPx({ min = 176, max = 360, chrome = 120, sidePad = 32 }: BoardPxOpts = {}): number {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const desktop = Platform.OS === 'web' && width > 768;
  // Десктоп: управление с клавиатуры, D-pad скрыт → резерв 0, поле крупнее (до 520).
  const ctrl = desktop ? 0 : CTRL_HEIGHTS[getCtrlScheme()];
  const capMax = desktop ? Math.max(max, 520) : max;
  const free = height - insets.top - insets.bottom - chrome - ctrl;
  return Math.max(min, Math.floor(Math.min(width - sidePad, free, capMax)));
}
