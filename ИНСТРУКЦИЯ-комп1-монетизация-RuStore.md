# Инструкция компу 1: включить монетизацию змейки в RuStore

> Что уже сделано (Claude, headless): клиент под RuStore Pay SDK + серверный эндпоинт валидации + миграция БД. Всё за флагом `EXPO_PUBLIC_STORE=rustore` (текущие сборки не трогает). Твоя часть — то, что требует входа под аккаунтом RuStore и реального Android-устройства. Порядок шагов важен: сначала консоль (0), потом сервер (A), потом сборка (B), тест (C), заливка (D).

Все команды — из папки `snake-game`. SSH на 37427: `ssh -i C:\ssh\nl-designer root@151.245.137.127`. Начни с `git pull`.

---

## 0. RuStore Console — товары и app-code (Владимир/ты под аккаунтом разработчика)

console.rustore.ru → приложение **Shake Work Off** (`com.kanaewvs.snake`):

1. Раздел монетизации → **включить покупки (in-app)**.
2. Создать **3 потребляемых (consumable)** товара, SKU **ровно** (иначе не сматчатся):
   - `com.kanaewvs.snake.coins100` — 100 монет
   - `com.kanaewvs.snake.coins600` — 600 монет
   - `com.kanaewvs.snake.coins1500` — 1500 монет
   Цены (предложение): **99 / 490 / 990 ₽** — можно поменять. Активировать товары.
3. Скопировать **ID приложения** (число из карточки/URL приложения в консоли) — это `consoleApplicationId` (далее `<APP_ID>`).

> Ключ RuStore для сервера уже есть: keyId `2351029770` + приватный ключ (в `SECRETS.local.md`, положить файлом — см. A2). ⚠️ Если платёжный API отклонит ключ (нет доступа к Payments API) — в консоли выдать этому ключу право на API платежей или создать ключ с нужным доступом.

## A. Сервер 37427 — эндпоинт валидации + начисление

**A1.** На сервере обновить код gameserver:
```bash
cd /opt/snake-backend
git -C <путь_к_репо_server_или_скопировать_gameserver> pull   # см. как устроен деплой gameserver у тебя
```
(gameserver собирается из `snake-game/server/` в `/opt/snake-backend/gameserver/`. Синхронизируй новые файлы `src/iap.ts`, `src/index.ts`, `migrations/03-iap.sql` так же, как заливал его в прошлый раз.)

**A2.** Положить приватный ключ RuStore файлом и прописать env. В `/opt/snake-backend/`:
```bash
# приватный ключ RuStore (PKCS#8 PEM) — из SECRETS.local.md, НЕ в git:
nano gameserver/rustore-private-key.pem     # вставить PEM, сохранить
chmod 600 gameserver/rustore-private-key.pem
```
В `.env` (или в блок `environment:` сервиса gameserver в `docker-compose.override.yml`) добавить:
```
RUSTORE_APP_ID=<APP_ID>
RUSTORE_KEY_ID=2351029770
RUSTORE_PRIVATE_KEY_FILE=/app/rustore-private-key.pem
JWT_SECRET=<уже есть в .env, тот же что у GoTrue>
SERVICE_KEY=<уже есть в .env, service_role JWT>
PGRST_URL=http://postgrest:3000
# RUSTORE_SANDBOX=1   # включить на время теста песочницей, потом убрать
```
И примонтировать ключ + прокинуть env в контейнер gameserver (в `docker-compose.override.yml`, сервис gameserver):
```yaml
    env_file: [.env]
    volumes:
      - ./gameserver/rustore-private-key.pem:/app/rustore-private-key.pem:ro
```

**A3.** Накатить миграцию БД (таблица идемпотентности + RPC начисления):
```bash
docker compose exec -T postgres psql -U postgres -d postgres < gameserver/migrations/03-iap.sql
# (имя БД/юзера — как в вашем .env POSTGRES_*; проверь docker compose ps → сервис postgres)
```

