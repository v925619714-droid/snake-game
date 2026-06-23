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
import { DUEL_BOARD, ROUND_TARGET } from '../game/duel';
import { type Direction, swipeToDirection } from '../game/logic';
import { useRoom } from '../net/useRoom';

const C = {
  bg: '#0e1116',
  board: '#161b22',
  border: '#222b36',
  text: '#e6edf3',
  textDim: '#8b949e',
  btn: '#222b36',
  accent: '#3ddc84',
};

const P = [
  { body: '#ff5c5c', head: '#ffb0a3', food: '#ff5c5c', name: 'Red' },
  { body: '#5cc8ff', head: '#b3e8ff', food: '#5cc8ff', name: 'Blue' },
];

export default function DuelGame({ onExit }: { onExit: () => void }) {
  const { width, height } = useWindowDimensions();
  const boardPx = Math.max(240, Math.floor(Math.min(width - 24, height - 320, 420)));
  const cell = boardPx / DUEL_BOARD;

  const { conn, role, code, duel, createRoom, joinRoom, startGame, turn, leave } = useRoom();
  const [joinCode, setJoinCode] = useState('');

  const handleExit = useCallback(() => {
    leave();
    onExit();
  }, [leave, onExit]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const map: Record<string, Direction> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'Enter') && role === 'host' && conn === 'ready' &&
        (!duel || duel.status === 'matchOver')) {
        e.preventDefault();
        startGame();
        return;
      }
      const dir = map[e.key];
      if (dir && duel && duel.status === 'playing') {
        e.preventDefault();
        turn(dir);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [duel, role, conn, turn, startGame]);

  const swipe = useMemo(
    () =>
      Gesture.Pan().onEnd((e) => {
        const dir = swipeToDirection(e.translationX, e.translationY);
        if (dir && duel?.status === 'playing') turn(dir);
      }),
    [duel, turn],
  );

  // ── LOBBY ──
  if (!duel) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Color Duel</Text>

        {conn === 'idle' && (
          <View style={styles.lobby}>
            <Pressable style={styles.bigBtn} onPress={createRoom} accessibilityLabel="create-room">
              <Text style={styles.bigBtnText}>Create room</Text>
            </Pressable>
            <Text style={styles.or}>or join with a code</Text>
            <View style={styles.joinRow}>
              <TextInput
                style={styles.input}
                value={joinCode}
                onChangeText={(t) => setJoinCode(t.toUpperCase())}
                placeholder="CODE"
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
                <Text style={styles.bigBtnText}>Join</Text>
              </Pressable>
            </View>
          </View>
        )}

        {(conn === 'connecting' || conn === 'waiting' || conn === 'ready') && (
          <View style={styles.lobby}>
            {role === 'host' && (
              <View style={styles.codeBox}>
                <Text style={styles.codeLabel}>Room code</Text>
                <Text style={styles.codeValue} accessibilityLabel={`room-code-${code}`}>
                  {code}
                </Text>
                <Text style={styles.codeHint}>Share it with the other player</Text>
              </View>
            )}
            <Text style={styles.status} accessibilityLabel={`conn-${conn}`}>
              {conn === 'connecting' && 'Connecting…'}
              {conn === 'waiting' && 'Waiting for opponent…'}
              {conn === 'ready' && role === 'host' && 'Opponent joined!'}
              {conn === 'ready' && role === 'guest' && 'Waiting for host to start…'}
            </Text>
            {conn === 'ready' && role === 'host' && (
              <Pressable style={styles.bigBtn} onPress={startGame} accessibilityLabel="duel-start">
                <Text style={styles.bigBtnText}>Start</Text>
              </Pressable>
            )}
            <Rules />
          </View>
        )}

        {conn === 'error' && <Text style={styles.status}>Connection error</Text>}

        <Pressable style={styles.backBtn} onPress={handleExit} accessibilityLabel="duel-back">
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  // ── MATCH ──
  const you = role === 'host' ? 0 : 1;
  const opp = you === 0 ? 1 : 0;
  const mine = P[you];

  return (
    <View style={styles.container}>
      <View style={styles.hud}>
        <ScoreChip label="You" color={mine.head} wins={duel.matchWins[you]} round={duel.roundScore[you]} />
        <View style={styles.roundBadge}>
          <Text style={styles.roundText}>Round {duel.round}</Text>
          <Text style={styles.roundSub}>first to {ROUND_TARGET}</Text>
        </View>
        <ScoreChip label="Opp" color={P[opp].head} wins={duel.matchWins[opp]} round={duel.roundScore[opp]} />
      </View>
      <Text style={[styles.youHint, { color: mine.head }]}>You are {mine.name} — eat {mine.name} food</Text>

      <GestureDetector gesture={swipe}>
        <View style={[styles.board, { width: boardPx, height: boardPx }]}>
          {duel.snakes.map((snake, si) =>
            snake.map((p, i) => (
              <View
                key={`${si}-${i}`}
                style={{ position: 'absolute', left: p.x * cell, top: p.y * cell, width: cell, height: cell, padding: 0.5 }}
              >
                <View style={{ flex: 1, borderRadius: cell * 0.28, backgroundColor: i === 0 ? P[si].head : P[si].body }} />
              </View>
            )),
          )}
          {duel.foods.map((f, i) => (
            <View
              key={`f-${i}`}
              style={{ position: 'absolute', left: f.pos.x * cell, top: f.pos.y * cell, width: cell, height: cell, padding: 1 }}
            >
              <View style={{ flex: 1, borderRadius: cell / 2, backgroundColor: P[f.color].food }} />
            </View>
          ))}

          {duel.status === 'roundOver' && (
            <View style={styles.overlay}>
              <Text style={styles.overlayTitle}>
                {duel.roundWinner === -1
                  ? 'Draw!'
                  : duel.roundWinner === you
                    ? 'Round won!'
                    : 'Round lost'}
              </Text>
              <Text style={styles.overlaySub}>Next round…</Text>
            </View>
          )}

          {duel.status === 'matchOver' && (
            <View style={styles.overlay}>
              <Text style={styles.overlayTitle}>
                {duel.matchWinner === you ? 'You win! 🏆' : 'You lose'}
              </Text>
              <Text style={styles.overlaySub}>
                {duel.matchWins[you]} : {duel.matchWins[opp]}
              </Text>
              {role === 'host' ? (
                <Pressable style={styles.bigBtn} onPress={startGame} accessibilityLabel="duel-restart">
                  <Text style={styles.bigBtnText}>Play again</Text>
                </Pressable>
              ) : (
                <Text style={styles.overlaySub}>Waiting for host…</Text>
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

      <Pressable style={styles.backBtn} onPress={handleExit} accessibilityLabel="duel-back">
        <Text style={styles.backText}>Leave</Text>
      </Pressable>
    </View>
  );
}

function Rules() {
  return (
    <View style={styles.rules}>
      <Text style={styles.rulesText}>Eat only YOUR color. Eating the other color = you lose.</Text>
      <Text style={styles.rulesText}>Avoid walls and the opponent. Best of 3 rounds.</Text>
    </View>
  );
}

function ScoreChip({ label, color, wins, round }: { label: string; color: string; wins: number; round: number }) {
  return (
    <View style={styles.chip}>
      <View style={styles.chipTop}>
        <View style={[styles.chipDot, { backgroundColor: color }]} />
        <Text style={styles.chipLabel}>{label}</Text>
      </View>
      <Text style={styles.chipWins} accessibilityLabel={`${label}-wins-${wins}`}>{wins}</Text>
      <Text style={styles.chipRound}>{round} this round</Text>
    </View>
  );
}

function DirButton({ label, dir, onPress }: { label: string; dir: Direction; onPress: (d: Direction) => void }) {
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
    paddingTop: Platform.OS === 'web' ? 16 : 40,
    paddingBottom: 16,
    gap: 12,
  },
  title: { color: C.text, fontSize: 26, fontWeight: '700', letterSpacing: 1 },
  lobby: { alignItems: 'center', gap: 16, width: '100%', maxWidth: 360 },
  bigBtn: { backgroundColor: C.accent, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 36, alignItems: 'center' },
  bigBtnText: { color: '#08130b', fontSize: 17, fontWeight: '700' },
  or: { color: C.textDim, fontSize: 14 },
  joinRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    backgroundColor: C.board, borderRadius: 12, borderWidth: 1, borderColor: C.border, color: C.text,
    fontSize: 22, fontWeight: '700', letterSpacing: 4, textAlign: 'center', paddingVertical: 10, width: 130,
  },
  joinBtn: { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20 },
  codeBox: { alignItems: 'center', gap: 4, backgroundColor: C.board, borderRadius: 14, padding: 18 },
  codeLabel: { color: C.textDim, fontSize: 13 },
  codeValue: { color: C.text, fontSize: 40, fontWeight: '700', letterSpacing: 8 },
  codeHint: { color: C.textDim, fontSize: 13 },
  status: { color: C.text, fontSize: 16 },
  rules: { gap: 4, alignItems: 'center', marginTop: 4 },
  rulesText: { color: C.textDim, fontSize: 13, textAlign: 'center' },
  hud: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  chip: { backgroundColor: C.board, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 16, alignItems: 'center', minWidth: 92 },
  chipTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipDot: { width: 12, height: 12, borderRadius: 6 },
  chipLabel: { color: C.textDim, fontSize: 12 },
  chipWins: { color: C.text, fontSize: 22, fontWeight: '700' },
  chipRound: { color: C.textDim, fontSize: 11 },
  roundBadge: { alignItems: 'center' },
  roundText: { color: C.text, fontSize: 14, fontWeight: '500' },
  roundSub: { color: C.textDim, fontSize: 11 },
  youHint: { fontSize: 13, fontWeight: '500' },
  board: { backgroundColor: C.board, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(14,17,22,0.85)', alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  overlayTitle: { color: C.text, fontSize: 26, fontWeight: '700' },
  overlaySub: { color: C.textDim, fontSize: 16 },
  dpad: { alignItems: 'center', gap: 10 },
  dpadRow: { flexDirection: 'row', gap: 10 },
  dirBtn: { width: 56, height: 56, borderRadius: 16, backgroundColor: C.btn, alignItems: 'center', justifyContent: 'center' },
  dirBtnText: { color: C.text, fontSize: 24 },
  backBtn: { paddingVertical: 8, paddingHorizontal: 20 },
  backText: { color: C.textDim, fontSize: 15 },
});
