# UI-аудит Shake Work Off

Аудит выполнен по реальному коду после обновления: ромбовый D-pad, 5 языков, IAP. Ниже — приоритизированный список проблем с указанием файла/строки, объяснением и конкретным решением. Код не изменялся.

---

## P0 — критично (блокирует релиз или ломает UX в продакшене)

### 1. Space Grotesk не покрывает кириллицу — переводимые заголовки и кнопки падают на системный шрифт

**Файлы и строки:**
- `src/theme/tokens.ts:62-65` — `fonts.display` и `fonts.num` = `SpaceGrotesk_700Bold`, `fonts.displayMed` = `SpaceGrotesk_500Medium`.
- `App.tsx:1188` — `menuCtaText: { fontFamily: fonts.display, ... }` используется для `t('play')`, `t('versus')`, `t('party')`.
- `App.tsx:1192` — `title` (бренд не переводится, но само определение display-шрифта влияет и на другие экраны).
- `src/screens/DuelGame.tsx:646` — `title` для `t('colorDuel')` / `t('ranked')`.
- `src/screens/DuelGame.tsx:652` — `bigBtnText` для `t('start')`, `t('playAgain')`, `t('done')`, `t('tryAgain')` и т.д.
- `src/screens/PartyGame.tsx:793` — `title`.
- `src/screens/PartyGame.tsx:813` — `bigBtnText`.
- `src/screens/Onboarding.tsx:166` — `title` для слайдов.
- `src/screens/Onboarding.tsx:173` — `ctaText`.
- `src/screens/Settings.tsx:196` — `title`.
- `src/screens/Account.tsx:187` — `title`.
- `src/screens/Account.tsx:214` — `ctaText`.

**Что происходит.** Google-шрифт `Space Grotesk` поддерживает только латиницу, латиницу Extended и вьетнамские диакритики. Кириллицы в нём нет. При отсутствии глифов iOS/Android отрисуют переводимый текст системным шрифтом (San Francisco / Roboto). В результате кнопки «Играть», «Дуэль», «Рейтинг» и русские/украинские/белорусские строки будут выглядеть иначе, чем английские; на Android возможен сдвиг baseline и разная ширина, что ломает выравнивание кнопок.

**Решение.** Для всего переводимого текста использовать `Inter`, у которого есть кириллица и латинские диакритики. `Space Grotesk` оставить только для:
- брендового логотипа `SHAKE WORK OFF` (он не переводится);
- чисто числовых значений (`fonts.num` для счёта, рейтинга, кодов комнат).

Конкретно:
```ts
// tokens.ts
export const fonts = {
  display: 'SpaceGrotesk_700Bold',   // только логотип / непереводимые бренд-элементы
  displayMed: 'SpaceGrotesk_500Medium',
  num: 'SpaceGrotesk_700Bold',       // цифры
  text: 'Inter_600SemiBold',         // переводимые заголовки и CTA
  body: 'Inter_500Medium',
  bodyBold: 'Inter_600SemiBold',
};
```
Затем заменить `fontFamily: fonts.display` в `menuCtaText`, `bigBtnText`, `title` (кроме логотипа), `ctaText` на `fonts.text`. Для испанских/немецких/португальских диакритиков Space Grotesk подходит, но ради единообразия лучше держать одно семейство для всего переводимого текста.

---

### 2. IAP может начислить монеты повторно после перезапуска приложения

**Файлы и строки:**
- `src/lib/iap.ts:33` — `const finished = new Set<string>();` живёт только в памяти.
- `src/lib/iap.ts:45-47` — защита от дублирования только в рамках одной сессии.
- `src/lib/iap.ts:63-68` — `cleanup` не сохраняет историю завершённых транзакций.

**Что происходит.** Если покупка была завершена, но приложение убито до `finishTransaction` (или платформа повторно доставляет покупку при следующем старте), `finished` будет пустым, и `onCoins` вызовется снова. Для consumable-монет это прямой эксплойт: пользователь получит монеты несколько раз.

