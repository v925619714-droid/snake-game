// Чистая логика кооп-режима: две змейки на одном поле, общий счёт.
// Game over, если любая змейка врежется (стена/тело/в другую/лоб-в-лоб).
import {
  BOARD,
  type Direction,
  type Point,
  isOpposite,
  nextPoint,
  pointsEqual,
  spawnFood,
} from './logic';

export type CoopStatus = 'playing' | 'over';

export interface CoopState {
  snakes: Point[][]; // [игрок0, игрок1], голова — индекс 0
  dirs: Direction[];
  pending: Direction[];
  food: Point;
  score: number; // суммарно съедено
  status: CoopStatus;
  loser: number; // -1 нет; 0/1 — кто врезался; 2 — оба/лоб-в-лоб
}

export function coopInitial(rng: () => number = Math.random): CoopState {
  // Старт параллельно на разных рядах, обе едут вправо — без мгновенного лобового.
  const s0: Point[] = [{ x: 3, y: 6 }, { x: 2, y: 6 }, { x: 1, y: 6 }];
  const s1: Point[] = [{ x: 3, y: 10 }, { x: 2, y: 10 }, { x: 1, y: 10 }];
  return {
    snakes: [s0, s1],
    dirs: ['right', 'right'],
    pending: ['right', 'right'],
    food: spawnFood([...s0, ...s1], rng),
    score: 0,
    status: 'playing',
    loser: -1,
  };
}

export function coopTurn(state: CoopState, player: 0 | 1, dir: Direction): CoopState {
  if (state.status !== 'playing') return state;
  if (isOpposite(dir, state.dirs[player])) return state;
  const pending = [...state.pending];
  pending[player] = dir;
  return { ...state, pending };
}

function inBounds(p: Point): boolean {
  return p.x >= 0 && p.x < BOARD && p.y >= 0 && p.y < BOARD;
}

export function coopStep(state: CoopState, rng: () => number = Math.random): CoopState {
  if (state.status !== 'playing') return state;

  const heads = [
    nextPoint(state.snakes[0][0], state.pending[0]),
    nextPoint(state.snakes[1][0], state.pending[1]),
  ];
  const eats = [pointsEqual(heads[0], state.food), pointsEqual(heads[1], state.food)];

  const crashed = [false, false];
  for (let i = 0; i < 2; i++) {
    const h = heads[i];
    if (!inBounds(h)) {
      crashed[i] = true;
      continue;
    }
    // своё тело: хвост уедет, если не ест → исключаем кончик
    const ownBody = eats[i] ? state.snakes[i] : state.snakes[i].slice(0, -1);
    if (ownBody.some((p) => pointsEqual(p, h))) {
      crashed[i] = true;
      continue;
    }
    // тело соперника считаем сплошным
    if (state.snakes[1 - i].some((p) => pointsEqual(p, h))) {
      crashed[i] = true;
    }
  }
  // лоб в лоб — обе головы в одну клетку
  if (pointsEqual(heads[0], heads[1])) {
    crashed[0] = true;
    crashed[1] = true;
  }

  if (crashed[0] || crashed[1]) {
    const loser = crashed[0] && crashed[1] ? 2 : crashed[0] ? 0 : 1;
    return { ...state, status: 'over', loser };
  }

  const newSnakes = [0, 1].map((i) => {
    const ns = [heads[i], ...state.snakes[i]];
    if (!eats[i]) ns.pop();
    return ns;
  });

  const gained = (eats[0] ? 1 : 0) + (eats[1] ? 1 : 0);
  const food =
    gained > 0 ? spawnFood([...newSnakes[0], ...newSnakes[1]], rng) : state.food;

  return {
    ...state,
    snakes: newSnakes,
    dirs: [...state.pending],
    food,
    score: state.score + gained,
  };
}
