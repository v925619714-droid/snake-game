/// <reference types="jest" />
import {
  addCoins,
  buySkin,
  canBuy,
  initialWallet,
  isOwned,
  sanitizeWallet,
  selectSkin,
  type Wallet,
} from './economy';
import { getSkin } from './skins';

const gold = getSkin('gold'); // price 50
const ice = getSkin('ice'); // price 80

describe('initialWallet', () => {
  test('старт: 0 монет, classic во владении и выбран', () => {
    const w = initialWallet();
    expect(w.coins).toBe(0);
    expect(w.owned).toEqual(['classic']);
    expect(w.selected).toBe('classic');
  });
});

describe('addCoins', () => {
  test('добавляет монеты', () => {
    expect(addCoins(initialWallet(), 10).coins).toBe(10);
  });
  test('не уходит в минус и игнорирует <= 0', () => {
    const w = addCoins(initialWallet(), -5);
    expect(w.coins).toBe(0);
  });
});

describe('canBuy / buySkin', () => {
  test('нельзя купить без денег', () => {
    const w = initialWallet();
    expect(canBuy(w, gold)).toBe(false);
    expect(buySkin(w, gold)).toBe(w);
  });
  test('покупка списывает монеты, добавляет владение и выбирает', () => {
    let w: Wallet = addCoins(initialWallet(), 100);
    expect(canBuy(w, gold)).toBe(true);
    w = buySkin(w, gold);
    expect(w.coins).toBe(50);
    expect(isOwned(w, 'gold')).toBe(true);
    expect(w.selected).toBe('gold');
  });
  test('повторно купить уже купленный нельзя', () => {
    let w = buySkin(addCoins(initialWallet(), 100), gold);
    const before = w.coins;
    w = buySkin(w, gold);
    expect(w.coins).toBe(before);
  });
  test('ровно хватает монет', () => {
    const w = buySkin(addCoins(initialWallet(), 50), gold);
    expect(w.coins).toBe(0);
    expect(isOwned(w, 'gold')).toBe(true);
  });
});

describe('selectSkin', () => {
  test('нельзя выбрать невладеемый скин', () => {
    const w = addCoins(initialWallet(), 100);
    expect(selectSkin(w, 'ice').selected).toBe('classic');
  });
  test('можно выбрать купленный', () => {
    let w = buySkin(addCoins(initialWallet(), 200), gold);
    w = buySkin(w, ice);
    w = selectSkin(w, 'gold');
    expect(w.selected).toBe('gold');
  });
});

describe('sanitizeWallet', () => {
  test('битые данные → валидный кошелёк с classic', () => {
    const w = sanitizeWallet({ coins: -3, owned: 'oops', selected: 'ghost' });
    expect(w.coins).toBe(0);
    expect(w.owned).toContain('classic');
    expect(w.selected).toBe('classic');
  });
  test('сохраняет корректные данные', () => {
    const w = sanitizeWallet({ coins: 70, owned: ['classic', 'gold'], selected: 'gold' });
    expect(w).toEqual({ coins: 70, owned: ['classic', 'gold'], selected: 'gold' });
  });
});
