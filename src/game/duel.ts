// Competitive 2-color duel logic (pure, host-authoritative).
// Each snake eats ONLY its own color. Eating the opponent's color = instant loss.
// Crash into wall / opponent / self = loss. Head-on = draw. First to ROUND_TARGET own
// foods (or opponent's fatal mistake) wins the round. Best-of-3 (first to 2 wins).
import { type Direction, type Point, isOpposite, nextPoint, pointsEqual } from './logic';

export const DUEL_BOARD = 25;
export const ROUND_TARGET = 7;
export const WINS_NEEDED = 2; // best of 3
export const MAX_ROUNDS = 7; // предохранитель от вечных ничьих
export const ROUND_TICKS_CAP = 800; // ~120s at 150ms/tick — anti-stall cap
const FOOD_PER_COLOR = 2;
// Еда не должна спавниться слишком близко к голове своей змейки (особенно на старте,
// чтобы не давать «бесплатный» кусок под носом). Манхэттен-дистанция, с фолбэком.
export const FOOD_MIN_HEAD_DIST = 6;

export type DuelStatus = 'playing' | 'roundOver' | 'matchOver';

// Причина гибели змейки в раунде (для аналитики). null = раунд завершён не крашем
// (по очкам/тайм-капу) или этот игрок не разбивался.
export type CrashCause = 'wall' | 'wrong_color' | 'self' | 'opponent' | 'head_on';

export interface Food {
  pos: Point;
  color: 0 | 1;
}

export interface DuelState {
  snakes: Point[][];
  dirs: Direction[];
  pending: Direction[];
  foods: Food[];
  roundScore: [number, number];
  matchWins: [number, number];
  round: number;
  tick: number;
  status: DuelStatus;
  roundWinner: number; // -1 draw, 0/1 winner
  matchWinner: number; // -1 none, 0/1
  causes: [CrashCause | null, CrashCause | null]; // причина краша по игрокам в последнем раунде
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
export function ensureFoods(snakes: Point[][], foods: Food[], rng: () => number): Food[] {
  const result = [...foods];
  const occupied = new Set<number>();
  for (const s of snakes) for (const p of s) occupied.add(key(p));
  for (const f of result) occupied.add(key(f.pos));

  for (const color of [0, 1] as const) {
    const head = snakes[color][0];
    let have = result.filter((f) => f.color === color).length;
    while (have < FOOD_PER_COLOR) {
      const cell = freeCell(occupied, head, FOOD_MIN_HEAD_DIST, rng);
      if (!cell) break;
      result.push({ pos: cell, color });
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
    foods: ensureFoods([s0, s1], [], rng),
    roundScore: [0, 0],
    matchWins,
    round,
    tick: 0,
    status: 'playing',
    roundWinner: -1,
    matchWinner: -1,
    causes: [null, null],
  };
}

export function duelNewMatch(rng: () => number = Math.random): DuelState {
  return freshRound(1, [0, 0], rng);
}

export function duelNextRound(state: DuelState, rng: () => number = Math.random): DuelState {
  if (state.status === 'matchOver') return state;
  return freshRound(state.round + 1, state.matchWins, rng);
}

export function duelTurn(state: DuelState, player: 0 | 1, dir: Direction): DuelState {
  if (state.status !== 'playing') return state;
  if (isOpposite(dir, state.dirs[player])) return state;
  const pending = [...state.pending] as Direction[];
  pending[player] = dir;
  return { ...state, pending };
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

export function duelStep(state: DuelState, rng: () => number = Math.random): DuelState {
  if (state.status !== 'playing') return state;

  const tick = state.tick + 1;
  const heads = [
    nextPoint(state.snakes[0][0], state.pending[0]),
    nextPoint(state.snakes[1][0], state.pending[1]),
  ];
  const eaten = heads.map((h) => state.foods.find((f) => pointsEqual(f.pos, h)));
  const grow = [Boolean(eaten[0] && eaten[0].color === 0), Boolean(eaten[1] && eaten[1].color === 1)];

  const crashed = [false, false];
  const causes: [CrashCause | null, CrashCause | null] = [null, null];
  for (let i = 0; i < 2; i++) {
    const h = heads[i];
    if (!inBounds(h)) {
      crashed[i] = true;
      causes[i] = 'wall';
      continue;
    }
    // съел чужой цвет — фатально
    if (eaten[i] && eaten[i]!.color !== i) {
      crashed[i] = true;
      causes[i] = 'wrong_color';
      continue;
    }
    const ownBody = grow[i] ? state.snakes[i] : state.snakes[i].slice(0, -1);
    if (ownBody.some((p) => pointsEqual(p, h))) {
      crashed[i] = true;
      causes[i] = 'self';
      continue;
    }
    if (state.snakes[1 - i].some((p) => pointsEqual(p, h))) {
      crashed[i] = true;
      causes[i] = 'opponent';
    }
  }
  if (pointsEqual(heads[0], heads[1])) {
    crashed[0] = true;
    crashed[1] = true;
    causes[0] = 'head_on';
    causes[1] = 'head_on';
  }

  if (crashed[0] || crashed[1]) {
    const winner = crashed[0] && crashed[1] ? -1 : crashed[0] ? 1 : 0;
    return endRound(state, {}, winner, causes);
  }

  // ходы
  const newSnakes = [0, 1].map((i) => {
    const ns = [heads[i], ...state.snakes[i]];
    if (!grow[i]) ns.pop();
    return ns;
  });
  const roundScore: [number, number] = [
    state.roundScore[0] + (grow[0] ? 1 : 0),
    state.roundScore[1] + (grow[1] ? 1 : 0),
  ];
  const eatenKeys = new Set(eaten.filter(Boolean).map((f) => key(f!.pos)));
  let foods = state.foods.filter((f) => !eatenKeys.has(key(f.pos)));
  foods = ensureFoods(newSnakes, foods, rng);

  const base: Partial<DuelState> = { snakes: newSnakes, dirs: [...state.pending] as Direction[], foods, roundScore, tick };

  // достиг цели по очкам
  if (roundScore[0] >= ROUND_TARGET || roundScore[1] >= ROUND_TARGET) {
    const winner = roundScore[0] > roundScore[1] ? 0 : roundScore[1] > roundScore[0] ? 1 : -1;
    return endRound(state, base, winner);
  }
  // тайм-кап
  if (tick >= ROUND_TICKS_CAP) {
    const winner = roundScore[0] > roundScore[1] ? 0 : roundScore[1] > roundScore[0] ? 1 : -1;
    return endRound(state, base, winner);
  }

  return { ...state, ...base };
}
