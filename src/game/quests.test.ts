import { applyProgress, claimQuest, claimable, dailyQuests, loadQuests, questLabel } from './quests';

describe('quests — ежедневные квесты', () => {
  it('3 квеста в день, типы уникальны, детерминированы по дате', () => {
    const a = dailyQuests('2026-06-24');
    const b = dailyQuests('2026-06-24');
    expect(a).toHaveLength(3);
    expect(new Set(a.map((q) => q.type)).size).toBe(3);
    expect(a.map((q) => q.type)).toEqual(b.map((q) => q.type)); // стабильно в течение дня
  });

  it('разные дни дают разный набор (ротация)', () => {
    const a = dailyQuests('2026-06-24').map((q) => q.type).join(',');
    const b = dailyQuests('2026-06-25').map((q) => q.type).join(',');
    expect(a).not.toBe(b);
  });

  it('count-прогресс накапливается с потолком target', () => {
    let items = dailyQuests('2026-06-26'); // содержит count-квесты
    const cnt = items.find((q) => q.mode === 'count');
    if (cnt) {
      items = applyProgress(items, cnt.type, 1);
      items = applyProgress(items, cnt.type, 999);
      const q = items.find((x) => x.type === cnt.type)!;
      expect(q.progress).toBe(q.target); // не больше target
    }
  });

  it('max-прогресс берёт лучший результат', () => {
    let items = dailyQuests('2026-06-24'); // solo_score (max) на idx
    const mx = items.find((q) => q.mode === 'max');
    if (mx) {
      items = applyProgress(items, mx.type, 10);
      items = applyProgress(items, mx.type, 5);
      const q = items.find((x) => x.type === mx.type)!;
      expect(q.progress).toBe(10);
    }
  });

  it('claim доступен только при выполнении и один раз', () => {
    let items = dailyQuests('2026-06-26');
    const t = items[0];
    items = applyProgress(items, t.type, t.target); // выполнить
    expect(claimable(items.find((q) => q.type === t.type)!)).toBe(true);
    const r1 = claimQuest(items, t.type);
    expect(r1.reward).toBe(t.reward);
    const r2 = claimQuest(r1.items, t.type); // повторно — нельзя
    expect(r2.reward).toBe(0);
  });

  it('loadQuests: чужая дата → свежий набор; та же дата → переносит прогресс', () => {
    const fresh = loadQuests({ date: '2000-01-01', items: [] }, '2026-06-24');
    expect(fresh.date).toBe('2026-06-24');
    expect(fresh.items.every((q) => q.progress === 0)).toBe(true);
    const day = dailyQuests('2026-06-24');
    const saved = { date: '2026-06-24', items: day.map((q, i) => ({ ...q, progress: i })) };
    const kept = loadQuests(saved, '2026-06-24');
    expect(kept.items.find((q) => q.type === day[1].type)!.progress).toBe(1);
  });

  it('questLabel подставляет target', () => {
    const q = dailyQuests('2026-06-24')[0];
    expect(questLabel(q)).toContain(String(q.target));
    expect(questLabel(q)).not.toContain('{t}');
  });
});
