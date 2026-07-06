// Единый расчёт размера игрового поля для solo/duel/party.
// Раньше каждый экран резервировал место под управление по-своему (336/356/330),
// из-за чего поле обрезалось или оставались дыры. Теперь резерв считается из
// РЕАЛЬНЫХ высот блока управления (см. Dpad.tsx: BTN=64, GAP=10) + высоты хрома экрана.
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCtrlScheme } from './settings';

// Фактические высоты блока управления:
// dpad (ромб) = 3 кнопки × 64 + 2 зазора × 10 = 212; split = 2 × 64 + 10 = 138; swipe = 0.
export const CTRL_HEIGHTS = { dpad: 212, split: 138, swipe: 0 } as const;

export interface BoardPxOpts {
  min?: number; // нижний предел поля
  max?: number; // верхний предел поля
  chrome?: number; // высота остального UI экрана (шапка, хинт, отступы, кнопка выхода)
  sidePad?: number; // суммарные горизонтальные поля вокруг поля
}

export function useBoardPx({ min = 176, max = 360, chrome = 120, sidePad = 32 }: BoardPxOpts = {}): number {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const ctrl = CTRL_HEIGHTS[getCtrlScheme()];
  const free = height - insets.top - insets.bottom - chrome - ctrl;
  return Math.max(min, Math.floor(Math.min(width - sidePad, free, max)));
}
