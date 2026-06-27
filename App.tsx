import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BOARD,
  type Direction,
  type GameState,
  createInitialState,
  startGame,
  step,
  swipeToDirection,
  turn,
} from './src/game/logic';
import {
  type Wallet,
  addCoins,
  buySkin,
  canBuy,
  initialWallet,
  isOwned,
  sanitizeWallet,
  selectSkin,
} from './src/game/economy';
import { SKINS, type Skin, getSkin } from './src/game/skins';
import { computeDaily, dayKey, type DailyResult } from './src/game/daily';
import { applyStreak, initialStreak, sanitizeStreak, type StreakState } from './src/game/streak';
import {
  applyProgress as questProgress,
  claimQuest,
  claimable as questClaimable,
  claimableCount,
  loadQuests,
  questLabel,
  type Quest,
  type QuestsState,
} from './src/game/quests';
import DuelGame from './src/screens/DuelGame';
import PartyGame from './src/screens/PartyGame';
import { type Profile, loadProfile, saveProfile } from './src/lib/profile';
import { type AuthUser, ensureSession } from './src/lib/auth';
import Account from './src/screens/Account';
import Onboarding from './src/screens/Onboarding';
import Settings from './src/screens/Settings';
import { tierFor } from './src/game/rating';
import Leaderboard from './src/screens/Leaderboard';
import { fetchProfileById, pushProfile, pushWallet, submitMatch } from './src/lib/leaderboard';
import { EVENTS, identify, track } from './src/lib/analytics';
import { initSound, play as playSfx, releaseSound } from './src/lib/sound';
import { shareResult } from './src/lib/share';
import { initSettings, hLight, hError, hSuccess } from './src/lib/settings';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { palette as COLORS, gradients, tierStyle, elevation, fonts, shade } from './src/theme/tokens';
import { TouchScale, FadePop } from './src/ui/anim';

const BEST_KEY = 'snake:best';
const WALLET_KEY = 'snake:wallet';
const ONBOARDED_KEY = 'snake:onboarded';
const DAILY_KEY = 'snake:daily';
const STREAK_KEY = 'snake:streak';
const QUESTS_KEY = 'snake:quests';

function speedFor(score: number): number {
  return Math.max(70, 160 - score * 4);
}

