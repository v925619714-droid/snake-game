// Competitive 2-color duel logic (pure, host-authoritative).
// Each snake eats ONLY its own color (grows + scores). Eating the opponent's color =
// instant loss. Crash into wall / opponent / self = loss. Head-on = draw.
// РАУНД ЗАКАНЧИВАЕТСЯ ТОЛЬКО ПРИ КРАШЕ (выживший побеждает; лоб-в-лоб = ничья).
// Без тайм-капа и без победы по числу еды. Best-of-3 (first to 2 round wins).
import { type Direction, type Point, isOpposite, nextPoint, pointsEqual } from './logic';

export const DUEL_BOARD = 25;
export const WINS_NEEDED = 2; // best of 3
export const MAX_ROUNDS = 7; // предохранитель от вечных ничьих (на уровне матча)
const FOOD_PER_COLOR = 2;
// Еда не должна спавниться слишком близко к голове своей змейки (особенно на старте,
// чтобы не давать «бесплатный» кусок под носом). Манхэттен-дистанция, с фолбэком.
export const FOOD_MIN_HEAD_DIST = 6;
// Только что появившаяся еда «мигает» и инертна это число тиков: сквозь неё можно
// проехать без последствий (ни смерти об чужую, ни съедания), потом становится живой.
// ~3с при обычном темпе 150мс/тик (~2с в бот-матчах 100мс).
export const FOOD_BLINK_TICKS = 20;
// Буст-еда: периодически появляется нейтральная «еда скорости». Кто съел — ускоряется
// (двигается 2 клетки за тик) на BOOST_TICKS тиков (~5–10с в зависимости от темпа).
// Даёт обогнать соперника, быстрее собрать свою еду/вырасти и подрезать его.
export const BOOST_TICKS = 50;
export const BOOST_FOOD_EVERY = 60; // как часто (тиков) спавнить буст-еду, если её нет
// Буфер поворотов на игрока (как в соло-режиме): делает ввод отзывчивым на быстром
// темпе — до 2 заказанных поворотов, применяются по одному за тик.
export const MAX_DUEL_TURN_QUEUE = 2;

export type DuelStatus = 'playing' | 'roundOver' | 'matchOver';

// Причина гибели змейки в раунде (для аналитики). null = раунд завершён не крашем
// (по очкам/тайм-капу) или этот игрок не разбивался.
export type CrashCause = 'wall' | 'wrong_color' | 'self' | 'opponent' | 'head_on';

export interface Food {
  pos: Point;
  color: 0 | 1;
  blink?: number; // тиков инертности осталось (мигает); undefined/0 = живая еда
  boost?: boolean; // буст-еда (нейтральная): даёт скорость, не растит, не смертельна
}

export interface DuelState {
  snakes: Point[][];
  dirs: Direction[];
  pending: Direction[]; // направление, исполняемое в текущем тике (из очереди/предыдущего)
  queues: [Direction[], Direction[]]; // буфер поворотов на игрока (≤ MAX_DUEL_TURN_QUEUE)
  foods: Food[];
  roundScore: [number, number];
  matchWins: [number, number];
  round: number;
  tick: number;
  status: DuelStatus;
  roundWinner: number; // -1 draw, 0/1 winner
  matchWinner: number; // -1 none, 0/1
  causes: [CrashCause | null, CrashCause | null]; // причина краша по игрокам в последнем раунде
  boosts: [number, number]; // тиков ускорения осталось по игрокам (>0 = 2 клетки/тик)
}

function key(p: Point): number {
  return p.y * DUEL_BOARD + p.x;
}

function inBounds(p: Point): boolean {
  return p.x >= 0 && p.x < DUEL_BOARD && p.y >= 0 && p.y < DUEL_BOARD;
}

// Случайная свободная клетка; по возможности не ближе minDist (манхэттен) к head.
// Фолбэк на любую свободную, если «далёких» нет (поздняя стадия, тесно).
function freeCell(occupied: Set<number>, head: Point, minDist: number, rng: () => number): Point | null {
  const far: number[] = [];
  const any: number[] = [];
  for (let i = 0; i < DUEL_BOARD * DUEL_BOARD; i++) {
    if (occupied.has(i)) continue;
    any.push(i);
    const x = i % DUEL_BOARD;
    const y = Math.floor(i / DUEL_BOARD);
    if (Math.abs(x - head.x) + Math.abs(y - head.y) >= minDist) far.push(i);
  }
  const pool = far.length ? far : any;
  if (pool.length === 0) return null;
  const idx = pool[Math.floor(rng() * pool.length)];
  return { x: idx % DUEL_BOARD, y: Math.floor(idx / DUEL_BOARD) };
}

