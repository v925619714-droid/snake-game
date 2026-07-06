# Shake Work Off — анализ проекта и план развития

> Источник: реальный код репозитория (`App.tsx`, `src/`, `package.json`, `app.json`, `eas.json`, `supabase/profiles.sql`, аудит-файлы). Тесты: 11 suites, 120 тестов — все зелёные.

---

## 0. Краткая сводка по текущему состоянию

### Что уже сделано и работает

- **Соло-режим** (`src/game/logic.ts`, `App.tsx`): классическая змейка 17×17, сквозные стены, очередь поворотов (`MAX_TURN_QUEUE = 2`), жирная еда `fatFood`, скины, рекорд, монеты.
- **1v1 Color Duel / Versus** (`src/screens/DuelGame.tsx`, `src/game/duel.ts`, `src/net/useRoom.ts`): best-of-3, еда своего/чужого цвета, жирная еда, бот-фолбэк через 7–8 секунд, инвайт по ссылке `?room=CODE`.
- **Ranked** (`DuelGame.tsx`, `src/game/rating.ts`, `src/lib/leaderboard.ts`): клиентский ELO + серверный ELO через RPC `submit_match`, тиры Bronze→Diamond.
- **Office Royale** (`src/screens/PartyGame.tsx`, `src/game/party.ts`, `src/net/usePartyRoom.ts`): FFA 5–10 игроков, best-of-2 раундов, лобби по коду, ставка «winner doesn't work today», инвайт `?party=CODE`, практика против ботов.
- **Экономика/скины** (`src/game/economy.ts`, `src/game/skins.ts`): 6 скинов за внутриигровые монеты, нет реальных платежей.
- **Удержание** (`daily.ts`, `quests.ts`, `streak.ts`): ежедневная награда, 3 дейли-квеста, серии побед в ranked.
- **Аккаунты** (`src/lib/auth.ts`, `src/lib/profile.ts`, `src/lib/leaderboard.ts`): анонимный вход Supabase Auth + email OTP + кросс-девайс синхронизация кошелька/рейтинга, удаление аккаунта.
- **Аналитика** (`src/lib/analytics.ts`): PostHog HTTP capture, ~30 событий.
- **Тема/UX** (`src/theme/tokens.ts`, `src/ui/anim.tsx`): единая Neon Arena палитра, TouchScale, Confetti, FadePop.
- **Кроссплатформа**: Expo SDK 56, React Native 0.85, iOS/Android/web. Web-версия на `snake.skillmake.ru`.
- **ASO/стора**: метаданные, скриншоты, privacy policy, App Store readiness audit.

### Главные боли (выявлено по коду)

1. **App.tsx — 1301 строка, смешаны состояние всего приложения, сольная игра и UI.** Это главный техдолг. Добавление любой фичи в меню/соло требует трогать этот файл.
2. **Мультиплеер на Supabase Broadcast** — хост-authoritative, но без настоящего prediction/interpolation: при потере пакета/лаге у гостя рывки. Watchdog есть, но он лечит симптом, не причину.
3. **Экономика не монетизируется.** Монеты только за игру; покупки за реальные деньги отсутствуют. ARPU ≈ 0.
4. **Retention-механики слабые для офисной аудитории.** Нет сезонов, пасов, командных лидербордов, пушей, событий.
5. **Рост и виральность в зачаточном состоянии.** Шеринг есть, но нет реферальной петли, нет invite-наград, нет корпоративных «команд/офисов» как долгоживущих сущностей.
6. **Android-релиз не подготовлен.** iOS — на ревью (билд 5), Android — «в планах».
7. **Производительность рендера змейки** — каждый сегмент рендерится отдельным `<View>` с `transform`. На поле 17×17 и маленьких змеях это ок, но в Office Royale (30–40×30) на слабых Android это будет проседать.

---

## 1. Игровая механика и фичи

### 1.1 Глубина соло-режима

**Что сейчас.** `src/game/logic.ts`: поле 17×17, одна еда, жирная еда, рекорд. Скорость `speedFor(score) = max(70, 160 - score*4)` — линейное ускорение. Цель — только набрать score.

**Что улучшить.**

1. **Режимы сложности в соло** (`src/game/logic.ts` + новый экран/параметр).
   - `Easy`: поле 21×21, скорость растёт медленнее, больше `fatFood`.
   - `Classic`: текущий 17×17.
   - `Hard`: поле 15×15, стены НЕ сквозные (смерть от стены), меньше еды.
   - *Зачем*: повышает реиграбельность и даёт новичку мягкий вход, а хардкорщику — челлендж.
   - *Файлы*: `src/game/logic.ts` (добавить `boardSize` и `wallsWrap` в `GameState`), `App.tsx` (выбор режима перед стартом), `src/lib/analytics.ts` (событие `soloModeSelected`).

