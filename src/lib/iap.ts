// Покупки монет за реальные деньги (expo-iap / StoreKit / Play Billing).
// Паттерн как у supabase/analytics: без стора (web, нет продуктов в ASC) — полный no-op,
// UI просто не показывает секцию. Продукты создаются в App Store Connect на
// МОНЕТИЗИРУЕМОМ аккаунте (КЗ); на билде без продуктов fetchCoinPacks вернёт [].
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COIN_PACKS, type CoinPack } from './iapProducts';
import {
  buyCoinPackRustore,
  fetchCoinPacksRustore,
  hasIapRustore,
  initIapRustore,
} from './iapRustore';

// Каталог паков — единый для всех провайдеров (см. iapProducts.ts). Ре-экспорт, чтобы
// потребители (App.tsx) продолжали импортировать из './iap' без изменений.
export { COIN_PACKS };
export type { CoinPack };

// На RuStore-сборке (флаг EXPO_PUBLIC_STORE=rustore) покупки идут через нативный RuStore
// Billing SDK + серверную валидацию (iapRustore.ts), а НЕ через expo-iap (Apple/Play Billing,
// который на APK из RuStore не работает).
const USE_RUSTORE = process.env.EXPO_PUBLIC_STORE === 'rustore';

// Нативный модуль нельзя импортировать статически: на web requireNativeModule падает
// при загрузке. Условный require выполняется только вне web.
type IapModule = typeof import('expo-iap');
let iap: IapModule | null = null;
if (Platform.OS !== 'web') {
  try {
    iap = require('expo-iap');
  } catch {}
}

export const hasIap = (): boolean => (USE_RUSTORE ? hasIapRustore() : iap !== null);

let connected = false;

// Защита от повторного гранта монет: обработанные transactionId ПЕРСИСТЯТСЯ в
// AsyncStorage (только память ломалась перезапуском: стор ре-доставляет покупку,
// finished пуст → повторный грант — прямой эксплойт consumable-монет).
const FIN_KEY = 'snake:iapFinished';
const FIN_LIMIT = 50; // храним последние N, старые не нужны (стор их уже не ре-доставит)
let finished = new Set<string>();

async function loadFinished(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(FIN_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) finished = new Set(arr.filter((x) => typeof x === 'string'));
    }
  } catch {}
}

function persistFinished(): void {
  const arr = [...finished].slice(-FIN_LIMIT);
  finished = new Set(arr);
  AsyncStorage.setItem(FIN_KEY, JSON.stringify(arr)).catch(() => {});
}

type Purchase = { productId: string; id?: string; transactionDate?: number };

// Подключение к стору + слушатели результата покупки. Возвращает cleanup.
// onCoins вызывается ПОСЛЕ успешной покупки — грант монет и запись в кошелёк на стороне App.
// onError — отказ/сбой покупки (кроме отмены пользователем): UI показывает сообщение.
export function initIap(
  onCoins: (coins: number, sku: string) => void,
  onError?: (code?: string) => void,
): () => void {
  if (USE_RUSTORE) return initIapRustore(onCoins, onError);
  if (!iap) return () => {};
  const mod = iap;
  let disposed = false;
  let upd: { remove(): void } | null = null;
  let err: { remove(): void } | null = null;

  const grant = (purchase: Purchase) => {
    const sku = purchase.productId;
    const pack = COIN_PACKS.find((p) => p.sku === sku);
    if (!pack) return false;
    const tid = purchase.id || `${sku}:${purchase.transactionDate}`;
    if (finished.has(tid)) return false;
    finished.add(tid);
    persistFinished();
    // Серверной верификации нет (монеты — клиентская валюта, как и весь кошелёк).
    onCoins(pack.coins, sku);
    return true;
  };

  // Слушатели вешаем ПОСЛЕ загрузки персиста finished — иначе ре-доставленная стором
  // покупка успела бы получить повторный грант до того, как мы узнали, что она обработана.
  loadFinished().then(() => {
    if (disposed) return;
    upd = mod.purchaseUpdatedListener((purchase) => {
      grant(purchase);
      mod.finishTransaction({ purchase, isConsumable: true }).catch(() => {});
    });
    err = mod.purchaseErrorListener((e: { code?: string }) => {
      // Отмена пользователем — не ошибка, UI не трогаем. Остальное — сообщаем.
      const code = String(e?.code ?? '');
      if (/cancel/i.test(code)) return;
      onError?.(code);
    });

    mod
      .initConnection()
      .then(async () => {
        connected = true;
        // «Зависшие» покупки (приложение убили до finishTransaction): догрантить и завершить.
        try {
          const pending = await mod.getAvailablePurchases();
          for (const purchase of pending as Purchase[]) {
            grant(purchase);
            await mod
              .finishTransaction({ purchase: purchase as never, isConsumable: true })
              .catch(() => {});
          }
        } catch {}
      })
      .catch(() => {});
  });

  return () => {
    disposed = true;
    upd?.remove();
    err?.remove();
    if (connected) mod.endConnection().catch(() => {});
    connected = false;
  };
}

// Список паков с локализованными ценами. [] = стор недоступен/продукты не заведены → UI прячет секцию.
export async function fetchCoinPacks(): Promise<CoinPack[]> {
  if (USE_RUSTORE) return fetchCoinPacksRustore();
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

// Запуск покупки. Успех придёт в purchaseUpdatedListener (initIap); синхронный отказ
// стора (нет соединения и т.п.) — false, чтобы UI показал сообщение об ошибке.
export async function buyCoinPack(sku: string): Promise<boolean> {
  if (USE_RUSTORE) return buyCoinPackRustore(sku);
  if (!iap) return false;
  try {
    await iap.requestPurchase({
      request: { apple: { sku }, google: { skus: [sku] } },
      type: 'in-app',
    });
    return true;
  } catch {
    return false;
  }
}
