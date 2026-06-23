// Скины змейки. Цена — в игровых монетах (0 = стартовый, всегда доступен).

export interface Skin {
  id: string;
  name: string;
  price: number;
  body: string;
  head: string;
}

export const SKINS: Skin[] = [
  { id: 'classic', name: 'Классика', price: 0, body: '#3ddc84', head: '#7cffb0' },
  { id: 'gold', name: 'Золото', price: 50, body: '#f1c40f', head: '#ffe680' },
  { id: 'ice', name: 'Лёд', price: 80, body: '#5cc8ff', head: '#b3e8ff' },
  { id: 'fire', name: 'Огонь', price: 80, body: '#ff5c5c', head: '#ffac6b' },
  { id: 'grape', name: 'Виноград', price: 120, body: '#9b6cff', head: '#c8aaff' },
  { id: 'mono', name: 'Моно', price: 150, body: '#c9d1d9', head: '#ffffff' },
];

export const DEFAULT_SKIN = SKINS[0];

export function getSkin(id: string): Skin {
  return SKINS.find((s) => s.id === id) ?? DEFAULT_SKIN;
}
