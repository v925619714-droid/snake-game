// Покупки монет за реальные деньги (expo-iap / StoreKit / Play Billing).
// Паттерн как у supabase/analytics: без стора (web, нет продуктов в ASC) — полный no-op,
// UI просто не показывает секцию. Продукты создаются в App Store Connect на
// МОНЕТИЗИРУЕМОМ аккаунте (КЗ); на билде без продуктов fetchCoinPacks вернёт [].
import { Platform } from 'react-native';

// Consumable-пакеты монет. SKU должны 1:1 совпадать с продуктами в ASC/Play Console.
export const COIN_PACKS: { sku: string; coins: number }[] = [
  { sku: 'com.kanaewvs.snake.coins100', coins: 100 },
  { sku: 'com.kanaewvs.snake.coins600', coins: 600 },
  { sku: 'com.kanaewvs.snake.coins1500', coins: 1500 },
];

export interface CoinPack {
  sku: string;
  coins: number;
  price: string; // локализованная цена из стора ("$0.99")
}

// Нативный модуль нельзя импортировать статически: на web requireNativeModule падает
// при загрузке. Условный require выполняется только вне web.
type IapModule = typeof import('expo-iap');
let iap: IapModule | null = null;
if (Platform.OS !== 'web') {
  try {
    iap = require('expo-iap');
  } catch {}
}

export const hasIap = (): boolean => iap !== null;

let connected = false;
const finished = new Set<string>(); // защита от повторного гранта за один и тот же transaction

// Подключение к стору + слушатели результата покупки. Возвращает cleanup.
// onCoins вызывается ПОСЛЕ успешной покупки — грант монет и запись в кошелёк на стороне App.
export function initIap(onCoins: (coins: number, sku: string) => void): () => void {
  if (!iap) return () => {};
  const mod = iap;

  const upd = mod.purchaseUpdatedListener((purchase) => {
    const sku = purchase.productId;
    const pack = COIN_PACKS.find((p) => p.sku === sku);
    if (!pack) return;
    const tid = purchase.id || `${sku}:${purchase.transactionDate}`;
    if (finished.has(tid)) return;
    finished.add(tid);
    // Серверной верификации нет (монеты — клиентская валюта, как и весь кошелёк).
    onCoins(pack.coins, sku);
    mod.finishTransaction({ purchase, isConsumable: true }).catch(() => {});
  });
  const err = mod.purchaseErrorListener(() => {
    // Отмена/ошибка покупки — ничего не делаем (UI не блокируется).
  });

  mod
    .initConnection()
    .then(() => {
      connected = true;
    })
    .catch(() => {});

  return () => {
    upd.remove();
    err.remove();
    if (connected) mod.endConnection().catch(() => {});
    connected = false;
  };
}

// Список паков с локализованными ценами. [] = стор недоступен/продукты не заведены → UI прячет секцию.
export async function fetchCoinPacks(): Promise<CoinPack[]> {
  if (!iap || !connected) return [];
  try {
    const products = await iap.fetchProducts({ skus: COIN_PACKS.map((p) => p.sku), type: 'in-app' });
    return COIN_PACKS.flatMap((pack) => {
      const prod = (products as { id: string; displayPrice: string }[]).find((p) => p.id === pack.sku);
      return prod ? [{ sku: pack.sku, coins: pack.coins, price: prod.displayPrice }] : [];
    });
  } catch {
    return [];
  }
}

// Запуск покупки. Результат придёт в purchaseUpdatedListener (initIap), не сюда.
export async function buyCoinPack(sku: string): Promise<void> {
  if (!iap) return;
  try {
    await iap.requestPurchase({
      request: { apple: { sku }, google: { skus: [sku] } },
      type: 'in-app',
    });
  } catch {
    // Синхронный отказ стора (нет соединения и т.п.) — тихо, UI не ломаем.
  }
}
