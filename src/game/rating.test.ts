/// <reference types="jest" />
import { START_RATING, applyResult, expectedScore, tierFor } from './rating';

describe('expectedScore', () => {
  test('равные рейтинги → 0.5', () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5, 5);
  });
  test('выше рейтинг → ожидание > 0.5', () => {
    expect(expectedScore(1200, 1000)).toBeGreaterThan(0.5);
    expect(expectedScore(1000, 1200)).toBeLessThan(0.5);
  });
});

describe('applyResult', () => {
  test('победа повышает, поражение понижает', () => {
    expect(applyResult(1000, 1000, 'win')).toBeGreaterThan(1000);
    expect(applyResult(1000, 1000, 'loss')).toBeLessThan(1000);
  });
  test('ничья при равных почти не меняет', () => {
    expect(applyResult(1000, 1000, 'draw')).toBe(1000);
  });
  test('победа над сильным даёт больше, чем над слабым', () => {
    const vsStrong = applyResult(1000, 1400, 'win') - 1000;
    const vsWeak = applyResult(1000, 600, 'win') - 1000;
    expect(vsStrong).toBeGreaterThan(vsWeak);
  });
  test('не уходит ниже 0', () => {
    expect(applyResult(5, 2000, 'loss')).toBeGreaterThanOrEqual(0);
  });
});

describe('tierFor', () => {
  test('границы тиров', () => {
    expect(tierFor(START_RATING).name).toBe('Bronze');
    expect(tierFor(1099).name).toBe('Bronze');
    expect(tierFor(1100).name).toBe('Silver');
    expect(tierFor(1300).name).toBe('Gold');
    expect(tierFor(1500).name).toBe('Platinum');
    expect(tierFor(1700).name).toBe('Diamond');
    expect(tierFor(9999).name).toBe('Diamond');
  });
});