// Дополняет поле едой до FOOD_PER_COLOR каждого цвета.
// blinkTicks — сколько тиков новая еда «мигает» и инертна (0 = сразу живая).
export function ensureFoods(
  snakes: Point[][],
  foods: Food[],
  rng: () => number,
  blinkTicks: number = FOOD_BLINK_TICKS,
): Food[] {
  const result = [...foods];
  const occupied = new Set<number>();
  for (const s of snakes) for (const p of s) occupied.add(key(p));
  for (const f of result) occupied.add(key(f.pos));

  for (const color of [0, 1] as const) {
    const head = snakes[color][0];
    let have = result.filter((f) => f.color === color && !f.boost).length;
    while (have < FOOD_PER_COLOR) {
      const cell = freeCell(occupied, head, FOOD_MIN_HEAD_DIST, rng);
      if (!cell) break;
      result.push({ pos: cell, color, blink: blinkTicks });
      occupied.add(key(cell));
      have++;
    }
  }
  return result;
}

function freshRound(round: number, matchWins: [number, number], rng: () => number): DuelState {
  // Параллельный старт на разных рядах, обе едут вправо.
  const s0: Point[] = [
    { x: 3, y: 8 },
    { x: 2, y: 8 },
    { x: 1, y: 8 },
  ];
  const s1: Point[] = [
    { x: 3, y: 16 },
    { x: 2, y: 16 },
    { x: 1, y: 16 },
  ];
  return {
    snakes: [s0, s1],
    dirs: ['right', 'right'],
    pending: ['right', 'right'],
    queues: [[], []],
    foods: ensureFoods([s0, s1], [], rng, 0), // стартовая еда сразу живая (видна с начала раунда)
    roundScore: [0, 0],
    matchWins,
    round,
    tick: 0,
    status: 'playing',
    roundWinner: -1,
    matchWinner: -1,
    causes: [null, null],
    boosts: [0, 0],
  };
}

export function duelNewMatch(rng: () => number = Math.random): DuelState {
  return freshRound(1, [0, 0], rng);
}

export function duelNextRound(state: DuelState, rng: () => number = Math.random): DuelState {
  if (state.status === 'matchOver') return state;
  return freshRound(state.round + 1, state.matchWins, rng);
}

// Поставить поворот игрока в его очередь. Сверяем с хвостом очереди (или с текущим
// направлением, если она пуста): 180° и дубль игнорируем, буфер ≤ MAX_DUEL_TURN_QUEUE.
export function duelTurn(state: DuelState, player: 0 | 1, dir: Direction): DuelState {
  if (state.status !== 'playing') return state;
  const q = state.queues[player];
  const last = q.length ? q[q.length - 1] : state.dirs[player];
  if (dir === last || isOpposite(dir, last)) return state;
  if (q.length >= MAX_DUEL_TURN_QUEUE) return state;
  const queues: [Direction[], Direction[]] = [[...state.queues[0]], [...state.queues[1]]];
  queues[player] = [...q, dir];
  return { ...state, queues };
}

function endRound(
  state: DuelState,
  partial: Partial<DuelState>,
  winner: number,
  causes: [CrashCause | null, CrashCause | null] = [null, null],
): DuelState {
  const matchWins: [number, number] = [...state.matchWins];
  if (winner === 0 || winner === 1) matchWins[winner] += 1;
  let matchWinner = matchWins[0] >= WINS_NEEDED ? 0 : matchWins[1] >= WINS_NEEDED ? 1 : -1;
  let status: DuelStatus = matchWinner >= 0 ? 'matchOver' : 'roundOver';
  // Предохранитель: после MAX_ROUNDS завершаем матч (по числу побед, иначе ничья).
  if (matchWinner < 0 && state.round >= MAX_ROUNDS) {
    matchWinner = matchWins[0] > matchWins[1] ? 0 : matchWins[1] > matchWins[0] ? 1 : -1;
    status = 'matchOver';
  }
  return { ...state, ...partial, matchWins, roundWinner: winner, matchWinner, status, causes };
}