function AppInner() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Поле соло-экрана: подгоняется под устройство (учёт safe area), чтобы D-pad и хинт влезали.
  const boardPx = Math.max(
    176,
    Math.floor(Math.min(width - 32, height - insets.top - insets.bottom - 300, 360)),
  );
  const cell = boardPx / BOARD;

  const [fontsLoaded] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  const foodPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(foodPulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(foodPulse, { toValue: 0, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [foodPulse]);
  const foodScale = foodPulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.04] });

  // Освобождение аудио-плееров при полном анмаунте приложения.
  useEffect(() => () => releaseSound(), []);

  const [state, setState] = useState<GameState>(() => createInitialState());
  const [best, setBest] = useState(0);
  const [wallet, setWallet] = useState<Wallet>(initialWallet);
  const [showShop, setShowShop] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [daily, setDaily] = useState<DailyResult | null>(null);
  const dailyStreakRef = useRef(0);
  const [shareNote, setShareNote] = useState('');
  const [paused, setPaused] = useState(false);
  const [streak, setStreak] = useState<StreakState>(initialStreak);
  const streakRef = useRef(streak);
  streakRef.current = streak;
  const [quests, setQuests] = useState<QuestsState | null>(null);
  const questsRef = useRef(quests);
  questsRef.current = quests;
  const [showQuests, setShowQuests] = useState(false);
  const initialRoom = useMemo(
    () =>
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('room')
        : null,
    [],
  );
  const initialFrom = useMemo(
    () =>
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('from')
        : null,
    [],
  );
  // Инвайт в командную комнату «Shake Work Off» по ссылке (?party=КОД) → авто-вход в Office Royale.
  const initialParty = useMemo(
    () =>
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('party')
        : null,
    [],
  );
  const [mode, setMode] = useState<'menu' | 'solo' | 'duel' | 'party' | 'leaderboard' | 'account' | 'settings'>(
    initialRoom ? 'duel' : initialParty ? 'party' : 'menu',
  );
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [duelRanked, setDuelRanked] = useState(false);
  // Комната из инвайт-ссылки — ОДНОРАЗОВАЯ: после выхода из дуэли или ручного входа в
  // Versus/Ranked сбрасываем, иначе повторный Versus снова цеплялся бы к старой (мёртвой)
  // комнате и не давал создать новую.
  const [inviteRoom, setInviteRoom] = useState<string | null>(initialRoom);
  const prevScore = useRef(0);
  const walletLoaded = useRef(false);
  const walletRef = useRef(wallet);
  walletRef.current = wallet;
  const bestRef = useRef(best);
  bestRef.current = best;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const stateRef = useRef(state);
  stateRef.current = state;
  const scoreRef = useRef(state.score);
  scoreRef.current = state.score;
  // Однажды сверились с облаком — локальная загрузка из AsyncStorage больше не перетирает.
  const reconciledRef = useRef(false);

  const skin = getSkin(wallet.selected);

  const saveWallet = useCallback((w: Wallet) => {
    AsyncStorage.setItem(WALLET_KEY, JSON.stringify(w)).catch(() => {});
  }, []);

  // Синхронизация профиля с аккаунтом: анонимный вход → uid; если у аккаунта уже есть
  // облачный профиль (другое устройство) — берём его (кросс-девайс), иначе переносим
  // локальный прогресс под uid. Офлайн-безопасно. Вызывается на старте и при входе/выходе.
  const applyAccount = useCallback(async (base: Profile) => {
    const user = await ensureSession();
    setAuthUser(user);
    if (!user) {
      pushProfile(base);
      identify(base.id, { name: base.name, rating: base.rating, wins: base.wins, losses: base.losses, tier: tierFor(base.rating).name });
      return;
    }
    const cloud = await fetchProfileById(user.id);
    let p: Profile;
    if (cloud) {
      p = { id: user.id, name: cloud.name || base.name, rating: cloud.rating, wins: cloud.wins, losses: cloud.losses };
    } else {
      p = { ...base, id: user.id };
      pushProfile(p);
    }
    await saveProfile(p);
    setProfile(p);

    // Кошелёк/прогресс (кросс-девайс): если в облаке есть осмысленный прогресс — принимаем его
    // (снимок монет/скинов целиком; рекорд берём максимум). Иначе заливаем локальный под этот uid.
    const cloudHasProgress =
      !!cloud && ((cloud.owned?.length ?? 0) > 1 || (cloud.coins ?? 0) > 0 || (cloud.best ?? 0) > 0);
    if (cloud && cloudHasProgress) {
      const adopted = sanitizeWallet({ coins: cloud.coins, owned: cloud.owned, selected: cloud.selected });
      setWallet(adopted);
      saveWallet(adopted);
      const mergedBest = Math.max(bestRef.current, cloud.best || 0);
      bestRef.current = mergedBest;
      setBest(mergedBest);
      AsyncStorage.setItem(BEST_KEY, String(mergedBest)).catch(() => {});
      // если локальный рекорд был выше облачного — подтянуть облако вверх
      if ((cloud.best || 0) < mergedBest) {
        pushWallet(user.id, adopted.coins, adopted.owned, adopted.selected, mergedBest);
      }
    } else {
      pushWallet(user.id, walletRef.current.coins, walletRef.current.owned, walletRef.current.selected, bestRef.current);
    }
    reconciledRef.current = true;

    identify(p.id, {
      name: p.name,
      rating: p.rating,
      wins: p.wins,
      losses: p.losses,
      tier: tierFor(p.rating).name,
      email: user.email ?? undefined,
      anon: user.isAnon,
    });
  }, [saveWallet]);

  useEffect(() => {
    track(EVENTS.appOpen, { entry: initialRoom ? 'invite' : 'direct' });
    if (initialRoom && initialFrom) track(EVENTS.challengeAccepted, { from: initialFrom });
    initSettings().catch(() => {});
    initSound().catch(() => {});
    // Первый запуск (не по инвайт-ссылке) → показать онбординг.
    if (!initialRoom) {
      AsyncStorage.getItem(ONBOARDED_KEY)
        .then((v) => {
          if (v !== '1') setShowOnboarding(true);
        })
        .catch(() => {});
    }
    // Ежедневная награда: посчитать, доступна ли сегодня.
    AsyncStorage.getItem(DAILY_KEY)
      .then((raw) => {
        let last: string | null = null;
        let streak = 0;
        if (raw) {
          try {
            const d = JSON.parse(raw);
            last = typeof d.last === 'string' ? d.last : null;
            streak = typeof d.streak === 'number' ? d.streak : 0;
          } catch {}
        }
        dailyStreakRef.current = streak;
        const res = computeDaily(last, streak, new Date());
        if (res.canClaim) setDaily(res);
      })
      .catch(() => {});
    AsyncStorage.getItem(STREAK_KEY)
      .then((raw) => {
        if (raw) {
          try {
            setStreak(sanitizeStreak(JSON.parse(raw)));
          } catch {}
        }
      })
      .catch(() => {});
    AsyncStorage.getItem(QUESTS_KEY)
      .then((raw) => {
        let parsed: unknown = null;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch {}
        const qs = loadQuests(parsed, dayKey(new Date()));
        setQuests(qs);
        AsyncStorage.setItem(QUESTS_KEY, JSON.stringify(qs)).catch(() => {});
      })
      .catch(() => {});
    loadProfile()
      .then((p) => {
        setProfile(p); // мгновенный старт на локальном профиле
        applyAccount(p); // фоновая привязка к аккаунту (офлайн-безопасно)
      })
      .catch(() => {});
    AsyncStorage.getItem(BEST_KEY)
      .then((v) => {
        if (reconciledRef.current) return; // облако уже отдало рекорд — не перетираем
        const n = v ? parseInt(v, 10) : 0;
        if (Number.isFinite(n) && n > 0) setBest(n);
      })
      .catch(() => {});
    AsyncStorage.getItem(WALLET_KEY)
      .then((raw) => {
        if (raw && !reconciledRef.current) {
          try {
            setWallet(sanitizeWallet(JSON.parse(raw)));
          } catch {}
        }
      })
      .catch(() => {})
      .finally(() => {
        walletLoaded.current = true;
      });
  }, []);

  // Самопланирующийся цикл: скорость читаем из scoreRef каждый тик, поэтому эффект НЕ
  // пересоздаётся на каждую съеденную еду (раньше setInterval с зависимостью от score
  // давал рывок таймингов после еды).
  useEffect(() => {
    if (state.status !== 'playing' || paused) return;
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      setState((s) => step(s));
      id = setTimeout(tick, speedFor(scoreRef.current));
    };
    id = setTimeout(tick, speedFor(scoreRef.current));
    return () => clearTimeout(id);
  }, [state.status, paused]);

  useEffect(() => {
    const delta = state.score - prevScore.current;
    if (delta > 0) {
      setWallet((w) => addCoins(w, delta));
      playSfx('eat');
      hLight();
    }
    prevScore.current = state.score;
  }, [state.score]);

  useEffect(() => {
    if (state.status !== 'over') return;
    track(EVENTS.soloGameOver, { score: state.score, best, new_best: state.score > best });
    // рекорд: считаем по bestRef, side-effect (AsyncStorage) вне setState-апдейтера
    const nextBestRec = Math.max(bestRef.current, state.score);
    if (nextBestRec !== bestRef.current) {
      setBest(nextBestRec);
      AsyncStorage.setItem(BEST_KEY, String(nextBestRec)).catch(() => {});
    }
    playSfx('crash');
    hError();
    bumpQuest('solo_score', state.score);
    bumpQuest('eat_solo', state.score);
    if (walletLoaded.current) saveWallet(walletRef.current);
    // облачная синхронизация кошелька/рекорда (кросс-девайс)
    const uid = profileRef.current?.id;
    if (uid) {
      const nextBest = Math.max(bestRef.current, state.score);
      const w = walletRef.current;
      pushWallet(uid, w.coins, w.owned, w.selected, nextBest);
    }
  }, [state.status, state.score, saveWallet]);

  const handleTurn = useCallback((dir: Direction) => {
    const s = stateRef.current;
    const ns = turn(s, dir);
    if (ns === s) return; // невалидный поворот (разворот/не в игре)
    setState(ns);
    if (ns.status === 'playing') hLight(); // side-effect вне setState-апдейтера
  }, []);

  const handleStart = useCallback(() => {
    setPaused(false);
    setState((s) => {
      if (s.status === 'playing') return s;
      track(EVENTS.soloStart, { restart: s.status === 'over' });
      return s.status === 'over' ? startGame(createInitialState()) : startGame(s);
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const map: Record<string, Direction> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
    };
    const onKey = (e: KeyboardEvent) => {
      if (mode !== 'solo') return; // клавиши только на соло-экране
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleStart();
        return;
      }
      const dir = map[e.key];
      if (dir) {
        e.preventDefault();
        handleTurn(dir);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleTurn, handleStart, mode]);

  // Свайп с ранним коммитом: поворачиваем, как только жест пересёк порог (а не на отпускании) —
  // заметно меньше задержка. Один поворот за жест (до отпускания пальца).
  const swipe = useMemo(() => {
    let committed = false;
    return Gesture.Pan()
      .onBegin(() => {
        committed = false;
      })
      .onUpdate((e) => {
        if (committed) return;
        if (Math.abs(e.translationX) + Math.abs(e.translationY) < 12) return;
        const dir = swipeToDirection(e.translationX, e.translationY);
        if (dir) {
          committed = true;
          handleTurn(dir);
        }
      });
  }, [handleTurn]);

  const openShop = useCallback(() => {
    if (walletLoaded.current) saveWallet(walletRef.current);
    track(EVENTS.shopOpen, { coins: walletRef.current.coins, owned: walletRef.current.owned.length });
    setShowShop(true);
  }, [saveWallet]);

  const handleBuy = useCallback(
    (s: Skin) => {
      const nw = buySkin(walletRef.current, s);
      if (nw !== walletRef.current) {
        track(EVENTS.skinPurchased, { skin: s.id, price: s.price, coins_after: nw.coins });
      }
      setWallet(nw);
      saveWallet(nw);
      const uid = profileRef.current?.id;
      if (uid) pushWallet(uid, nw.coins, nw.owned, nw.selected, bestRef.current);
    },
    [saveWallet],
  );

  const handleSelect = useCallback(
    (id: string) => {
      const nw = selectSkin(walletRef.current, id);
      track(EVENTS.skinSelected, { skin: id });
      setWallet(nw);
      saveWallet(nw);
      const uid = profileRef.current?.id;
      if (uid) pushWallet(uid, nw.coins, nw.owned, nw.selected, bestRef.current);
    },
    [saveWallet],
  );

  const handleRatingResult = useCallback(
    (r: { result: 'win' | 'loss' | 'draw'; newRating: number; delta: number; oppRating: number; vsBot: boolean; oppId: string | null }) => {
      // Оптимистично обновляем локально (мгновенный UI), затем сверяем с сервером.
      // Side-effects (track/save/submit) — вне setState-апдейтера (через profileRef).
      const p = profileRef.current;
      if (!p) return;
      const np: Profile = {
        ...p,
        rating: r.newRating,
        wins: p.wins + (r.result === 'win' ? 1 : 0),
        losses: p.losses + (r.result === 'loss' ? 1 : 0),
      };
      setProfile(np);
      track(EVENTS.ratingChange, {
        result: r.result,
        old_rating: p.rating,
        new_rating: r.newRating,
        delta: r.delta,
        tier: tierFor(r.newRating).name,
        vs_bot: r.vsBot,
      });
      saveProfile(np);
      // прогресс дейли-квестов (ranked)
      bumpQuest('play_ranked', 1);
      if (r.result === 'win') bumpQuest('win_ranked', 1);
      // серия побед + бонус-монеты на вехах
      const sr = applyStreak(streakRef.current, r.result);
      setStreak(sr.state);
      AsyncStorage.setItem(STREAK_KEY, JSON.stringify(sr.state)).catch(() => {});
      if (sr.bonus > 0) {
        const nw = addCoins(walletRef.current, sr.bonus);
        setWallet(nw);
        saveWallet(nw);
        const uid = profileRef.current?.id;
        if (uid) pushWallet(uid, nw.coins, nw.owned, nw.selected, bestRef.current);
        track(EVENTS.winStreak, { streak: sr.milestone, bonus: sr.bonus });
      }
      // Авторитетный рейтинг считает сервер (ELO, кулдаун, анти-чит). Сверяем.
      submitMatch(r.result, r.oppRating, r.vsBot, r.oppId)
        .then((s) => {
          if (!s) return;
          const cur = profileRef.current;
          if (!cur || cur.rating === s.rating) return;
          const np2: Profile = { ...cur, rating: s.rating };
          setProfile(np2);
          saveProfile(np2);
        })
        .catch(() => {});
    },
    [saveWallet],
  );

  const finishOnboarding = useCallback(() => {
    setShowOnboarding(false);
    AsyncStorage.setItem(ONBOARDED_KEY, '1').catch(() => {});
  }, []);

  // После удаления аккаунта (T28): стереть локальные данные и начать с чистого гостя.
  const handleAccountDeleted = useCallback(async () => {
    try {
      await Promise.all([
        AsyncStorage.removeItem('snake:profile'),
        AsyncStorage.removeItem(WALLET_KEY),
        AsyncStorage.removeItem(BEST_KEY),
        AsyncStorage.removeItem(DAILY_KEY),
      ]);
    } catch {}
    reconciledRef.current = false;
    setWallet(initialWallet());
    setBest(0);
    setDaily(null);
    setAuthUser(null);
    setMode('solo');
    try {
      const fresh = await loadProfile(); // создаст новый локальный профиль
      setProfile(fresh);
      applyAccount(fresh); // новый анонимный вход + строка в облаке
    } catch {}
  }, [applyAccount]);

  const claimDaily = useCallback(() => {
    if (!daily || !daily.canClaim) return;
    const nw = addCoins(walletRef.current, daily.amount);
    setWallet(nw);
    saveWallet(nw);
    const uid = profileRef.current?.id;
    if (uid) pushWallet(uid, nw.coins, nw.owned, nw.selected, bestRef.current);
    AsyncStorage.setItem(DAILY_KEY, JSON.stringify({ last: dayKey(new Date()), streak: daily.streak })).catch(() => {});
    dailyStreakRef.current = daily.streak;
    track(EVENTS.dailyClaim, { streak: daily.streak, amount: daily.amount, reward_day: daily.rewardDay });
    hSuccess();
    setDaily(null);
  }, [daily, saveWallet]);

  // Прогресс дейли-квеста (count/max по типу). Пишем в AsyncStorage только при изменении.
  const bumpQuest = useCallback((type: string, amount: number) => {
    const cur = questsRef.current;
    if (!cur) return;
    const items = questProgress(cur.items, type, amount);
    if (!items.some((q, i) => q !== cur.items[i])) return;
    const ns = { ...cur, items };
    setQuests(ns);
    AsyncStorage.setItem(QUESTS_KEY, JSON.stringify(ns)).catch(() => {});
  }, []);

  const claimQuestReward = useCallback(
    (type: string) => {
      const cur = questsRef.current;
      if (!cur) return;
      const { items, reward } = claimQuest(cur.items, type);
      if (reward <= 0) return;
      const ns = { ...cur, items };
      setQuests(ns);
      AsyncStorage.setItem(QUESTS_KEY, JSON.stringify(ns)).catch(() => {});
      const nw = addCoins(walletRef.current, reward);
      setWallet(nw);
      saveWallet(nw);
      const uid = profileRef.current?.id;
      if (uid) pushWallet(uid, nw.coins, nw.owned, nw.selected, bestRef.current);
      track(EVENTS.questClaim, { quest: type, reward });
      hSuccess();
    },
    [saveWallet],
  );

  if (!fontsLoaded) {
    return <View style={styles.boot} />;
  }

  if (mode === 'account') {
    return (
      <GestureHandlerRootView style={styles.root}>
        <Account
          user={authUser}
          onBack={() => setMode('menu')}
          onChanged={() => {
            if (profile) applyAccount(profile);
          }}
          onDeleted={handleAccountDeleted}
        />
      </GestureHandlerRootView>
    );
  }

  if (mode === 'leaderboard') {
    return (
      <GestureHandlerRootView style={styles.root}>
        <Leaderboard myId={profile?.id ?? ''} onBack={() => setMode('menu')} />
      </GestureHandlerRootView>
    );
  }

  if (mode === 'settings') {
    return (
      <GestureHandlerRootView style={styles.root}>
        <Settings onBack={() => setMode('menu')} />
      </GestureHandlerRootView>
    );
  }

  if (mode === 'duel') {
    return (
      <GestureHandlerRootView style={styles.root}>
        <DuelGame
          onExit={() => { setInviteRoom(null); setMode('menu'); }}
          autoJoin={duelRanked ? null : inviteRoom}
          ranked={duelRanked}
          myRating={profile?.rating ?? 1000}
          myId={profile?.id ?? ''}
          onRatingResult={handleRatingResult}
        />
      </GestureHandlerRootView>
    );
  }

  if (mode === 'party') {
    return (
      <GestureHandlerRootView style={styles.root}>
        <PartyGame onExit={() => setMode('menu')} autoJoin={initialParty} />
      </GestureHandlerRootView>
    );
  }

  const tier = tierFor(profile?.rating ?? 1000);

  // ── MENU (главное меню, без игрового поля; прокручивается → ничего не обрезается) ──
  if (mode === 'menu') {
    return (
      <GestureHandlerRootView style={styles.root}>
        <LinearGradient colors={gradients.vignette} style={styles.bg}>
          <StatusBar style="light" />
          <ScrollView
            contentContainerStyle={[styles.menuScroll, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 24 }]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <Text style={styles.title}>
                <Text style={{ color: COLORS.brand1 }}>SHAKE </Text>
                <Text style={{ color: COLORS.text }}>WORK </Text>
                <Text style={{ color: COLORS.brand3 }}>OFF</Text>
              </Text>
              <Text style={styles.subtitle}>LAST SNAKE STANDING</Text>
              <TouchScale style={styles.acctChip} onPress={() => setMode('account')} accessibilityLabel="account">
                <Text style={styles.acctText} numberOfLines={1}>
                  {authUser && !authUser.isAnon && authUser.email ? authUser.email : 'Guest · sign in to sync'}
                </Text>
              </TouchScale>
            </View>

            {daily && daily.canClaim && (
              <TouchScale style={[styles.dailyWrap, styles.wide]} onPress={claimDaily} accessibilityLabel="daily-claim">
                <LinearGradient colors={gradients.coin} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.dailyBtn}>
                  <Text style={styles.dailyText}>🎁 Daily · Day {daily.streak} · +{daily.amount}</Text>
                  <Text style={styles.dailyClaimText}>Claim</Text>
                </LinearGradient>
              </TouchScale>
            )}

            <View style={styles.statRow}>
              <View style={styles.coinPill}>
                <LinearGradient colors={gradients.coin} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.coinDot} />
                <Text style={styles.coinText} accessibilityLabel={`coins-${wallet.coins}`}>{wallet.coins}</Text>
              </View>
              <View style={styles.bestPill}>
                <Text style={styles.bestPillLabel}>BEST</Text>
                <Text style={styles.bestPillVal}>{best}</Text>
              </View>
              {streak.cur > 0 && (
                <View style={styles.bestPill} accessibilityLabel={`streak-${streak.cur}`}>
                  <Text style={styles.bestPillLabel}>🔥</Text>
                  <Text style={styles.bestPillVal}>{streak.cur}</Text>
                </View>
              )}
              <TouchScale
                style={styles.soundChip}
                onPress={() => setMode('settings')}
                accessibilityLabel="open-settings"
              >
                <Text style={styles.soundChipText}>⚙️</Text>
              </TouchScale>
            </View>

            <TouchScale style={[styles.ctaWrap, styles.wide]} onPress={() => setMode('solo')} accessibilityLabel="play-solo">
              <LinearGradient colors={gradients.play} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.menuCta}>
                <Text style={styles.menuCtaText}>Play</Text>
              </LinearGradient>
            </TouchScale>

            <TouchScale
              style={[styles.ctaWrap, styles.wide]}
              onPress={() => {
                track(EVENTS.matchmakingStart, { mode: 'versus' });
                setInviteRoom(null); // ручной Versus → чистое лобби, не цепляться к старой ссылке
                setDuelRanked(false);
                setMode('duel');
              }}
              accessibilityLabel="versus"
            >
              <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.menuCta}>
                <Text style={styles.menuCtaText}>Versus</Text>
              </LinearGradient>
            </TouchScale>

            <TouchScale
              style={[styles.ctaWrap, styles.wide]}
              onPress={() => {
                track(EVENTS.matchmakingStart, { mode: 'ranked', rating: profile?.rating ?? 1000 });
                setInviteRoom(null);
                setDuelRanked(true);
                setMode('duel');
              }}
              accessibilityLabel="ranked"
            >
              <LinearGradient colors={gradients.ranked} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.rankedCta}>
                <Text style={styles.rankedText}>
                  Ranked · <Text style={{ color: tierStyle[tier.name]?.color ?? COLORS.onBrand }}>{tier.name}</Text> {profile?.rating ?? 1000}
                </Text>
              </LinearGradient>
            </TouchScale>

            <TouchScale
              style={[styles.ctaWrap, styles.wide]}
              onPress={() => {
                track(EVENTS.matchmakingStart, { mode: 'party' });
                setMode('party');
              }}
              accessibilityLabel="party"
            >
              <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.menuCta}>
                <Text style={styles.menuCtaText}>Office Royale (beta)</Text>
              </LinearGradient>
            </TouchScale>

            <View style={[styles.menuGhostRow, styles.wide]}>
              <TouchScale style={[styles.ghostBtn, styles.ghostHalf]} onPress={openShop} accessibilityLabel="shop">
                <Text style={styles.ghostText}>Shop</Text>
              </TouchScale>
              <TouchScale
                style={[styles.ghostBtn, styles.ghostHalf]}
                onPress={() => {
                  track(EVENTS.leaderboardOpen);
                  setMode('leaderboard');
                }}
                accessibilityLabel="leaderboard"
              >
                <Text style={styles.ghostText}>Leaderboard</Text>
              </TouchScale>
            </View>

            <TouchScale style={[styles.ghostBtn, styles.wide, styles.ghostWide]} onPress={() => setShowQuests(true)} accessibilityLabel="quests">
              <Text style={styles.ghostText}>
                🎯 Daily quests{quests && claimableCount(quests.items) > 0 ? `  •${claimableCount(quests.items)}` : ''}
              </Text>
            </TouchScale>

            <TouchScale style={styles.helpLink} onPress={() => setShowOnboarding(true)} accessibilityLabel="how-to-play">
              <Text style={styles.helpText}>How to play</Text>
            </TouchScale>
          </ScrollView>

          {showShop && (
            <ShopOverlay wallet={wallet} onBuy={handleBuy} onSelect={handleSelect} onClose={() => setShowShop(false)} />
          )}
          {showQuests && quests && (
            <QuestsOverlay items={quests.items} onClaim={claimQuestReward} onClose={() => setShowQuests(false)} />
          )}
          {showOnboarding && <Onboarding onDone={finishOnboarding} />}
        </LinearGradient>
      </GestureHandlerRootView>
    );
  }

  // ── SOLO (фокус-экран игры: только счёт, поле, хинт, D-pad; safe-area) ──
  return (
    <GestureHandlerRootView style={styles.root}>
      <LinearGradient colors={gradients.vignette} style={styles.bg}>
        <View style={[styles.soloContainer, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
          <StatusBar style="light" />

          <View style={styles.soloTop}>
            <TouchScale style={styles.backChip} onPress={() => setMode('menu')} accessibilityLabel="solo-back">
              <Text style={styles.backChipText}>‹ Menu</Text>
            </TouchScale>
            <View style={styles.soloScores}>
              <Text style={styles.soloScoreText}>
                SCORE <Text style={styles.soloScoreVal} accessibilityLabel={`score-${state.score}`}>{state.score}</Text>
              </Text>
              <Text style={styles.soloScoreText}>
                BEST <Text style={[styles.soloScoreVal, styles.scoreBest]}>{best}</Text>
              </Text>
            </View>
            <View style={styles.coinPill}>
              <LinearGradient colors={gradients.coin} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.coinDot} />
              <Text style={styles.coinText}>{wallet.coins}</Text>
            </View>
          </View>

          <GestureDetector gesture={swipe}>
            <View style={[styles.board, { width: boardPx, height: boardPx }]}>
              {state.snake.map((p, i) => {
                const isHead = i === 0;
                return (
                  <View
                    key={i}
                    style={{ position: 'absolute', left: 0, top: 0, width: cell, height: cell, padding: 1, transform: [{ translateX: p.x * cell }, { translateY: p.y * cell }] }}
                  >
                    <View
                      style={[
                        {
                          flex: 1,
                          borderRadius: cell * (isHead ? 0.34 : 0.28),
                          backgroundColor: isHead ? skin.head : shade(skin.body, (i / state.snake.length) * 0.5),
                        },
                        isHead && {
                          shadowColor: skin.head,
                          shadowOpacity: 0.9,
                          shadowRadius: 6,
                          shadowOffset: { width: 0, height: 0 },
                          elevation: 6,
                        },
                      ]}
                    >
                      {isHead && (
                        <>
                          <View style={[styles.eye, { top: cell * 0.26, left: cell * 0.24, width: cell * 0.16, height: cell * 0.16, borderRadius: cell * 0.08 }]} />
                          <View style={[styles.eye, { top: cell * 0.26, right: cell * 0.24, width: cell * 0.16, height: cell * 0.16, borderRadius: cell * 0.08 }]} />
                        </>
                      )}
                    </View>
                  </View>
                );
              })}

              <View
                style={{ position: 'absolute', left: 0, top: 0, width: cell, height: cell, padding: 2, transform: [{ translateX: state.food.x * cell }, { translateY: state.food.y * cell }] }}
              >
                <Animated.View style={{ flex: 1, borderRadius: cell / 2, backgroundColor: COLORS.food, shadowColor: COLORS.food, shadowOpacity: 0.95, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 6, transform: [{ scale: foodScale }] }} />
              </View>

              {state.status !== 'playing' && (
                <View style={styles.overlay}>
                  <FadePop style={styles.overlayInner}>
                    <Text style={styles.overlayTitle}>
                      {state.status === 'over' ? 'Game over' : 'Ready?'}
                    </Text>
                    {state.status === 'over' && (
                      <Text style={styles.overlaySub}>Score: {state.score}</Text>
                    )}
                    <TouchScale
                      style={[styles.startBtn, { backgroundColor: skin.body }]}
                      onPress={handleStart}
                      accessibilityLabel="start"
                    >
                      <Text style={styles.startBtnText}>
                        {state.status === 'over' ? 'Again' : 'Start'}
                      </Text>
                    </TouchScale>
                    {state.status === 'over' && (
                      <TouchScale
                        style={styles.shareBtn}
                        onPress={() => {
                          const sc = state.score;
                          shareResult(`I scored ${sc} in Shake Work Off 🐍 — can you beat it?`).then((o) => {
                            track(EVENTS.share, { where: 'solo', score: sc, outcome: o });
                            if (o === 'copied') {
                              setShareNote('Link copied!');
                              setTimeout(() => setShareNote(''), 1500);
                            }
                          });
                        }}
                        accessibilityLabel="share-score"
                      >
                        <Text style={styles.shareBtnText}>{shareNote || 'Share score'}</Text>
                      </TouchScale>
                    )}
                  </FadePop>
                </View>
              )}

              {state.status === 'playing' && !paused && (
                <TouchScale style={styles.pauseBtn} haptic={false} onPress={() => setPaused(true)} accessibilityLabel="pause">
                  <Text style={styles.pauseBtnText}>⏸</Text>
                </TouchScale>
              )}

              {state.status === 'playing' && paused && (
                <View style={styles.overlay}>
                  <FadePop style={styles.overlayInner}>
                    <Text style={styles.overlayTitle}>Paused</Text>
                    <TouchScale
                      style={[styles.startBtn, { backgroundColor: skin.body }]}
                      onPress={() => setPaused(false)}
                      accessibilityLabel="resume"
                    >
                      <Text style={styles.startBtnText}>Resume</Text>
                    </TouchScale>
                  </FadePop>
                </View>
              )}
          </View>
        </GestureDetector>

          <Text style={styles.hint}>Swipe anywhere or use the D-pad</Text>

          <Dpad onPress={handleTurn} />
        </View>
        {showOnboarding && <Onboarding onDone={finishOnboarding} />}
      </LinearGradient>
    </GestureHandlerRootView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppInner />
    </SafeAreaProvider>
  );
}

