// Чистая логика ежедневной награды (T27, удержание). Без сторонних зависимостей —
// легко тестируется. Награда растёт по стрику (по календарным дням), цикл — неделя.

export interface DailyResult {
  canClaim: boolean; // доступна ли награда сегодня
  streak: number; // каким станет стрик при получении (или текущий, если уже забрано)
  amount: number; // сколько монет дадут (0 если уже забрано)
  rewardDay: number; // день недельного цикла 1..7 (для подсветки в UI)
}

const BASE = 25; // монет за день 1
const STEP = 15; // прибавка за каждый следующий день недельного цикла
const CYCLE = 7; // длина цикла наград (потом суммы повторяются, стрик растёт дальше)

// Локальный календарный ключ дня 'YYYY-MM-DD'.
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function amountFor(streak: number): { amount: number; rewardDay: number } {
  const rewardDay = ((Math.max(1, streak) - 1) % CYCLE) + 1;
  return { amount: BASE + (rewardDay - 1) * STEP, rewardDay };
}

// Рассчитать состояние награды на момент now по сохранённым last (ISO-день) и стрику.
export function computeDaily(lastClaim: string | null, prevStreak: number, now: Date): DailyResult {
  const today = dayKey(now);
  if (lastClaim === today) {
    const { rewardDay } = amountFor(prevStreak);
    return { canClaim: false, streak: prevStreak, amount: 0, rewardDay };
  }
  const yest = new Date(now.getTime());
  yest.setDate(yest.getDate() - 1);
  const nextStreak = lastClaim === dayKey(yest) ? Math.max(1, prevStreak) + 1 : 1;
  const { amount, rewardDay } = amountFor(nextStreak);
  return { canClaim: true, streak: nextStreak, amount, rewardDay };
}