**Решение.**
1. Хранить `finished` в `AsyncStorage` (ключ `snake:iapFinished`).
2. При старте `initIap` загружать множество завершённых `transactionId`.
3. Проверять `if (finished.has(tid)) return;` уже после загрузки.
4. После `finishTransaction` сохранять `tid` в AsyncStorage.
5. Дополнительно вызывать `getAvailablePurchases`/`getPurchaseHistory` при старте, чтобы докупить/завершить «зависшие» покупки.

---

### 3. Жёстко зашитые английские строки, видимые пользователю

**Файлы и строки:**
- `src/screens/Onboarding.tsx:74` — `<Text ...>SPEED ×2</Text>`.
- `src/screens/Onboarding.tsx:85` — `<Text ...>RANKED</Text>`.
- `src/screens/PartyGame.tsx:147` — `mine ? 'YOU' : shortName(names[si])`.
- `src/screens/PartyGame.tsx:290` — `names = state.snakes.map((_, i) => (i === 0 ? 'You' : `Bot ${i + 1}`));`.
- `src/screens/PartyGame.tsx:338` — `setInviteNote('Link copied!');`.
- `src/screens/PartyGame.tsx:602` — `setShareNote('Link copied!');`.
- `src/screens/PartyGame.tsx:768` — `<Text style={styles.title}>Shake Work Off</Text>` (бренд — допустимо, но лучше вынести в константу).
- `src/screens/Leaderboard.tsx:62` — `{me ? ' (you)' : ''}`.
- `src/screens/Leaderboard.tsx:68` — `{r.wins}W {r.losses}L`.
- `src/screens/Account.tsx:127` — `placeholder="you@email.com"`.
- `src/screens/DuelGame.tsx:344` — `placeholder="CODE"`.
- `src/screens/PartyGame.tsx:414` — `placeholder="CODE"`.
- `src/screens/PartyGame.tsx:587` — `nameOf` fallback: `` `Player ${slot + 1}` ``.
- `App.tsx:931` — `shareResult('I scored ${sc} in Shake Work Off 🐍 — can you beat it?')`.
- `src/screens/DuelGame.tsx:573-575` — share-сообщения `I won ... / I just battled ...`.
- `src/screens/PartyGame.tsx:591-598` — share-сообщения `I won Shake Work Off ... / ... won Shake Work Off ...`.

**Решение.** Добавить ключи в `src/lib/i18n.ts` и использовать `t()` / `tr()`:
- `obSpeedBoost: 'SPEED ×2'` (или локализованный эквивалент).
- `obRankedBadge: 'RANKED'`.
- `youBadge`, `botName` (с интерполяцией `{n}`), `playerName`.
- `linkCopied` (уже есть, но не везде используется).
- `lbYouSuffix`, `winsSuffix`/`lossesSuffix`.
- `emailPlaceholder`.
- `roomCodePlaceholder`.
- `soloShareText`, `duelWinShareText`, `duelLossShareText`, `partyWinShareText`, `partyLossShareText` с интерполяцией `{score}`, `{stake}`, `{winnerName}`.

---

### 4. Несогласованный резерв места под управление — риск обрезания D-pad или поля

**Файлы и строки:**
- `App.tsx:92-95` — `dpadReserve = getCtrlScheme() === 'swipe' ? 130 : 336`.
- `src/screens/DuelGame.tsx:77` — `height - ... - (getCtrlScheme() === 'swipe' ? 150 : 356)`.
- `src/screens/PartyGame.tsx:196` — `reserve = getCtrlScheme() === 'swipe' ? 140 : 330`.

**Что происходит.** Три разных экрана считают высоту доски по-разному: 130/150/140 для swipe и 336/356/330 для кнопок. При `split`-схеме реальная высота D-pad ~138 px, а в `DuelGame` всё равно отнимается 356 px — поле получается меньше необходимого. На маленьких экранах (iPhone SE) разница в 20–30 px может привести к тому, что нижняя часть D-pad уйдёт за safe area или, наоборот, останется пустое пространство. Кроме того, `getCtrlScheme()` вызывается прямо в рендере; пока `initSettings()` не завершился, используется дефолт `'dpad'`, что даёт первый кадр с неправильным размером поля.

