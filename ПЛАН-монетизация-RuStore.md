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

## Состояние на 2026-07-14

**Готово в коде (Claude, headless, компилируется — tsc 0 / jest 120, non-breaking):**
- Клиент: `iapProducts.ts`, `iapRustore.ts` (Pay SDK: purchase → invoiceId → серверная валидация → грант), `iap.ts` делегирует по флагу. Под Pay SDK: покупку подтверждает СЕРВЕР (:confirm), клиент — нет.
- Сервер: `server/src/iap.ts` — роут `POST /iap/rustore/validate` (проверка GoTrue-JWT + Public-Token RuStore + чтение статуса инвойса + идемпотентное начисление). Смонтирован в `index.ts`. Миграция `server/migrations/03-iap.sql` (таблица `processed_purchases` + RPC `grant_coins`, только service_role).
- URL валидации: `https://snake-rt.skillmake.ru/iap/rustore/validate` → `EXPO_PUBLIC_RUSTORE_VALIDATE_URL`.

⚠️ **RuStore переводит всех с BillingClient на Pay SDK до 01.08.2026** — мы уже на Pay SDK (пакет v10 `sdk/pay/react-native`), это правильный путь, старый BillingClient не брать.

## Что сам сделать НЕ могу (нужен человек)

- **RuStore Console** (app-code + товары): требует вход под аккаунтом разработчика — мне ввод логина/паролей запрещён, а залогиненного Chrome не подключено. → делает Владимир/комп 1.
- **Тест покупки**: RuStore Billing требует установленного приложения RuStore + авторизации + реальной/тестовой оплаты — **на эмуляторе не работает**, нужен реальный Android-девайс. → комп 1.

## Нужно от Владимира / комп 1 (блокеры)

**1. RuStore Console → взять app-code и создать товары** (console.rustore.ru → приложение Shake Work Off):
   - Раздел «Монетизация / Платные услуги» → включить покупки.
   - Создать 3 **потребляемых** (consumable) товара с SKU **ровно**:
     `com.kanaewvs.snake.coins100`, `com.kanaewvs.snake.coins600`, `com.kanaewvs.snake.coins1500`.
   - Цены (предлагаю): **99 / 490 / 990 ₽** (подтвердить/поменять).
   - Скопировать **ID приложения** (число из URL/карточки приложения) — это `consoleApplicationId`.

**2. Сервер 37427** — комп 1 добавляет в `/opt/snake-backend/.env` (значения не в чат/git):
   `RUSTORE_APP_ID=<app-code>`, `RUSTORE_KEY_ID=2351029770`, `RUSTORE_PRIVATE_KEY=<PEM>`, `JWT_SECRET`/`SERVICE_KEY` (уже есть), затем миграция `03-iap.sql` + пересборка gameserver.

**3. EAS env (профиль production-apk)**: `EXPO_PUBLIC_STORE=rustore`, `EXPO_PUBLIC_RUSTORE_APP_ID=<app-code>`, `EXPO_PUBLIC_RUSTORE_VALIDATE_URL=https://snake-rt.skillmake.ru/iap/rustore/validate`. Плюс `npm i` пакета SDK + `"scheme":"snakerustore"` в app.json (деплинк возврата с оплаты).

## Тест (комп 1, на устройстве)

- Собрать `production-apk` с `EXPO_PUBLIC_STORE=rustore` + `EXPO_PUBLIC_RUSTORE_APP_ID` + `EXPO_PUBLIC_RUSTORE_VALIDATE_URL`.
- Установить на Android c установленным приложением RuStore, залогиниться в RuStore.
- Купить пакет тест-картой (Сбер test_cards) → монеты начислились → скин покупается. Повторный запуск не дублирует начисление.

## Оценка

~3-5 раб. дней кода (клиент+сервер) + тест на устройстве (комп 1) + модерация RuStore. Не зависит от проблем с Apple.

---

*Связано: `src/lib/iap.ts`, `src/game/economy.ts`, релиз 1.2.0 (`ИНСТРУКЦИЯ-релиз-1.2.0-переезд.md`). Источники SDK: github.com/rustore-dev/react-native-rustore-billing-sdk, rustore.ru/help/en/sdk/pay/react-native.*
