/// <reference types="jest" />
import { type DuelState } from './duel';
import { botDirection } from './bot';

// rng, при котором ветка «ошибки» НЕ срабатывает (0.9 >= BOT_MISTAKE_RATE).
const noMistake = () => 0.9;

function duel(p: Partial<DuelState> = {}): DuelState {
  return {
    snakes: [
      [{ x: 2, y: 2 }, { x: 1, y: 2 }],
      [{ x: 10, y: 10 }, { x: 9, y: 10 }],
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

describe('botDirection', () => {
  test('идёт к своей еде (вверх)', () => {
    const s = duel({ foods: [{ pos: { x: 10, y: 5 }, color: 1 }] });
    expect(botDirection(s, 1, noMistake)).toBe('up');
  });

  test('не съедает чужой цвет прямо по курсу', () => {
    const s = duel({
      foods: [
        { pos: { x: 11, y: 10 }, color: 0 }, // чужая еда прямо справа — нельзя
        { pos: { x: 10, y: 4 }, color: 1 }, // своя сверху
      ],
    });
    const d = botDirection(s, 1, noMistake);
    expect(d).not.toBe('right');
    expect(d).toBe('up');
  });

  test('не врезается в стену', () => {
    const s = duel({
      snakes: [
        [{ x: 2, y: 2 }, { x: 1, y: 2 }],
        [{ x: 24, y: 10 }, { x: 23, y: 10 }],
      ],
      foods: [{ pos: { x: 24, y: 2 }, color: 1 }],
    });
    const d = botDirection(s, 1, noMistake);
    expect(d).not.toBe('right'); // справа стена (x=25)
    expect(d).toBe('up');
  });

  test('не разворачивается на 180°', () => {
    const s = duel({
      snakes: [
        [{ x: 2, y: 2 }, { x: 1, y: 2 }],
        [{ x: 10, y: 10 }, { x: 9, y: 10 }],
      ],
      dirs: ['right', 'right'],
      foods: [{ pos: { x: 5, y: 10 }, color: 1 }], // еда слева-сзади, но влево нельзя
    });
    expect(botDirection(s, 1, noMistake)).not.toBe('left');
  });

  test('избегает тела соперника', () => {
    const s = duel({
      snakes: [
        [{ x: 11, y: 10 }, { x: 11, y: 9 }, { x: 11, y: 8 }], // соперник занимает x=11
        [{ x: 10, y: 10 }, { x: 9, y: 10 }],
      ],
      dirs: ['down', 'right'],
      foods: [{ pos: { x: 10, y: 2 }, color: 1 }],
    });
    const d = botDirection(s, 1, noMistake);
    expect(d).not.toBe('right'); // справа тело соперника (11,10)
  });
});
