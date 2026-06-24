// Серия побед в ranked (удержание/азарт). Чистая логика — тестируемо.
// Победа → +1; поражение → сброс; ничья → без изменений. На вехах — бонус-монеты.

export interface StreakState {
  cur: number; // текущая серия
  best: number; // лучшая за всё время
}

export interface StreakResult {
  state: StreakState;
  bonus: number; // монет за достигнутую веху (0 — нет)
  milestone: number | null; // достигнутая веха (для тоста), иначе null
}

// Вехи серии → бонус монет.
export const STREAK_MILESTONES: Record<number, number> = { 3: 10, 5: 25, 10: 60, 20: 150 };

export const initialStreak: StreakState = { cur: 0, best: 0 };

export function applyStreak(prev: StreakState, result: 'win' | 'loss' | 'draw'): StreakResult {
  if (result === 'draw') return { state: prev, bonus: 0, milestone: null };
  if (result === 'loss') return { state: { cur: 0, best: prev.best }, bonus: 0, milestone: null };
  const cur = prev.cur + 1;
  const best = Math.max(prev.best, cur);
  const bonus = STREAK_MILESTONES[cur] ?? 0;
  return { state: { cur, best }, bonus, milestone: bonus > 0 ? cur : null };
}

export function sanitizeStreak(raw: unknown): StreakState {
  const s = (raw ?? {}) as Partial<StreakState>;
  const cur = typeof s.cur === 'number' && s.cur >= 0 ? Math.floor(s.cur) : 0;
  const best = typeof s.best === 'number' && s.best >= 0 ? Math.floor(s.best) : 0;
  return { cur, best: Math.max(best, cur) };
}