2. **Модификаторы раунда** (per-run бонусы/моды).
   - `Double Coins`, `Slow Motion first 30s`, `Tiny Head` (меньше хитбокс головы), `Magnet` (еда притягивается на 1 клетку).
   - *Зачем*: каждый заход отличается; связка с монетизацией (смотреть рекламу за мод).
   - *Файлы*: `src/game/logic.ts` (`step`, `createInitialState`), `App.tsx`, `economy.ts`.

3. **Солочелленджи / еженедельные миссии** (дополнение к `quests.ts`).
   - «Проживи 60 секунд», «Набери 50 без жирной еды», «Съешь 10 жирных ед».
   - *Зачем*: цели кроме рекорда; retention.
   - *Файлы*: `src/game/quests.ts` (расширить `POOL`), `App.tsx` (трекать время жизни, fatFood eaten).

### 1.2 Глубина Color Duel (1v1 / ranked)

**Что сейчас.** `src/game/duel.ts`: best-of-3, две змейки, еда цветами, жирная еда, раунд кончается только при краше. Бот идеален (`BOT_MISTAKE_RATE = 0` в `src/game/bot.ts`).

**Что улучшить.**

1. **Регулируемая сложность бота** (`src/game/bot.ts`).
   - Ввести `BOT_MISTAKE_RATE` в зависимости от рейтинга/выбора: для новичка 0.12, для Diamond 0.0.
   - *Зачем*: сейчас бот непобедим на высокой скорости, новички получают 0:3 и уходят.
   - *Файлы*: `src/game/bot.ts`, `src/net/useRoom.ts` (`startBotMatch` передаёт `difficulty`), `src/screens/DuelGame.tsx`.

2. **Power-ups в дуэли** (новая сущность в `src/game/duel.ts`).
   - `Shield` (1 тик неуязвимости к чужому цвету/столкновению), `Ghost` (проход сквозь тело на 3 тика), `Reverse controls` (наложить на соперника).
   - *Зачем*: глубина, come-back механика, зрелищность.
   - *Файлы*: `src/game/duel.ts` (`Food` / `PowerUp`, `duelStep`), `DuelGame.tsx` (рендер иконок), `src/game/bot.ts` (учёт power-ups).

3. **Таймер-раунд как альтернатива**.
   - Сейчас раунд может длиться вечно, если оба осторожничают. Добавить `ROUND_TICK_LIMIT = 600` (~90 сек) и победу по `roundScore` + длине.
   - *Зачем*: сокращает сессию, удобно для офисного перерыва.
   - *Файлы*: `src/game/duel.ts`, `DuelGame.tsx` (HUD таймер).

### 1.3 Глубина Office Royale (party)

**Что сейчас.** `src/game/party.ts`: FFA, best-of-2, сквозные стены, жирная еда растёт от числа живых. Практика против ботов. Сетевой режим — лобби, ставка, зритель.

**Что улучшить.**

1. **Роли в командном режиме**.
   - `Teams` (2 команды по 3–5): змейки одной команды не убивают друг друга, цель — последняя команда.
   - `Tag Team`: после смерти игрок пересаживается в зритель, но может «отомстить» одноразовым power-up.
   - *Зачем*: офисы играют командами (отдел vs отдел), виральность внутри компании.
   - *Файлы*: `src/game/party.ts` (`PartyState.team?: number[]`, коллизии), `PartyGame.tsx` (выбор режима), `usePartyRoom.ts` (roster).

2. **Арены/карты**.
   - Добавить препятствия на поле (столы/кубики в офисе). Например, 4 клетки-препятствия в центре, через которые нельзя пройти.
   - *Зачем*: вариативность, тактика, тема.
   - *Файлы*: `src/game/party.ts` (`obstacles: Point[]`, `partyStep`), `PartyBoard` в `PartyGame.tsx`.

3. **Мини-ивенты внутри матча**.
   - `Fog of war` (видимость 10×10 вокруг головы) на 30 секунд, `Low gravity` (скорость падает), `Golden rush` (жирная еда каждые 20 тиков).
   - *Зачем*: зрелищность, replayability.
   - *Файлы*: `src/game/party.ts`, `PartyGame.tsx`.

4. **Более умные боты для практики**.
   - Сейчас `partyBot.ts` просто избегает тел и идёт к еде. Добавить агрессию (пытаться блокировать игрока), уход от лобовых, учёт жирной еды.
   - *Зачем*: практика должна готовить к реальным игрокам.
   - *Файлы*: `src/game/partyBot.ts`.

### 1.4 Кастомизация и прогрессия

