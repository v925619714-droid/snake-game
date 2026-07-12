// Чистый рейтинг ELO + тиры.
export const START_RATING = 1000;
const K = 32;

export type MatchResult = 'win' | 'loss' | 'draw';

export function expectedScore(rating: number, oppRating: number): number {
  return 1 / (1 + Math.pow(10, (oppRating - rating) / 400));
}

const SCORE: Record<MatchResult, number> = { win: 1, draw: 0.5, loss: 0 };

// Возвращает новый рейтинг (не ниже 0).
export function applyResult(rating: number, oppRating: number, result: MatchResult): number {
  const e = expectedScore(rating, oppRating);
  const next = rating + K * (SCORE[result] - e);
  return Math.max(0, Math.round(next));
}

export interface Tier {
  name: string;
  min: number;
  color: string;
}

export const TIERS: Tier[] = [
  { name: 'Bronze', min: 0, color: '#cd7f32' },
  { name: 'Silver', min: 1100, color: '#c0c0c0' },
  { name: 'Gold', min: 1300, color: '#f1c40f' },
  { name: 'Platinum', min: 1500, color: '#5cc8ff' },
  { name: 'Diamond', min: 1700, color: '#b9f2ff' },
];

export function tierFor(rating: number): Tier {
  let t = TIERS[0];
  for (const x of TIERS) if (rating >= x.min) t = x;
  return t;
}
