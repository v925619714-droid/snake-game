import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { BOARD, type Direction, swipeToDirection } from '../game/logic';
import { useRoom } from '../net/useRoom';

const C = {
  bg: '#0e1116',
  board: '#161b22',
  border: '#222b36',
  food: '#ff5c5c',
  text: '#e6edf3',
  textDim: '#8b949e',
  btn: '#222b36',
  accent: '#3ddc84',
};

const PLAYER_COLORS = [
  { body: '#3ddc84', head: '#7cffb0' }, // 0 — хост
  { body: '#5cc8ff', head: '#b3e8ff' }, // 1 — гость
];

export default function CoopGame({ onExit }: { onExit: () => void }) {
  const { width, height } = useWindowDimensions();
  const boardPx = Math.max(200, Math.floor(Math.min(width - 32, height - 320, 380)));
  const cell = boardPx / BOARD;

  const { conn, role, code, coop, createRoom, joinRoom, startGame, turn, leave } = useRoom();
  const [joinCode, setJoinCode] = useState('');

  const handleExit = useCallback(() => {
    leave();
    onExit();
  }, [leave, onExit]);

  // Клавиатура (web/десктоп).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const map: Record<string, Direction> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'Enter') && role === 'host' && conn === 'ready') {
        e.preventDefault();
        startGame();
        return;
      }
      const dir = map[e.key];
      if (dir && coop && coop.status === 'playing') {
        e.preventDefault();
        turn(dir);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [coop, role, conn, turn, startGame]);

  const swipe = useMemo(
    () =>
      Gesture.Pan().onEnd((e) => {
        const dir = swipeToDirection(e.translationX, e.translationY);
        if (dir && coop?.status === 'playing') turn(dir);
      }),
    [coop, turn],
  );

  // ЛОББИ (партия ещё не идёт).
  if (!coop) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Онлайн вдвоём</Text>

        {conn === 'idle' && (
          <View style={styles.lobby}>
            <Pressable style={styles.bigBtn} onPress={createRoom} accessibilityLabel="create-room">
              <Text style={styles.bigBtnText}>Создать комнату</Text>
            </Pressable>
            <Text style={styles.or}>или войти по коду</Text>
            <View style={styles.joinRow}>
              <TextInput
                style={styles.input}
                value={joinCode}
                onChangeText={(t) => setJoinCode(t.toUpperCase())}
                placeholder="КОД"
                placeholderTextColor={C.textDim}
                autoCapitalize="characters"
                maxLength={4}
                accessibilityLabel="join-code"
              />
              <Pressable
                style={styles.joinBtn}
                onPress={() => joinCode.length >= 3 && joinRoom(joinCode)}
                accessibilityLabel="join-room"
              >
                <Text style={styles.bigBtnText}>Войти</Text>
              </Pressable>
            </View>
          </View>
        )}

        {(conn === 'connecting' || conn === 'waiting' || conn === 'ready') && (
          <View style={styles.lobby}>
            {role === 'host' && (
              <View style={styles.codeBox}>
                <Text style={styles.codeLabel}>Код комнаты</Text>
                <Text style={styles.codeValue} accessibilityLabel={`room-code-${code}`}>
                  {code}
                </Text>
                <Text style={styles.codeHint}>Передай его второму игроку</Text>
              </View>
            )}
            <Text style={styles.status} accessibilityLabel={`conn-${conn}`}>
              {conn === 'connecting' && 'Подключаемся…'}
              {conn === 'waiting' && 'Ждём второго игрока…'}
              {conn === 'ready' && role === 'host' && 'Игрок подключился!'}
              {conn === 'ready' && role === 'guest' && 'Ждём, пока хост начнёт…'}
            </Text>
            {conn === 'ready' && role === 'host' && (
              <Pressable style={styles.bigBtn} onPress={startGame} accessibilityLabel="coop-start">
                <Text style={styles.bigBtnText}>Старт</Text>
              </Pressable>
            )}
          </View>
        )}

        {conn === 'error' && <Text style={styles.status}>Ошибка соединения</Text>}

        <Pressable style={styles.backBtn} onPress={handleExit} accessibilityLabel="coop-back">
          <Text style={styles.backText}>Назад</Text>
        </Pressable>
      </View>
    );
  }

  // ПАРТИЯ.
  const youIndex = role === 'host' ? 0 : 1;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Вдвоём</Text>
      <View style={styles.scoreRow}>
        <View style={styles.scoreBox}>
          <Text style={styles.scoreLabel}>Собрано вместе</Text>
          <Text style={styles.scoreValue} accessibilityLabel={`coop-score-${coop.score}`}>
            {coop.score}
          </Text>
        </View>
      </View>
      <Text style={[styles.youHint, { color: PLAYER_COLORS[youIndex].head }]}>
        Вы — {youIndex === 0 ? 'зелёная' : 'синяя'}
      </Text>

      <GestureDetector gesture={swipe}>
        <View style={[styles.board, { width: boardPx, height: boardPx }]}>
          {coop.snakes.map((snake, si) =>
            snake.map((p, i) => (
              <View
                key={`${si}-${i}`}
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
                    backgroundColor: i === 0 ? PLAYER_COLORS[si].head : PLAYER_COLORS[si].body,
                  }}
                />
              </View>
            )),
          )}
          <View
            style={{
              position: 'absolute',
              left: coop.food.x * cell,
              top: coop.food.y * cell,
              width: cell,
              height: cell,
              padding: 2,
            }}
          >
            <View style={{ flex: 1, borderRadius: cell / 2, backgroundColor: C.food }} />
          </View>

          {coop.status === 'over' && (
            <View style={styles.overlay}>
              <Text style={styles.overlayTitle}>Игра окончена</Text>
              <Text style={styles.overlaySub}>Собрано: {coop.score}</Text>
              {role === 'host' ? (
                <Pressable style={styles.bigBtn} onPress={startGame} accessibilityLabel="coop-restart">
                  <Text style={styles.bigBtnText}>Заново</Text>
                </Pressable>
              ) : (
                <Text style={styles.overlaySub}>Ждём хоста…</Text>
              )}
            </View>
          )}
        </View>
      </GestureDetector>

      <View style={styles.dpad}>
        <DirButton label="▲" dir="up" onPress={turn} />
        <View style={styles.dpadRow}>
          <DirButton label="◀" dir="left" onPress={turn} />
          <DirButton label="▼" dir="down" onPress={turn} />
          <DirButton label="▶" dir="right" onPress={turn} />
        </View>
      </View>

      <Pressable style={styles.backBtn} onPress={handleExit} accessibilityLabel="coop-back">
        <Text style={styles.backText}>Выйти</Text>
      </Pressable>
    </View>
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
    <Pressable style={styles.dirBtn} onPress={() => onPress(dir)} accessibilityLabel={`dir-${dir}`}>
      <Text style={styles.dirBtnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Platform.OS === 'web' ? 20 : 44,
    paddingBottom: 20,
    gap: 14,
  },
  title: { color: C.text, fontSize: 26, fontWeight: '700', letterSpacing: 1 },
  lobby: { alignItems: 'center', gap: 16, width: '100%', maxWidth: 360 },
  bigBtn: {
    backgroundColor: C.accent,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 36,
    alignItems: 'center',
  },
  bigBtnText: { color: '#08130b', fontSize: 17, fontWeight: '700' },
  or: { color: C.textDim, fontSize: 14 },
  joinRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    backgroundColor: C.board,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    color: C.text,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
    paddingVertical: 10,
    width: 130,
  },
  joinBtn: {
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  codeBox: { alignItems: 'center', gap: 4, backgroundColor: C.board, borderRadius: 14, padding: 18 },
  codeLabel: { color: C.textDim, fontSize: 13 },
  codeValue: { color: C.text, fontSize: 40, fontWeight: '700', letterSpacing: 8 },
  codeHint: { color: C.textDim, fontSize: 13 },
  status: { color: C.text, fontSize: 16 },
  scoreRow: { flexDirection: 'row' },
  scoreBox: {
    backgroundColor: C.board,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  scoreLabel: { color: C.textDim, fontSize: 12 },
  scoreValue: { color: C.text, fontSize: 22, fontWeight: '700' },
  youHint: { fontSize: 14, fontWeight: '500' },
  board: {
    backgroundColor: C.board,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(14,17,22,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  overlayTitle: { color: C.text, fontSize: 24, fontWeight: '700' },
  overlaySub: { color: C.textDim, fontSize: 16 },
  dpad: { alignItems: 'center', gap: 10 },
  dpadRow: { flexDirection: 'row', gap: 10 },
  dirBtn: {
    width: 58,
    height: 58,
    borderRadius: 16,
    backgroundColor: C.btn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dirBtnText: { color: C.text, fontSize: 24 },
  backBtn: { paddingVertical: 8, paddingHorizontal: 20 },
  backText: { color: C.textDim, fontSize: 15 },
});
