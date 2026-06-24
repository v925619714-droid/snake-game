import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DUEL_BOARD } from '../game/duel';
import { type Direction, swipeToDirection } from '../game/logic';
import { type MatchResult, applyResult, tierFor } from '../game/rating';
import { useRoom } from '../net/useRoom';
import { EVENTS, track } from '../lib/analytics';
import { play as playSfx } from '../lib/sound';
import { shareResult } from '../lib/share';
import { hLight, hMedium, hSuccess, hError, colorblindOn } from '../lib/settings';
import { fonts, shade } from '../theme/tokens';
import { TouchScale, FadePop, Confetti } from '../ui/anim';

const C = {
  bg: '#0B0F17',
  board: '#121826',
  border: '#1D2940',
  text: '#E8F0FB',
  textDim: '#8395AE',
  btn: '#121826',
  accent: '#3DDC84',
};

const P = [
  { body: '#ff5c5c', head: '#ffb0a3', food: '#ff5c5c', name: 'Red' },
  { body: '#5cc8ff', head: '#b3e8ff', food: '#5cc8ff', name: 'Blue' },
];

export interface RatingChange {
  result: MatchResult;
  newRating: number;
  delta: number;
  oppRating: number;
  vsBot: boolean;
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
  const insets = useSafeAreaInsets();
  const pad = { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 };
  const boardPx = Math.max(240, Math.floor(Math.min(width - 24, height - insets.top - insets.bottom - 300, 420)));
  const cell = boardPx / DUEL_BOARD;