// Один под-шаг: двигает на 1 клетку только snake'ов из `moving`. Возвращает либо
// завершённый раунд (ended), либо новое состояние (snakes/roundScore/foods) + какие
// игроки подобрали буст-еду (picked). Housekeeping (мигание/доспавн/буст-таймеры) — НЕ здесь.
function advance(
  state: DuelState,
  moving: [boolean, boolean],
  rng: () => number,
): { ended?: DuelState; state?: DuelState; picked: [boolean, boolean] } {
  const snakes = state.snakes;
  const heads = [
    moving[0] ? nextPoint(snakes[0][0], state.pending[0]) : snakes[0][0],
    moving[1] ? nextPoint(snakes[1][0], state.pending[1]) : snakes[1][0],
  ];
  // только «живая» (не мигающая) еда под головой
  const hf = heads.map((h, i) =>
    moving[i] ? state.foods.find((f) => pointsEqual(f.pos, h) && (f.blink ?? 0) <= 0) : undefined,
  );
  const picked: [boolean, boolean] = [false, false];
  const grow = [false, false];
  const crashed = [false, false];
  const causes: [CrashCause | null, CrashCause | null] = [null, null];

  for (let i = 0; i < 2; i++) {
    if (!moving[i]) continue;
    const h = heads[i];
    if (!inBounds(h)) {
      crashed[i] = true;
      causes[i] = 'wall';
      continue;
    }
    const f = hf[i];
    if (f && f.boost) {
      picked[i] = true; // буст-еда: не растит, не смертельна
    } else if (f && f.color !== i) {
      crashed[i] = true;
      causes[i] = 'wrong_color';
      continue;
    } else if (f && f.color === i) {
      grow[i] = true;
    }
    const ownBody = grow[i] ? snakes[i] : snakes[i].slice(0, -1);
    if (ownBody.some((p) => pointsEqual(p, h))) {
      crashed[i] = true;
      causes[i] = 'self';
      continue;
    }
    if (snakes[1 - i].some((p) => pointsEqual(p, h))) {
      crashed[i] = true;
      causes[i] = 'opponent';
    }
  }
  if (moving[0] && moving[1] && pointsEqual(heads[0], heads[1])) {
    crashed[0] = true;
    crashed[1] = true;
    causes[0] = 'head_on';
    causes[1] = 'head_on';
  }

  if (crashed[0] || crashed[1]) {
    const winner = crashed[0] && crashed[1] ? -1 : crashed[0] ? 1 : 0;
    return { ended: endRound(state, {}, winner, causes), picked };
  }

  const newSnakes = [0, 1].map((i) => {
    if (!moving[i]) return snakes[i];
    const ns = [heads[i], ...snakes[i]];
    if (!grow[i]) ns.pop();
    return ns;
  });
  const roundScore: [number, number] = [
    state.roundScore[0] + (grow[0] ? 1 : 0),
    state.roundScore[1] + (grow[1] ? 1 : 0),
  ];
  const eatenKeys = new Set<number>();
  for (let i = 0; i < 2; i++) {
    if (moving[i] && hf[i] && (grow[i] || picked[i])) eatenKeys.add(key(hf[i]!.pos));
  }
  const foods = state.foods.filter((f) => !eatenKeys.has(key(f.pos)));
  return { state: { ...state, snakes: newSnakes, roundScore, foods }, picked };
}

export function duelStep(state: DuelState, rng: () => number = Math.random): DuelState {
  if (state.status !== 'playing') return state;

  const tick = state.tick + 1;
  const startBoosts = state.boosts ?? [0, 0];
  let picked: [boolean, boolean] = [false, false];

  // Применяем по одному заказанному повороту из буфера каждому игроку (отзывчивый ввод).
  // Буст (фаза 2) использует то же направление — за тик исполняется максимум один поворот.
  const q0 = state.queues ?? [[], []];
  const pending = [...state.pending] as Direction[];
  const queues: [Direction[], Direction[]] = [q0[0].slice(), q0[1].slice()];
  for (let i = 0; i < 2; i++) {
    const nd = queues[i].shift();
    if (nd) pending[i] = nd;
  }
  const base: DuelState = { ...state, pending, queues };

  // Фаза 1: оба двигаются на 1 клетку.
  const r1 = advance(base, [true, true], rng);
  if (r1.ended) return r1.ended;
  let cur = r1.state!;
  picked = [r1.picked[0], r1.picked[1]];

  // Фаза 2: забустенные двигаются ещё на 1 клетку (итого 2 за тик).
  const boostNow: [boolean, boolean] = [startBoosts[0] > 0, startBoosts[1] > 0];
  if (boostNow[0] || boostNow[1]) {
    const r2 = advance(cur, boostNow, rng);
    if (r2.ended) return r2.ended;
    cur = r2.state!;
    picked = [picked[0] || r2.picked[0], picked[1] || r2.picked[1]];
  }

  // Housekeeping (раз в тик): таймеры буста, мигание, доспавн еды + буст-еды.
  const boosts: [number, number] = [
    picked[0] ? BOOST_TICKS : Math.max(0, startBoosts[0] - 1),
    picked[1] ? BOOST_TICKS : Math.max(0, startBoosts[1] - 1),
  ];
  let foods = cur.foods.map((f) => ((f.blink ?? 0) > 0 ? { ...f, blink: (f.blink ?? 0) - 1 } : f));
  foods = ensureFoods(cur.snakes, foods, rng);
  if (tick % BOOST_FOOD_EVERY === 0 && !foods.some((f) => f.boost)) {
    const occ = new Set<number>();
    for (const s of cur.snakes) for (const p of s) occ.add(key(p));
    for (const f of foods) occ.add(key(f.pos));
    const cell = freeCell(occ, cur.snakes[0][0], 6, rng);
    if (cell) foods = [...foods, { pos: cell, color: 0, boost: true }];
  }

  // Раунд заканчивается ТОЛЬКО при крахе (обработан в advance). Ни по очкам, ни по времени.
  return { ...cur, foods, boosts, tick, dirs: [...pending] as Direction[], queues };
}