**Решение.**
1. Вынести расчёт размера доски и резерва управления в единый хук, например `src/lib/layout.ts`:
```ts
export function useBoardPx(opts: { min?: number; max?: number; extraReserve?: number } = {}) { ... }
```
2. Завести таблицу реальных высот управления:
   - `dpad` (center) ≈ 212 px,
   - `dpad` side ≈ 212 px + боковые отступы,
   - `split` ≈ 138 px,
   - `swipe` ≈ 0 px + hint.
3. Использовать один и тот же хук в `App.tsx`, `DuelGame.tsx`, `PartyGame.tsx`.
4. Учитывать `insets.bottom` и `paddingBottom` единообразно.

---

## P1 — важно (техдолг и заметные UX-проблемы)

### 5. Локальные палитры и дублирование стилей между экранами

**Файлы и строки:**
- `src/screens/DuelGame.tsx:25-33` — `const C = { bg, board, border, text, textDim, btn, accent }`.
- `src/screens/PartyGame.tsx:51-59` — аналогичный `C`.
- `src/screens/Leaderboard.tsx:11-18` — аналогичный `C`.
- Повторяющиеся классы:
  - `container` — `DuelGame.tsx:641`, `PartyGame.tsx:783`, `Account.tsx:185`, `Leaderboard.tsx:88`, `Settings.tsx:194`, `Onboarding.tsx:145`.
  - `title` — `DuelGame.tsx:646`, `PartyGame.tsx:793`, `Account.tsx:187`, `Leaderboard.tsx:98`, `Settings.tsx:196`, `Onboarding.tsx:166`.
  - `bigBtn` / `bigBtnText` — `DuelGame.tsx:651-652`, `PartyGame.tsx:811-813`.
  - `altBtn` / `altBtnText` — `DuelGame.tsx:655-656`, `PartyGame.tsx:814-815`.
  - `backBtn` / `backText` — все экраны.
  - `codeBox` / `codeLabel` / `codeValue` / `codeHint` — `DuelGame.tsx:665-670`, `PartyGame.tsx:845-848`.
  - `overlay` / `overlayInner` / `overlayTitle` / `overlaySub` — `App.tsx:1256-1269`, `DuelGame.tsx:694-700`, `PartyGame.tsx:882-894`.
  - `hud` / chip-стили — `DuelGame.tsx:676-685`, `PartyGame.tsx:862-874`.
  - `shareBtn` / `shareBtnText` — `App.tsx:1272-1273`, `DuelGame.tsx:653-654`, `PartyGame.tsx:900-901`.
  - `input` + `joinRow` + `joinBtn` — `DuelGame.tsx:660-664`, `PartyGame.tsx:831-844`.

**Решение.** Удалить локальные `C` и перейти на `palette` из `src/theme/tokens.ts`. Создать общие компоненты примитивов:
1. `src/ui/Screen.tsx` — `ScreenContainer`, `ScreenTitle`, `ScreenBackButton`.
2. `src/ui/Button.tsx` — `PrimaryButton`, `SecondaryButton`, `GhostButton`.
3. `src/ui/CodeBox.tsx` — код комнаты с label/value/hint.
4. `src/ui/HudChip.tsx` — чипы для HUD ( label / value / color ).
5. `src/ui/Overlay.tsx` — затемнение + `FadePop` + заголовок/подзаголовок.
6. `src/ui/JoinRow.tsx` — `TextInput` + кнопка Join.

**Порядок консолидации:**
1. `BackButton`/`backText` — самый безопасный, трогает только визуальный слой.
2. `PrimaryButton`/`SecondaryButton`/`GhostButton` — заменяет `bigBtn`/`altBtn`/`ghostBtn`.
3. `CodeBox` — объединяет лобби `DuelGame` и `PartyGame`.
4. `Overlay` — объединяет оверлеи `App`, `DuelGame`, `PartyGame`.
5. `HudChip` — унифицирует HUD дуэли и пати.
6. `ScreenContainer`/`ScreenTitle` — финальный рефакторинг общей обёртки.

---

### 6. Смена языка в настройках не уведомляет уже смонтированные экраны

