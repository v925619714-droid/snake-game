/// <reference types="jest" />
import {
  DUEL_BOARD,
  type DuelState,
  duelNewMatch,
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