**A4.** Пересобрать и поднять только gameserver:
```bash
docker compose up -d --build gameserver
docker compose logs --tail=30 gameserver     # старт без ошибок
```

**A5.** Проверить, что роут смонтирован (без токена должен вернуть 401, не 404):
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://snake-rt.skillmake.ru/iap/rustore/validate \
  -H "Content-Type: application/json" -d '{}'
# 401 = роут жив (нет авторизации). 404 = код не подхватился (проверь A1/A4).
```

## B. Сборка клиента (EAS, профиль production-apk)

**B1.** Поставить RuStore Pay SDK (git-зависимость) и деплинк возврата:
```powershell
npm install "git+https://git@gitflic.ru/project/rustore/react-native-rustore-billing-sdk.git"
```
В `app.json` в блок `expo` добавить строку: `"scheme": "snakerustore",` (деплинк возврата с оплаты).

**B2.** Прописать EAS-переменные на профиль **production-apk** (Preview/Production — как заведено):
```powershell
npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_STORE --value rustore --visibility plaintext
npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_RUSTORE_APP_ID --value <APP_ID> --visibility plaintext
npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_RUSTORE_VALIDATE_URL --value https://snake-rt.skillmake.ru/iap/rustore/validate --visibility plaintext
```
> ⚠️ `EXPO_PUBLIC_STORE=rustore` включает RuStore-путь для ВСЕХ production-сборок. Для iOS/Play-сборки его быть НЕ должно. Мы собираем RuStore отдельным профилем `production-apk` — держи флаг только там; если iOS/Play собираешь тем же production-env, вынеси флаг в отдельный профиль или env-scope.

**B3.** Поднять versionCode и собрать APK:
```powershell
npx eas-cli@latest build --platform android --profile production-apk
```

## C. Тест на РЕАЛЬНОМ устройстве (эмулятор не подходит — нужен установленный RuStore)

1. Скачать APK из EAS, поставить на Android, где установлено и залогинено приложение **RuStore**.
2. В игре открыть магазин → секция паков монет должна показать цены из RuStore.
3. Купить пак тест-картой (Сбер [test_cards](https://securepayments.sberbank.ru/wiki/doku.php/test_cards)) → монеты начислились, скин покупается.
4. Перезапустить приложение → **повторного начисления НЕТ** (идемпотентность).
5. Сервер: `docker compose logs --tail=50 gameserver` без ошибок; в БД появилась строка:
   ```bash
   docker compose exec -T postgres psql -U postgres -d postgres -c "select invoice_id,sku,coins,user_id from processed_purchases order by created_at desc limit 5;"
   ```

> Если покупка проходит, а монеты не начисляются — смотри логи gameserver: скорее всего (а) платёжный ключ без доступа к Payments API, или (б) поля статуса/продукта в ответе RuStore называются иначе, чем ожидает `server/src/iap.ts` (`purchaseState`/`status`, `productId`). Пришли мне тело ответа RuStore из лога — поправлю парсинг под реальную схему (тестировать вживую я не мог).

## D. Заливка в RuStore

APK с монетизацией залить в RuStore Console как обновление (versionCode выше текущего). После одобрения товары станут покупаемыми у пользователей.

## Откат

Проблемы? Собери `production-apk` **без** `EXPO_PUBLIC_STORE=rustore` — вернётся прежний путь (expo-iap → на RuStore-APK просто прячет магазин, ничего не ломает). Серверный эндпоинт и миграция инертны, пока клиент их не зовёт.

---

*Код: `src/lib/iapRustore.ts`, `src/lib/iap.ts`, `server/src/iap.ts`, `server/migrations/03-iap.sql`. Общий план — `ПЛАН-монетизация-RuStore.md`. Пакет SDK v10 = RuStore Pay SDK (BillingClient deprecated с 01.08.2026 — не брать).*
