import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { DUEL_BOARD } from '../game/duel';
import { type Direction, swipeToDirection } from '../game/logic';
import { type MatchResult, applyResult, tierFor } from '../game/rating';
import { useRoom } from '../net/useRoom';
import { EVENTS, track } from '../lib/analytics';
import { play as playSfx } from '../lib/sound';
import { shareResult } from '../lib/share';
import { hLight, hMedium, hSuccess, hError, colorblindOn, getCtrlScheme, getCtrlSide } from '../lib/settings';
import { palette, fonts, radius, shade, glow } from '../theme/tokens';
import { TouchScale, Confetti } from '../ui/anim';
import { Dpad } from '../ui/Dpad';
import { GameButton } from '../ui/GameButton';
import { GameInput } from '../ui/GameInput';
import { GameOverlay } from '../ui/GameOverlay';
import { CodeBox } from '../ui/CodeBox';
import { HudChip } from '../ui/HudChip';
import { ScreenShell, ScreenTitle } from '../ui/Screen';
import { SnakeCell, FoodCell } from '../ui/BoardCells';
import { t, tierName } from '../lib/i18n';
import { useBoardPx, useIsDesktopWeb } from '../lib/layout';
import { GAME_URL } from '../lib/share';

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
  oppId: string | null;
}

function inviteUrl(code: string, from?: string): string {
  if (!code) return '';
  const base =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : GAME_URL;
  const f = from ? `&from=${encodeURIComponent(from)}` : '';
  return `${base}?room=${code}${f}&utm_source=challenge`;
}

