// Чистая логика корпоративного режима «Shake Work Off»: free-for-all на N игроков
// (5–10), последняя выжившая змейка побеждает («сегодня не работает»). Без зависимостей
// от React Native — покрывается юнит-тестами (Jest).
//
// ВАЖНО: это ОТДЕЛЬНЫЙ модуль, он НЕ пересекается с дуэлью (duel.ts). 1v1/ranked и их
// 28 тестов остаются нетронутыми — здесь свои типы и своя логика (last-alive вместо
// best-of-3, единая нейтральная еда вместо «свой/чужой цвет», смерть змейки вместо
// форфейт-победы). Общие чистые примитивы берём из logic.ts.
import { type Direction, type Point, isOpposite, nextPoint, pointsEqual } from './logic';

export const PARTY_MAX = 10; // максимум игроков в комнате
export const PARTY_MIN = 3; // минимум для старта матча (дефолт в UI — 4)
export const MAX_PARTY_TURN_QUEUE = 2; // буфер поворотов на игрока (как в соло/дуэли)

// Грейс на старте: первые GRACE_TICKS тиков нет смертей от ЧУЖИХ змей и лоб-в-лоб
// (стена и собственное тело — всегда). Чтобы спавн не превращался в мгновенный килл.
// ~2с при темпе 150 мс/тик.
export const GRACE_TICKS = 13;

// Сжатие арены — гарантия финиша матча. После SHRINK_START_TICK убираем по 1 клетке с
// каждой стороны каждые SHRINK_EVERY тиков (≈3 мин старт, ≈5с шаг при 150 мс/тик).
export const SHRINK_START_TICK = 1200;
export const SHRINK_EVERY = 33;

export type PartyStatus = 'playing' | 'over';
export type PartyCrashCause = 'wall' | 'self' | 'opponent' | 'head_on';

export interface PartyFood {
  pos: Point; // нейтральная еда (единый тип): её ест любой игрок
}

export interface PartyState {
  snakes: Point[][]; // длины N; snakes[i] — тело игрока i, голова на индексе 0
  dirs: Direction[]; // длины N — текущее направление каждого
  pending: Direction[]; // длины N — направление, исполняемое в текущем тике
  queues: Direction[][]; // длины N — буфер поворотов на игрока (≤ MAX_PARTY_TURN_QUEUE)
  alive: boolean[]; // длины N — жив ли игрок
  foods: PartyFood[];
  scores: number[]; // длины N — съедено еды
  board: number; // размер поля (клеток), зависит от числа игроков
  shrink: number; // сколько клеток убрано с КАЖДОЙ стороны (сжатие арены)
  tick: number;
  status: PartyStatus;
  winner: number; // слот победителя; -1 = ничья/не определён
  placements: number[]; // порядок выбывания: [0] — первый выбывший … [last] — победитель
  causes: (PartyCrashCause | null)[]; // причина гибели по игрокам
}

const DELT: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const OPP: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' };

// Размер поля под число игроков: больше игроков — больше арена.
export function boardForCount(n: number): number {
  return n <= 5 ? 30 : n <= 7 ? 35 : 40;
}

// Предел сжатия — оставляем играбельную арену не меньше ~8 клеток.
function maxShrink(board: number): number {
  return Math.max(0, Math.floor(board / 2) - 4);
}

// Клетка внутри текущей (сжатой) играбельной зоны.
function inZone(p: Point, board: number, shrink: number): boolean {
  return p.x >= shrink && p.x < board - shrink && p.y >= shrink && p.y < board - shrink;
}

function key(p: Point, board: number): number {
  return p.y * board + p.x;
}

function clampIn(p: Point, board: number): Point {
  return {
    x: Math.max(0, Math.min(board - 1, p.x)),
    y: Math.max(0, Math.min(board - 1, p.y)),
  };
}

// Старт: N змей равномерно по кольцу вокруг центра, головой к центру, тело — наружу.
function spawnSnakes(n: number, board: number): { snakes: Point[][]; dirs: Direction[] } {
  const cx = (board - 1) / 2;
  const cy = (board - 1) / 2;
  const R = Math.floor(board * 0.36);
  const snakes: Point[][] = [];
  const dirs: Direction[] = [];
  for (let i = 0; i < n; i++) {
    const ang = (2 * Math.PI * i) / n;
    const hx = Math.round(cx + R * Math.cos(ang));
    const hy = Math.round(cy + R * Math.sin(ang));
    const ddx = cx - hx;
    const ddy = cy - hy;
    const dir: Direction =
      Math.abs(ddx) >= Math.abs(ddy) ? (ddx > 0 ? 'right' : 'left') : ddy > 0 ? 'down' : 'up';
    const back = OPP[dir];
    const head: Point = { x: hx, y: hy };
    const b1 = clampIn({ x: hx + DELT[back].x, y: hy + DELT[back].y }, board);
    const b2 = clampIn({ x: hx + DELT[back].x * 2, y: hy + DELT[back].y * 2 }, board);
    snakes.push([head, b1, b2]);
    dirs.push(dir);
  }
  return { snakes, dirs };
}