**Файлы и строки:**
- `src/lib/i18n.ts:45-50` — `setLang` меняет только модульную переменную `lang`.
- `src/screens/Settings.tsx:111-114` — меняет только локальный `setLangState`, не перерисовывает `AppInner`.

**Что происходит.** В текущей архитектуре виден только один экран за раз, и возврат в меню (`setMode('menu')`) вызовет ререндер `AppInner`, который подхватит новый `lang`. Но если появится модальное окно настроек поверх меню или inline-переключатель языка, меню останется на старом языке. Кроме того, это нарушает принцип реактивности: состояние языка «спрятано» в модуле.

**Решение.** Добавить механизм подписки/уведомления:
```ts
// i18n.ts
let listeners = new Set<() => void>();
export function subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb); }
export function setLang(v: Lang) { lang = v; AsyncStorage.setItem(...); listeners.forEach(l => l()); }
```
И использовать хук в корневом компоненте:
```ts
const [, forceUpdate] = useReducer(x => x + 1, 0);
useEffect(() => subscribe(forceUpdate), []);
```
Либо обернуть приложение в `I18nProvider` с `useState(lang)` и предоставить `useT()`.

---

### 7. `i18n.ts` не поддерживает интерполяцию и множественное число

**Файлы и строки:**
- `src/lib/i18n.ts:267-269` — `t(key)` возвращает голую строку.
- `src/screens/PartyGame.tsx:517` — `tr('needPlayers').split('{n}').join(String(PARTY_MIN))`.
- `src/screens/PartyGame.tsx:393` — `tr('invitedToTeam').split('{c}').join(...)`.
- `src/screens/Leaderboard.tsx:68` — `{r.wins}W {r.losses}L`.
- Share-сообщения и квесты тоже требуют интерполяции.

**Решение.** Расширить `t` вторым аргументом:
```ts
export function t(key: StringKey, vars?: Record<string, string | number>): string {
  let s = S[key][lang] ?? S[key].en;
  if (vars) Object.entries(vars).forEach(([k, v]) => { s = s.replaceAll(`{${k}}`, String(v)); });
  return s;
}
```
Заменить все `.split('{n}').join(...)` на `t('needPlayers', { n: PARTY_MIN })`. Для множественного числа добавить отдельный `plural(key, count)` или подключить лёгкую библиотеку (`i18next` + `react-i18next`) при росте словаря.

---

### 8. Десктопный RNW-вид не ограничен по ширине, D-pad прижимается к краям экрана

**Файлы и строки:**
- `App.tsx:1159` — `root: { flex: 1 }`, нет `maxWidth`/центрирования.
- `src/screens/DuelGame.tsx:641` — `container` центрирует содержимое, но сам занимает 100 %.
- `src/screens/PartyGame.tsx:783` — аналогично.
- `src/ui/Dpad.tsx:102-103` — `dockL: { alignSelf: 'flex-start', marginLeft: 12 }`, `dockR: { alignSelf: 'flex-end', marginRight: 12 }`.

**Что происходит.** На широком браузерном окне игровые экраны выравниваются по центру, но D-pad в режиме `left`/`right` прижимается к левому/правому краю **окна**, а не к игровому полю. Это выглядит разорванно: доска по центру, кнопки у краёв монитора.

**Решение.**
1. Обёрнуть игровой контент в центрированный контейнер `maxWidth: 520` (или `560` для пати):
```tsx
<View style={styles.gameWrap}>
  <View style={styles.gameInner}>{children}</View>
</View>
```
2. `gameWrap: { flex: 1, alignItems: 'center' }`, `gameInner: { width: '100%', maxWidth: 520 }`.
3. В `Dpad` убрать абсолютные `marginLeft: 12`/`marginRight: 12` для `dockL`/`dockR`; вместо этого размещать D-pad внутри общего `gameInner` и использовать `alignSelf: 'flex-start'/'flex-end'` относительно этого контейнера.

---

### 9. IAP молча глотает ошибки — пользователь не понимает, что произошло

