// ИИ-бот для Color Duel (чистая функция → тестируемо).
// Жадно идёт к СВОЕЙ еде, избегает фатальных ходов (стена/чужой цвет/тело своё или
// соперника). Иногда «ошибается» — для живости и баланса под винрейт ~50%.
// Бот появляется ТОЛЬКО как соперник живого игрока (фолбэк ranked, когда нет реального
// соперника) и в рейтинге/лидерборде не участвует (нет профиля в облаке).
import { DUEL_BOARD, type DuelState } from './duel';
import { type Direction, type Point, isOpposite, nextPoint, pointsEqual } from './logic';

// Доля случайных (не оптимальных) ходов. Крутилка баланса: больше → бот слабее.
export const BOT_MISTAKE_RATE = 0.12;

const ALL_DIRS: Direction[] = ['up', 'down', 'left', 'right'];

function inBounds(p: Point): boolean {
  return p.x >= 0 && p.x < DUEL_BOARD && p.y >= 0 && p.y < DUEL_BOARD;
}

function manhattan(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function botDirection(
  state: DuelState,
  player: 0 | 1,
  rng: () => number = Math.random,
): Direction {
  const me = player;
  const opp = (1 - me) as 0 | 1;
  const head = state.snakes[me][0];
  const curDir = state.dirs[me];

  // Развернуться на 180° нельзя — такие направления отбрасываем сразу.
  const candidates = ALL_DIRS.filter((d) => !isOpposite(d, curDir));

  const safe: { dir: Direction; head: Point }[] = [];
  for (const d of candidates) {
    const h = nextPoint(head, d);
    if (!inBounds(h)) continue; // стена
    const food = state.foods.find((f) => pointsEqual(f.pos, h));
    if (food && food.color !== me) continue; // съесть чужой цвет = смерть
    const grow = Boolean(food && food.color === me);
    const ownBody = grow ? state.snakes[me] : state.snakes[me].slice(0, -1);
    if (ownBody.some((p) => pointsEqual(p, h))) continue; // своё тело
    if (state.snakes[opp].some((p) => pointsEqual(p, h))) continue; // тело соперника
    safe.push({ dir: d, head: h });
  }

  if (safe.length === 0) return curDir; // некуда деться — поедет прямо (проиграет)

  // «Человеческая» ошибка: случайный безопасный ход.
  if (rng() < BOT_MISTAKE_RATE) {
    const idx = Math.min(safe.length - 1, Math.floor(rng() * safe.length));
    return safe[idx].dir;
  }

  // Иначе — к ближайшей СВОЕЙ еде.
  const myFoods = state.foods.filter((f) => f.color === me);
  if (myFoods.length === 0) return safe[0].dir;
  let best = safe[0];
  let bestDist = Infinity;
  for (const s of safe) {
    let d = Infinity;
    for (const f of myFoods) d = Math.min(d, manhattan(s.head, f.pos));
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best.dir;
}