**Что сейчас.** 6 скинов за монеты (`src/game/skins.ts`). Нет аватаров, титулов, эмодзи, следов.

**Что добавить.**

1. **Следы/частицы** (`src/ui/anim.tsx` + `skins.ts`).
   - Скин может задавать `trail: boolean`, `particles: 'sparkle' | 'smoke'`.
   - *Зачем*: визуальная ценность премиум-скинов.
   - *Файлы*: `src/game/skins.ts`, `App.tsx`/`DuelGame.tsx`/`PartyGame.tsx` (рендер следа за хвостом).

2. **Титулы и аватары**.
   - Титул за тир (`Diamond — Office Legend`), за победы, за участие в 50 party.
   - Аватарки из 2–3 букв имени + цвет тира (уже частично в `Leaderboard.tsx`).
   - *Зачем*: социальный статус, стимул играть ranked.
   - *Файлы*: `src/lib/profile.ts` (`titles: string[]`), `Leaderboard.tsx`, `Account.tsx`.

3. **Коллекционные наборы скинов**.
   - «Office Pack» (костюм, галстук, кофе), «Neon Pack», «Holiday Pack».
   - *Зачем*: monetization + seasonal content.
   - *Файлы*: `src/game/skins.ts`, экономика/IAP.

---

## 2. Техническое

### 2.1 Архитектура и рефакторинг

**Проблема №1: App.tsx — God-component.**

- В файле 1301 строка. Хранит состояние меню, соло, wallet, daily, quests, streak, профиль, auth, shop overlay, quests overlay, onboarding, keyboard/swipe, D-pad, стили.
- **Рефакторинг:**
  - Вынести сольную игру в `src/screens/SoloGame.tsx`. `App.tsx` становится роутером + загрузчиком глобального состояния.
  - Вынести меню в `src/screens/Menu.tsx`.
  - Вынести состояние wallet/progress в `src/hooks/useWallet.ts` (или React Context), чтобы не прокидывать через пропсы.
  - Вынести глобальную инициализацию (профиль, аккаунт, daily, quests) в `src/hooks/useBootstrap.ts`.
- **Файлы для изменения:** `App.tsx`, новые `src/screens/SoloGame.tsx`, `src/screens/Menu.tsx`, `src/hooks/useWallet.ts`, `src/hooks/useBootstrap.ts`.
- **Impact:** высокий (упрощает дальнейшую разработку). **Effort:** высокий (2–3 дня + тестирование).

**Проблема №2: Дублирование управления и UI между режимами.**

- `Dpad`, свайп, keyboard-обработка, рендер змейки продублированы в `App.tsx` (соло), `DuelGame.tsx`, `PartyGame.tsx`.
- **Рефакторинг:**
  - Создать `src/ui/GameControls.tsx` (`Dpad`, `useSwipe`, `useKeyboardTurn`).
  - Создать `src/ui/SnakeRenderer.tsx` и `src/ui/FoodRenderer.tsx` (общие для всех режимов с учётом `skin`/`color`).
- **Файлы:** `src/ui/GameControls.tsx`, `src/ui/SnakeRenderer.tsx`, `src/ui/FoodRenderer.tsx`.
- **Impact:** высокий. **Effort:** средний.

**Проблема №3: Локальное состояние vs облако.**

- Сейчас `App.tsx` одновременно пишет в `AsyncStorage` и вызывает `pushWallet`/`pushProfile`. Есть риск рассинхронизации (например, `reconciledRef` не всегда надёжен).
- **Решение:**
  - Сделать `src/lib/sync.ts` с единой функцией `saveProgress(wallet, best)`.
  - Всегда писать локально, затем фоном пушить в облако. При конфликте — сервер является авторитетом для `rating`, локальное — для `best`/`coins` (с мержем).
- **Файлы:** `src/lib/sync.ts`, `App.tsx`, `src/lib/leaderboard.ts`.
- **Impact:** средний. **Effort:** средний.

### 2.2 Производительность рендера

**Проблема:** змейка рисуется как массив `<View>` с `transform: translateX/Y`. В `PartyGame.tsx` (`PartyBoard`) на каждый тик пересоздаётся весь массив сегментов. На больших полях и слабых Android это будет тормозить.

**Решения:**

1. **Мемоизация сегментов.**
   - В `SnakeRenderer` использовать `memo` + `key` по индексу. Тело змейки меняется каждый тик, но цвет/форма сегмента — нет.
   - *Файлы:* `src/ui/SnakeRenderer.tsx`.

2. **FlatList / Canvas для больших полей.**
   - Для Office Royale рассмотреть `react-native-skia` (но это новая зависимость) или хотя бы уменьшить `padding`/`borderRadius` на слабых устройствах.
   - Быстрый win: отключить `shadow*` на каждой клетке для Android (`elevation` достаточно).
   - *Файлы:* `src/screens/PartyGame.tsx` (`PartyBoard` стили).

