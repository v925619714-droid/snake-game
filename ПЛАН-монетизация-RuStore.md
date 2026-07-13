# План: монетизация в RuStore (RuStore Billing SDK + серверная валидация)

> Решение Владимира (2026-07-13): путь **A** — родной RuStore Billing SDK в приложении + валидация покупок на нашем бэкенде 37427. Причина: монетизация под Apple заблокирована (проблемы с аккаунтом), а RuStore можно; заодно чиним дыру «сервер доверяет клиенту по монетам».

## Что сейчас (по коду)

- Платная поверхность = **3 пакета монет** (100/600/1500, `src/lib/iap.ts`) на **`expo-iap`** → только Apple StoreKit + Google Play Billing.
- Монеты тратятся на **скины** (`src/game/economy.ts`, `skins.ts`). Монеты также зарабатываются в игре (дейлики/квесты/стрик).
- Кошелёк клиентский (AsyncStorage), синкается в `profiles.coins` через `pushWallet`, но **сервер не верифицирует** покупки/начисления.
- На RuStore-APK `expo-iap` не работает (Play Billing требует установку из Google Play) → `fetchCoinPacks()` возвращает `[]` → магазин прячется → **монетизации нет**.

## Целевая схема

RuStore Billing SDK делает покупку → клиент шлёт `purchaseId` на наш сервер → сервер валидирует покупку через RuStore API → начисляет монеты в `profiles.coins` (service_role, идемпотентно по `purchaseId`) → клиент `confirmPurchase` (consume) и перечитывает баланс. Кошелёк по монетам становится **серверным** (античит).

## Компоненты и кто делает

### 1. Клиент (RN/Expo) — Claude (headless, компилируется, но тест на устройстве за комп 1)
- Пакет `react-native-rustore-billing-sdk` (git с gitflic), нативный `ru.rustore.sdk:billingclient` — через prebuild+autolinking.
- **Config-plugin** `plugins/withRustoreBilling.js`: deeplink intent-filter в AndroidManifest (scheme `snakerustore`) + maven-репо RuStore.
- Флаг сборки **`EXPO_PUBLIC_STORE=rustore`** на профиле `production-apk` → `iap.ts` выбирает RuStore-провайдер (на iOS/web/Play — прежний `expo-iap`).
- Новый `src/lib/iapRustore.ts`: `init(consoleApplicationId, deeplinkScheme)` / `checkPurchasesAvailability` / `getProducts` / `purchaseProduct` / `confirmPurchase`. Те же SKU.

### 2. Сервер 37427 — Claude (headless)
- HTTP-эндпоинт валидации на gameserver (Node/Colyseus express): `POST /iap/rustore/validate` `{purchaseId, sku}` + Bearer (JWT юзера). Проверяет платёж через RuStore API (ключ keyId `2351029770`, приватный ключ на сервере), при успехе начисляет монеты, возвращает новый баланс.
- Таблица `processed_purchases(purchase_id PK, user_id, sku, coins, created_at)` — идемпотентность (повторный validate не начисляет дважды).
- Начисление — service_role, минуя клиентский `pushWallet`.

### 3. RuStore Console — Владимир / комп 1
- Включить покупки для приложения `com.kanaewvs.snake`.
- Создать 3 consumable-товара с SKU **ровно** `com.kanaewvs.snake.coins100 / .coins600 / .coins1500`, задать цены (₽).
- Дать **consoleApplicationId** (код приложения из консоли) → в EAS env `EXPO_PUBLIC_RUSTORE_APP_ID`.

## Нужно от Владимира (блокеры)

1. **consoleApplicationId** (код приложения в RuStore Console) — без него SDK не инициализируется.
2. **Создать 3 товара** (SKU выше) + включить покупки в консоли RuStore.
3. Подтвердить цены пакетов в ₽ (например 99 / 490 / 990 ₽ — на ваше решение).

## Тест (комп 1, на устройстве)

- Собрать `production-apk` с `EXPO_PUBLIC_STORE=rustore` + `EXPO_PUBLIC_RUSTORE_APP_ID` + `EXPO_PUBLIC_RUSTORE_VALIDATE_URL`.
- Установить на Android c установленным приложением RuStore, залогиниться в RuStore.
- Купить пакет тест-картой (Сбер test_cards) → монеты начислились → скин покупается. Повторный запуск не дублирует начисление.

## Оценка

~3-5 раб. дней кода (клиент+сервер) + тест на устройстве (комп 1) + модерация RuStore. Не зависит от проблем с Apple.

---

*Связано: `src/lib/iap.ts`, `src/game/economy.ts`, релиз 1.2.0 (`ИНСТРУКЦИЯ-релиз-1.2.0-переезд.md`). Источники SDK: github.com/rustore-dev/react-native-rustore-billing-sdk, rustore.ru/help/en/sdk/pay/react-native.*