  const { conn, role, code, duel, oppRating, vsBot, oppLeft, netError, createRoom, joinRoom, quickMatch, rankedMatch, startGame, turn, leave } = useRoom();
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [shareNote, setShareNote] = useState('');
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
    const change: RatingChange = { result, newRating, delta: newRating - myRating, oppRating: opp, vsBot };
    setRatingChange(change);
    onRatingResult?.(change);
  }, [ranked, duel, role, oppRating, myRating, vsBot, onRatingResult]);

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
      if (d > 0) {
        track(EVENTS.foodEaten, { mode, color: myColor, correct: true, count: d });
        playSfx('eat');
        hLight();
      }
      // подобрал буст-еду (ускорение)
      if ((prev.boosts?.[me] ?? 0) === 0 && (cur.boosts?.[me] ?? 0) > 0) playSfx('boost');
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
        playSfx(result === 'win' ? 'win' : result === 'loss' ? 'lose' : 'crash');
        if (result === 'win') hSuccess();
        else if (result === 'loss') hError();
        else hMedium();
      } else {
        if (cause) playSfx('crash'); // погиб в промежуточном раунде
        if (outcome === 'win') hMedium();
        else hLight();
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

  // Поворот + тактильный отклик (только во время раунда).
  const doTurn = useCallback(
    (dir: Direction) => {
      if (duel?.status !== 'playing') return;
      hLight();
      turn(dir);
    },
    [duel, turn],
  );

  // Свайп с ранним коммитом (меньше задержка): поворот при пересечении порога, один на жест.
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
          doTurn(dir);
        }
      });
  }, [doTurn]);

  const tier = tierFor(myRating);

  // ── LOBBY ──
  if (!duel) {
    return (
      <View style={[styles.container, pad]}>
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
            <TouchScale style={styles.altBtn} onPress={leave} accessibilityLabel="cancel-search">
              <Text style={styles.altBtnText}>Cancel</Text>
            </TouchScale>
          </View>
        )}

        {!ranked && conn === 'idle' && (
          <View style={styles.lobby}>
            <TouchScale style={styles.bigBtn} onPress={onQuick} accessibilityLabel="quick-match">
              <Text style={styles.bigBtnText}>Quick match</Text>
            </TouchScale>
            <Text style={styles.subtle}>random opponent</Text>
            <View style={styles.divider} />
            <TouchScale style={styles.altBtn} onPress={onCreate} accessibilityLabel="create-room">
              <Text style={styles.altBtnText}>Play with a friend</Text>
            </TouchScale>
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
              <TouchScale
                style={styles.joinBtn}
                onPress={onJoinCode}
                accessibilityLabel="join-room"
              >
                <Text style={styles.altBtnText}>Join</Text>
              </TouchScale>
            </View>
            <Rules />
          </View>
        )}

        {!ranked && conn === 'searching' && (
          <View style={styles.lobby}>
            <Text style={styles.status} accessibilityLabel="conn-searching">Searching for an opponent…</Text>
            <TouchScale style={styles.altBtn} onPress={leave} accessibilityLabel="cancel-search">
              <Text style={styles.altBtnText}>Cancel</Text>
            </TouchScale>
          </View>
        )}

        {!ranked && (conn === 'connecting' || conn === 'waiting' || conn === 'ready') && (
          <View style={styles.lobby}>
            {role === 'host' && (
              <View style={styles.codeBox}>
                <Text style={styles.codeLabel}>Room code</Text>
                <Text style={styles.codeValue} accessibilityLabel={`room-code-${code}`}>{code}</Text>
                {!!inviteUrl(code) && (
                  <TouchScale style={styles.copyBtn} onPress={copyInvite} accessibilityLabel="copy-invite">
                    <Text style={styles.copyBtnText}>{copied ? 'Link copied!' : 'Copy invite link'}</Text>
                  </TouchScale>
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
              <TouchScale style={styles.bigBtn} onPress={startGame} accessibilityLabel="duel-start">
                <Text style={styles.bigBtnText}>Start</Text>
              </TouchScale>
            )}
            <Rules />
          </View>
        )}

        {conn === 'error' && <Text style={styles.status}>Connection error</Text>}

        <TouchScale style={styles.backBtn} onPress={handleExit} accessibilityLabel="duel-back">
          <Text style={styles.backText}>Back</Text>
        </TouchScale>
      </View>
    );
  }

  // ── MATCH ──
  const you = role === 'host' ? 0 : 1;
  const opp = you === 0 ? 1 : 0;
  const mine = P[you];

  return (
    <View style={[styles.container, pad]}>
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
          <Text style={styles.roundSub}>don't crash</Text>
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
      {duel.boosts[you] > 0 && (
        <View style={styles.boostPill}>
          <Text style={styles.boostText}>⚡ SPEED ×2</Text>
        </View>
      )}

      {(() => {
        const total = duel.roundScore[you] + duel.roundScore[opp];
        const myFrac = total === 0 ? 0.5 : duel.roundScore[you] / total;
        return (
          <View style={styles.progressTrack}>
            <View style={[styles.progressL, { width: `${myFrac * 100}%`, backgroundColor: mine.head }]} />
            <View style={[styles.progressR, { width: `${(1 - myFrac) * 100}%`, backgroundColor: P[opp].head }]} />
          </View>
        );
      })()}

      <GestureDetector gesture={swipe}>
        <View style={[styles.board, { width: boardPx, height: boardPx }]}>
          {duel.snakes.map((snake, si) =>
            snake.map((p, i) => {
              const isHead = i === 0;
              return (
                <View
                  key={`${si}-${i}`}
                  style={{ position: 'absolute', left: p.x * cell, top: p.y * cell, width: cell, height: cell, padding: 0.5 }}
                >
                  <View
                    style={[
                      {
                        flex: 1,
                        borderRadius: cell * (isHead ? 0.34 : 0.28),
                        backgroundColor: isHead ? P[si].head : shade(P[si].body, (i / snake.length) * 0.5),
                      },
                      isHead && {
                        shadowColor: P[si].head,
                        shadowOpacity: 0.9,
                        shadowRadius: 5,
                        shadowOffset: { width: 0, height: 0 },
                        elevation: 5,
                      },
                    ]}
                  >
                    {isHead && (
                      <>
                        <View style={[styles.eye, { top: cell * 0.26, left: cell * 0.22, width: cell * 0.18, height: cell * 0.18, borderRadius: cell * 0.09 }]} />
                        <View style={[styles.eye, { top: cell * 0.26, right: cell * 0.22, width: cell * 0.18, height: cell * 0.18, borderRadius: cell * 0.09 }]} />
                      </>
                    )}
                  </View>
                </View>
              );
            }),
          )}
          {duel.foods.map((f, i) => {
            if (f.boost) {
              // Буст-еда (нейтральная, скорость): золотой кружок со свечением + белое ядро.
              return (
                <View
                  key={`f-${i}`}
                  style={{ position: 'absolute', left: f.pos.x * cell, top: f.pos.y * cell, width: cell, height: cell, padding: 0.5 }}
                >
                  <View style={{ flex: 1, borderRadius: cell / 2, backgroundColor: '#FFE680', shadowColor: '#FFD75E', shadowOpacity: 1, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 8, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{ width: cell * 0.34, height: cell * 0.34, borderRadius: cell * 0.2, backgroundColor: '#fff' }} />
                  </View>
                </View>
              );
            }
            const blink = f.blink ?? 0;
            // Пока мигает — пульсирует прозрачностью (видно, что еда ещё инертна).
            const opacity = blink > 0 ? (Math.floor(blink / 2) % 2 === 0 ? 0.25 : 0.7) : 1;
            return (
              <View
                key={`f-${i}`}
                style={{ position: 'absolute', left: f.pos.x * cell, top: f.pos.y * cell, width: cell, height: cell, padding: 1, opacity }}
              >
                <View style={{ flex: 1, borderRadius: f.color === you ? cell / 2 : (colorblindOn() ? cell * 0.12 : cell / 2), backgroundColor: P[f.color].food, shadowColor: P[f.color].food, shadowOpacity: 0.9, shadowRadius: 5, shadowOffset: { width: 0, height: 0 }, elevation: 5 }} />
              </View>
            );
          })}

          {duel.status === 'roundOver' && (
            <View style={styles.overlay}>
              <FadePop style={styles.overlayInner}>
                <Text style={styles.overlayTitle}>
                  {duel.roundWinner === -1 ? 'Draw!' : duel.roundWinner === you ? 'Round won!' : 'Round lost'}
                </Text>
                <Text style={styles.overlaySub}>Next round…</Text>
              </FadePop>
            </View>
          )}

          {netError && duel.status !== 'matchOver' && (
            <View style={styles.overlay}>
              <FadePop style={styles.overlayInner}>
                <Text style={styles.overlayTitle}>Connection lost</Text>
                <Text style={styles.overlaySub}>Reconnecting…</Text>
                <TouchScale style={styles.bigBtn} onPress={handleExit} accessibilityLabel="duel-neterror-leave">
                  <Text style={styles.bigBtnText}>Leave</Text>
                </TouchScale>
              </FadePop>
            </View>
          )}

          {duel.status === 'matchOver' && (
            <View style={styles.overlay}>
              {duel.matchWinner === you && <Confetti />}
              <FadePop style={styles.overlayInner}>
                <Text style={styles.overlayTitle}>
                  {duel.matchWinner === you ? 'You win!' : duel.matchWinner === -1 ? "It's a draw" : 'You lose'}
                </Text>
                {oppLeft && <Text style={styles.overlaySub}>Opponent left — you win by forfeit</Text>}
                <Text style={styles.overlaySub}>{duel.matchWins[you]} : {duel.matchWins[opp]}</Text>
                {ranked && ratingChange && (
                  <Text style={[styles.ratingDelta, { color: ratingChange.delta >= 0 ? C.accent : '#ff6b6b' }]}>
                    {ratingChange.delta >= 0 ? '+' : ''}{ratingChange.delta} → {ratingChange.newRating}
                  </Text>
                )}
                {ranked || oppLeft ? (
                  <TouchScale style={styles.bigBtn} onPress={handleExit} accessibilityLabel="duel-back">
                    <Text style={styles.bigBtnText}>Done</Text>
                  </TouchScale>
                ) : role === 'host' ? (
                  <TouchScale style={styles.bigBtn} onPress={startGame} accessibilityLabel="duel-restart">
                    <Text style={styles.bigBtnText}>Play again</Text>
                  </TouchScale>
                ) : (
                  <Text style={styles.overlaySub}>Waiting for host…</Text>
                )}
                <TouchScale
                  style={styles.shareBtn}
                  onPress={() => {
                    const won = duel.matchWinner === you;
                    const msg = won
                      ? `I won ${duel.matchWins[you]}:${duel.matchWins[opp]} in Chroma Coil ⚡ — challenge me!`
                      : `I just battled in Chroma Coil ⚡ — can you do better?`;
                    shareResult(msg).then((o) => {
                      track(EVENTS.share, { where: 'duel', result: won ? 'win' : 'other', outcome: o });
                      if (o === 'copied') {
                        setShareNote('Link copied!');
                        setTimeout(() => setShareNote(''), 1500);
                      }
                    });
                  }}
                  accessibilityLabel="share-result"
                >
                  <Text style={styles.shareBtnText}>{shareNote || 'Share result'}</Text>
                </TouchScale>
              </FadePop>
            </View>
          )}
        </View>
      </GestureDetector>

      <View style={styles.dpad}>
        <DirButton label="▲" dir="up" onPress={doTurn} />
        <View style={styles.dpadRow}>
          <DirButton label="◀" dir="left" onPress={doTurn} />
          <DirButton label="▼" dir="down" onPress={doTurn} />
          <DirButton label="▶" dir="right" onPress={doTurn} />
        </View>
      </View>

      <TouchScale style={styles.backBtn} onPress={handleExit} accessibilityLabel="duel-back">
        <Text style={styles.backText}>Leave</Text>
      </TouchScale>
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
    <View style={[styles.chip, { borderColor: color }]}>
      <View style={styles.chipTop}>
        <View style={[styles.chipDot, { backgroundColor: color, shadowColor: color, shadowOpacity: 0.9, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } }]} />
        <Text style={styles.chipLabel}>{label}</Text>
      </View>
      <Text style={[styles.chipWins, { color }]} accessibilityLabel={`${label}-wins-${wins}`}>{wins}</Text>
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
    <TouchScale style={styles.dirBtn} onPress={() => onPress(dir)} accessibilityLabel={`dir-${dir}`}>
      <Text style={styles.dirBtnText}>{label}</Text>
    </TouchScale>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center',
    paddingTop: Platform.OS === 'web' ? 16 : 40, paddingBottom: 16, gap: 12,
  },
  title: { fontFamily: fonts.display, color: C.text, fontSize: 26, letterSpacing: 1 },
  lobby: { alignItems: 'center', gap: 12, width: '100%', maxWidth: 360 },
  rankBox: { alignItems: 'center', gap: 2, backgroundColor: C.board, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 40, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  rankTier: { fontFamily: fonts.display, fontSize: 22 },
  rankRating: { fontFamily: fonts.num, color: C.text, fontSize: 30 },
  bigBtn: { backgroundColor: C.accent, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 36, alignItems: 'center' },
  bigBtnText: { fontFamily: fonts.display, color: '#06180E', fontSize: 17 },
  shareBtn: { paddingVertical: 9, paddingHorizontal: 22, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: C.board },
  shareBtnText: { fontFamily: fonts.bodyBold, color: C.text, fontSize: 14 },
  altBtn: { backgroundColor: C.board, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', alignItems: 'center' },
  altBtnText: { fontFamily: fonts.bodyBold, color: C.text, fontSize: 15 },
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
  codeValue: { fontFamily: fonts.num, color: '#7CF7D4', fontSize: 40, letterSpacing: 8 },
  copyBtn: { backgroundColor: C.accent, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 18 },
  copyBtnText: { color: '#08130b', fontSize: 14, fontWeight: '700' },
  codeHint: { color: C.textDim, fontSize: 13 },
  status: { color: C.text, fontSize: 16 },
  rules: { gap: 4, alignItems: 'center', marginTop: 4 },
  rulesText: { color: C.textDim, fontSize: 13, textAlign: 'center' },
  hud: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  chip: { backgroundColor: C.board, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 16, alignItems: 'center', minWidth: 92, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  progressTrack: { width: '100%', maxWidth: 420, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  progressL: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4 },
  progressR: { position: 'absolute', right: 0, top: 0, bottom: 0, borderRadius: 4 },
  chipTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipDot: { width: 12, height: 12, borderRadius: 6 },
  chipLabel: { color: C.textDim, fontSize: 12 },
  chipWins: { fontFamily: fonts.num, color: C.text, fontSize: 22 },
  chipRound: { fontFamily: fonts.body, color: C.textDim, fontSize: 11 },
  roundBadge: { alignItems: 'center' },
  roundText: { fontFamily: fonts.bodyBold, color: C.text, fontSize: 14 },
  roundSub: { fontFamily: fonts.body, color: C.textDim, fontSize: 11 },
  youHint: { fontFamily: fonts.bodyBold, fontSize: 13 },
  boostPill: { backgroundColor: 'rgba(255,215,94,0.18)', borderColor: '#FFD75E', borderWidth: 1, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 12 },
  boostText: { fontFamily: fonts.bodyBold, color: '#FFE680', fontSize: 12, letterSpacing: 1 },
  board: { backgroundColor: '#0C111B', borderRadius: 16, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(124,247,212,0.20)' },
  eye: { position: 'absolute', backgroundColor: '#06121e' },
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(7,10,16,0.86)', alignItems: 'center', justifyContent: 'center',
  },
  overlayInner: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  overlayTitle: { fontFamily: fonts.display, color: C.text, fontSize: 26 },
  overlaySub: { fontFamily: fonts.body, color: C.textDim, fontSize: 16 },
  ratingDelta: { fontFamily: fonts.num, fontSize: 20 },
  dpad: { alignItems: 'center', gap: 10 },
  dpadRow: { flexDirection: 'row', gap: 10 },
  dirBtn: { width: 56, height: 56, borderRadius: 16, backgroundColor: C.btn, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  dirBtnText: { color: C.text, fontSize: 24 },
  backBtn: { paddingVertical: 8, paddingHorizontal: 20 },
  backText: { color: C.textDim, fontSize: 15 },
});