3. **Избежать лишних ре-рендеров в `App.tsx`.**
   - Сейчас `foodPulse` (Animated.Value) и `setInterval` не пересоздаются, но `App.tsx` всё равно ре-рендерится на каждый тик соло. После разделения на `SoloGame.tsx` это уйдёт.

### 2.3 Стабильность мультиплеера и нетворкинг

**Проблема:** Supabase Broadcast — fire-and-forget, без гарантий порядка/доставки. Хост рассылает `state` каждые 150 мс; гость дропает устаревшие по `seq`. При лаге — рывки.

**Решения (по возрастанию сложности):**

1. **Клиентская интерполяция (быстрый win).**
   - Гость не сразу применяет `state`, а сохраняет 2 последних состояния и интерполирует змейку между ними. Добавляет ~150 мс задержки, но убирает рывки.
   - *Файлы:* `src/net/useRoom.ts` (сохранять history), `DuelGame.tsx`/`PartyGame.tsx` (рендерить интерполированное состояние).
   - **Impact:** высокий. **Effort:** средний.

2. **Input prediction + server reconciliation pattern.**
   - Гость мгновенно применяет свой ввод локально, но продолжает получать авторитетное состояние от хоста. Если расхождение — плавно сводить к хосту (для змейки это сложно, но возможно для головы).
   - *Файлы:* `src/net/useRoom.ts` (`turn`), `src/game/duel.ts`.
   - **Impact:** высокий. **Effort:** высокий.

3. **Защита от читов в ranked.**
   - Сейчас `submit_match` принимает результат от клиента. Для надёжности оба клиента должны подтверждать исход (`host_result`, `guest_result`), сервер принимает только при совпадении (или если один не ответил за таймаут).
   - *Файлы:* `supabase/profiles.sql` (`submit_match` v3), `src/net/useRoom.ts` (отправка `result_confirm` в конце матча), `src/lib/leaderboard.ts`.
   - **Impact:** высокий. **Effort:** средний.

4. **Reconnect в party.**
   - Сейчас поздний вход — только зритель. Хост с `phello` рассылает `pstart`. Нужно разрешить reconnect игрока в свой слот, если матч ещё идёт.
   - *Файлы:* `src/net/usePartyRoom.ts`.
   - **Impact:** средний. **Effort:** средний.

### 2.4 Тестирование

**Что есть.** 120 юнит-тестов на чистую логику (`logic`, `duel`, `party`, `bot`, `partyBot`, `economy`, `daily`, `quests`, `streak`, `rating`, `analytics`).

**Чего нет.**

- Тестов на сетевые хуки (`useRoom.ts`, `usePartyRoom.ts`).
- Интеграционных/UI-тестов (`Maestro` уже есть в `.maestro/`, но сценарии не читались — нужно проверить/дописать).
- Тестов на `App.tsx` (сложно из-за размера).

**План:**

1. Добавить `src/net/useRoom.test.ts` с моком `supabase` канала. Проверить: создание комнаты, join, бот-фолбэк, forfeit win.
2. Добавить Maestro-флоу: `onboarding → solo play → menu → shop → back`.
3. После рефакторинга `App.tsx` покрыть `SoloGame.tsx` и `Menu.tsx` рендер-тестами (`@testing-library/react-native`).

### 2.5 Кроссплатформа

**iOS.** Готов к App Store (audit 2026-06-24). Остались блокеры вне кода: Apple Developer Program, email-доставка для ревьюера, заполнение ASC.

**Android.**

- Нужно настроить `eas.json` для Android production (сейчас только `production` общий + `credentialsSource: local`).
- Проверить adaptive icon (уже есть `android-icon-foreground.png` и `android-icon-background.png`).
- Добавить `android.statusBarColor`, проверить safe-area.
- Протестировать производительность на бюджетном Android — там скорее всего будут просадки в party.

**Web.**

- Уже работает на `snake.skillmake.ru`. Нужно проверить responsive на десктопе (поле ограничено 360–420 px, но на большом экране меню выглядит ок).
- Добавить SEO-страницу `/` с SSR-заглушкой или хотя бы meta-теги.

---

## 3. Монетизация

### 3.1 Модели, подходящие офисной аудитории

Офисная аудитория: платит небольшими суммами, любит «развлечь команду», ценит премиум-статус, не любит агрессивную рекламу.

#### A. Косметические IAP (рекомендуется в первую очередь)

