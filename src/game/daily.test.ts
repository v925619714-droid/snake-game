import { computeDaily, dayKey } from './daily';

const at = (s: string) => new Date(s + 'T12:00:00');

describe('daily — ежедневная награда', () => {
  it('первый заход (никогда не забирал) → можно забрать, стрик 1, 25 монет', () => {
    const r = computeDaily(null, 0, at('2026-06-24'));
    expect(r.canClaim).toBe(true);
    expect(r.streak).toBe(1);
    expect(r.amount).toBe(25);
    expect(r.rewardDay).toBe(1);
  });

  it('уже забирал сегодня → нельзя, amount 0', () => {
    const today = dayKey(at('2026-06-24'));
    const r = computeDaily(today, 3, at('2026-06-24'));
    expect(r.canClaim).toBe(false);
    expect(r.amount).toBe(0);
    expect(r.streak).toBe(3);
  });

  it('забирал вчера → стрик продолжается (был 2 → станет 3), сумма растёт', () => {
    const r = computeDaily(dayKey(at('2026-06-23')), 2, at('2026-06-24'));
    expect(r.canClaim).toBe(true);
    expect(r.streak).toBe(3);
    expect(r.amount).toBe(25 + 2 * 15); // день 3 = 55
  });

  it('пропустил день (последний раз позавчера) → стрик сбрасывается на 1', () => {
    const r = computeDaily(dayKey(at('2026-06-22')), 5, at('2026-06-24'));
    expect(r.canClaim).toBe(true);
    expect(r.streak).toBe(1);
    expect(r.amount).toBe(25);
  });

  it('недельный цикл сумм: день 8 даёт столько же, сколько день 1, но стрик растёт', () => {
    const r = computeDaily(dayKey(at('2026-06-23')), 7, at('2026-06-24'));
    expect(r.streak).toBe(8);
    expect(r.rewardDay).toBe(1); // цикл 7 → 8-й день = день 1 по награде
    expect(r.amount).toBe(25);
  });

  it('день 7 цикла = 25 + 6*15 = 115', () => {
    const r = computeDaily(dayKey(at('2026-06-23')), 6, at('2026-06-24'));
    expect(r.streak).toBe(7);
    expect(r.amount).toBe(115);
  });
});
