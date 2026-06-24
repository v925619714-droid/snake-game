import { applyStreak, initialStreak, sanitizeStreak } from './streak';

describe('streak — серия побед', () => {
  it('победа увеличивает серию и лучший результат', () => {
    const r = applyStreak({ cur: 0, best: 0 }, 'win');
    expect(r.state).toEqual({ cur: 1, best: 1 });
    expect(r.bonus).toBe(0);
  });

  it('поражение сбрасывает серию, но best сохраняется', () => {
    const r = applyStreak({ cur: 7, best: 7 }, 'loss');
    expect(r.state).toEqual({ cur: 0, best: 7 });
  });

  it('ничья не меняет серию', () => {
    const r = applyStreak({ cur: 4, best: 9 }, 'draw');
    expect(r.state).toEqual({ cur: 4, best: 9 });
    expect(r.bonus).toBe(0);
  });

  it('веха 5 даёт бонус 25 монет', () => {
    const r = applyStreak({ cur: 4, best: 4 }, 'win');
    expect(r.state.cur).toBe(5);
    expect(r.bonus).toBe(25);
    expect(r.milestone).toBe(5);
  });

  it('веха 3 = 10, 10 = 60, 20 = 150', () => {
    expect(applyStreak({ cur: 2, best: 2 }, 'win').bonus).toBe(10);
    expect(applyStreak({ cur: 9, best: 9 }, 'win').bonus).toBe(60);
    expect(applyStreak({ cur: 19, best: 19 }, 'win').bonus).toBe(150);
  });

  it('не-веховая победа даёт 0 бонуса и milestone null', () => {
    const r = applyStreak({ cur: 5, best: 5 }, 'win');
    expect(r.state.cur).toBe(6);
    expect(r.bonus).toBe(0);
    expect(r.milestone).toBeNull();
  });

  it('sanitize чинит битые данные (best >= cur)', () => {
    expect(sanitizeStreak({ cur: 5, best: 2 })).toEqual({ cur: 5, best: 5 });
    expect(sanitizeStreak(null)).toEqual(initialStreak);
  });
});