- **Премиум-скины** за реальные деньги ($0.99–$2.99). Например, «CEO Suit», «Neon Dragon», «Office Plant».
- **Паки скинов** ($4.99 за 3 скина).
- **Battle Pass** ($6.99/сезон) с косметическими наградами, титулами, монетами.
- *Реализация:* Expo In-App Purchases (`expo-in-app-purchases` или новый `react-native-iap` с config plugin). Нужно настроить `app.json` плагин, продукты в App Store Connect / Google Play Console.
- *Файлы:* новые `src/lib/iap.ts`, `src/screens/Shop.tsx` (отдельный премиум-таб), `app.json`.

#### B. Внутриигровые монеты + ускорители

- Покупка монет пакетами ($0.99 = 100, $4.99 = 600, $9.99 = 1500).
- Монеты тратятся на скины и на «продолжить после смерти» в соло (1 раз за забег, 50 монет).
- *Зачем:* soft currency + hard currency в одном флаконе; ARPDAU растёт.

#### C. Rewarded-видео

- «Удвоить награду за матч», «+50 монет после game over», «пропустить кулдаун дейлика».
- Провайдер: Google AdMob (`react-native-google-mobile-ads`) или ironSource / Unity Ads.
- *Зачем:* не агрессивно, пользователь сам выбирает. Для офисной аудитории — приемлемо.
- *Файлы:* `src/lib/ads.ts`, интеграция в `App.tsx` (game over), `DuelGame.tsx` (match end), `PartyGame.tsx`.

#### D. Корпоративные/командные тарифы (B2B)

- **Premium Team Room**: команда покупает подписку на месяц ($9.99/команда до 20 человек) — убирает рекламу, даёт эксклюзивные командные скины, приватные комнаты, командный лидерборд.
- **Office Tournament Pack**: раз в месяц организатор создаёт турнир с таблицей, призом (внутриигровым) и брендированной ареной.
- *Зачем:* это уникальная ниша игры; конкурентов нет. Потенциально самый высокий LTV.
- *Файлы:* `src/lib/teams.ts`, `src/screens/TeamDashboard.tsx`, Supabase-таблицы `teams`, `team_members`, `team_tournaments`.

#### E. Подписка (дополнительно)

- **Shake Work Off Pro** ($2.99/мес или $19.99/год): ежедневные +50% монет, эксклюзивный скин раз в месяц, отключение рекламы, премиум-таблицы.
- *Риск:* для казуальной игры конверсия в подписку низкая. Начать лучше с IAP + rewarded.

### 3.2 Конкретные предложения по приоритету

1. **IAP-монеты + премиум-скины** — быстрый запуск ARPU. Impact: высокий, effort: средний.
2. **Rewarded ads за удвоение награды** — почти чистый прирост revenue. Impact: средний, effort: низкий.
3. **Battle Pass (сезонный)** — retention + monetization. Impact: высокий, effort: высокий.
4. **Corporate Team Pack** — уникальный канал. Impact: высокий, effort: высокий.

---

## 4. Удержание (retention)

### 4.1 Онбординг

**Что сейчас.** `src/screens/Onboarding.tsx`: 4 слайда, фокус на дуэль. Нет интерактивного туториала.

**Проблема:** новичок попадает в меню и может нажать Ranked, не зная правил дуэли. Смерть от чужого цвета = фрустрация.

**Решения:**

1. **Интерактивный туториал соло** (1 минута).
   - Подсвечивать свайпы, показать жирную еду, объяснить wrap-around walls.
   - *Файлы:* новый `src/screens/TutorialSolo.tsx`, вызов из `App.tsx` если `ONBOARDED_KEY` не установлен.

2. **Обучение в дуэли против бота**.
   - Первый заход в Versus — всегда бот, но с низкой сложностью и подсказками «eat red / avoid blue».
   - *Файлы:* `DuelGame.tsx` + флаг `firstDuelEver` в `profile.ts`.

3. **Tooltips в UI**.
   - В меню добавить бейджи «New» / «Play» / «Best for teams». В лобби Office Royale — подсказка «share this code in Slack».

### 4.2 Ежедневные механики

**Что сейчас.** `daily.ts`: награда растёт по недельному циклу. `quests.ts`: 3 квеста в день. `streak.ts`: серии побед в ranked.

**Что улучшить:**

1. **Награда за возвращение после перерыва**.
   - Если игрок не заходил 3+ дня — предложить «Comeback bonus» (100 монет + один премиум-скин на 24 часа).
   - *Файлы:* `src/game/daily.ts` (добавить `comebackBonus`), `App.tsx`.

2. **Еженедельный челлендж**.
   - «Сыграй 10 ranked / набери 500 еды в solo / выиграй 3 party» — общая шкала с наградой в конце недели.
   - *Файлы:* новый `src/game/weekly.ts`, UI в меню.

