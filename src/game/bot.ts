// Сильный ИИ-бот для Color Duel (чистая функция → тестируемо).
// Пространственно-осознанный: на каждый ход через flood-fill оценивает, сколько
// свободного места останется, и НЕ загоняет себя в тупик (главная причина слабости
// «жадных» ботов). Идёт к своей еде только когда есть место; в тесноте — режим
// выживания (максимум пространства). Уходит от лобовых столкновений (предсказывает
// ход соперника). Избегает фатальных ходов (стена/чужой цвет/своё и чужое тело).
//
// NB: на большом поле с раздельной едой матч — симметричная гонка, поэтому идеальный
// бот против идеального игрока даёт ~50%. Реальная сложность для ЧЕЛОВЕКА задаётся
// темпом матча (BOT_TICK_MS в useRoom): бот безошибочен на любой скорости, а у
// человека есть время реакции.
//
// Бот появляется ТОЛЬКО как соперник живого игрока (фолбэк ranked, когда нет реального
// соперника) и в рейтинге/лидерборде не участвует (нет профиля в облаке).
import { DUEL_BOARD, type DuelState } from './duel';
import { type Direction, type Point, isOpposite, nextPoint, pointsEqual } from './logic';

// Доля случайных (не оптимальных) ходов. Крутилка баланса: больше → бот слабее.
// 0 = максимальная сложность: бот никогда не ошибается, всегда идёт оптимально.
export const BOT_MISTAKE_RATE = 0;

const ALL_DIRS: Direction[] = ['up', 'down', 'left', 'right'];

function inBounds(p: Point): boolean {
  return p.x >= 0 && p.x < DUEL_BOARD && p.y >= 0 && p.y < DUEL_BOARD;
}

function manhattan(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function keyOf(p: Point): number {
  return p.y * DUEL_BOARD + p.x;
}

// Размер свободной области, достижимой из start (start считается свободной).
// blocked — множество ключей занятых клеток (тела змей).
function freeSpace(start: Point, blocked: Set<number>): number {
  const seen = new Set<number>([keyOf(start)]);
  const stack: Point[] = [start];
  let count = 0;
  while (stack.length) {
    const p = stack.pop()!;
    count++;
    const ns = [
      { x: p.x + 1, y: p.y },
      { x: p.x - 1, y: p.y },
      { x: p.x, y: p.y + 1 },
      { x: p.x, y: p.y - 1 },
    ];
    for (const n of ns) {
      if (!inBounds(n)) continue;
      const k = keyOf(n);
      if (seen.has(k) || blocked.has(k)) continue;
      seen.add(k);
      stack.push(n);
    }
  }
  return count;
}

interface Cand {
  dir: Direction;
  dist: number; // манхэттен до ближайшей своей еды
  space: number; // свободное место после хода (flood-fill)
  headon: boolean; // ведёт в клетку, куда шагнёт соперник
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
  const myLen = state.snakes[me].length;
  const myFoods = state.foods.filter((f) => f.color === me);

  // Предсказание следующей клетки головы соперника (для ухода от лобовых).
  const oppHead = state.snakes[opp][0];
  const oppNext = nextPoint(oppHead, state.pending[opp] ?? state.dirs[opp]);

  const cands: Cand[] = [];
  for (const d of ALL_DIRS) {
    if (isOpposite(d, curDir)) continue;
    const h = nextPoint(head, d);
    if (!inBounds(h)) continue; // стена
    const food = state.foods.find((f) => pointsEqual(f.pos, h));
    const foodActive = Boolean(food && (food.blink ?? 0) <= 0);
    if (food && foodActive && !food.boost && food.color !== me) continue; // живой чужой цвет = смерть (мигающий/буст безопасны)
    const grow = Boolean(food && foodActive && !food.boost && food.color === me);
    const ownBody = grow ? state.snakes[me] : state.snakes[me].slice(0, -1);
    if (ownBody.some((p) => pointsEqual(p, h))) continue; // своё тело
    if (state.snakes[opp].some((p) => pointsEqual(p, h))) continue; // тело соперника

    // Занятость после хода: наше тело (с учётом роста) + полное тело соперника.
    const blocked = new Set<number>();
    for (const p of ownBody) blocked.add(keyOf(p));
    for (const p of state.snakes[opp]) blocked.add(keyOf(p));

    const dist = myFoods.length ? Math.min(...myFoods.map((f) => manhattan(h, f.pos))) : 0;
    cands.push({ dir: d, dist, space: freeSpace(h, blocked), headon: pointsEqual(h, oppNext) });
  }

  if (cands.length === 0) return curDir; // некуда деться — поедет прямо (проиграет)

  // Случайная «ошибка» (для отката сложности; при rate 0 не срабатывает).
  if (rng() < BOT_MISTAKE_RATE) {
    const idx = Math.min(cands.length - 1, Math.floor(rng() * cands.length));
    return cands[idx].dir;
  }

  // Не ходим в лоб сопернику, если есть альтернатива.
  const noHeadon = cands.filter((c) => !c.headon);
  const pool0 = noHeadon.length ? noHeadon : cands;

  // Не заходим в область меньше своей длины (анти-самозапирание).
  const spacious = pool0.filter((c) => c.space > myLen);

  if (spacious.length) {
    // Есть простор → к ближайшей своей еде; при равенстве — где места больше.
    spacious.sort((a, b) => a.dist - b.dist || b.space - a.space);
    return spacious[0].dir;
  }

  // Тесно везде → режим выживания: максимум пространства, потом ближе к еде.
  pool0.sort((a, b) => b.space - a.space || a.dist - b.dist);
  return pool0[0].dir;
}
