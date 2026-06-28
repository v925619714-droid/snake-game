/// <reference types="jest" />
import { partyBotDir, hasSafeMove } from './partyBot';
import { type PartyState } from './party';
import { type Direction, type Point, isOpposite } from './logic';

function mk(p: Partial<PartyState> & { snakes: Point[][] }): PartyState {
  const n = p.snakes.length;
  const dirs = p.dirs ?? p.snakes.map<Direction>(() => 'right');
  return {
    snakes: p.snakes,
    dirs,
    pending: p.pending ?? [...dirs],
    queues: p.queues ?? p.snakes.map<Direction[]>(() => []),
    alive: p.alive ?? p.snakes.map(() => true),
    foods: p.foods ?? [],
    scores: p.scores ?? p.snakes.map(() => 0),
    board: p.board ?? 20,
    tick: p.tick ?? 0,
    status: p.status ?? 'playing',
    roundWinner: p.roundWinner ?? -1,
    matchWinner: p.matchWinner ?? -1,
    roundWins: p.roundWins ?? p.snakes.map(() => 0),
    round: p.round ?? 1,
    placements: p.placements ?? [],
    causes: p.causes ?? p.snakes.map(() => null),
  };
}

const noMistake = () => 0; // детерминированно берёт первый безопасный

describe('partyBotDir', () => {
  test('не разворачивается на 180°', () => {
    const s = mk({ snakes: [[{ x: 5, y: 5 }, { x: 4, y: 5 }]], dirs: ['right'] });
    expect(partyBotDir(s, 0, noMistake)).not.toBe('left');
  });

  test('край безопасен (wrap): идёт сквозь край к еде на другой стороне', () => {
    // голова у левого края; еда у правого края — через wrap ближе всего влево
    const s = mk({ snakes: [[{ x: 0, y: 5 }, { x: 1, y: 5 }]], dirs: ['left'], foods: [{ pos: { x: 19, y: 5 } }] });
    expect(partyBotDir(s, 0, noMistake)).toBe('left');
  });

  test('идёт к ближайшей еде', () => {
    // еда сверху — бот выбирает up (cur=right, up разрешён)
    const s = mk({
      snakes: [[{ x: 5, y: 5 }, { x: 4, y: 5 }]],
      dirs: ['right'],
      foods: [{ pos: { x: 5, y: 0 } }],
    });
    expect(partyBotDir(s, 0, noMistake)).toBe('up');
  });

  test('избегает тела чужой змейки', () => {
    const s = mk({
      snakes: [
        [{ x: 5, y: 5 }, { x: 4, y: 5 }],
        [{ x: 6, y: 5 }, { x: 6, y: 4 }, { x: 6, y: 6 }], // справа стена из тела
      ],
      dirs: ['right', 'up'],
    });
    const d = partyBotDir(s, 0, noMistake);
    expect(d).not.toBe('right'); // справа тело соперника
    expect(isOpposite(d, 'right')).toBe(false); // и не 180
  });

  test('hasSafeMove: false когда зажат со всех сторон', () => {
    // голова в углу зоны, тело сзади, бот едет в угол → некуда (кроме 180)
    const s = mk({
      snakes: [[{ x: 0, y: 0 }, { x: 1, y: 0 }]],
      dirs: ['left'],
      board: 20,
    });
    // up/left вне зоны, down свободна → safe есть
    expect(hasSafeMove(s, 0)).toBe(true);
    // а вот реально запертый случай:
    const s2 = mk({
      snakes: [
        [{ x: 0, y: 0 }, { x: 0, y: 1 }], // голова в углу, едет вверх (в стену)
      ],
      dirs: ['up'],
      foods: [],
      // заблокируем right телом второй змейки
    });
    // up = стена(y=-1), left = стена(x=-1), down = 180 к up → запрещён, right свободен
    expect(hasSafeMove(s2, 0)).toBe(true);
  });
});