3. **Сезонный рейтинг**.
   - Рейтинг сбрасывается каждые 2–3 месяца; участники получают скин/титул по итогам сезона.
   - *Файлы:* `src/game/rating.ts` (`season` + `seasonHigh`), `Leaderboard.tsx`.

4. **Ежедневный мини-лидерборд**.
   - «Топ-10 лучших соло-рекордов сегодня» внутри региона/друзей.
   - *Файлы:* `src/lib/leaderboard.ts`, `Leaderboard.tsx`.

### 4.3 Push-уведомления

**Что сейчас.** Нет пушей.

**Что нужно:**

- `expo-notifications` + EAS.
- Типы пушей:
  - Daily reminder: «Your daily coins are waiting — claim now» (в 12:00 по локальному времени).
  - Streak restore: «You were on a 5-win streak — don't lose it!».
  - Party invite: «@name invited you to Office Royale — join now».
  - Weekly challenge complete: «Weekly challenge done — grab your reward».
- *Файлы:* новый `src/lib/notifications.ts`, вызовы в `App.tsx` (запрос разрешения), `usePartyRoom.ts` (invite).

### 4.4 Социальные фичи

1. **Друзья / recent players**.
   - После дуэли предложить «Add friend». Список друзей с онлайн-статусом.
   - *Файлы:* `src/lib/friends.ts` (Supabase таблица `friends`), новый экран `Friends.tsx`.

2. **Личные рекорды и статистика**.
   - Сколько игр, winrate, любимый режим, лучший рекорд соло.
   - *Файлы:* `Account.tsx` или новый `Stats.tsx`.

### 4.5 Ключевые метрики

- **D1/D7/D30 retention** — целевые: D1 ≥ 40%, D7 ≥ 15%, D30 ≥ 6%.
- **Average session length** — целевые: соло 4 мин, дуэль 3 мин, party 8 мин.
- **Sessions per user per day** — целевое: 2.5+.
- **Ranked matches per user per week** — целевое: 5+.
- **Share rate** — целевое: ≥ 5% пользователей шерят результат за неделю.
- **Ad impressions / IAP revenue per DAU** — отслеживать через PostHog.

---

## 5. Рост и виральность

### 5.1 Реферальные петли

**Что сейчас.** Шеринг результата и инвайт-ссылки есть (`src/lib/share.ts`, `?room=CODE`, `?party=CODE`), но нет наград за приглашение.

**Решения:**

1. **Invite rewards**.
   - Пригласивший получает 50 монет за первую игру приглашённого; приглашённый — 100 стартовых монет.
   - *Файлы:* `src/lib/share.ts` (генерация `?ref=USER_ID`), `src/lib/leaderboard.ts`/`supabase` (таблица `referrals`), `App.tsx` (проверка ref при старте).

2. **Referral leaderboard**.
   - «Top inviters this week» — социальный статус + монеты.

3. **Team invite bonus**.
   - Если в Office Royale собрать 5+ человек за один день — всем участникам 100 монет.

### 5.2 Шеринг результатов

**Что улучшить.**

1. **Карточка результата в виде изображения**.
   - Вместо текста генерировать PNG/GIF с змейкой, счётом, позицией. Для web — canvas; для native — `react-native-view-shot`.
   - *Файлы:* `src/lib/shareCard.ts`, `src/ui/ShareCard.tsx`.

2. **Предустановленные фразы**.
   - «I just won Office Royale — I don't work today 🎉» / «Beat my 47 in solo 🐍».
   - *Файлы:* `src/lib/share.ts`.

### 5.3 Корпоративный англ (teams/offices/challenges)

Это уникальная сильная сторона игры.

1. **Создание команды/офиса**.
   - Пользователь создаёт «Office: Acme Corp», получает invite-ссылку `?team=CODE`.
   - Члены команды видят друг друга в командном лидерборде.
   - *Файлы:* `src/lib/teams.ts`, `supabase/teams.sql`, `src/screens/TeamDashboard.tsx`.

2. **Еженедельные офисные челленджи**.
   - «Сыграйте 50 party-матчей вместе — откроется эксклюзивный скин для всех».
   - «Кто больше всех выиграет в дуэли на этой неделе?».

3. **Корпоративные турниры**.
   - Организатор создаёт bracket из 8 человек, играют 1v1, финал — Office Royale.
   - *Файлы:* `src/screens/Tournament.tsx`, `supabase/tournaments.sql`.

4. **Slack / Teams-интеграция**.
   - Генерация сообщения для вставки в Slack: «Join Office Royale — winner skips standup».
   - Для web — кнопка «Copy Slack message».

### 5.4 ASO и каналы привлечения

**Что уже сделано.** `store-metadata-final.md`: название, сабтайтл, ключевые слова, описание, дифференциация через `office games`.

