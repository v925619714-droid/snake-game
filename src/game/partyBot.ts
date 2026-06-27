// Простой безопасный бот для режима «Shake Work Off» (FFA, party.ts).
// Не загоняет себя сразу в стену/тело, по возможности идёт к ближайшей еде. Без
// flood-fill — этого достаточно для: (1) локальной практики/визуальной проверки,
// (2) фолбэка при дисконнекте игрока, (3) добивки пустых слотов до минимума.
// Чистая функция → тестируемо.
import { type Direction, isOpposite, nextPoint } from './logic';
import { type PartyState } from './party';

const ALL: Direction[] = ['up', 'down', 'left', 'right'];

export function partyBotDir(state: PartyState, i: number, rng: () => number = Math.random): Direction {
  const cur = state.dirs[i];
  const head = state.snakes[i][0];
  const board = state.board;
  const sh = state.shrink;

  // Занятые клетки — тела всех живых змей.
  const blocked = new Set<number>();
  for (let j = 0; j < state.snakes.length; j++) {
    if (!state.alive[j]) continue;
    for (const p of state.snakes[j]) blocked.add(p.y * board + p.x);
  }

  const safe: Direction[] = [];
  for (const d of ALL) {
    if (isOpposite(d, cur)) continue;
    const h = nextPoint(head, d);
    if (h.x < sh || h.x >= board - sh || h.y < sh || h.y >= board - sh) continue; // стена/зона
    if (blocked.has(h.y * board + h.x)) continue; // тело (своё/чужое)
    safe.push(d);
  }
  if (safe.length === 0) return cur; // некуда — едет прямо (обречён)

  // По возможности — к ближайшей еде.
  if (state.foods.length > 0) {
    let best = safe[0];
    let bestDist = Infinity;
    for (const d of safe) {
      const h = nextPoint(head, d);
      let md = Infinity;
      for (const f of state.foods) {
        const dist = Math.abs(f.pos.x - h.x) + Math.abs(f.pos.y - h.y);
        if (dist < md) md = dist;
      }
      if (md < bestDist) {
        bestDist = md;
        best = d;
      }
    }
    return best;
  }

  return safe[Math.floor(rng() * safe.length)];
}

// Утилита для тестов/UI: есть ли у бота безопасный ход (иначе он обречён в этот тик).
export function hasSafeMove(state: PartyState, i: number): boolean {
  const cur = state.dirs[i];
  const head = state.snakes[i][0];
  const board = state.board;
  const sh = state.shrink;
  const blocked = new Set<number>();
  for (let j = 0; j < state.snakes.length; j++) {
    if (!state.alive[j]) continue;
    for (const p of state.snakes[j]) blocked.add(p.y * board + p.x);
  }
  return ALL.some((d) => {
    if (isOpposite(d, cur)) return false;
    const h = nextPoint(head, d);
    if (h.x < sh || h.x >= board - sh || h.y < sh || h.y >= board - sh) return false;
    return !blocked.has(h.y * board + h.x);
  });
}
