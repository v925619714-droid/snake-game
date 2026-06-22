import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
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

const COLORS = {
  bg: '#0e1116',
  board: '#161b22',
  border: '#222b36',
  snake: '#3ddc84',
  snakeHead: '#7cffb0',
  food: '#ff5c5c',
  text: '#e6edf3',
  textDim: '#8b949e',
  btn: '#222b36',
  btnPressed: '#2d3947',
};

const BEST_KEY = 'snake:best';

function speedFor(score: number): number {
  return Math.max(70, 160 - score * 4);
}

export default function App() {
  const { width, height } = useWindowDimensions();
  const boardPx = Math.max(180, Math.floor(Math.min(width - 32, height - 360, 380)));
  const cell = boardPx / BOARD;

  const [state, setState] = useState<GameState>(() => createInitialState());
  const [best, setBest] = useState(0);
  const prevScore = useRef(0);

  // Загрузка сохранённого рекорда при первом запуске.
  useEffect(() => {
    AsyncStorage.getItem(BEST_KEY)
      .then((v) => {
        const n = v ? parseInt(v, 10) : 0;
        if (Number.isFinite(n) && n > 0) setBest(n);
      })
      .catch(() => {});
  }, []);

  // Игровой цикл.
  useEffect(() => {
    if (state.status !== 'playing') return;
    const id = setInterval(() => setState((s) => step(s)), speedFor(state.score));
    return () => clearInterval(id);
  }, [state.status, state.score]);

  // Обновление и сохранение рекорда.
  useEffect(() => {
    if (state.status !== 'over') return;
    setBest((b) => {
      const next = Math.max(b, state.score);
      if (next !== b) AsyncStorage.setItem(BEST_KEY, String(next)).catch(() => {});
      return next;
    });
  }, [state.status, state.score]);

  // Вибро-отклик (только на устройстве): на поедании и на проигрыше.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (state.score > prevScore.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    prevScore.current = state.score;
  }, [state.score]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (state.status === 'over') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  }, [state.status]);

  const handleTurn = useCallback((dir: Direction) => {
    setState((s) => turn(s, dir));
  }, []);

  const handleStart = useCallback(() => {
    setState((s) => (s.status === 'over' ? startGame(createInitialState()) : startGame(s)));
  }, []);

  // Управление с клавиатуры (web — для тестирования и десктопа).
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

  // Свайп по полю — управление пальцем.
  const swipe = useMemo(
    () =>
      Gesture.Pan().onEnd((e) => {
        const dir = swipeToDirection(e.translationX, e.translationY);
        if (dir) handleTurn(dir);
      }),
    [handleTurn],
  );

  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={styles.container}>
        <StatusBar style="light" />
        <Text style={styles.title}>Змейка</Text>

        <View style={styles.scoreRow}>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>Счёт</Text>
            <Text style={styles.scoreValue} accessibilityLabel={`score-${state.score}`}>
              {state.score}
            </Text>
          </View>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>Рекорд</Text>
            <Text style={styles.scoreValue}>{best}</Text>
          </View>
        </View>

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
                    backgroundColor: i === 0 ? COLORS.snakeHead : COLORS.snake,
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
                  {state.status === 'over' ? 'Игра окончена' : 'Готов?'}
                </Text>
                {state.status === 'over' && (
                  <Text style={styles.overlaySub}>Счёт: {state.score}</Text>
                )}
                <Pressable style={styles.startBtn} onPress={handleStart} accessibilityLabel="start">
                  <Text style={styles.startBtnText}>
                    {state.status === 'over' ? 'Заново' : 'Старт'}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </GestureDetector>

        <Text style={styles.hint}>Свайп или стрелки · пробел — старт</Text>

        <View style={styles.dpad}>
          <DirButton label="▲" dir="up" onPress={handleTurn} />
          <View style={styles.dpadRow}>
            <DirButton label="◀" dir="left" onPress={handleTurn} />
            <DirButton label="▼" dir="down" onPress={handleTurn} />
            <DirButton label="▶" dir="right" onPress={handleTurn} />
          </View>
        </View>
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Platform.OS === 'web' ? 24 : 48,
    paddingBottom: 24,
    gap: 14,
  },
  title: { color: COLORS.text, fontSize: 30, fontWeight: '700', letterSpacing: 1 },
  scoreRow: { flexDirection: 'row', gap: 12 },
  scoreBox: {
    backgroundColor: COLORS.board,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 20,
    alignItems: 'center',
    minWidth: 96,
  },
  scoreLabel: { color: COLORS.textDim, fontSize: 12 },
  scoreValue: { color: COLORS.text, fontSize: 22, fontWeight: '700' },
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
  overlayTitle: { color: COLORS.text, fontSize: 26, fontWeight: '700' },
  overlaySub: { color: COLORS.textDim, fontSize: 16 },
  startBtn: {
    backgroundColor: COLORS.snake,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 999,
  },
  startBtnText: { color: '#08130b', fontSize: 18, fontWeight: '700' },
  hint: { color: COLORS.textDim, fontSize: 13 },
  dpad: { alignItems: 'center', gap: 10 },
  dpadRow: { flexDirection: 'row', gap: 10 },
  dirBtn: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: COLORS.btn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dirBtnPressed: { backgroundColor: COLORS.btnPressed },
  dirBtnText: { color: COLORS.text, fontSize: 24 },
});
