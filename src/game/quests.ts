// Ежедневные квесты (удержание). Чистая логика — тестируемо. 3 квеста в день,
// детерминированно по дате (стабильны в течение суток), ротация из пула.

export type QuestMode = 'count' | 'max';

export interface QuestTemplate {
  type: string;
  label: string; // {t} заменяется на target
  target: number;
  reward: number; // монет
  mode: QuestMode; // count = накапливать, max = лучший за один заход
}

export interface Quest extends QuestTemplate {
  progress: number;
  claimed: boolean;
}

export interface QuestsState {
  date: string; // YYYY-MM-DD
  items: Quest[];
}

const POOL: QuestTemplate[] = [
  { type: 'solo_score', label: 'Score {t} in one solo run', target: 25, reward: 35, mode: 'max' },
  { type: 'eat_solo', label: 'Eat {t} food in solo', target: 30, reward: 30, mode: 'count' },
  { type: 'win_ranked', label: 'Win {t} ranked duels', target: 2, reward: 45, mode: 'count' },
  { type: 'play_ranked', label: 'Play {t} ranked duels', target: 3, reward: 30, mode: 'count' },
];

function daysSince(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

// 3 квеста дня (детерминированно по дате; типы уникальны, т.к. берём подряд из пула >3).
export function dailyQuests(dateKey: string): Quest[] {
  const idx = daysSince(dateKey);
  const items: Quest[] = [];
  for (let i = 0; i < 3; i++) {
    const t = POOL[(((idx + i) % POOL.length) + POOL.length) % POOL.length];
    items.push({ ...t, progress: 0, claimed: false });
  }
  return items;
}

export function questLabel(q: Quest): string {
  return q.label.replace('{t}', String(q.target));
}

export function isComplete(q: Quest): boolean {
  return q.progress >= q.target;
}

export function claimable(q: Quest): boolean {
  return isComplete(q) && !q.claimed;
}

// Прогресс по типу: count → +amount (с потолком target), max → лучший результat.
export function applyProgress(items: Quest[], type: string, amount: number): Quest[] {
  return items.map((q) => {
    if (q.type !== type || q.claimed) return q;
    const progress =
      q.mode === 'max' ? Math.max(q.progress, amount) : Math.min(q.target, q.progress + amount);
    return progress === q.progress ? q : { ...q, progress };
  });
}

// Забрать награду по типу (если доступна). Возвращает обновлённый список + сумму награды.
export function claimQuest(items: Quest[], type: string): { items: Quest[]; reward: number } {
  let reward = 0;
  const next = items.map((q) => {
    if (q.type === type && claimable(q)) {
      reward = q.reward;
      return { ...q, claimed: true };
    }
    return q;
  });
  return { items: next, reward };
}

// Загрузка/нормализация: если дата не сегодня — свежий набор.
export function loadQuests(raw: unknown, today: string): QuestsState {
  const s = (raw ?? {}) as Partial<QuestsState>;
  if (s.date === today && Array.isArray(s.items) && s.items.length === 3) {
    const fresh = dailyQuests(today);
    // переносим progress/claimed на актуальные шаблоны (по типу)
    const items = fresh.map((f) => {
      const old = s.items!.find((o) => o && o.type === f.type);
      return old
        ? { ...f, progress: Math.max(0, Math.min(f.target, Number(old.progress) || 0)), claimed: Boolean(old.claimed) }
        : f;
    });
    return { date: today, items };
  }
  return { date: today, items: dailyQuests(today) };
}

export function claimableCount(items: Quest[]): number {
  return items.filter(claimable).length;
}
