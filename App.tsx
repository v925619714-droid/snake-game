import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
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
import DuelGame from './src/screens/DuelGame';
import { type Profile, loadProfile, saveProfile } from './src/lib/profile';
import { tierFor } from './src/game/rating';
import Leaderboard from './src/screens/Leaderboard';
import { pushProfile } from './src/lib/leaderboard';
import { EVENTS, identify, track } from './src/lib/analytics';

const COLORS = {
  bg: '#0e1116',
  board: '#161b22',
  border: '#222b36',
  food: '#ff5c5c',
  text: '#e6edf3',
  textDim: '#8b949e',
  btn: '#222b36',
  btnPressed: '#2d3947',
  coin: '#f1c40f',
  accent: '#3ddc84',
};

const BEST_KEY = 'snake:best';
const WALLET_KEY = 'snake:wallet';

function speedFor(score: number): number {
  return Math.max(70, 160 - score * 4);
}

export default function App() {
  const { width, height } = useWindowDimensions();
  const boardPx = Math.max(180, Math.floor(Math.min(width - 32, height - 380, 360)));
  const cell = boardPx / BOARD;

  const [state, setState] = useState<GameState>(() => createInitialState());
  const [best, setBest] = useState(0);
  const [wallet, setWallet] = useState<Wallet>(initialWallet);
  const [showShop, setShowShop] = useState(false);
  const initialRoom = useMemo(
    () =>
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('room')
        : null,
    [],
  );
  const [mode, setMode] = useState<'solo' | 'duel' | 'leaderboard'>(initialRoom ? 'duel' : 'solo');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [duelRanked, setDuelRanked] = useState(false);
  const prevScore = useRef(0);
  const walletLoaded = useRef(false);
  const walletRef = useRef(wallet);
  walletRef.current = wallet;

  const skin = getSkin(wallet.selected);

  const saveWallet = useCallback((w: Wallet) => {
    AsyncStorage.setItem(WALLET_KEY, JSON.stringify(w)).catch(() => {});
  }, []);

  useEffect(() => {
    track(EVENTS.appOpen, { entry: initialRoom ? 'invite' : 'direct' });
    loadProfile()
      .then((p) => {
        setProfile(p);
        pushProfile(p);
        identify(p.id, {
          name: p.name,
          rating: p.rating,
          wins: p.wins,
          losses: p.losses,
          tier: tierFor(p.rating).name,
        });
      })
      .catch(() => {});
    AsyncStorage.getItem(BEST_KEY)
      .then((v) => {
        const n = v ? parseInt(v, 10) : 0;
        if (Number.isFinite(n) && n > 0) setBest(n);
      })
      .catch(() => {});
    AsyncStorage.getItem(WALLET_KEY)
      .then((raw) => {
        if (raw) {
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

  useEffect(() => {
    if (state.status !== 'playing') return;
    const id = setInterval(() => setState((s) => step(s)), speedFor(state.score));
    return () => clearInterval(id);
  }, [state.status, state.score]);

  useEffect(() => {
    const delta = state.score - prevScore.current;
    if (delta > 0) {
      setWallet((w) => addCoins(w, delta));
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
    }
    prevScore.current = state.score;
  }, [state.score]);

  useEffect(() => {
    if (state.status !== 'over') return;
    track(EVENTS.soloGameOver, { score: state.score, best, new_best: state.score > best });
    setBest((b) => {
      const next = Math.max(b, state.score);
      if (next !== b) AsyncStorage.setItem(BEST_KEY, String(next)).catch(() => {});
      return next;
    });
    if (walletLoaded.current) saveWallet(walletRef.current);
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  }, [state.status, state.score, saveWallet]);

  const handleTurn = useCallback((dir: Direction) => {
    setState((s) => turn(s, dir));
  }, []);

  const handleStart = useCallback(() => {
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
  }, [handleTurn, handleStart]);

  const swipe = useMemo(
    () =>
      Gesture.Pan().onEnd((e) => {
        const dir = swipeToDirection(e.translationX, e.translationY);
        if (dir) handleTurn(dir);
      }),
    [handleTurn],
  );

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
    },
    [saveWallet],
  );

  const handleSelect = useCallback(
    (id: string) => {
      const nw = selectSkin(walletRef.current, id);
      track(EVENTS.skinSelected, { skin: id });
      setWallet(nw);
      saveWallet(nw);
    },
    [saveWallet],
  );

  const handleRatingResult = useCallback(
    (r: { result: 'win' | 'loss' | 'draw'; newRating: number; delta: number }) => {
      setProfile((p) => {
        if (!p) return p;
        const np: Profile = {
          ...p,
          rating: r.newRating,
          wins: p.wins + (r.result === 'win' ? 1 : 0),
          losses: p.losses + (r.result === 'loss' ? 1 : 0),
        };
        track(EVENTS.ratingChange, {
          result: r.result,
          old_rating: p.rating,
          new_rating: r.newRating,
          delta: r.delta,
          tier: tierFor(r.newRating).name,
        });
        saveProfile(np);
        pushProfile(np);
        return np;
      });
    },
    [],
  );

  if (mode === 'leaderboard') {
    return (
      <GestureHandlerRootView style={styles.root}>
        <Leaderboard myId={profile?.id ?? ''} onBack={() => setMode('solo')} />
      </GestureHandlerRootView>
    );
  }

  if (mode === 'duel') {
    return (
      <GestureHandlerRootView style={styles.root}>
        <DuelGame
          onExit={() => setMode('solo')}
          autoJoin={duelRanked ? null : initialRoom}
          ranked={duelRanked}
          myRating={profile?.rating ?? 1000}
          onRatingResult={handleRatingResult}
        />
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={styles.container}>
        <StatusBar style="light" />
        <Text style={styles.title}>Chroma Coil</Text>

        <View style={styles.scoreRow}>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>Score</Text>
            <Text style={styles.scoreValue} accessibilityLabel={`score-${state.score}`}>
              {state.score}
            </Text>
          </View>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>Best</Text>
            <Text style={styles.scoreValue}>{best}</Text>
          </View>
        </View>

        <View style={styles.coinRow}>
          <View style={styles.coinPill}>
            <View style={styles.coinDot} />
            <Text style={styles.coinText} accessibilityLabel={`coins-${wallet.coins}`}>
              {wallet.coins}
            </Text>
          </View>
          <Pressable style={styles.shopBtn} onPress={openShop} accessibilityLabel="shop">
            <Text style={styles.shopBtnText}>Shop</Text>
          </Pressable>
          <Pressable
            style={styles.shopBtn}
            onPress={() => {
              track(EVENTS.matchmakingStart, { mode: 'versus' });
              setDuelRanked(false);
              setMode('duel');
            }}
            accessibilityLabel="versus"
          >
            <Text style={styles.shopBtnText}>Versus</Text>
          </Pressable>
        </View>

        <Pressable
          style={[styles.shopBtn, styles.rankedBtn]}
          onPress={() => {
            track(EVENTS.matchmakingStart, { mode: 'ranked', rating: profile?.rating ?? 1000 });
            setDuelRanked(true);
            setMode('duel');
          }}
          accessibilityLabel="ranked"
        >
          <Text style={styles.rankedBtnText}>
            Ranked · {tierFor(profile?.rating ?? 1000).name} {profile?.rating ?? 1000}
          </Text>
        </Pressable>

        <Pressable
          style={styles.shopBtn}
          onPress={() => {
            track(EVENTS.leaderboardOpen);
            setMode('leaderboard');
          }}
          accessibilityLabel="leaderboard"
        >
          <Text style={styles.shopBtnText}>Leaderboard</Text>
        </Pressable>

        <GestureDetector gesture={swipe}>
          <View style={[styles.board, { width: boardPx, height: boardPx }]}>
            {state.snake.map((p, i) => (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  left: p.x * cell,
                  top: p.y * cell,
                  width: cell,
                  height: cell,
                  padding: 1,
                }}
              >
                <View
                  style={{
                    flex: 1,
                    borderRadius: cell * 0.28,
                    backgroundColor: i === 0 ? skin.head : skin.body,
                  }}
                />
              </View>
            ))}

            <View
              style={{
                position: 'absolute',
                left: state.food.x * cell,
                top: state.food.y * cell,
                width: cell,
                height: cell,
                padding: 2,
              }}
            >
              <View style={{ flex: 1, borderRadius: cell / 2, backgroundColor: COLORS.food }} />
            </View>

            {state.status !== 'playing' && (
              <View style={styles.overlay}>
                <Text style={styles.overlayTitle}>
                  {state.status === 'over' ? 'Game over' : 'Ready?'}
                </Text>
                {state.status === 'over' && (
                  <Text style={styles.overlaySub}>Score: {state.score}</Text>
                )}
                <Pressable
                  style={[styles.startBtn, { backgroundColor: skin.body }]}
                  onPress={handleStart}
                  accessibilityLabel="start"
                >
                  <Text style={styles.startBtnText}>
                    {state.status === 'over' ? 'Again' : 'Start'}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </GestureDetector>

        <Text style={styles.hint}>Swipe or arrows · space to start</Text>

        <View style={styles.dpad}>
          <DirButton label="▲" dir="up" onPress={handleTurn} />
          <View style={styles.dpadRow}>
            <DirButton label="◀" dir="left" onPress={handleTurn} />
            <DirButton label="▼" dir="down" onPress={handleTurn} />
            <DirButton label="▶" dir="right" onPress={handleTurn} />
          </View>
        </View>

        {showShop && (
          <ShopOverlay
            wallet={wallet}
            onBuy={handleBuy}
            onSelect={handleSelect}
            onClose={() => setShowShop(false)}
          />
        )}
      </View>
    </GestureHandlerRootView>
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
    <Pressable
      style={({ pressed }) => [styles.dirBtn, pressed && styles.dirBtnPressed]}
      onPress={() => onPress(dir)}
      accessibilityLabel={`dir-${dir}`}
    >
      <Text style={styles.dirBtnText}>{label}</Text>
    </Pressable>
  );
}

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
                  <Pressable
                    style={styles.skinBtn}
                    onPress={() => onSelect(s.id)}
                    accessibilityLabel={`select-${s.id}`}
                  >
                    <Text style={styles.skinBtnText}>Select</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.skinBtn, !affordable && styles.skinBtnDisabled]}
                    onPress={() => affordable && onBuy(s)}
                    accessibilityLabel={`buy-${s.id}`}
                  >
                    <Text style={[styles.skinBtnText, !affordable && styles.skinBtnDisabledText]}>
                      Buy
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </ScrollView>

        <Pressable style={styles.closeBtn} onPress={onClose} accessibilityLabel="shop-close">
          <Text style={styles.closeBtnText}>Close</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Platform.OS === 'web' ? 20 : 44,
    paddingBottom: 20,
    gap: 12,
  },
  title: { color: COLORS.text, fontSize: 28, fontWeight: '700', letterSpacing: 1 },
  scoreRow: { flexDirection: 'row', gap: 12 },
  scoreBox: {
    backgroundColor: COLORS.board,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 18,
    alignItems: 'center',
    minWidth: 90,
  },
  scoreLabel: { color: COLORS.textDim, fontSize: 12 },
  scoreValue: { color: COLORS.text, fontSize: 20, fontWeight: '700' },
  coinRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coinPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.board,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  coinDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: COLORS.coin },
  coinText: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  shopBtn: {
    backgroundColor: COLORS.board,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  shopBtnText: { color: COLORS.text, fontSize: 14, fontWeight: '500' },
  rankedBtn: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  rankedBtnText: { color: '#08130b', fontSize: 14, fontWeight: '700' },
  board: {
    backgroundColor: COLORS.board,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(14,17,22,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  overlayTitle: { color: COLORS.text, fontSize: 24, fontWeight: '700' },
  overlaySub: { color: COLORS.textDim, fontSize: 16 },
  startBtn: { paddingVertical: 12, paddingHorizontal: 32, borderRadius: 999 },
  startBtnText: { color: '#08130b', fontSize: 18, fontWeight: '700' },
  hint: { color: COLORS.textDim, fontSize: 13 },
  dpad: { alignItems: 'center', gap: 10 },
  dpadRow: { flexDirection: 'row', gap: 10 },
  dirBtn: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: COLORS.btn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dirBtnPressed: { backgroundColor: COLORS.btnPressed },
  dirBtnText: { color: COLORS.text, fontSize: 24 },
  shopOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  shopCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    backgroundColor: COLORS.bg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 12,
  },
  shopHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  shopTitle: { color: COLORS.text, fontSize: 20, fontWeight: '700' },
  shopList: { flexGrow: 0 },
  skinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.board,
    borderRadius: 12,
    padding: 10,
  },
  skinSwatch: { flexDirection: 'row', gap: 3 },
  swatchCell: { width: 18, height: 18, borderRadius: 5 },
  skinName: { color: COLORS.text, fontSize: 16, fontWeight: '500' },
  skinPrice: { color: COLORS.textDim, fontSize: 13 },
  skinBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
    minWidth: 84,
    alignItems: 'center',
  },
  skinBtnText: { color: '#08130b', fontSize: 14, fontWeight: '700' },
  skinBtnActive: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.accent },
  skinBtnActiveText: { color: COLORS.accent, fontSize: 14, fontWeight: '700' },
  skinBtnDisabled: { backgroundColor: COLORS.btn },
  skinBtnDisabledText: { color: COLORS.textDim },
  closeBtn: {
    backgroundColor: COLORS.btn,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeBtnText: { color: COLORS.text, fontSize: 16, fontWeight: '500' },
});