export default function DuelGame({
  onExit,
  autoJoin,
  ranked = false,
  myRating = 1000,
  myId = '',
  onRatingResult,
}: {
  onExit: () => void;
  autoJoin?: string | null;
  ranked?: boolean;
  myRating?: number;
  myId?: string;
  onRatingResult?: (r: RatingChange) => void;
}) {
  const isDesktop = useIsDesktopWeb();
  const boardPx = useBoardPx({ min: 240, max: 420, chrome: 190, sidePad: 24 });
  const cell = boardPx / DUEL_BOARD;

  const { conn, role, code, duel, oppRating, oppId, vsBot, oppLeft, netError, joinFailed, createRoom, joinRoom, rejoin, playBot, quickMatch, rankedMatch, startGame, turn, leave } = useRoom();
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
      rankedMatch(myRating, myId);
    } else if (autoJoin) {
      autoStarted.current = true;
      modeRef.current = 'friend';
      track(EVENTS.matchmakingStart, { mode: 'friend', via: 'invite' });
      joinRoom(autoJoin);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [ranked, autoJoin, conn, rankedMatch, joinRoom, myRating, myId]);

  // Хост авто-стартует, как только реальный соперник зашёл в комнату — и в ranked, и в
  // игре с другом по ссылке. Убирает ручной «Start» как точку отказа (друг заходил, а
  // матч не начинался, пока хост не нажмёт кнопку).
  useEffect(() => {
    if (role === 'host' && conn === 'ready' && !duel) startGame();
  }, [role, conn, duel, startGame]);

  // Ranked: однократно посчитать изменение рейтинга в конце матча.
  useEffect(() => {
    if (!ranked || !duel || duel.status !== 'matchOver' || resultDone.current) return;
    resultDone.current = true;
    const you = role === 'host' ? 0 : 1;
    const result: MatchResult = duel.matchWinner === you ? 'win' : duel.matchWinner === -1 ? 'draw' : 'loss';
    const opp = typeof oppRating === 'number' ? oppRating : myRating;
    const newRating = applyResult(myRating, opp, result);
    const change: RatingChange = { result, newRating, delta: newRating - myRating, oppRating: opp, vsBot, oppId };
    setRatingChange(change);
    onRatingResult?.(change);
  }, [ranked, duel, role, oppRating, myRating, vsBot, oppId, onRatingResult]);

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
    const url = inviteUrl(code, myId);
    if (url && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }).catch(() => {});
    }
  }, [code, myId]);

  // Вызвать друга через системный share-лист (виральность).
  const challengeFriend = useCallback(() => {
    const url = inviteUrl(code, myId);
    if (!url) return;
    track(EVENTS.challengeCreated, { via: 'share' });
    shareResult(t('shareChallenge'), url).then(() => {
      if (typeof navigator !== 'undefined' && !(navigator as { share?: unknown }).share) {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    });
  }, [code, myId]);

  const cancelSearch = useCallback(() => {
    track(EVENTS.matchmakingCancel, { mode: modeRef.current });
    leave();
  }, [leave]);

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
  // activeOffset: до 12px жест не активируется и не мешает тапам по D-pad/кнопкам.
  const swipe = useMemo(() => {
    let committed = false;
    return Gesture.Pan()
      .activeOffsetX([-12, 12])
      .activeOffsetY([-12, 12])
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
      <ScreenShell maxWidth={420}>
        <ScreenTitle>{ranked ? t('ranked') : t('colorDuel')}</ScreenTitle>

        {joinFailed && (
          <View style={styles.lobby}>
            <Text style={styles.status}>{t('roomNotFound')}</Text>
            <Text style={[styles.subtle, { textAlign: 'center' }]}>{t('roomNotFoundHint')}</Text>
            <GameButton title={t('tryAgain')} onPress={() => { if (autoJoin) rejoin(autoJoin); }} a11y="retry-join" />
            <GameButton title={t('playVsBot')} variant="secondary" onPress={() => playBot(myRating)} a11y="play-bot" />
          </View>
        )}

        {ranked && (conn === 'idle' || conn === 'searching' || conn === 'connecting' || conn === 'waiting' || conn === 'ready') && (
          <View style={styles.lobby}>
            <View style={styles.rankBox}>
              <Text style={[styles.rankTier, { color: tier.color }]}>{tierName(tier.name)}</Text>
              <Text style={styles.rankRating}>{myRating}</Text>
            </View>
            <Text style={styles.status} accessibilityLabel={`conn-${conn}`}>
              {conn === 'ready' ? t('opponentFound') : t('findingOpponent')}
            </Text>
            <GameButton title={t('cancel')} variant="secondary" onPress={cancelSearch} a11y="cancel-search" />
          </View>
        )}

        {!ranked && conn === 'idle' && (
          <View style={styles.lobby}>
            <GameButton title={t('quickMatch')} onPress={onQuick} a11y="quick-match" />
            <Text style={styles.subtle}>{t('randomOpponent')}</Text>
            <View style={styles.divider} />
            <GameButton title={t('playWithFriend')} variant="secondary" onPress={onCreate} a11y="create-room" />
            <View style={styles.joinRow}>
              <GameInput
                value={joinCode}
                onChangeText={(v) => setJoinCode(v.toUpperCase())}
                placeholder={t('codePlaceholderShort')}
                autoCapitalize="characters"
                maxLength={4}
                mono
                a11y="join-code"
                style={styles.codeInput}
              />
              <GameButton title={t('join')} variant="secondary" onPress={onJoinCode} a11y="join-room" />
            </View>
            <Rules />
          </View>
        )}

        {!ranked && conn === 'searching' && (
          <View style={styles.lobby}>
            <Text style={styles.status} accessibilityLabel="conn-searching">{t('searchingOpponent')}</Text>
            <GameButton title={t('cancel')} variant="secondary" onPress={cancelSearch} a11y="cancel-search" />
          </View>
        )}

        {!ranked && !joinFailed && (conn === 'connecting' || conn === 'waiting' || conn === 'ready') && (
          <View style={styles.lobby}>
            {role === 'host' && (
              <CodeBox
                label={t('roomCode')}
                code={code}
                a11y={`room-code-${code}`}
                hints={[t('sendCodeHint'), t('keepOpenHint')]}
              >
                {!!inviteUrl(code, myId) && (
                  <>
                    <GameButton
                      title={copied ? t('linkCopied') : t('challengeFriendBtn')}
                      onPress={challengeFriend}
                      a11y="challenge-friend"
                      style={styles.copyBtn}
                    />
                    <GameButton title={t('copyInviteLink')} variant="ghost" onPress={copyInvite} a11y="copy-invite" />
                  </>
                )}
              </CodeBox>
            )}
            <Text style={styles.status} accessibilityLabel={`conn-${conn}`}>
              {conn === 'connecting' && t('connecting')}
              {conn === 'waiting' && t('waitingOpponent')}
              {conn === 'ready' && role === 'host' && t('opponentJoined')}
              {conn === 'ready' && role === 'guest' && t('waitingHost')}
            </Text>
            {conn === 'ready' && role === 'host' && (
              <GameButton title={t('start')} onPress={startGame} a11y="duel-start" />
            )}
            <Rules />
          </View>
        )}

        {conn === 'error' && <Text style={styles.status}>{t('connectionError')}</Text>}

        <GameButton title={t('back')} variant="ghost" onPress={handleExit} a11y="duel-back" />
      </ScreenShell>
    );
  }

  // ── MATCH ──
  const you = role === 'host' ? 0 : 1;
  const opp = you === 0 ? 1 : 0;
  const mine = P[you];

  return (
    <GestureDetector gesture={swipe}>
    <ScreenShell maxWidth={560} center={false}>
      <View style={styles.hud}>
        <HudChip
          label={t('you')}
          value={duel.matchWins[you]}
          valueColor={mine.head}
          borderColor={mine.head}
          sub={ranked ? `${myRating} ${t('ptsSuffix')}` : `${duel.roundScore[you]} ${t('thisRound')}`}
          a11y={`${t('you')}-wins-${duel.matchWins[you]}`}
        >
          <View style={[styles.chipDot, { backgroundColor: mine.head }, glow(mine.head, 5, 0.9)]} />
        </HudChip>
        <View style={styles.roundBadge}>
          <Text style={styles.roundText}>{ranked ? t('ranked') : `${t('round')} ${duel.round}`}</Text>
          <Text style={styles.roundSub}>{t('dontCrash')}</Text>
        </View>
        <HudChip
          label={t('oppLabel')}
          value={duel.matchWins[opp]}
          valueColor={P[opp].head}
          borderColor={P[opp].head}
          sub={ranked && typeof oppRating === 'number' ? `${oppRating} ${t('ptsSuffix')}` : `${duel.roundScore[opp]} ${t('thisRound')}`}
          a11y={`${t('oppLabel')}-wins-${duel.matchWins[opp]}`}
        >
          <View style={[styles.chipDot, { backgroundColor: P[opp].head }, glow(P[opp].head, 5, 0.9)]} />
        </HudChip>
      </View>
      <Text style={[styles.youHint, { color: mine.head }]}>
        {t('youAreEat', { c: t(you === 0 ? 'colorRed' : 'colorBlue') })}
      </Text>

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

      <View style={styles.playArea}>
      <View style={[styles.board, { width: boardPx, height: boardPx }]}>
          {duel.snakes.map((snake, si) =>
            snake.map((p, i) => (
              <SnakeCell
                key={`${si}-${i}`}
                x={p.x}
                y={p.y}
                cell={cell}
                pad={0.5}
                isHead={i === 0}
                color={i === 0 ? P[si].head : shade(P[si].body, (i / snake.length) * 0.5)}
                glowColor={P[si].head}
                eyeSize={0.18}
                eyeInset={0.22}
              />
            )),
          )}
          {duel.foods.map((f, i) => {
            if (f.fat) {
              return <FoodCell key={`f-${i}`} x={f.pos.x} y={f.pos.y} cell={cell} kind="fat" pad={0.5} />;
            }
            const blink = f.blink ?? 0;
            // Пока мигает — пульсирует прозрачностью (видно, что еда ещё инертна).
            const opacity = blink > 0 ? (Math.floor(blink / 2) % 2 === 0 ? 0.25 : 0.7) : 1;
            return (
              <FoodCell
                key={`f-${i}`}
                x={f.pos.x}
                y={f.pos.y}
                cell={cell}
                color={P[f.color].food}
                kind={f.color === you ? 'round' : colorblindOn() ? 'square' : 'round'}
                opacity={opacity}
              />
            );
          })}

          {duel.status === 'roundOver' && (
            <GameOverlay
              title={duel.roundWinner === -1 ? t('draw') : duel.roundWinner === you ? t('roundWon') : t('roundLost')}
              sub={t('nextRound')}
            />
          )}

          {netError && duel.status !== 'matchOver' && (
            <GameOverlay title={t('connectionLost')} sub={t('reconnecting')}>
              <GameButton title={t('leave')} onPress={handleExit} a11y="duel-neterror-leave" />
            </GameOverlay>
          )}

          {duel.status === 'matchOver' && (
            <GameOverlay
              title={duel.matchWinner === you ? t('youWin') : duel.matchWinner === -1 ? t('itsADraw') : t('youLose')}
              backdrop={duel.matchWinner === you ? <Confetti /> : undefined}
            >
              {oppLeft && <Text style={styles.overlaySub}>{t('forfeitWin')}</Text>}
              <Text style={styles.overlaySub}>{duel.matchWins[you]} : {duel.matchWins[opp]}</Text>
              {ranked && ratingChange && (
                <Text style={[styles.ratingDelta, { color: ratingChange.delta >= 0 ? palette.accent : palette.danger }]}>
                  {ratingChange.delta >= 0 ? '+' : ''}{ratingChange.delta} → {ratingChange.newRating}
                </Text>
              )}
              {ranked || oppLeft ? (
                <GameButton title={t('done')} onPress={handleExit} a11y="duel-back" />
              ) : role === 'host' ? (
                <GameButton title={t('playAgain')} onPress={startGame} a11y="duel-restart" />
              ) : (
                <Text style={styles.overlaySub}>{t('waitingHost')}</Text>
              )}
              <GameButton
                title={shareNote || t('shareResultBtn')}
                variant="secondary"
                onPress={() => {
                  const won = duel.matchWinner === you;
                  const msg = won
                    ? t('shareDuelWin', { a: duel.matchWins[you], b: duel.matchWins[opp] })
                    : t('shareDuelLoss');
                  shareResult(msg).then((o) => {
                    track(EVENTS.share, { where: 'duel', result: won ? 'win' : 'other', outcome: o });
                    if (o === 'copied') {
                      setShareNote(t('linkCopied'));
                      setTimeout(() => setShareNote(''), 1500);
                    }
                  });
                }}
                a11y="share-result"
              />
            </GameOverlay>
          )}
        </View>
      </View>

      {!isDesktop && <Dpad onTurn={doTurn} scheme={getCtrlScheme()} side={getCtrlSide()} />}

      <GameButton title={t('leave')} variant="ghost" onPress={handleExit} a11y="duel-back" />
    </ScreenShell>
    </GestureDetector>
  );
}

