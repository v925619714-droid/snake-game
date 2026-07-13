// Каталог consumable-пакетов монет. SKU должны 1:1 совпадать с продуктами в
// ASC / Play Console / RuStore Console. Вынесено из iap.ts отдельным модулем, чтобы
// провайдеры (expo-iap и RuStore) делили один каталог без циклического импорта.
export const COIN_PACKS: { sku: string; coins: number }[] = [
  { sku: 'com.kanaewvs.snake.coins100', coins: 100 },
  { sku: 'com.kanaewvs.snake.coins600', coins: 600 },
  { sku: 'com.kanaewvs.snake.coins1500', coins: 1500 },
];

export interface CoinPack {
  sku: string;
  coins: number;
  price: string; // локализованная цена из стора ("$0.99" / "99 ₽")
}
