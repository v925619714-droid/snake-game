/// <reference types="jest" />
import {
  BOOST_TICKS,
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
    queues: [[], []],
    foods: [],
    roundScore: [0, 0],
    matchWins: [0, 0],
    round: 1,
    tick: 0,
    status: 'playing',
    roundWinner: -1,
    matchWinner: -1,
    causes: [null, null],
    boosts: [0, 0],
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

describe('мигание еды (инертна 3с)', () => {
  test('мигающая ЧУЖАЯ еда не убивает — проезжаем насквозь', () => {
    const s = duel({ foods: [{ pos: { x: 6, y: 5 }, color: 1, blink: 3 }] });
    const n = duelStep(s, rng0);
    expect(n.status).toBe('playing'); // не crash об чужую мигающую еду
  });

  test('мигающая СВОЯ еда не съедается (инертна)', () => {
    const s = duel({ foods: [{ pos: { x: 6, y: 5 }, color: 0, blink: 3 }] });
    const n = duelStep(s, rng0);
    expect(n.roundScore[0]).toBe(0); // не съедено
    expect(n.snakes[0]).toHaveLength(3); // не выросла
    expect(n.foods.some((f) => f.pos.x === 6 && f.pos.y === 5 && f.color === 0)).toBe(true); // осталась
  });

  test('живая (не мигающая) еда съедается как обычно', () => {
    const s = duel({ foods: [{ pos: { x: 6, y: 5 }, color: 0, blink: 0 }] });
    const n = duelStep(s, rng0);
    expect(n.roundScore[0]).toBe(1);
  });

  test('таймер мигания уменьшается каждый тик', () => {
    const s = duel({ foods: [{ pos: { x: 20, y: 20 }, color: 0, blink: 3 }] });
    const n = duelStep(s, rng0);
    expect(n.foods.find((f) => f.pos.x === 20 && f.pos.y === 20)?.blink).toBe(2);
  });

  test('стартовая еда раунда сразу живая (не мигает)', () => {
    const s = duelNewMatch(rng0);
    expect(s.foods.every((f) => (f.blink ?? 0) === 0)).toBe(true);
  });
});

describe('duelTurn (буфер ввода)', () => {
  test('180 игнор, 90 встаёт в очередь игрока', () => {
    const s = duel();
    expect(duelTurn(s, 0, 'left').queues[0]).toHaveLength(0); // 180° → не в очередь
    expect(duelTurn(s, 0, 'up').queues[0][0]).toBe('up'); // 90° → в очередь
  });
  test('очередь игрока не задевает соперника', () => {
    const s = duel();
    const n = duelTurn(s, 1, 'up');
    expect(n.queues[1][0]).toBe('up');
    expect(n.queues[0]).toHaveLength(0);
  });
  test('копит до двух поворотов, третий отбрасывается', () => {
    let s = duel();
    s = duelTurn(s, 0, 'up'); // 90° от right
    s = duelTurn(s, 0, 'left'); // 90° от up
    s = duelTurn(s, 0, 'down'); // буфер полон
    expect(s.queues[0]).toEqual(['up', 'left']);
  });
  test('duelStep применяет один поворот из очереди и сдвигает её', () => {
    const s = duel({ queues: [['up'], []] });
    const n = duelStep(s, rng0);
    expect(n.snakes[0][0]).toEqual({ x: 5, y: 4 }); // (5,5) повернул вверх
    expect(n.dirs[0]).toBe('up');
    expect(n.queues[0]).toHaveLength(0);
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

describe('duelStep — буст-еда (скорость)', () => {
  test('съел буст-еду → ускорение, без роста, не смертельно', () => {
    const s = duel({ foods: [{ pos: { x: 6, y: 5 }, color: 0, boost: true }] });
    const n = duelStep(s, rng0);
    expect(n.status).toBe('playing');
    expect(n.boosts[0]).toBe(BOOST_TICKS);
    expect(n.snakes[0]).toHaveLength(3); // буст-еда не растит
    expect(n.foods.some((f) => f.boost && f.pos.x === 6 && f.pos.y === 5)).toBe(false); // съедена
  });

  test('буст-еда чужого «цвета» не убивает (нейтральна)', () => {
    // snake1 (color 1) едет на буст-еду (хранится с color 0) — не должно быть wrong_color
    const s = duel({ foods: [{ pos: { x: 6, y: 20 }, color: 0, boost: true }] });
    const n = duelStep(s, rng0);
    expect(n.status).toBe('playing');
    expect(n.boosts[1]).toBe(BOOST_TICKS);
  });

  test('забустенная змейка двигается 2 клетки за тик', () => {
    const s = duel({ boosts: [5, 0] });
    const n = duelStep(s, rng0);
    expect(n.snakes[0][0]).toEqual({ x: 7, y: 5 }); // 5→7 (2 клетки вправо)
    expect(n.snakes[1][0]).toEqual({ x: 6, y: 20 }); // обычная — 1 клетка
    expect(n.boosts[0]).toBe(4); // таймер тикнул
  });
});

describe('duelStep — счёт и матч', () => {
  test('сбор еды НЕ заканчивает раунд (только краш/тайм-кап)', () => {
    const s = duel({ roundScore: [6, 0], foods: [{ pos: { x: 6, y: 5 }, color: 0 }] });
    const n = duelStep(s, rng0);
    expect(n.roundScore[0]).toBe(7); // съел седьмую — но раунд продолжается
    expect(n.status).toBe('playing');
  });

  test('вторая победа (через краш соперника) → матч окончен', () => {
    // matchWins[1,0]; снейк1 врезается в стену → раунд игроку 0 → матч окончен
    const s = duel({
      matchWins: [1, 0],
      snakes: [
        [{ x: 5, y: 5 }, { x: 4, y: 5 }],
        [{ x: 24, y: 20 }, { x: 23, y: 20 }],
      ],
      dirs: ['right', 'right'],
      pending: ['right', 'right'],
    });
    const n = duelStep(s, rng0);
    expect(n.roundWinner).toBe(0);
    expect(n.matchWins).toEqual([2, 0]);
    expect(n.status).toBe('matchOver');
    expect(n.matchWinner).toBe(0);
  });
});