**Файлы и строки:**
- `src/lib/iap.ts:52-54` — `purchaseErrorListener(() => { /* ничего */ })`.
- `src/lib/iap.ts:72-83` — `fetchCoinPacks` возвращает `[]` при любой ошибке.
- `src/lib/iap.ts:86-96` — `buyCoinPack` молча `catch {}`.

**Что происходит.** Если стор недоступен, продукты не заведены, платёж отменён или произошла сетевая ошибка, UI не получает никакой обратной связи. Пользователь тапает «Купить» и ничего не видит.

**Решение.**
1. Вернуть из `fetchCoinPacks` либо `{ packs, error }`, либо кидать ошибку и ловить в `App.tsx`.
2. `buyCoinPack` должен возвращать `{ success: boolean; error?: string }`.
3. `purchaseErrorListener` должен вызывать колбэк `onError`, который в `App.tsx` показывает всплывающее уведомление (`t('purchaseError')`).
4. Добавить аналитику `EVENTS.iapError`.

---

### 10. Inline-стили змейки/еды создают новые объекты на каждый игровой тик

**Файлы и строки:**
- `App.tsx:862-905` — рендер сегментов змейки и еды с inline `style={{ ... }}`.
- `src/screens/DuelGame.tsx:463-519` — аналогично.
- `src/screens/PartyGame.tsx:103-179` — `PartyBoard` тоже использует inline-стили.

**Что происходит.** На каждом тике `step()` создаётся новый `state`, и родитель перерисовывается. Inline-стили каждой клетки (`transform`, `backgroundColor`, `borderRadius`) создают новые объекты — это давление на GC и лишняя работа Reconciler, особенно на слабых Android-устройствах.

**Решение.**
1. Вынести статические части в `StyleSheet` (`cell`, `cellInner`, `head`, `food`, `eye`).
2. Динамические значения (`translateX`, `translateY`, `backgroundColor`) передавать через `style={[styles.cell, { transform: [...], backgroundColor }]}`, чтобы статическая часть не пересоздавалась.
3. Для головы/тела использовать `useMemo` на уровне отдельного сегмента или мемоизированный компонент `SnakeCell`.
4. Еду (`food`, `fatFood`) вынести в отдельный `FoodCell`.

---

### 11. Тени реализованы только для iOS (`shadow*`), на вебе/Android не работают единообразно

**Файлы и строки:**
- `src/theme/tokens.ts:83-97` — `elevation` задаёт `shadow*` и `elevation`.
- Множество inline-стилей: `App.tsx:873-878`, `App.tsx:895`, `App.tsx:901-902`, `DuelGame.tsx:475-479`, `DuelGame.tsx:502`, `DuelGame.tsx:516`, `DuelGame.tsx:628`, `PartyGame.tsx:123-128`, `PartyGame.tsx:173-178`, `Onboarding.tsx:25`, `Onboarding.tsx:55`, `Onboarding.tsx:159`.

**Что происходит.** `shadowColor/Opacity/Radius/Offset` работают только на iOS. `elevation` — только на Android. На вебе (RNW) `elevation` игнорируется, а `shadow*` поддерживаются не везде и выглядят по-разному. В результате карточки, кнопки и еда на вебе выглядят плоско, а на iOS/Android — по-разному.

**Решение.**
1. Создать кроссплатформенный токен теней:
```ts
export const shadow = Platform.select({
  ios: { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
  android: { elevation: 8 },
  default: { boxShadow: '0 10px 40px rgba(0,0,0,0.45)' },
});
```
2. Удалить inline `shadow*`/`elevation` из компонентов; использовать `elevation.card`/`elevation.glow` с веб-вариантом `boxShadow`.
3. Для свечения еды/головы добавить отдельный токен `glow` с `boxShadow` для веба.

---

### 12. `Leaderboard` неправильно строит инициалы для нелатинских имён

**Файлы и строки:**
- `src/screens/Leaderboard.tsx:48-49`:
```ts
const initials = (tail.replace(/[^A-Za-z0-9]/g, '').slice(0, 2) || '?').toUpperCase();
```

**Что происходит.** Для имен на кириллице регулярка вырежет все буквы, и аватар будет '?'. Это заметная проблема для русскоязычных пользователей.

