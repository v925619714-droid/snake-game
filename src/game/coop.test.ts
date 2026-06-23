/// <reference types="jest" />
import { BOARD, type Point } from './logic';
import { type CoopState, coopInitial, coopStep, coopTurn } from './coop';

const rng0 = () => 0;

function coop(partial: Partial<CoopState> = {}): CoopState {
  return {
    snakes: [
      [{ x: 4, y: 8 }, { x: 3, y: 8 }, { x: 2, y: 8 }],
      [{ x: 12, y: 8 }, { x: 13, y: 8 }, { x: 14, y: 8 }],
    ],
    dirs: ['right', 'left'],
    pending: ['right', 'left'],
    food: { x: 0, y: 0 },
    score: 0,
    status: 'playing',
    loser: -1,
    ...partial,
  };
}

describe('coopInitial', () => {
  test('две змейки по 3 сегмента, играем, еда не на змейках', () => {
    const s = coopInitial(rng0);
    expect(s.snakes[0]).toHaveLength(3);
    expect(s.snakes[1]).toHaveLength(3);
    expect(s.status).toBe('playing');
    const all = [...s.snakes[0], ...s.snakes[1]];
    expect(all.some((p) => p.x === s.food.x && p.y === s.food.y)).toBe(false);
  });
});

describe('coopTurn', () => {
  test('разворот на 180° игнорируется, 90° принимается', () => {
    const s = coop();
    expect(coopTurn(s, 0, 'left').pending[0]).toBe('right'); // 180 для игрока0
    expect(coopTurn(s, 0, 'up').pending[0]).toBe('up');
    expect(coopTurn(s, 1, 'up').pending[1]).toBe('up');
  });
});

describe('coopStep', () => {
  test('обе змейки двигаются, длина сохраняется без еды', () => {
    const n = coopStep(coop(), rng0);
    expect(n.snakes[0][0]).toEqual({ x: 5, y: 8 });
    expect(n.snakes[1][0]).toEqual({ x: 11, y: 8 });
    expect(n.snakes[0]).toHaveLength(3);
    expect(n.snakes[1]).toHaveLength(3);
    expect(n.status).toBe('playing');
  });

  test('игрок0 ест еду: общий счёт +1 и рост', () => {
    const n = coopStep(coop({ food: { x: 5, y: 8 } }), rng0);
    expect(n.score).toBe(1);
    expect(n.snakes[0]).toHaveLength(4);
  });

  test('выход за стену → game over с loser', () => {
    const s = coop({
      snakes: [
        [{ x: BOARD - 1, y: 8 }, { x: BOARD - 2, y: 8 }],
        [{ x: 12, y: 0 }, { x: 13, y: 0 }],
      ],
      dirs: ['right', 'left'],
      pending: ['right', 'left'],
    });
    const n = coopStep(s, rng0);
    expect(n.status).toBe('over');
    expect(n.loser).toBe(0);
  });

  test('въезд в тело соперника → game over', () => {
    // игрок0 идёт вверх в клетку, занятую телом игрока1
    const s = coop({
      snakes: [
        [{ x: 8, y: 8 }, { x: 7, y: 8 }],
        [{ x: 8, y: 7 }, { x: 9, y: 7 }, { x: 10, y: 7 }],
      ],
      dirs: ['right', 'left'],
      pending: ['up', 'left'],
    });
    const n = coopStep(s, rng0);
    expect(n.status).toBe('over');
    expect(n.loser).toBe(0);
  });

  test('лоб в лоб → game over, loser = 2', () => {
    const s = coop({
      snakes: [
        [{ x: 7, y: 8 }, { x: 6, y: 8 }],
        [{ x: 9, y: 8 }, { x: 10, y: 8 }],
      ],
      dirs: ['right', 'left'],
      pending: ['right', 'left'],
    });
    // обе придут в (8,8)
    const n = coopStep(s, rng0);
    expect(n.status).toBe('over');
    expect(n.loser).toBe(2);
  });
});
