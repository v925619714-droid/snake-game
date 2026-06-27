/// <reference types="jest" />
import {
  GRACE_TICKS,
  MAX_PARTY_TURN_QUEUE,
  type PartyState,
  boardForCount,
  partyNewMatch,
  partyStep,
  partyTurn,
} from './party';
import { type Direction, type Point } from './logic';

const rng0 = () => 0;

// Билдер валидного состояния. По умолчанию tick = GRACE_TICKS, т.е. в partyStep станет
// GRACE_TICKS+1 → ВНЕ грейса (коллизии с чужими/лоб-в-лоб действуют). Для теста грейса tick:0.
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
    board: p.board ?? 30,
    shrink: p.shrink ?? 0,
    tick: p.tick ?? GRACE_TICKS,
    status: p.status ?? 'playing',
    winner: p.winner ?? -1,
    placements: p.placements ?? [],
    causes: p.causes ?? p.snakes.map(() => null),
  };
}

// Две змейки далеко друг от друга — фон, чтобы матч не заканчивался преждевременно.
const farB: Point[] = [
  { x: 20, y: 20 },
  { x: 20, y: 21 },
  { x: 20, y: 22 },
];

describe('partyNewMatch', () => {
  test('создаёт N змей, все живы, поле и еда по числу игроков', () => {
    const s = partyNewMatch(6, rng0);
    expect(s.snakes).toHaveLength(6);
    expect(s.alive.every(Boolean)).toBe(true);
    expect(s.dirs).toHaveLength(6);
    expect(s.board).toBe(boardForCount(6)); // 35
    expect(s.foods).toHaveLength(3); // ceil(6/2)
    expect(s.status).toBe('playing');
    expect(s.winner).toBe(-1);
  });

  test('boardForCount растёт с числом игроков', () => {
    expect(boardForCount(5)).toBe(30);
    expect(boardForCount(7)).toBe(35);
    expect(boardForCount(10)).toBe(40);
  });
});

describe('partyTurn (буфер ввода на игрока)', () => {
  test('90° встаёт в очередь нужного игрока, не задевая других', () => {
    const s = mk({ snakes: [[{ x: 5, y: 5 }, { x: 4, y: 5 }], farB] });
    const n = partyTurn(s, 0, 'up');
    expect(n.queues[0]).toEqual(['up']);
    expect(n.queues[1]).toHaveLength(0);
  });
  test('180° и дубль игнорируются', () => {
    const s = mk({ snakes: [[{ x: 5, y: 5 }, { x: 4, y: 5 }], farB], dirs: ['right', 'right'] });
    expect(partyTurn(s, 0, 'left').queues[0]).toHaveLength(0); // 180°
    expect(partyTurn(s, 0, 'right').queues[0]).toHaveLength(0); // дубль
  });
  test('мёртвый игрок не может повернуть', () => {
    const s = mk({ snakes: [[{ x: 5, y: 5 }, { x: 4, y: 5 }], farB], alive: [false, true] });
    expect(partyTurn(s, 0, 'up')).toBe(s);
  });
  test('буфер не больше MAX_PARTY_TURN_QUEUE', () => {
    let s = mk({ snakes: [[{ x: 5, y: 5 }, { x: 4, y: 5 }], farB] });
    s = partyTurn(s, 0, 'up');
    s = partyTurn(s, 0, 'left');
    s = partyTurn(s, 0, 'down'); // буфер полон (2)
    expect(s.queues[0]).toHaveLength(MAX_PARTY_TURN_QUEUE);
  });
});

describe('partyStep — движение и еда', () => {
  test('змейка двигается; голова на еде → рост и счёт', () => {
    const s = mk({
      snakes: [[{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }], farB],
      foods: [{ pos: { x: 6, y: 5 } }],
    });
    const n = partyStep(s, rng0);
    expect(n.snakes[0][0]).toEqual({ x: 6, y: 5 });
    expect(n.snakes[0]).toHaveLength(4); // выросла
    expect(n.scores[0]).toBe(1);
    expect(n.status).toBe('playing'); // двое живы
  });

  test('применяет один поворот из очереди и сдвигает буфер', () => {
    const s = mk({
      snakes: [[{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }], farB],
      queues: [['up'], []],
    });
    const n = partyStep(s, rng0);
    expect(n.snakes[0][0]).toEqual({ x: 5, y: 4 }); // повернул вверх
    expect(n.dirs[0]).toBe('up');
    expect(n.queues[0]).toHaveLength(0);
  });
});