function Rules() {
  return (
    <View style={styles.rules}>
      <Text style={styles.rulesText}>{t('rules1')}</Text>
      <Text style={styles.rulesText}>{t('rules2')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  lobby: { alignItems: 'center', gap: 12, width: '100%', maxWidth: 360 },
  rankBox: { alignItems: 'center', gap: 2, backgroundColor: palette.surface, borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: 40, borderWidth: 1, borderColor: palette.borderGlass },
  rankTier: { fontFamily: fonts.display, fontSize: 22 },
  rankRating: { fontFamily: fonts.num, color: palette.text, fontSize: 30 },
  subtle: { fontFamily: fonts.body, color: palette.textDim, fontSize: 13 },
  divider: { height: 1, backgroundColor: palette.border, alignSelf: 'stretch', marginVertical: 4 },
  joinRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  codeInput: { width: 130, textAlign: 'center' },
  copyBtn: { paddingVertical: 8, paddingHorizontal: 18 },
  status: { fontFamily: fonts.body, color: palette.text, fontSize: 16 },
  rules: { gap: 4, alignItems: 'center', marginTop: 4 },
  rulesText: { fontFamily: fonts.body, color: palette.textDim, fontSize: 13, textAlign: 'center' },
  hud: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  chipDot: { width: 12, height: 12, borderRadius: 6 },
  progressTrack: { width: '100%', maxWidth: 420, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  progressL: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4 },
  progressR: { position: 'absolute', right: 0, top: 0, bottom: 0, borderRadius: 4 },
  roundBadge: { alignItems: 'center' },
  roundText: { fontFamily: fonts.bodyBold, color: palette.text, fontSize: 14 },
  roundSub: { fontFamily: fonts.body, color: palette.textDim, fontSize: 11 },
  youHint: { fontFamily: fonts.bodyBold, fontSize: 13 },
  playArea: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%' },
  board: { backgroundColor: palette.board, borderRadius: 16, overflow: 'hidden', borderWidth: 1.5, borderColor: palette.borderGlow },
  overlaySub: { fontFamily: fonts.body, color: palette.textDim, fontSize: 16, textAlign: 'center' },
  ratingDelta: { fontFamily: fonts.num, fontSize: 20 },
});