**Решение.** Использовать Unicode-aware регулярку:
```ts
const initials = (tail.replace(/\p{M}|\p{P}|\p{Z}/gu, '').slice(0, 2) || '?').toUpperCase();
```
или просто брать первые два графемных кластера (`Intl.Segmenter` / библиотека `grapheme-splitter`).

---

## P2 — потом (мелкие оптимизации и улучшения)

### 13. D-pad: callback-стили `Pressable` создают новые массивы на каждое нажатие

**Файлы и строки:**
- `src/ui/Dpad.tsx:30-34`:
```tsx
style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
>
{({ pressed }) => (
  <Text style={[styles.glyph, pressed && styles.glyphPressed]}>{GLYPHS[dir]}</Text>
)}
```

**Что происходит.** Функции рендера и style-callback вызываются при каждом изменении `pressed`, создавая новые массивы. На практике это не критично, но можно сделать чище.

**Решение.** Использовать `Animated` или отдельный стейт `pressed` внутри `DirBtn`:
```tsx
const [pressed, setPressed] = useState(false);
<Pressable
  onPressIn={() => setPressed(true)}
  onPressOut={() => setPressed(false)}
  style={[styles.btn, pressed && styles.btnPressed]}
>
  <Text style={[styles.glyph, pressed && styles.glyphPressed]}>...</Text>
</Pressable>
```

---

### 14. `hitSlop` в D-pad оставляет нулевую «мёртвую зону» между кнопками

**Файлы и строки:**
- `src/ui/Dpad.tsx:15-17` — `SLOP = 5`, `GAP = 10`.

**Что происходит.** `5 + 5 = 10 = GAP`, поэтому между кнопками нет неприкосновенного промежутка. Визуальный зазор есть, но тач-зоны соприкасаются. На практике промахи маловероятны из-за ромбовой раскладки, но риск двойной активации при быстрых движениях выше, чем с небольшим зазором.

**Решение.** Уменьшить `SLOP` до `4` или увеличить `GAP` до `14`, чтобы оставить 2–4 px «мёртвой зоны».

---

### 15. `pointerEvents="box-none"` в `Dpad` может вести себя непредсказуемо на вебе

**Файлы и строки:**
- `src/ui/Dpad.tsx:54` — `<View style={styles.splitRow} pointerEvents="box-none">`.
- `src/ui/anim.tsx:39` — `<View pointerEvents="none" ...>`.

**Что происходит.** В React Native Web `pointerEvents` поддерживается, но `box-none` иногда игнорируется в сложных вложениях (особенно внутри `GestureDetector`). Если свайп и D-pad конфликтуют, пользователь на вебе может случайно активировать свайп, тапая кнопки.

**Решение.** Проверить поведение на вебе. Если `box-none` не срабатывает, заменить на `TouchableOpacity`/`Pressable` без обёртки `pointerEvents`, а область свайпа ограничить хуком `GestureHandlerRootView` на уровне экрана.

---

### 16. `getCtrlScheme()` / `getCtrlSide()` в рендере дают первый кадр с дефолтом

**Файлы и строки:**
- `App.tsx:92`, `App.tsx:974`.
- `src/screens/DuelGame.tsx:77`, `src/screens/DuelGame.tsx:593`.
- `src/screens/PartyGame.tsx:196`, `src/screens/PartyGame.tsx:701`.

**Что происходит.** Пока `initSettings()` не прочитал `AsyncStorage`, `getCtrlScheme()` возвращает `'dpad'`. Первый рендер поля и D-pad строится с дефолтом; если пользователь сохранил `swipe`, может быть кратковременная вспышка D-pad.

**Решение.** Добавить `settingsReady` флаг в `settings.ts` (или возвращать `null` из хука до инициализации) и рендерить `boot`-экран/скелетон, пока настройки не загружены.

---

### 17. `t()` вызывается прямо в JSX на каждый рендер

**Файлы и строки:** повсеместно (`App.tsx`, `DuelGame.tsx`, `PartyGame.tsx` и др.).

