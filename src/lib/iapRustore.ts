// Провайдер покупок для RuStore (нативный react-native-rustore-billing-sdk).
// Активен только на RuStore-сборке (EXPO_PUBLIC_STORE=rustore) — выбор делает iap.ts.
// Отличие от expo-iap: покупка промис-based (purchaseProduct → confirmPurchase), а начисление
// монет идёт ЧЕРЕЗ НАШ СЕРВЕР: purchaseId валидируется на бэкенде (RuStore API), сервер
// начисляет монеты и возвращает дельту. Клиент сам монеты не «печатает» (античит).
import { Platform } from 'react-native';
import { COIN_PACKS, type CoinPack } from './iapProducts';
import { supabase } from './supabase';

// Нативный модуль нельзя импортировать статически (на web/iOS его нет). Условный require
// выполняется только на Android; на билде без пакета/флага rb остаётся null → полный no-op.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RustoreModule = any;
let rb: RustoreModule | null = null;
if (Platform.OS === 'android') {
  try {
    const m = require('react-native-rustore-billing-sdk');
    rb = m?.default ?? m;
  } catch {}
}

const APP_ID = process.env.EXPO_PUBLIC_RUSTORE_APP_ID || '';
const SCHEME = process.env.EXPO_PUBLIC_RUSTORE_SCHEME || 'snakerustore';
const VALIDATE_URL = process.env.EXPO_PUBLIC_RUSTORE_VALIDATE_URL || '';

export const hasIapRustore = (): boolean => rb !== null && APP_ID !== '';

let inited = false;
let coinsCb: ((coins: number, sku: string) => void) | null = null;
let errCb: ((code?: string) => void) | null = null;

// init идемпотентен: SDK инициализируем один раз, колбэки обновляем на каждый вызов.
export function initIapRustore(
  onCoins: (coins: number, sku: string) => void,
  onError?: (code?: string) => void,
): () => void {
  coinsCb = onCoins;
  errCb = onError ?? null;
  if (rb && APP_ID && !inited) {
    try {
      rb.init({ consoleApplicationId: APP_ID, deeplinkScheme: SCHEME });
      inited = true;
    } catch {}
  }
  return () => {
    coinsCb = null;
    errCb = null;
  };
}

// Список паков с ценами RuStore. [] = стор/покупки недоступны → UI прячет секцию.
export async function fetchCoinPacksRustore(): Promise<CoinPack[]> {
  if (!rb || !APP_ID) return [];
  try {
    // На части устройств покупки недоступны (нет RuStore/не залогинен) — тогда прячем секцию.
    const avail = await rb.checkPurchasesAvailability?.().catch(() => null);
    if (avail && avail.isAvailable === false) return [];
    const raw = await rb.getProducts(COIN_PACKS.map((p) => p.sku));
    const list: { productId?: string; id?: string; priceLabel?: string; price?: string }[] =
      Array.isArray(raw) ? raw : (raw?.products ?? []);
    return COIN_PACKS.flatMap((pack) => {
      const prod = list.find((p) => (p.productId ?? p.id) === pack.sku);
      if (!prod) return [];
      const price = String(prod.priceLabel ?? prod.price ?? '');
      return [{ sku: pack.sku, coins: pack.coins, price }];
    });
  } catch {
    return [];
  }
}

// Покупка пака. SUCCESS → серверная валидация+начисление → грант монет в App → consume.
export async function buyCoinPackRustore(sku: string): Promise<boolean> {
  if (!rb || !APP_ID) return false;
  try {
    const res = await rb.purchaseProduct({ productId: sku, quantity: 1 });
    const type = String(res?.type ?? res?.purchaseType ?? '');
    if (type !== 'SUCCESS') {
      if (!/cancel/i.test(type)) errCb?.(type || undefined);
      return /cancel/i.test(type); // отмена — не ошибка для UI
    }
    // Pay SDK (v10): разовые покупки идентифицируются invoiceId; в старых сборках — purchaseId.
    const payId: string | undefined =
      res?.response?.invoiceId ?? res?.invoiceId ?? res?.response?.purchaseId ?? res?.purchaseId;
    if (!payId) {
      errCb?.('no_invoice_id');
      return false;
    }
    // Сервер сам валидирует инвойс и ПОДТВЕРЖДАЕТ покупку (:confirm) — он авторитетен,
    // поэтому клиентский confirmPurchase не вызываем (иначе двойное подтверждение).
    const granted = await validateAndGrant(payId, sku);
    if (granted != null && granted > 0) coinsCb?.(granted, sku);
    return granted != null;
  } catch {
    errCb?.();
    return false;
  }
}

// Валидация покупки и начисление на нашем сервере. Возвращает дельту монет (0 если уже
// обработана ранее — идемпотентность на сервере) или null при сбое (монеты НЕ начисляем).
async function validateAndGrant(invoiceId: string, sku: string): Promise<number | null> {
  if (!VALIDATE_URL) {
    errCb?.('no_validation'); // сервер валидации не сконфигурирован
    return null;
  }
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const r = await fetch(VALIDATE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ invoiceId, sku }),
    });
    if (!r.ok) {
      errCb?.(`validate_${r.status}`);
      return null;
    }
    const j = (await r.json()) as { coins?: number };
    return typeof j.coins === 'number' ? j.coins : null;
  } catch {
    errCb?.('validate_net');
    return null;
  }
}