// Сколько еды держим на поле: ~1 на каждых 2 живых игрока, минимум 1.
function foodTarget(aliveCount: number): number {
  return Math.max(1, Math.ceil(aliveCount / 2));
}

// Дополняет поле нейтральной едой до целевого числа (в пределах играбельной зоны,
// не на змеях и не на существующей еде).
export function ensureFoods(state: PartyState, rng: () => number = Math.random): PartyFood[] {
  const foods = [...state.foods];
  const aliveCount = state.alive.filter(Boolean).length;
  const target = foodTarget(aliveCount);
  if (foods.length >= target) return foods;

  const occupied = new Set<number>();
  for (let i = 0; i < state.snakes.length; i++) {
    if (!state.alive[i]) continue;
    for (const p of state.snakes[i]) occupied.add(key(p, state.board));
  }
  for (const f of foods) occupied.add(key(f.pos, state.board));

  const free: number[] = [];
  for (let y = state.shrink; y < state.board - state.shrink; y++) {
    for (let x = state.shrink; x < state.board - state.shrink; x++) {
      const k = y * state.board + x;
      if (!occupied.has(k)) free.push(k);
    }
  }
  while (foods.length < target && free.length > 0) {
    const idx = Math.floor(rng() * free.length);
    const k = free[idx];
    free.splice(idx, 1);
    foods.push({ pos: { x: k % state.board, y: Math.floor(k / state.board) } });
    occupied.add(k);
  }
  return foods;
}

// Новый матч на count игроков (зажимаем в [2, PARTY_MAX]; UI требует 5–10, но логика
// корректна и для 2–4 — это удобно для тестов и мелких команд).
export function partyNewMatch(count: number, rng: () => number = Math.random): PartyState {
  const n = Math.max(2, Math.min(PARTY_MAX, Math.floor(count)));
  const board = boardForCount(n);
  const { snakes, dirs } = spawnSnakes(n, board);
  const base: PartyState = {
    snakes,
    dirs,
    pending: [...dirs],
    queues: Array.from({ length: n }, () => []),
    alive: Array.from({ length: n }, () => true),
    foods: [],
    scores: Array.from({ length: n }, () => 0),
    board,
    shrink: 0,
    tick: 0,
    status: 'playing',
    winner: -1,
    placements: [],
    causes: Array.from({ length: n }, () => null),
  };
  return { ...base, foods: ensureFoods(base, rng) };
}

// Поставить поворот игрока в его очередь (как в соло/дуэли): сверка с хвостом очереди
// (или с текущим направлением), 180° и дубль игнорируем, мёртвых/вне игры — тоже.
export function partyTurn(state: PartyState, pid: number, dir: Direction): PartyState {
  if (state.status !== 'playing') return state;
  if (pid < 0 || pid >= state.snakes.length || !state.alive[pid]) return state;
  const q = state.queues[pid];
  const last = q.length ? q[q.length - 1] : state.dirs[pid];
  if (dir === last || isOpposite(dir, last)) return state;
  if (q.length >= MAX_PARTY_TURN_QUEUE) return state;
  const queues = state.queues.map((qq, i) => (i === pid ? [...qq, dir] : qq));
  return { ...state, queues };
}