**Что ещё сделать:**

1. **A/B-тестирование скриншотов**.
   - Вариант A: Office Royale с людьми. Вариант B: дуэль 1v1. Измерять конверсию через App Store Connect / Google Play Console.

2. **Добавить видео-превью**.
   - 15-секундное видео: «share link → 5 colleagues join → winner celebrates».

3. **Каналы привлечения:**
   - **Organic search**: snake, multiplayer, party game, office games.
   - **TikTok / Reels**: короткие ролики «who skips work today» с офисным юмором.
   - **Product Hunt / Hacker News**: позиционировать как «Snake for remote teams».
   - **B2B outreach**: предлагать компаниям корпоративный пакет.

---

## 6. UX/UI и доступность

### 6.1 Интерфейс

**Проблемы:**

1. **Главное меню перегружено кнопками.** Play, Versus, Ranked, Office Royale, Shop, Leaderboard, Quests, Settings — 8 CTA. Новый пользователь теряется.
   - *Решение:* группировка. Верхний ряд: Play (соло), Duel (Versus + Ranked внутри), Office Royale. Нижний ряд: Shop, Leaderboard, Quests.
   - *Файлы:* `src/screens/Menu.tsx` (после рефакторинга).

2. **Нет индикации загрузки при входе.**
   - `App.tsx` возвращает `<View style={styles.boot} />` пока грузятся шрифты. Нужен сплеш/логотип.
   - *Файлы:* `App.tsx`, `assets/splash-icon.png` уже настроен через `expo-splash-screen`.

3. **В соло-режиме нет паузы в меню.**
   - Пауза есть (кнопка ⏸), но нет кнопки «Menu» во время паузы. Нужно добавить «Quit to menu» с предупреждением.
   - *Файлы:* `App.tsx` (pause overlay).

4. **Ranked-lobby не показывает estimated wait time.**
   - Просто «Finding a ranked opponent…». Добавить прогресс-бар или «~7s».

### 6.2 Доступность

**Что сделано.**

- `colorblindOn()` по умолчанию включён: в дуэли чужая еда рисуется квадратом, своя — кругом (`DuelGame.tsx` строка 512).
- Хаптика отключается в настройках.
- Все интерактивные элементы имеют `accessibilityLabel`.

**Что улучшить:**

1. **Подписи цветов в дуэли**.
   - Добавить буквы R/B поверх еды или рядом с HUD. Сейчас форма помогает, но подпись надёжнее.
   - *Файлы:* `DuelGame.tsx` (рендер еды).

2. **Размер тач-зон.**
   - D-pad кнопки 58×58 px — хорошо. Свайп-зона покрывает всё поле — отлично.
   - Но кнопки в меню (Shop, Leaderboard) маленькие. Увеличить минимальную высоту до 44 px.

3. **Поддержка Dynamic Type / крупных шрифтов.**
   - Многие размеры зафиксированы (`fontSize: 13`). Добавить `allowFontScaling` и адаптивные layout.

4. **VoiceOver / TalkBack.**
   - Добавить `accessibilityRole`, `accessibilityHint` для важных кнопок.
   - Для игрового поля — announcement при game over / победе.

### 6.3 Полировка

- **Анимации переходов между экранами.** Сейчас `setMode` мгновенно меняет экран. Добавить `react-native-reanimated` или `Animated` fade/slide.
- **Toast-уведомления.** Вместо `setShareNote('Link copied!')` использовать единый toast для достижений, наград, ошибок.
- **Ошибки сети.** В `useRoom.ts` есть `netError`, но UX можно усилить: конкретное сообщение «Check your connection» и кнопка retry.

---

## 7. Приоритизация

### Этап 0 — Quick wins (1–2 недели)

| # | Задача | Impact | Effort | Файлы |
|---|--------|--------|--------|-------|
| 0.1 | Улучшить onboarding: добавить интерактивный туториал соло и бота-обучение в дуэли | Высокий | Средний | `Onboarding.tsx`, `TutorialSolo.tsx`, `DuelGame.tsx` |
| 0.2 | Rewarded ads: «удвоить награду» после game over / match end | Средний | Низкий | новый `src/lib/ads.ts`, `App.tsx`, `DuelGame.tsx` |
| 0.3 | Увеличить touch-зоны, добавить toasts, улучшить сообщения об ошибках сети | Средний | Низкий | `src/ui/anim.tsx` (Toast), `useRoom.ts`, экраны |
| 0.4 | Добавить weekly challenge и comeback bonus | Средний | Средний | `src/game/weekly.ts`, `daily.ts`, `App.tsx` |
| 0.5 | Улучшить шеринг: карточка результата + предустановленные фразы | Средний | Средний | `src/lib/shareCard.ts`, `src/ui/ShareCard.tsx` |

