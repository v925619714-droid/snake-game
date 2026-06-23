// Чистая логика игровой экономики: монеты, владение скинами, выбор активного.
import { type Skin } from './skins';

export interface Wallet {
  coins: number;
  owned: string[]; // id купленных/доступных скинов (classic всегда внутри)
  selected: string; // активный скин
}

export function initialWallet(): Wallet {
  return { coins: 0, owned: ['classic'], selected: 'classic' };
}

export function addCoins(w: Wallet, n: number): Wallet {
  if (n <= 0) return w;
  return { ...w, coins: w.coins + n };
}

export function isOwned(w: Wallet, skinId: string): boolean {
  return w.owned.includes(skinId);
}

export function canBuy(w: Wallet, skin: Skin): boolean {
  return !isOwned(w, skin.id) && w.coins >= skin.price;
}

// Купить скин: списать монеты, добавить во владение и сразу выбрать.
export function buySkin(w: Wallet, skin: Skin): Wallet {
  if (!canBuy(w, skin)) return w;
  return {
    coins: w.coins - skin.price,
    owned: [...w.owned, skin.id],
    selected: skin.id,
  };
}

// Выбрать активный скин (только из уже доступных).
export function selectSkin(w: Wallet, skinId: string): Wallet {
  if (!isOwned(w, skinId)) return w;
  return { ...w, selected: skinId };
}

// Нормализация при загрузке из хранилища (на случай битых данных).
export function sanitizeWallet(raw: unknown): Wallet {
  const w = (raw ?? {}) as Partial<Wallet>;
  const owned = Array.isArray(w.owned) ? w.owned.filter((x) => typeof x === 'string') : [];
  if (!owned.includes('classic')) owned.unshift('classic');
  const coins = typeof w.coins === 'number' && w.coins >= 0 ? Math.floor(w.coins) : 0;
  const selected = typeof w.selected === 'string' && owned.includes(w.selected) ? w.selected : 'classic';
  return { coins, owned, selected };
}