// Один шаг симуляции: применяем по одному повороту из буфера, двигаем живых,
// считаем коллизии (стена/сам/чужой/лоб-в-лоб), еду, сжатие, выбывание и победу.
export function partyStep(state: PartyState, rng: () => number = Math.random): PartyState {
  if (state.status !== 'playing') return state;
  const n = state.snakes.length;
  const tick = state.tick + 1;
  const board = state.board;

  // Сжатие арены (гарантия финиша).
  let shrink = state.shrink;
  if (tick >= SHRINK_START_TICK && (tick - SHRINK_START_TICK) % SHRINK_EVERY === 0) {
    shrink = Math.min(maxShrink(board), shrink + 1);
  }
  const grace = tick <= GRACE_TICKS;

  // Снять по одному повороту из очереди → pending (только живым).
  const pending = [...state.pending];
  const queues = state.queues.map((q) => q.slice());
  for (let i = 0; i < n; i++) {
    if (state.alive[i] && queues[i].length > 0) pending[i] = queues[i].shift()!;
  }

  // Головы живых после хода.
  const heads: Point[] = state.snakes.map((s, i) =>
    state.alive[i] ? nextPoint(s[0], pending[i]) : s[0],
  );

  // Еда под головой → рост.
  const grow: boolean[] = new Array(n).fill(false);
  const eaten = new Set<number>();
  for (let i = 0; i < n; i++) {
    if (!state.alive[i]) continue;
    const f = state.foods.find((fd) => pointsEqual(fd.pos, heads[i]));
    if (f) {
      grow[i] = true;
      eaten.add(key(f.pos, board));
    }
  }

  // Крах: стена(зона) / своё тело / тело чужого.
  const crashed: boolean[] = new Array(n).fill(false);
  const causes: (PartyCrashCause | null)[] = [...state.causes];
  for (let i = 0; i < n; i++) {
    if (!state.alive[i]) continue;
    const h = heads[i];
    if (!inZone(h, board, shrink)) {
      crashed[i] = true;
      causes[i] = 'wall';
      continue;
    }
    const ownBody = grow[i] ? state.snakes[i] : state.snakes[i].slice(0, -1);
    if (ownBody.some((p) => pointsEqual(p, h))) {
      crashed[i] = true;
      causes[i] = 'self';
      continue;
    }
    if (!grace) {
      for (let j = 0; j < n; j++) {
        if (j === i || !state.alive[j]) continue;
        if (state.snakes[j].some((p) => pointsEqual(p, h))) {
          crashed[i] = true;
          causes[i] = 'opponent';
          break;
        }
      }
    }
  }

  // Лоб-в-лоб: две и более живых головы в одной клетке — все гибнут (вне грейса).
  if (!grace) {
    const byCell = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      if (!state.alive[i]) continue;
      const k = key(heads[i], board);
      const arr = byCell.get(k) ?? [];
      arr.push(i);
      byCell.set(k, arr);
    }
    for (const arr of byCell.values()) {
      if (arr.length >= 2) {
        for (const i of arr) {
          crashed[i] = true;
          causes[i] = 'head_on';
        }
      }
    }
  }

  // Применяем: двигаем выживших, мёртвых оставляем как есть (на рендере скрыты по alive).
  const newSnakes = state.snakes.map((s, i) => {
    if (!state.alive[i] || crashed[i]) return s;
    const ns = [heads[i], ...s];
    if (!grow[i]) ns.pop();
    return ns;
  });
  const scores = state.scores.map((sc, i) => sc + (state.alive[i] && !crashed[i] && grow[i] ? 1 : 0));

  // Выбывшие в этом тике → в порядок выбывания (по слотам).
  const alive = [...state.alive];
  const placements = [...state.placements];
  for (let i = 0; i < n; i++) {
    if (state.alive[i] && crashed[i]) {
      alive[i] = false;
      placements.push(i);
    }
  }

  // Еда: убрать съеденную, дополнить до цели.
  const remaining = state.foods.filter((f) => !eaten.has(key(f.pos, board)));
  const mid: PartyState = { ...state, snakes: newSnakes, alive, board, shrink, foods: remaining };
  const foods = ensureFoods(mid, rng);

  // Победа: остался ≤1 живой.
  const aliveIdx: number[] = [];
  for (let i = 0; i < n; i++) if (alive[i]) aliveIdx.push(i);
  let status: PartyStatus = state.status;
  let winner = state.winner;
  let finalPlacements = placements;
  if (aliveIdx.length <= 1) {
    status = 'over';
    winner = aliveIdx.length === 1 ? aliveIdx[0] : -1;
    finalPlacements = [...placements];
    for (const i of aliveIdx) if (!finalPlacements.includes(i)) finalPlacements.push(i);
  }

  return {
    ...state,
    snakes: newSnakes,
    dirs: [...pending],
    pending,
    queues,
    alive,
    foods,
    scores,
    board,
    shrink,
    tick,
    status,
    winner,
    placements: finalPlacements,
    causes,
  };
}

// Принудительно вывести слот из игры (дисконнект игрока). Матч продолжается, пока не
// останется ≤1 живого. Используется сетевым контуром при уходе игрока/хоста.
export function partyKill(state: PartyState, slot: number): PartyState {
  if (state.status !== 'playing') return state;
  if (slot < 0 || slot >= state.snakes.length || !state.alive[slot]) return state;
  const alive = [...state.alive];
  alive[slot] = false;
  const placements = [...state.placements];
  if (!placements.includes(slot)) placements.push(slot);

  const aliveIdx: number[] = [];
  for (let i = 0; i < alive.length; i++) if (alive[i]) aliveIdx.push(i);
  let status: PartyStatus = state.status;
  let winner = state.winner;
  let finalPlacements = placements;
  if (aliveIdx.length <= 1) {
    status = 'over';
    winner = aliveIdx.length === 1 ? aliveIdx[0] : -1;
    finalPlacements = [...placements];
    for (const i of aliveIdx) if (!finalPlacements.includes(i)) finalPlacements.push(i);
  }
  return { ...state, alive, placements: finalPlacements, status, winner };
}
