import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { type MatchResult, applyResult, tierFor } from '../game/rating';
import { useRoom } from '../net/useRoom';
import { EVENTS, track } from '../lib/analytics';

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

export interface RatingChange {
  result: MatchResult;
  newRating: number;
  delta: number;
}

function inviteUrl(code: string): string {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !code) return '';
  return `${window.location.origin}${window.location.pathname}?room=${code}`;
}

export default function DuelGame({
  onExit,
  autoJoin,
  ranked = false,
  myRating = 1000,
  onRatingResult,
}: {
  onExit: () => void;
  autoJoin?: string | null;
  ranked?: boolean;
  myRating?: number;
  onRatingResult?: (r: RatingChange) => void;
}) {
  const { width, height } = useWindowDimensions();
  const boardPx = Math.max(240, Math.floor(Math.min(width - 24, height - 320, 420)));
  const cell = boardPx / DUEL_BOARD;

  const { conn, role, code, duel, oppRating, vsBot, createRoom, joinRoom, quickMatch, rankedMatch, startGame, turn, leave } = useRoom();
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [ratingChange, setRatingChange] = useState<RatingChange | null>(null);
  const autoStarted = useRef(false);
  const resultDone = useRef(false);
  // Лейбл режима для аналитики (уточняется при выборе действия в лобби).
  const modeRef = useRef<'quick' | 'friend' | 'ranked'>(ranked ? 'ranked' : autoJoin ? 'friend' : 'quick');
  const prevDuelRef = useRef<typeof duel>(null);
  const matchStartedRef = useRef(false);

  // Авто-вход: ranked → поиск по рейтингу; ссылка → join.
  useEffect(() => {
    if (autoStarted.current || conn !== 'idle') return;
    if (ranked) {
      autoStarted.current = true;
      rankedMatch(myRating);
    } else if (autoJoin) {
      autoStarted.current = true;
      modeRef.current = 'friend';
      track(EVENTS.matchmakingStart, { mode: 'friend', via: 'invite' });
      joinRoom(autoJoin);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [ranked, autoJoin, conn, rankedMatch, joinRoom, myRating]);

  // Ranked: хост авто-стартует, когда соперник найден.
  useEffect(() => {
    if (ranked && role === 'host' && conn === 'ready' && !duel) startGame();
  }, [ranked, role, conn, duel, startGame]);

  // Ranked: однократно посчитать изменение рейтинга в конце матча.
  useEffect(() => {
    if (!ranked || !duel || duel.status !== 'matchOver' || resultDone.current) return;
    resultDone.current = true;
    const you = role === 'host' ? 0 : 1;
    const result: MatchResult = duel.matchWinner === you ? 'win' : duel.matchWinner === -1 ? 'draw' : 'loss';
    const opp = typeof oppRating === 'number' ? oppRating : myRating;
    const newRating = applyResult(myRating, opp, result);
    const change: RatingChange = { result, newRating, delta: newRating - myRating };
    setRatingChange(change);
    onRatingResult?.(change);
  }, [ranked, duel, role, oppRating, myRating, onRatingResult]);

  // Действия лобби с разметкой режима для аналитики.
  const onQuick = useCallback(() => {
    modeRef.current = 'quick';
    track(EVENTS.matchmakingStart, { mode: 'quick' });
    quickMatch();
  }, [quickMatch]);

  const onCreate = useCallback(() => {
    modeRef.current = 'friend';
    track(EVENTS.matchmakingStart, { mode: 'friend', via: 'host' });
    createRoom();
  }, [createRoom]);

  const onJoinCode = useCallback(() => {
    if (joinCode.length < 3) return;
    modeRef.current = 'friend';
    track(EVENTS.matchmakingStart, { mode: 'friend', via: 'code' });
    joinRoom(joinCode);
  }, [joinCode, joinRoom]);

  // Диффер состояний дуэли → события матча/раунда/еды/фатальных ошибок.
  useEffect(() => {
    const prev = prevDuelRef.current;
    const cur = duel;
    prevDuelRef.current = cur;
    if (!cur) {
      matchStartedRef.current = false;
      return;
    }
    const mode = modeRef.current;
    const me = role === 'host' ? 0 : 1;
    const oppI = me === 0 ? 1 : 0;
    const myColor = me === 0 ? 'red' : 'blue';

    if (cur.status === 'playing' && cur.round === 1 && !matchStartedRef.current) {
      matchStartedRef.current = true;
      track(EVENTS.matchStart, { mode, role: role ?? 'guest', vs_bot: vsBot });
    }

    if (prev && prev.status === 'playing' && cur.status === 'playing') {
      const d = cur.roundScore[me] - prev.roundScore[me];
      if (d > 0) track(EVENTS.foodEaten, { mode, color: myColor, correct: true, count: d });
    }

    if (prev && prev.status === 'playing' && cur.status !== 'playing') {
      const cause = cur.causes[me];
      if (cause) track(EVENTS.fatalMistake, { mode, type: cause, round: cur.round });
      const outcome = cur.roundWinner === -1 ? 'draw' : cur.roundWinner === me ? 'win' : 'loss';
      track(EVENTS.roundEnd, { mode, round: cur.round, outcome });
      if (cur.status === 'matchOver') {
        matchStartedRef.current = false;
        const result = cur.matchWinner === -1 ? 'draw' : cur.matchWinner === me ? 'win' : 'loss';
        track(EVENTS.matchEnd, {
          mode,
          role: role ?? 'guest',
          vs_bot: vsBot,
          result,
          my_wins: cur.matchWins[me],
          opp_wins: cur.matchWins[oppI],
          rounds: cur.round,
        });
      }
    }
  }, [duel, role, vsBot]);

  const handleExit = useCallback(() => {
    leave();
    onExit();
  }, [leave, onExit]);

  const copyInvite = useCallback(() => {
    const url = inviteUrl(code);
    if (url && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }).catch(() => {});
    }
  }, [code]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const map: Record<string, Direction> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'Enter') && !ranked && role === 'host' && conn === 'ready' &&
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
  }, [duel, role, conn, turn, startGame, ranked]);

  const swipe = useMemo(
    () =>
      Gesture.Pan().onEnd((e) => {
        const dir = swipeToDirection(e.translationX, e.translationY);
        if (dir && duel?.status === 'playing') turn(dir);
      }),
    [duel, turn],
  );

  const tier = tierFor(myRating);

  // ── LOBBY ──
  if (!duel) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{ranked ? 'Ranked' : 'Color Duel'}</Text>

        {ranked && (conn === 'idle' || conn === 'searching' || conn === 'connecting' || conn === 'waiting' || conn === 'ready') && (
          <View style={styles.lobby}>
            <View style={styles.rankBox}>
              <Text style={[styles.rankTier, { color: tier.color }]}>{tier.name}</Text>
              <Text style={styles.rankRating}>{myRating}</Text>
            </View>
            <Text style={styles.status} accessibilityLabel={`conn-${conn}`}>
              {conn === 'ready' ? 'Opponent found! Starting…' : 'Finding a ranked opponent…'}
            </Text>
            <Pressable style={styles.altBtn} onPress={leave} accessibilityLabel="cancel-search">
              <Text style={styles.altBtnText}>Cancel</Text>
            </Pressable>
          </View>
        )}

        {!ranked && conn === 'idle' && (
          <View style={styles.lobby}>
            <Pressable style={styles.bigBtn} onPress={onQuick} accessibilityLabel="quick-match">
              <Text style={styles.bigBtnText}>Quick match</Text>
            </Pressable>
            <Text style={styles.subtle}>random opponent</Text>
            <View style={styles.divider} />
            <Pressable style={styles.altBtn} onPress={onCreate} accessibilityLabel="create-room">
              <Text style={styles.altBtnText}>Play with a friend</Text>
            </Pressable>
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
                onPress={onJoinCode}
                accessibilityLabel="join-room"
              >
                <Text style={styles.altBtnText}>Join</Text>
              </Pressable>
            </View>
            <Rules />
          </View>
        )}

        {!ranked && conn === 'searching' && (
          <View style={styles.lobby}>
            <Text style={styles.status} accessibilityLabel="conn-searching">Searching for an opponent…</Text>
            <Pressable style={styles.altBtn} onPress={leave} accessibilityLabel="cancel-search">
              <Text style={styles.altBtnText}>Cancel</Text>
            </Pressable>
          </View>
        )}

        {!ranked && (conn === 'connecting' || conn === 'waiting' || conn === 'ready') && (
          <View style={styles.lobby}>
            {role === 'host' && (
              <View style={styles.codeBox}>
                <Text style={styles.codeLabel}>Room code</Text>
                <Text style={styles.codeValue} accessibilityLabel={`room-code-${code}`}>{code}</Text>
                {!!inviteUrl(code) && (
                  <Pressable style={styles.copyBtn} onPress={copyInvite} accessibilityLabel="copy-invite">
                    <Text style={styles.copyBtnText}>{copied ? 'Link copied!' : 'Copy invite link'}</Text>
                  </Pressable>
                )}
                <Text style={styles.codeHint}>Send the code or link to a friend</Text>
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
        <ScoreChip
          label="You"
          color={mine.head}
          wins={duel.matchWins[you]}
          round={duel.roundScore[you]}
          rating={ranked ? myRating : undefined}
        />
        <View style={styles.roundBadge}>
          <Text style={styles.roundText}>{ranked ? 'Ranked' : `Round ${duel.round}`}</Text>
          <Text style={styles.roundSub}>first to {ROUND_TARGET}</Text>
        </View>
        <ScoreChip
          label="Opp"
          color={P[opp].head}
          wins={duel.matchWins[opp]}
          round={duel.roundScore[opp]}
          rating={ranked && typeof oppRating === 'number' ? oppRating : undefined}
        />
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
          {duel.foods.map((f, i) => {
            const blink = f.blink ?? 0;
            // Пока мигает — пульсирует прозрачностью (видно, что еда ещё инертна).
            const opacity = blink > 0 ? (Math.floor(blink / 2) % 2 === 0 ? 0.25 : 0.7) : 1;
            return (
              <View
                key={`f-${i}`}
                style={{ position: 'absolute', left: f.pos.x * cell, top: f.pos.y * cell, width: cell, height: cell, padding: 1, opacity }}
              >
                <View style={{ flex: 1, borderRadius: cell / 2, backgroundColor: P[f.color].food }} />
              </View>
            );
          })}

          {duel.status === 'roundOver' && (
            <View style={styles.overlay}>
              <Text style={styles.overlayTitle}>
                {duel.roundWinner === -1 ? 'Draw!' : duel.roundWinner === you ? 'Round won!' : 'Round lost'}
              </Text>
              <Text style={styles.overlaySub}>Next round…</Text>
            </View>
          )}

          {duel.status === 'matchOver' && (
            <View style={styles.overlay}>
              <Text style={styles.overlayTitle}>
                {duel.matchWinner === you ? 'You win! 🏆' : duel.matchWinner === -1 ? "It's a draw" : 'You lose'}
              </Text>
              <Text style={styles.overlaySub}>{duel.matchWins[you]} : {duel.matchWins[opp]}</Text>
              {ranked && ratingChange && (
                <Text style={[styles.ratingDelta, { color: ratingChange.delta >= 0 ? C.accent : '#ff6b6b' }]}>
                  {ratingChange.delta >= 0 ? '+' : ''}{ratingChange.delta} → {ratingChange.newRating}
                </Text>
              )}
              {ranked ? (
                <Pressable style={styles.bigBtn} onPress={handleExit} accessibilityLabel="duel-back">
                  <Text style={styles.bigBtnText}>Done</Text>
                </Pressable>
              ) : role === 'host' ? (
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

function ScoreChip({
  label,
  color,
  wins,
  round,
  rating,
}: {
  label: string;
  color: string;
  wins: number;
  round: number;
  rating?: number;
}) {
  return (
    <View style={styles.chip}>
      <View style={styles.chipTop}>
        <View style={[styles.chipDot, { backgroundColor: color }]} />
        <Text style={styles.chipLabel}>{label}</Text>
      </View>
      <Text style={styles.chipWins} accessibilityLabel={`${label}-wins-${wins}`}>{wins}</Text>
      {typeof rating === 'number' ? (
        <Text style={styles.chipRound}>{rating} pts</Text>
      ) : (
        <Text style={styles.chipRound}>{round} this round</Text>
      )}
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
    flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center',
    paddingTop: Platform.OS === 'web' ? 16 : 40, paddingBottom: 16, gap: 12,
  },
  title: { color: C.text, fontSize: 26, fontWeight: '700', letterSpacing: 1 },
  lobby: { alignItems: 'center', gap: 12, width: '100%', maxWidth: 360 },
  rankBox: { alignItems: 'center', gap: 2, backgroundColor: C.board, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40 },
  rankTier: { fontSize: 22, fontWeight: '700' },
  rankRating: { color: C.text, fontSize: 30, fontWeight: '700' },
  bigBtn: { backgroundColor: C.accent, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 36, alignItems: 'center' },
  bigBtnText: { color: '#08130b', fontSize: 17, fontWeight: '700' },
  altBtn: { backgroundColor: C.board, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 24, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  altBtnText: { color: C.text, fontSize: 15, fontWeight: '500' },
  subtle: { color: C.textDim, fontSize: 13 },
  divider: { height: 1, backgroundColor: C.border, alignSelf: 'stretch', marginVertical: 4 },
  joinRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    backgroundColor: C.board, borderRadius: 12, borderWidth: 1, borderColor: C.border, color: C.text,
    fontSize: 22, fontWeight: '700', letterSpacing: 4, textAlign: 'center', paddingVertical: 10, width: 130,
  },
  joinBtn: { backgroundColor: C.board, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, borderWidth: 1, borderColor: C.border },
  codeBox: { alignItems: 'center', gap: 8, backgroundColor: C.board, borderRadius: 14, padding: 18 },
  codeLabel: { color: C.textDim, fontSize: 13 },
  codeValue: { color: C.text, fontSize: 40, fontWeight: '700', letterSpacing: 8 },
  copyBtn: { backgroundColor: C.accent, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 18 },
  copyBtnText: { color: '#08130b', fontSize: 14, fontWeight: '700' },
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
  ratingDelta: { fontSize: 20, fontWeight: '700' },
  dpad: { alignItems: 'center', gap: 10 },
  dpadRow: { flexDirection: 'row', gap: 10 },
  dirBtn: { width: 56, height: 56, borderRadius: 16, backgroundColor: C.btn, alignItems: 'center', justifyContent: 'center' },
  dirBtnText: { color: C.text, fontSize: 24 },
  backBtn: { paddingVertical: 8, paddingHorizontal: 20 },
  backText: { color: C.textDim, fontSize: 15 },
});