### Этап 1 — Средние (2–4 недели)

| # | Задача | Impact | Effort | Файлы |
|---|--------|--------|--------|-------|
| 1.1 | Рефакторинг `App.tsx`: вынести `SoloGame.tsx`, `Menu.tsx`, `useWallet.ts` | Высокий | Высокий | `App.tsx`, новые файлы |
| 1.2 | IAP: монеты и премиум-скины | Высокий | Средний | `src/lib/iap.ts`, `Shop.tsx`, `app.json` |
| 1.3 | Интерполяция состояния в мультиплеере + защита от читов через двойное подтверждение | Высокий | Средний | `useRoom.ts`, `supabase/profiles.sql` |
| 1.4 | Push-уведомления (daily, streak, party invite) | Высокий | Средний | `src/lib/notifications.ts`, `App.tsx` |
| 1.5 | Режимы сложности в соло и регулируемая сложность бота | Средний | Средний | `logic.ts`, `bot.ts`, `App.tsx` |
| 1.6 | Реферальная петля: ref=UID + награды | Высокий | Средний | `src/lib/share.ts`, `supabase/referrals.sql`, `App.tsx` |

### Этап 2 — Крупные (1–3 месяца)

| # | Задача | Impact | Effort | Файлы |
|---|--------|--------|--------|-------|
| 2.1 | Корпоративный функционал: команды, офисные лидерборды, турниры | Высокий | Высокий | `src/lib/teams.ts`, `src/screens/TeamDashboard.tsx`, `supabase/teams.sql`, `supabase/tournaments.sql` |
| 2.2 | Battle Pass / сезонный рейтинг | Высокий | Высокий | `src/game/battlePass.ts`, `src/screens/BattlePass.tsx`, `rating.ts` |
| 2.3 | Полноценная prediction + reconciliation для мультиплеера | Высокий | Высокий | `useRoom.ts`, `usePartyRoom.ts`, `duel.ts`, `party.ts` |
| 2.4 | Power-ups и модификаторы в дуэли/party | Средний | Высокий | `duel.ts`, `party.ts`, все экраны режимов |
| 2.5 | Android-релиз: EAS production, тестирование, оптимизация рендера | Высокий | Средний | `eas.json`, `PartyGame.tsx`, билды |

### Этап 3 — Стратегические (3–6 месяцев)

| # | Задача | Impact | Effort | Файлы |
|---|--------|--------|--------|-------|
| 3.1 | B2B корпоративный пакет: приватные комнаты, брендирование, админ-панель | Высокий | Высокий | новые сервисы, Supabase, web-admin |
| 3.2 | Кроссплатформенный friends/recent players + социальный граф | Средний | Высокий | `src/lib/friends.ts`, `supabase/friends.sql` |
| 3.3 | Подписка Pro | Средний | Высокий | `src/lib/iap.ts`, `src/screens/Pro.tsx` |
| 3.4 | Локализация под дополнительные языки (DE, ES, FR, PT) | Средний | Средний | i18n, `store-metadata-*.md` |

### Рекомендуемый порядок запуска

1. **Сначала quick wins**: onboarding + rewarded ads + рефералка + weekly challenge. Это дешёво и сразу поднимает retention / виральность.
2. **Затем рефакторинг `App.tsx` + IAP**. Без рефакторинга добавление монетизации будет больно; без монетизации проект не масштабируется.
3. **Параллельно улучшать мультиплеер**: интерполяция, reconnect, чит-защита. Это основа ценности игры.
4. **После стабилизации retention и revenue** — запускать корпоративный функционал и battle pass.
5. **Android-релиз** делать после iOS-soft-launch, когда основные баги найдены.

---

## 8. Выводы

**Shake Work Off** — технически зрелый прототип с сильной офисной идеей и работающим мультиплеером. Основные активы:

- Чистая, покрытая тестами игровая логика.
- Уже работают три режима: solo, 1v1/ranked, Office Royale.
- Готовы аккаунты, кросс-девайс, удаление аккаунта, privacy, ASO.

Главные риски:

1. **Техдолг в `App.tsx`** тормозит добавление фич.
2. **Нулевая монетизация** ограничивает возможность масштабировать трафик.
3. **Мультиплеер на Broadcast** достаточен для MVP, но не для коммерческого масштаба без interpolation/reconnect.
4. **Retention-механики слабы**: нет пушей, сезонов, командной социалки.

**Главная рекомендация:** в ближайшие 4–6 недель сделать рефакторинг + onboarding + rewarded ads + IAP-монеты, параллельно закрыть interpolation в мультиплеере. Это превратит проект из «хорошего MVP» в «игру, которую можно масштабировать и монетизировать».