function DirButton({
  label,
  dir,
  onPress,
}: {
  label: string;
  dir: Direction;
  onPress: (d: Direction) => void;
}) {
  return (
    <TouchScale style={styles.dirBtn} onPress={() => onPress(dir)} accessibilityLabel={`dir-${dir}`}>
      <Text style={styles.dirBtnText}>{label}</Text>
    </TouchScale>
  );
}

// D-pad вынесен и мемоизирован: onPress стабилен (useCallback), поэтому панель НЕ
// реконсилится на каждом игровом тике (меньше работы рендера → плавнее).
const Dpad = memo(function Dpad({ onPress }: { onPress: (d: Direction) => void }) {
  return (
    <View style={styles.dpad}>
      <DirButton label="▲" dir="up" onPress={onPress} />
      <View style={styles.dpadRow}>
        <DirButton label="◀" dir="left" onPress={onPress} />
        <DirButton label="▼" dir="down" onPress={onPress} />
        <DirButton label="▶" dir="right" onPress={onPress} />
      </View>
    </View>
  );
});

function ShopOverlay({
  wallet,
  onBuy,
  onSelect,
  onClose,
}: {
  wallet: Wallet;
  onBuy: (s: Skin) => void;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.shopOverlay}>
      <View style={styles.shopCard}>
        <View style={styles.shopHeader}>
          <Text style={styles.shopTitle}>Skins</Text>
          <View style={styles.coinPill}>
            <View style={styles.coinDot} />
            <Text style={styles.coinText}>{wallet.coins}</Text>
          </View>
        </View>

        <ScrollView style={styles.shopList} contentContainerStyle={{ gap: 10 }}>
          {SKINS.map((s) => {
            const owned = isOwned(wallet, s.id);
            const selected = wallet.selected === s.id;
            const affordable = canBuy(wallet, s);
            return (
              <View key={s.id} style={styles.skinRow}>
                <View style={styles.skinSwatch}>
                  <View style={[styles.swatchCell, { backgroundColor: s.body }]} />
                  <View style={[styles.swatchCell, { backgroundColor: s.head }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.skinName}>{s.name}</Text>
                  <Text style={styles.skinPrice}>{s.price === 0 ? 'Free' : `${s.price} coins`}</Text>
                </View>
                {selected ? (
                  <View style={[styles.skinBtn, styles.skinBtnActive]}>
                    <Text style={styles.skinBtnActiveText}>Selected</Text>
                  </View>
                ) : owned ? (
                  <TouchScale
                    style={styles.skinBtn}
                    onPress={() => onSelect(s.id)}
                    accessibilityLabel={`select-${s.id}`}
                  >
                    <Text style={styles.skinBtnText}>Select</Text>
                  </TouchScale>
                ) : (
                  <TouchScale
                    style={[styles.skinBtn, !affordable && styles.skinBtnDisabled]}
                    onPress={() => affordable && onBuy(s)}
                    accessibilityLabel={`buy-${s.id}`}
                  >
                    <Text style={[styles.skinBtnText, !affordable && styles.skinBtnDisabledText]}>
                      Buy
                    </Text>
                  </TouchScale>
                )}
              </View>
            );
          })}
        </ScrollView>

        <TouchScale style={styles.closeBtn} onPress={onClose} accessibilityLabel="shop-close">
          <Text style={styles.closeBtnText}>Close</Text>
        </TouchScale>
      </View>
    </View>
  );
}

