// Лёгкая аналитика без SDK: события шлются прямо в PostHog HTTP-эндпоинт через fetch.
// Работает и на web, и на native. Без ключа — полностью no-op (как hasSupabase),
// поэтому код безопасно живёт в проде и «включается» добавлением EXPO_PUBLIC_POSTHOG_KEY.
import { Platform } from 'react-native';

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '';
const HOST = (process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com').replace(/\/+$/, '');
const APP_VERSION = '1.0.0';

export const hasAnalytics = Boolean(KEY);

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

function genAnonId(): string {
  return 'anon_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// Текущий distinct_id: до загрузки профиля — анонимный, после identify — id профиля.
let distinctId = genAnonId();

// Каноничный словарь событий — единый источник правды для разметки.
export const EVENTS = {
  appOpen: 'app_open',
  soloStart: 'solo_start',
  soloGameOver: 'solo_game_over',
  shopOpen: 'shop_open',
  skinPurchased: 'skin_purchased',
  skinSelected: 'skin_selected',
  leaderboardOpen: 'leaderboard_open',
  matchmakingStart: 'matchmaking_start',
  matchStart: 'match_start',
  roundEnd: 'round_end',
  matchEnd: 'match_end',
  foodEaten: 'food_eaten',
  fatalMistake: 'fatal_mistake',
  ratingChange: 'rating_change',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS] | string;
export type Props = Record<string, unknown>;

// Базовые свойства, прикрепляемые к каждому событию.
export function baseProps(): Props {
  return { app: 'chroma-coil', app_version: APP_VERSION, platform: Platform.OS };
}

// Чистая сборка тела запроса к PostHog (вынесена для тестируемости).
export function eventBody(apiKey: string, event: EventName, id: string, props: Props): Props {
  return {
    api_key: apiKey,
    event,
    distinct_id: id,
    properties: { ...baseProps(), ...props },
    timestamp: new Date().toISOString(),
  };
}

function post(body: Props): void {
  // fire-and-forget; ошибки сети не должны влиять на игру
  try {
    void fetch(`${HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

// Привязать события к профилю игрока + записать его свойства ($set).
export function identify(id: string, props: Props = {}): void {
  if (id) distinctId = id;
  if (isDev) console.log('[analytics] identify', id, props);
  if (!hasAnalytics) return;
  post({
    api_key: KEY,
    event: '$identify',
    distinct_id: distinctId,
    properties: { ...baseProps(), $set: props },
    timestamp: new Date().toISOString(),
  });
}

// Отправить событие.
export function track(event: EventName, props: Props = {}): void {
  if (isDev) console.log('[analytics]', event, props);
  if (!hasAnalytics) return;
  post(eventBody(KEY, event, distinctId, props));
}
