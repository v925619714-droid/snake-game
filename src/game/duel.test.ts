/// <reference types="jest" />
import {
  DUEL_BOARD,
  type DuelState,
  FOOD_MIN_HEAD_DIST,
  duelNewMatch,
  ensureFoods,
  duelStep,
  duelTurn,
} from './duel';

const rng0 = () => 0;

function duel(p: Partial<DuelState> = {}): DuelState {
  return {
    snakes: [
      [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }],
      [{ x: 5, y: 20 }, { x: 4, y: 20 }, { x: 3, y: 20 }],
    ],
    dirs: ['right', 'right'],
    pending: ['right', 'right'],
    foods: [],
    roundScore: [0, 0],
    matchWins: [0, 0],
    round: 1,
    tick: 0,
    status: 'playing',
    roundWinner: -1,
    matchWinner: -1,
    causes: [null, null],
    ...p,
  };
}

describe('duelNewMatch', () => {
  test('две змейки, по 2 еды каждого цвета, поле 25', () => {
    const s = duelNewMatch(rng0);
    expect(s.snakes).toHaveLength(2);
    expect(s.foods.filter((f) => f.color === 0)).toHaveLength(2);
    expect(s.foods.filter((f) => f.color === 1)).toHaveLength(2);
    expect(DUEL_BOARD).toBe(25);
    expect(s.status).toBe('playing');
  });
});

describe('спавн еды', () => {
  const snakes = [
    [{ x: 3, y: 8 }, { x: 2, y: 8 }, { x: 1, y: 8 }],
    [{ x: 3, y: 16 }, { x: 2, y: 16 }, { x: 1, y: 16 }],
  ];

  test('не более 2 еды каждого цвета', () => {
    const foods = ensureFoods(snakes, [], Math.random);
    expect(foods.filter((f) => f.color === 0).length).toBeLessThanOrEqual(2);
    expect(foods.filter((f) => f.color === 1).length).toBeLessThanOrEqual(2);
  });

  test('еда не появляется ближе FOOD_MIN_HEAD_DIST к голове своей змейки', () => {
    for (let i = 0; i < 100; i++) {
      const foods = ensureFoods(snakes, [], Math.random);
      for (const f of foods) {
        const head = snakes[f.color][0];
        const d = Math.abs(f.pos.x - head.x) + Math.abs(f.pos.y - head.y);
        expect(d).toBeGreaterThanOrEqual(FOOD_MIN_HEAD_DIST);
      }
    }
  });
});

describe('duelTurn', () => {
  test('180 игнор, 90 принят', () => {
    const s = duel();
    expect(duelTurn(s, 0, 'left').pending[0]).toBe('right');
    expect(duelTurn(s, 0, 'up').pending[0]).toBe('up');
  });
});

describe('duelStep — еда', () => {
  test('съел свой цвет: +1 и рост', () => {
    const s = duel({ foods: [{ pos: { x: 6, y: 5 }, color: 0 }] });
    const n = duelStep(s, rng0);
    expect(n.roundScore[0]).toBe(1);
    expect(n.snakes[0]).toHaveLength(4);
    expect(n.status).toBe('playing');
  });

  test('съел ЧУЖОЙ цвет → проигрыш, раунд за соперником', () => {
    const s = duel({ foods: [{ pos: { x: 6, y: 5 }, color: 1 }] });
    const n = duelStep(s, rng0);
    expect(n.status).toBe('roundOver');
    expect(n.roundWinner).toBe(1);
    expect(n.matchWins).toEqual([0, 1]);
  });
});