function QuestsOverlay({
  items,
  onClaim,
  onClose,
}: {
  items: Quest[];
  onClaim: (type: string) => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.shopOverlay}>
      <View style={styles.shopCard}>
        <View style={styles.shopHeader}>
          <Text style={styles.shopTitle}>Daily quests</Text>
        </View>
        <View style={{ gap: 10 }}>
          {items.map((q) => {
            const pct = Math.min(1, q.progress / q.target);
            const can = questClaimable(q);
            return (
              <View key={q.type} style={styles.questRow}>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={styles.questLabel}>{questLabel(q)}</Text>
                  <View style={styles.questBar}>
                    <View style={[styles.questBarFill, { width: `${pct * 100}%` }]} />
                  </View>
                  <Text style={styles.questMeta}>
                    {Math.min(q.progress, q.target)}/{q.target} · +{q.reward}
                  </Text>
                </View>
                {q.claimed ? (
                  <View style={[styles.skinBtn, styles.skinBtnActive]}>
                    <Text style={styles.skinBtnActiveText}>Done</Text>
                  </View>
                ) : (
                  <TouchScale
                    style={[styles.skinBtn, !can && styles.skinBtnDisabled]}
                    onPress={() => can && onClaim(q.type)}
                    accessibilityLabel={`claim-${q.type}`}
                  >
                    <Text style={[styles.skinBtnText, !can && styles.skinBtnDisabledText]}>Claim</Text>
                  </TouchScale>
                )}
              </View>
            );
          })}
        </View>
        <TouchScale style={styles.closeBtn} onPress={onClose} accessibilityLabel="quests-close">
          <Text style={styles.closeBtnText}>Close</Text>
        </TouchScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bg: { flex: 1 },
  boot: { flex: 1, backgroundColor: COLORS.bg },
  eye: { position: 'absolute', backgroundColor: '#06121e' },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Platform.OS === 'web' ? 18 : 44,
    paddingBottom: 18,
    gap: 10,
  },
  // Меню (прокручиваемое) и соло-экран (фиксированный, под swipe).
  menuScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 16 },
  soloContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 16 },
  soloTop: { width: '100%', maxWidth: 420, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  backChip: { backgroundColor: COLORS.surface, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.borderGlass },
  backChipText: { fontFamily: fonts.bodyBold, color: COLORS.text, fontSize: 14 },
  soloScores: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  soloScoreText: { fontFamily: fonts.bodyBold, color: COLORS.textDim, fontSize: 11, letterSpacing: 1 },
  soloScoreVal: { fontFamily: fonts.num, color: COLORS.text, fontSize: 18 },
  statRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  bestPill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.surface, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.borderGlass },
  bestPillLabel: { fontFamily: fonts.bodyBold, color: COLORS.textDim, fontSize: 10, letterSpacing: 2 },
  bestPillVal: { fontFamily: fonts.num, color: COLORS.brand1, fontSize: 16 },
  soundChip: { backgroundColor: COLORS.surface, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: COLORS.borderGlass },
  soundChipText: { fontSize: 16 },
  menuCta: { paddingVertical: 14, alignItems: 'center' },
  menuCtaText: { fontFamily: fonts.display, color: COLORS.onAccent, fontSize: 17, letterSpacing: 0.5 },
  menuGhostRow: { flexDirection: 'row', gap: 10 },
  ghostHalf: { flex: 1 },
  header: { alignItems: 'center', gap: 3 },
  title: { fontFamily: fonts.display, fontSize: 25, letterSpacing: 1.5, textAlign: 'center' },
  subtitle: { fontFamily: fonts.bodyBold, color: COLORS.textFaint, fontSize: 10, letterSpacing: 5 },
  acctChip: { marginTop: 4, backgroundColor: COLORS.surface, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 12, borderWidth: 1, borderColor: COLORS.borderGlass, maxWidth: 260 },
  acctText: { fontFamily: fonts.body, color: COLORS.textDim, fontSize: 11 },
  dailyWrap: { width: '100%', maxWidth: 360, borderRadius: 999, overflow: 'hidden', ...elevation.glow },
  dailyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 18 },
  dailyText: { fontFamily: fonts.bodyBold, color: COLORS.onAccent, fontSize: 13 },
  dailyClaimText: { fontFamily: fonts.display, color: COLORS.onAccent, fontSize: 14, letterSpacing: 0.5 },
  scoreRow: { flexDirection: 'row', gap: 12 },
  scoreBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 22,
    alignItems: 'center',
    minWidth: 100,
    borderWidth: 1,
    borderColor: COLORS.borderGlass,
    ...elevation.card,
  },
  scoreLabel: { fontFamily: fonts.bodyBold, color: COLORS.textDim, fontSize: 10, letterSpacing: 2 },
  scoreValue: { fontFamily: fonts.num, color: COLORS.text, fontSize: 24 },
  scoreBest: { color: COLORS.brand1 },
  coinRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coinPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: COLORS.surface,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.borderGlass,
  },
  coinDot: { width: 15, height: 15, borderRadius: 8, backgroundColor: COLORS.coin },
  coinText: { fontFamily: fonts.num, color: COLORS.coinHi, fontSize: 15 },
  ghostBtn: {
    backgroundColor: COLORS.surface,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: COLORS.borderGlass,
    alignItems: 'center',
  },
  ghostText: { fontFamily: fonts.bodyBold, color: COLORS.text, fontSize: 14 },
  ctaWrap: { borderRadius: 999, overflow: 'hidden', ...elevation.glow },
  cta: { paddingVertical: 9, paddingHorizontal: 22, alignItems: 'center' },
  ctaText: { fontFamily: fonts.display, color: COLORS.onAccent, fontSize: 14, letterSpacing: 0.5 },
  wide: { width: '100%', maxWidth: 360 },
  rankedCta: { paddingVertical: 12, alignItems: 'center' },
  rankedText: { fontFamily: fonts.bodyBold, color: COLORS.onBrand, fontSize: 14, letterSpacing: 0.5 },
  ghostWide: { paddingVertical: 11 },
  helpLink: { paddingVertical: 2, paddingHorizontal: 10 },
  helpText: { fontFamily: fonts.body, color: COLORS.textFaint, fontSize: 13, textDecorationLine: 'underline' },
  board: {
    backgroundColor: COLORS.board,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: COLORS.borderGlow,
    ...elevation.card,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(7,10,16,0.86)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  overlayInner: { alignItems: 'center', gap: 14 },
  overlayTitle: { fontFamily: fonts.display, color: COLORS.text, fontSize: 26, letterSpacing: 1 },
  overlaySub: { fontFamily: fonts.body, color: COLORS.textDim, fontSize: 16 },
  startBtn: { paddingVertical: 12, paddingHorizontal: 34, borderRadius: 999 },
  startBtnText: { fontFamily: fonts.display, color: COLORS.onAccent, fontSize: 18 },
  shareBtn: { paddingVertical: 9, paddingHorizontal: 22, borderRadius: 999, borderWidth: 1, borderColor: COLORS.borderGlass, backgroundColor: COLORS.surface },
  shareBtnText: { fontFamily: fonts.bodyBold, color: COLORS.text, fontSize: 14 },
  pauseBtn: { position: 'absolute', top: 8, right: 8, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(7,10,16,0.55)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.borderGlass },
  pauseBtnText: { color: COLORS.text, fontSize: 14 },
  hint: { fontFamily: fonts.body, color: COLORS.textFaint, fontSize: 12, letterSpacing: 0.5 },
  dpad: { alignItems: 'center', gap: 10 },
  dpadRow: { flexDirection: 'row', gap: 10 },
  dirBtn: {
    width: 58,
    height: 58,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderGlass,
  },
  dirBtnPressed: { backgroundColor: COLORS.surfaceHi },
  dirBtnText: { color: COLORS.text, fontSize: 24 },
  shopOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.66)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  shopCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    backgroundColor: COLORS.bg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 12,
    ...elevation.card,
  },
  shopHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  shopTitle: { fontFamily: fonts.display, color: COLORS.text, fontSize: 20, letterSpacing: 1 },
  shopList: { flexGrow: 0 },
  skinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.borderGlass,
  },
  questRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: COLORS.borderGlass },
  questLabel: { fontFamily: fonts.bodyBold, color: COLORS.text, fontSize: 14 },
  questBar: { height: 6, borderRadius: 3, backgroundColor: COLORS.surfaceHi, overflow: 'hidden' },
  questBarFill: { height: 6, borderRadius: 3, backgroundColor: COLORS.brand1 },
  questMeta: { fontFamily: fonts.body, color: COLORS.textDim, fontSize: 11 },
  skinSwatch: { flexDirection: 'row', gap: 3 },
  swatchCell: { width: 18, height: 18, borderRadius: 6 },
  skinName: { fontFamily: fonts.bodyBold, color: COLORS.text, fontSize: 16 },
  skinPrice: { fontFamily: fonts.body, color: COLORS.textDim, fontSize: 13 },
  skinBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
    minWidth: 84,
    alignItems: 'center',
  },
  skinBtnText: { fontFamily: fonts.bodyBold, color: COLORS.onAccent, fontSize: 14 },
  skinBtnActive: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.brand2 },
  skinBtnActiveText: { fontFamily: fonts.bodyBold, color: COLORS.brand2, fontSize: 14 },
  skinBtnDisabled: { backgroundColor: COLORS.surfaceHi },
  skinBtnDisabledText: { color: COLORS.textFaint },
  closeBtn: {
    backgroundColor: COLORS.surfaceHi,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeBtnText: { fontFamily: fonts.bodyBold, color: COLORS.text, fontSize: 16 },
});
