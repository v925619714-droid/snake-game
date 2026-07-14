// Серверная валидация покупок RuStore (Pay SDK) + начисление монет. Изолировано от игровой
// логики: монтируется в index.ts как express-роут POST /iap/rustore/validate.
//
// Поток: клиент купил пак (RuStore SDK) → шлёт invoiceId + sku + свой GoTrue-JWT сюда →
// сервер (1) проверяет JWT, (2) берёт Public-Token RuStore, (3) читает статус инвойса,
// (4) если PAID/CONFIRMED и sku совпал — начисляет монеты ИДЕМПОТЕНТНО (grant_coins,
// PK по invoice_id), (5) подтверждает покупку (:confirm) и возвращает начисленную дельту.
// Клиент монеты сам не «печатает» — это чинит прежнюю накрутку.
//
// ENV (задаёт комп 1 в /opt/snake-backend/.env, секреты только там):
//   RUSTORE_APP_ID       — consoleApplicationId (число из RuStore Console)
//   RUSTORE_KEY_ID       — keyId ключа RuStore (2351029770)
//   RUSTORE_PRIVATE_KEY  — приватный ключ RuStore (PKCS#8 PEM; \n экранированы)
//   JWT_SECRET           — общий секрет GoTrue (для верификации токена юзера)
//   PGRST_URL            — адрес PostgREST (по умолчанию http://postgrest:3000)
//   SERVICE_KEY          — service_role JWT (для RPC начисления)
//   RUSTORE_SANDBOX=1    — использовать песочницу RuStore
import crypto from 'crypto';
import type { Request, Response } from 'express';

const APP_ID = process.env.RUSTORE_APP_ID || '';
const KEY_ID = process.env.RUSTORE_KEY_ID || '';
const PRIVATE_KEY = (process.env.RUSTORE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const JWT_SECRET = process.env.JWT_SECRET || '';
const REST_URL = process.env.PGRST_URL || 'http://postgrest:3000';
const SERVICE_KEY = process.env.SERVICE_KEY || '';
const SANDBOX = process.env.RUSTORE_SANDBOX === '1';
const API = 'https://public-api.rustore.ru';

// SKU → монеты. Должно совпадать с src/lib/iapProducts.ts и товарами в RuStore Console.
const COINS: Record<string, number> = {
  'com.kanaewvs.snake.coins100': 100,
  'com.kanaewvs.snake.coins600': 600,
  'com.kanaewvs.snake.coins1500': 1500,
};

// --- Верификация GoTrue JWT (HS256) без внешних зависимостей ---
function b64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
function verifyJwt(token: string): { sub: string } | null {
  if (!JWT_SECRET) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest();
  const got = b64url(s);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) return null;
  try {
    const payload = JSON.parse(b64url(p).toString('utf8'));
    if (payload.exp && Date.now() / 1000 > Number(payload.exp)) return null;
    if (!payload.sub) return null;
    return { sub: String(payload.sub) };
  } catch {
    return null;
  }
}

// --- Public-Token (JWE) RuStore из keyId + подписи RSA-SHA512 ---
let tokenCache: { token: string; exp: number } | null = null;
async function rustoreToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.exp) return tokenCache.token;
  const timestamp = new Date().toISOString();
  const signer = crypto.createSign('RSA-SHA512');
  signer.update(KEY_ID + timestamp);
  const signature = signer.sign(PRIVATE_KEY, 'base64');
  const r = await fetch(`${API}/public/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyId: KEY_ID, timestamp, signature }),
  });
  const j: any = await r.json();
  const token = j?.body?.jwe ?? j?.jwe;
  if (!token) throw new Error('rustore_auth_failed');
  tokenCache = { token, exp: Date.now() + 10 * 60 * 1000 }; // JWE живёт дольше, кэшируем 10 мин
  return token;
}

function base(): string {
  return SANDBOX ? `${API}/public/sandbox` : `${API}/public`;
}

async function getPurchase(purchaseId: string, token: string): Promise<any> {
  const r = await fetch(`${base()}/applications/${APP_ID}/purchases/${purchaseId}`, {
    headers: { 'Public-Token': token },
  });
  return r.json();
}

async function confirmPurchase(purchaseId: string, token: string): Promise<void> {
  await fetch(`${base()}/applications/${APP_ID}/purchases/${purchaseId}:confirm`, {
    method: 'PUT',
    headers: { 'Public-Token': token },
  });
}

// Идемпотентное начисление через RPC grant_coins (см. миграцию 03-iap.sql). Возвращает
// начисленную дельту (0 — если invoice уже был обработан) или null при сбое.
async function grantCoins(userId: string, invoiceId: string, sku: string, coins: number): Promise<number | null> {
  const r = await fetch(`${REST_URL}/rpc/grant_coins`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ p_user: userId, p_invoice: invoiceId, p_sku: sku, p_coins: coins }),
  });
  if (!r.ok) return null;
  const j: any = await r.json();
  if (typeof j === 'number') return j;
  if (typeof j?.delta === 'number') return j.delta;
  return null;
}

export async function handleRustoreValidate(req: Request, res: Response): Promise<Response> {
  try {
    const auth = req.header('authorization') || '';
    const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const user = verifyJwt(jwt);
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const invoiceId = req.body?.invoiceId;
    const sku = req.body?.sku;
    if (typeof invoiceId !== 'string' || typeof sku !== 'string' || !(sku in COINS)) {
      return res.status(400).json({ error: 'bad_request' });
    }

    const token = await rustoreToken();
    const info = await getPurchase(invoiceId, token);
    const body = info?.body ?? info;
    const status = body?.purchaseState ?? body?.status;
    const prod = body?.productId ?? body?.product_id;
    if (prod && prod !== sku) return res.status(409).json({ error: 'sku_mismatch' });
    if (status !== 'PAID' && status !== 'CONFIRMED') {
      return res.status(402).json({ error: 'not_paid', status });
    }

    // Начисляем ДО confirm — если confirm упадёт, монеты уже у юзера, а RuStore авто-refund
    // при неподтверждении лечит только его сторону. Идемпотентность защищает от повтора.
    const delta = await grantCoins(user.sub, invoiceId, sku, COINS[sku]);
    if (delta == null) return res.status(500).json({ error: 'grant_failed' });

    if (status === 'PAID') {
      try {
        await confirmPurchase(invoiceId, token);
      } catch {}
    }
    return res.json({ coins: delta });
  } catch {
    return res.status(500).json({ error: 'server_error' });
  }
}