describe('duelStep — столкновения', () => {
  test('стена → раунд сопернику', () => {
    const s = duel({
      snakes: [
        [{ x: 24, y: 5 }, { x: 23, y: 5 }],
        [{ x: 5, y: 20 }, { x: 4, y: 20 }],
      ],
    });
    const n = duelStep(s, rng0);
    expect(n.status).toBe('roundOver');
    expect(n.roundWinner).toBe(1);
  });

  test('въезд в тело соперника → раунд сопернику', () => {
    const s = duel({
      snakes: [
        [{ x: 5, y: 5 }, { x: 4, y: 5 }],
        [{ x: 6, y: 5 }, { x: 7, y: 5 }, { x: 8, y: 5 }],
      ],
      dirs: ['right', 'right'],
      pending: ['right', 'up'],
    });
    const n = duelStep(s, rng0);
    expect(n.status).toBe('roundOver');
    expect(n.roundWinner).toBe(1); // снейк0 врезался в тело снейка1 → побеждает снейк1
  });

  test('лоб в лоб → ничья, матч-счёт без изменений', () => {
    const s = duel({
      snakes: [
        [{ x: 5, y: 5 }, { x: 4, y: 5 }],
        [{ x: 7, y: 5 }, { x: 8, y: 5 }],
      ],
      dirs: ['right', 'left'],
      pending: ['right', 'left'],
    });
    const n = duelStep(s, rng0);
    expect(n.status).toBe('roundOver');
    expect(n.roundWinner).toBe(-1);
    expect(n.matchWins).toEqual([0, 0]);
  });
});

describe('duelStep — причины краша (causes)', () => {
  test('стена → wall у врезавшегося', () => {
    const s = duel({
      snakes: [
        [{ x: 24, y: 5 }, { x: 23, y: 5 }],
        [{ x: 5, y: 20 }, { x: 4, y: 20 }],
      ],
    });
    const n = duelStep(s, rng0);
    expect(n.causes[0]).toBe('wall');
    expect(n.causes[1]).toBeNull();
  });

  test('чужой цвет → wrong_color', () => {
    const s = duel({ foods: [{ pos: { x: 6, y: 5 }, color: 1 }] });
    const n = duelStep(s, rng0);
    expect(n.causes[0]).toBe('wrong_color');
  });

  test('въезд в соперника → opponent', () => {
    const s = duel({
      snakes: [
        [{ x: 5, y: 5 }, { x: 4, y: 5 }],
        [{ x: 6, y: 5 }, { x: 7, y: 5 }, { x: 8, y: 5 }],
      ],
      dirs: ['right', 'right'],
      pending: ['right', 'up'],
    });
    const n = duelStep(s, rng0);
    expect(n.causes[0]).toBe('opponent');
  });

  test('въезд в себя → self', () => {
    // змейка достаточной длины, разворот в тело даёт самопересечение
    const s = duel({
      snakes: [
        [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 5 }],
        [{ x: 5, y: 20 }, { x: 4, y: 20 }],
      ],
      dirs: ['up', 'right'],
      pending: ['left', 'right'],
      foods: [{ pos: { x: 4, y: 5 }, color: 0 }], // рост, чтобы хвост не освободил клетку
    });
    const n = duelStep(s, rng0);
    expect(n.causes[0]).toBe('self');
  });

  test('лоб в лоб → head_on у обоих', () => {
    const s = duel({
      snakes: [
        [{ x: 5, y: 5 }, { x: 4, y: 5 }],
        [{ x: 7, y: 5 }, { x: 8, y: 5 }],
      ],
      dirs: ['right', 'left'],
      pending: ['right', 'left'],
    });
    const n = duelStep(s, rng0);
    expect(n.causes).toEqual(['head_on', 'head_on']);
  });

  test('победа по очкам → причин нет', () => {
    const s = duel({ roundScore: [6, 0], foods: [{ pos: { x: 6, y: 5 }, color: 0 }] });
    const n = duelStep(s, rng0);
    expect(n.causes).toEqual([null, null]);
  });
});

describe('duelStep — счёт и матч', () => {
  test('достиг 7 своих → победа в раунде', () => {
    const s = duel({ roundScore: [6, 0], foods: [{ pos: { x: 6, y: 5 }, color: 0 }] });
    const n = duelStep(s, rng0);
    expect(n.roundWinner).toBe(0);
    expect(n.matchWins).toEqual([1, 0]);
    expect(n.status).toBe('roundOver');
  });

  test('вторая победа → матч окончен', () => {
    const s = duel({ matchWins: [1, 0], roundScore: [6, 0], foods: [{ pos: { x: 6, y: 5 }, color: 0 }] });
    const n = duelStep(s, rng0);
    expect(n.matchWins).toEqual([2, 0]);
    expect(n.status).toBe('matchOver');
    expect(n.matchWinner).toBe(0);
  });
});
