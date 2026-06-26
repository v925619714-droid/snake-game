// Чистая логика игры «Змейка» — без зависимостей от React Native.
// Вынесено отдельно, чтобы покрывать юнит-тестами (Jest) без рендера.

export type Point = { x: number; y: number };
export type Direction = 'up' | 'down' | 'left' | 'right';
export type Status = 'ready' | 'playing' | 'over';

export interface GameState {
  snake: Point[]; // голова — индекс 0
  food: Point;
  dir: Direction; // текущее направление движения
  pendingDir: Direction; // направление, применяемое на следующем шаге
  queue: Direction[]; // буфер поворотов (≤ MAX_TURN_QUEUE), применяется по одному за шаг
  score: number;
  status: Status;
}

// Размер поля в клетках (нечётный — есть центральная клетка).
export const BOARD = 17;

// Сколько поворотов держим в буфере. 2 = игрок может «заказать» быстрый разворот
// углом (например up→left) двумя касаниями подряд — оба сработают на двух тиках, и
// быстрый ввод между тиками не теряется. Это ключ к отзывчивости управления.
export const MAX_TURN_QUEUE = 2;

const DELTAS: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function isOpposite(a: Direction, b: Direction): boolean {
  const d = DELTAS[a];
  const e = DELTAS[b];
  return d.x === -e.x && d.y === -e.y;
}

export function pointsEqual(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

export function nextPoint(p: Point, dir: Direction): Point {
  const d = DELTAS[dir];
  return { x: p.x + d.x, y: p.y + d.y };
}

// Случайная свободная клетка для еды.
export function spawnFood(snake: Point[], rng: () => number = Math.random): Point {
  const occupied = new Set(snake.map((p) => p.y * BOARD + p.x));
  const free: number[] = [];
  for (let i = 0; i < BOARD * BOARD; i++) {
    if (!occupied.has(i)) free.push(i);
  }
  if (free.length === 0) return snake[0]; // поле заполнено целиком
  const idx = free[Math.floor(rng() * free.length)];
  return { x: idx % BOARD, y: Math.floor(idx / BOARD) };
}

// Определить направление по смещению свайпа. Возвращает null, если жест слишком короткий.
export function swipeToDirection(dx: number, dy: number, threshold = 20): Direction | null {
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

export function createInitialState(rng: () => number = Math.random): GameState {
  const snake: Point[] = [
    { x: 8, y: 8 },
    { x: 7, y: 8 },
    { x: 6, y: 8 },
  ];
  return {
    snake,
    food: spawnFood(snake, rng),
    dir: 'right',
    pendingDir: 'right',
    queue: [],
    score: 0,
    status: 'ready',
  };
}

export function startGame(state: GameState): GameState {
  return { ...state, status: 'playing' };
}

// Поставить поворот в очередь. Сверяем НЕ с текущим направлением, а с последним
// заказанным (хвост очереди или pendingDir, если она пуста) — иначе быстрый ввод
// «углом» (up→left) отбрасывался бы или приводил к мгновенному самопересечению.
// 180° и дубль игнорируем; буфер ограничен MAX_TURN_QUEUE.
export function turn(state: GameState, dir: Direction): GameState {
  if (state.status !== 'playing') return state;
  const last = state.queue.length ? state.queue[state.queue.length - 1] : state.pendingDir;
  if (dir === last || isOpposite(dir, last)) return state;
  if (state.queue.length >= MAX_TURN_QUEUE) return state;
  return { ...state, queue: [...state.queue, dir] };
}

// Один шаг игры. Перед движением применяем один поворот из буфера (если он есть).
export function step(state: GameState, rng: () => number = Math.random): GameState {
  if (state.status !== 'playing') return state;

  // Достаём очередной заказанный поворот; что осталось — переносим дальше.
  const dir = state.queue.length ? state.queue[0] : state.pendingDir;
  const queue = state.queue.length ? state.queue.slice(1) : state.queue;
  const d = DELTAS[dir];
  const head = state.snake[0];
  const next: Point = { x: head.x + d.x, y: head.y + d.y };

  // Столкновение со стеной.
  if (next.x < 0 || next.x >= BOARD || next.y < 0 || next.y >= BOARD) {
    return { ...state, dir, pendingDir: dir, queue, status: 'over' };
  }

  const willEat = pointsEqual(next, state.food);
  // Хвост уедет, если не едим, — значит его кончик не считаем препятствием.
  const body = willEat ? state.snake : state.snake.slice(0, -1);
  if (body.some((p) => pointsEqual(p, next))) {
    return { ...state, dir, pendingDir: dir, queue, status: 'over' };
  }

  const newSnake = [next, ...state.snake];
  if (willEat) {
    return {
      ...state,
      snake: newSnake,
      dir,
      pendingDir: dir,
      queue,
      score: state.score + 1,
      food: spawnFood(newSnake, rng),
    };
  }
  newSnake.pop();
  return { ...state, snake: newSnake, dir, pendingDir: dir, queue };
}
