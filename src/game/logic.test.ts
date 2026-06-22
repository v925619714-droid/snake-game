/// <reference types="jest" />
import {
  BOARD,
  type GameState,
  createInitialState,
  isOpposite,
  spawnFood,
  step,
  swipeToDirection,
  turn,
} from './logic';

const rng0 = () => 0; // детерминированный «генератор случайностей»

function playingState(partial: Partial<GameState> = {}): GameState {
  return {
    snake: [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
    ],
    food: { x: 0, y: 0 },
    dir: 'right',
    pendingDir: 'right',
    score: 0,
    status: 'playing',
    ...partial,
  };
}

describe('isOpposite', () => {
  test('распознаёт противоположные направления', () => {
    expect(isOpposite('left', 'right')).toBe(true);
    expect(isOpposite('up', 'down')).toBe(true);
    expect(isOpposite('left', 'up')).toBe(false);
  });
});

describe('createInitialState', () => {
  test('змейка из 3 сегментов, статус ready, еда не на змейке', () => {
    const s = createInitialState(rng0);
    expect(s.snake).toHaveLength(3);
    expect(s.status).toBe('ready');
    expect(s.dir).toBe('right');
    expect(s.snake.some((p) => p.x === s.food.x && p.y === s.food.y)).toBe(false);
  });
});

describe('turn', () => {
  test('разворот на 180° игнорируется', () => {
    const s = playingState({ dir: 'right', pendingDir: 'right' });
    expect(turn(s, 'left').pendingDir).toBe('right');
  });
  test('поворот на 90° принимается', () => {
    expect(turn(playingState({ dir: 'right' }), 'up').pendingDir).toBe('up');
  });
  test('не действует вне статуса playing', () => {
    expect(turn(playingState({ status: 'ready' }), 'up').pendingDir).toBe('right');
  });
});

describe('step', () => {
  test('движение без еды сохраняет длину', () => {
    const n = step(playingState(), rng0);
    expect(n.snake[0]).toEqual({ x: 6, y: 5 });
    expect(n.snake).toHaveLength(3);
    expect(n.score).toBe(0);
  });

  test('поедание еды растит змейку и увеличивает счёт', () => {
    const n = step(playingState({ food: { x: 6, y: 5 } }), rng0);
    expect(n.score).toBe(1);
    expect(n.snake).toHaveLength(4);
    expect(n.snake[0]).toEqual({ x: 6, y: 5 });
  });

  test('столкновение со стеной завершает игру', () => {
    const s = playingState({
      snake: [
        { x: BOARD - 1, y: 5 },
        { x: BOARD - 2, y: 5 },
      ],
    });
    expect(step(s, rng0).status).toBe('over');
  });

  test('столкновение с собственным телом завершает игру', () => {
    // Голова входит в средний сегмент тела (5,6) — не в кончик хвоста (5,7).
    const s = playingState({
      snake: [
        { x: 5, y: 5 }, // голова
        { x: 6, y: 5 },
        { x: 6, y: 6 },
        { x: 5, y: 6 }, // в эту клетку врежется голова
        { x: 5, y: 7 }, // хвост (уедет, но погоды не делает)
      ],
      dir: 'left',
      pendingDir: 'down',
    });
    expect(step(s, rng0).status).toBe('over');
  });

  test('кончик хвоста не считается препятствием (хвост уезжает)', () => {
    const s = playingState({
      snake: [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
        { x: 4, y: 6 },
        { x: 5, y: 6 },
      ],
      dir: 'down',
      pendingDir: 'down',
    });
    const n = step(s, rng0);
    expect(n.status).toBe('playing');
    expect(n.snake[0]).toEqual({ x: 5, y: 6 });
  });

  test('вне статуса playing шаг ничего не меняет', () => {
    const s = playingState({ status: 'over' });
    expect(step(s, rng0)).toBe(s);
  });
});

describe('swipeToDirection', () => {
  test('горизонтальный свайп вправо/влево', () => {
    expect(swipeToDirection(60, 5)).toBe('right');
    expect(swipeToDirection(-60, 5)).toBe('left');
  });
  test('вертикальный свайп вниз/вверх', () => {
    expect(swipeToDirection(5, 60)).toBe('down');
    expect(swipeToDirection(5, -60)).toBe('up');
  });
  test('доминирует большая ось', () => {
    expect(swipeToDirection(60, 30)).toBe('right');
    expect(swipeToDirection(30, 60)).toBe('down');
  });
  test('слишком короткий жест игнорируется', () => {
    expect(swipeToDirection(5, 5)).toBeNull();
  });
});

describe('spawnFood', () => {
  test('никогда не появляется на клетке змейки', () => {
    const snake = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    for (let r = 0; r < 1; r += 0.017) {
      const f = spawnFood(snake, () => r);
      expect(snake.some((p) => p.x === f.x && p.y === f.y)).toBe(false);
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.x).toBeLessThan(BOARD);
    }
  });
});