**Что происходит.** Сам по себе `t()` — чистая синхронная функция, возвращающая строку, поэтому она **не вызывает лишних перерендеров**. Но при каждом игровом тике происходят десятки lookup-вызовов и создание новых массивов стилей. Это не главный источник просадок, но усугубляет пункт 10.

**Решение.**
1. Для статических надписей (заголовки, лейблы) вынести `const label = t('...')` за пределы компонента или в `useMemo`.
2. Основной выигрыш даст всё-таки мемоизация ячеек змейки и вынесение стилей (пункт 10), а не кэширование `t()`.

---

### 18. `Onboarding` визуализирует текст картинками без локализации

**Файлы и строки:**
- `src/screens/Onboarding.tsx:74` — `SPEED ×2`.
- `src/screens/Onboarding.tsx:85` — `RANKED`.

**Решение.** Уже покрыто в P0, но дополнительно: вынести визуальные плашки в маленькие компоненты, принимающие `children` — тогда `t()` будет работать и внутри визуала.

---

### 19. `Settings.tsx` использует `void` для асинхронных сеттеров настроек

**Файлы и строки:**
- `src/screens/Settings.tsx:113`, `123`, `135`, `147`, `162`, `180` — `void saveLang(v)`, `void setMuted(!v)` и т.д.

**Что происходит.** Ошибки записи в `AsyncStorage` игнорируются. Пользователь думает, что настройка сохранена, но при перезапуске она может сброситься.

**Решение.** Добавить `.catch(() => setMsg(t('saveError')))` или логирование. Для критичных настроек (язык, управление) показывать fallback-уведомление.

---

## Итоговая таблица приоритетов

| # | Проблема | Приоритет | Главные файлы |
|---|----------|-----------|---------------|
| 1 | Space Grotesk без кириллицы на переводимых CTA | P0 | `tokens.ts`, `App.tsx`, `DuelGame.tsx`, `PartyGame.tsx`, `Onboarding.tsx`, `Settings.tsx`, `Account.tsx` |
| 2 | IAP: повторный грант после перезапуска | P0 | `src/lib/iap.ts` |
| 3 | Непереведённые строки в UI/share/placeholders | P0 | `Onboarding.tsx`, `PartyGame.tsx`, `Leaderboard.tsx`, `Account.tsx`, `DuelGame.tsx`, `App.tsx` |
| 4 | Рассогласованный резерв под управление | P0 | `App.tsx`, `DuelGame.tsx`, `PartyGame.tsx` |
| 5 | Локальные палитры + дублирование стилей | P1 | `DuelGame.tsx`, `PartyGame.tsx`, `Leaderboard.tsx`, все экраны |
| 6 | Язык не реактивен для уже смонтированных экранов | P1 | `src/lib/i18n.ts`, `Settings.tsx` |
| 7 | Нет интерполяции/множественного числа | P1 | `src/lib/i18n.ts` |
| 8 | Десктопный вид не ограничен по ширине | P1 | `App.tsx`, `Dpad.tsx` |
| 9 | IAP молча глотает ошибки | P1 | `src/lib/iap.ts` |
| 10 | Inline-стили змейки/еды на каждый тик | P1 | `App.tsx`, `DuelGame.tsx`, `PartyGame.tsx` |
| 11 | Тени не кроссплатформенные | P1 | `tokens.ts`, множество экранов |
| 12 | Инициалы для нелатинских имён | P1 | `Leaderboard.tsx` |
| 13 | D-pad callback-стили | P2 | `src/ui/Dpad.tsx` |
| 14 | hitSlop без мёртвой зоны | P2 | `src/ui/Dpad.tsx` |
| 15 | `pointerEvents="box-none"` на вебе | P2 | `src/ui/Dpad.tsx`, `src/ui/anim.tsx` |
| 16 | Первый кадр с дефолтными настройками | P2 | `src/lib/settings.ts`, экраны |
| 17 | `t()` в JSX | P2 | все экраны |
| 18 | Локализация onboarding-визуала | P2 | `Onboarding.tsx` |
| 19 | `void` для асинхронных сеттеров настроек | P2 | `Settings.tsx` |