describe('partyStep — коллизии', () => {
  test('стена убивает; остаётся один → победа последнего', () => {
    const s = mk({
      snakes: [[{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }], farB],
      dirs: ['left', 'up'],
      pending: ['left', 'up'],
    });
    const n = partyStep(s, rng0);
    expect(n.alive[0]).toBe(false);
    expect(n.causes[0]).toBe('wall');
    expect(n.status).toBe('over');
    expect(n.winner).toBe(1);
    expect(n.placements).toEqual([0, 1]); // первый выбывший → … → победитель
  });

  test('въезд в тело чужого → opponent', () => {
    const s = mk({
      snakes: [
        [{ x: 5, y: 5 }, { x: 4, y: 5 }],
        [{ x: 6, y: 5 }, { x: 6, y: 6 }, { x: 6, y: 7 }],
      ],
      dirs: ['right', 'up'],
      pending: ['right', 'up'],
    });
    const n = partyStep(s, rng0);
    expect(n.alive[0]).toBe(false);
    expect(n.causes[0]).toBe('opponent');
  });

  test('лоб-в-лоб → обе гибнут, ничья', () => {
    const s = mk({
      snakes: [
        [{ x: 5, y: 5 }, { x: 4, y: 5 }],
        [{ x: 7, y: 5 }, { x: 8, y: 5 }],
      ],
      dirs: ['right', 'left'],
      pending: ['right', 'left'],
    });
    const n = partyStep(s, rng0);
    expect(n.alive).toEqual([false, false]);
    expect(n.causes).toEqual(['head_on', 'head_on']);
    expect(n.status).toBe('over');
    expect(n.winner).toBe(-1);
  });

  test('грейс на старте: лоб-в-лоб НЕ убивает (tick в пределах грейса)', () => {
    const s = mk({
      snakes: [
        [{ x: 5, y: 5 }, { x: 4, y: 5 }],
        [{ x: 7, y: 5 }, { x: 8, y: 5 }],
      ],
      dirs: ['right', 'left'],
      pending: ['right', 'left'],
      tick: 0, // step → tick 1 ≤ GRACE_TICKS
    });
    const n = partyStep(s, rng0);
    expect(n.alive).toEqual([true, true]);
    expect(n.status).toBe('playing');
  });

  test('из 3 игроков один гибнет — матч продолжается', () => {
    const s = mk({
      snakes: [
        [{ x: 0, y: 5 }, { x: 1, y: 5 }], // врежется в стену слева
        [{ x: 10, y: 10 }, { x: 10, y: 11 }],
        farB,
      ],
      dirs: ['left', 'up', 'up'],
      pending: ['left', 'up', 'up'],
    });
    const n = partyStep(s, rng0);
    expect(n.alive).toEqual([false, true, true]);
    expect(n.status).toBe('playing');
    expect(n.winner).toBe(-1);
    expect(n.placements).toEqual([0]);
  });
});

describe('partyStep — сжатие арены (shrink)', () => {
  test('после сжатия голова в убранной зоне гибнет (wall)', () => {
    // shrink=2 → играбельно x,y в [2 .. board-3]. Голова на y=2 идёт вверх → y=1 вне зоны.
    const s = mk({
      snakes: [[{ x: 10, y: 2 }, { x: 10, y: 3 }], [{ x: 20, y: 20 }, { x: 20, y: 21 }]],
      dirs: ['up', 'right'],
      pending: ['up', 'right'],
      shrink: 2,
    });
    const n = partyStep(s, rng0);
    expect(n.alive[0]).toBe(false);
    expect(n.causes[0]).toBe('wall');
  });
});
