// Экран корпоративного режима «Shake Work Off» (FFA 5–10).
// Главный экран маршрутизирует: Practice vs bots (локально) ИЛИ Team room (по сети).
// Рендер поля общий (PartyBoard). Существующие режимы не затронуты — отдельный модуль.
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  PARTY_MAX,
  PARTY_MIN,
  PARTY_WINS_NEEDED,
  type PartyState,
  partyNewMatch,
  partyNextRound,
  partyStep,
  partyTurn,
} from '../game/party';
import { partyBotDir } from '../game/partyBot';
import { type Direction, swipeToDirection } from '../game/logic';
import { usePartyRoom } from '../net/usePartyRoom';
import { palette, fonts, radius, shade } from '../theme/tokens';
import { TouchScale, Confetti } from '../ui/anim';
import { hLight, hSuccess, hError, getCtrlScheme, getCtrlSide } from '../lib/settings';
import { Dpad } from '../ui/Dpad';
import { GameButton } from '../ui/GameButton';
import { GameInput } from '../ui/GameInput';
import { GameOverlay } from '../ui/GameOverlay';
import { CodeBox } from '../ui/CodeBox';
import { HudChip } from '../ui/HudChip';
import { ScreenShell, ScreenTitle } from '../ui/Screen';
import { SnakeCell, FoodCell } from '../ui/BoardCells';
import { t as tr } from '../lib/i18n';
import { useBoardPx as useSharedBoardPx, useIsDesktopWeb } from '../lib/layout';
import { play as playSfx } from '../lib/sound';
import { shareResult, GAME_URL } from '../lib/share';
import { EVENTS, track } from '../lib/analytics';

const TICK_MS = 150;
const ROUND_BREAK_MS = 2600; // пауза между раундами best-of (показываем итог раунда)
const COUNT_OPTIONS = [5, 6, 8, 10];

// Ссылка-инвайт в командную комнату: на web берём текущий origin (домен), иначе GAME_URL.
function teamInviteUrl(code: string): string {
  if (!code) return '';
  const base =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : GAME_URL;
  return `${base}?party=${code}`;
}

const PARTY_COLORS = [
  { body: '#ff5c5c', head: '#ffb0a3' },
  { body: '#5cc8ff', head: '#b3e8ff' },
  { body: '#67e08a', head: '#bff5cf' },
  { body: '#ffd75e', head: '#fff0b8' },
  { body: '#c98bff', head: '#e7c9ff' },
  { body: '#ff9f43', head: '#ffd8a8' },
  { body: '#3ddc97', head: '#a9f0d4' },
  { body: '#ff7bd5', head: '#ffc4ec' },
  { body: '#9aa7ff', head: '#cdd4ff' },
  { body: '#9ad34d', head: '#d8f0a8' },
];

// ── общий рендер поля ──
function shortName(n: string | undefined): string {
  const s = (n ?? '').trim();
  return s.length > 7 ? s.slice(0, 7) : s || '—';
}

function PartyBoard({
  state,
  mySlot,
  boardPx,
  names,
  children,
}: {
  state: PartyState;
  mySlot: number;
  boardPx: number;
  names: string[];
  children?: ReactNode;
}) {
  const cell = boardPx / state.board;
  return (
    <View style={[styles.boardWrap, { width: boardPx, height: boardPx }]}>
      {state.snakes.map((snake, si) => {
        if (!state.alive[si]) return null;
        const col = PARTY_COLORS[si % PARTY_COLORS.length];
        const mine = si === mySlot;
        return snake.map((p, i) => {
          const isHead = i === 0;
          return (
            <SnakeCell
              key={`${si}-${i}`}
              x={p.x}
              y={p.y}
              cell={cell}
              pad={0.5}
              isHead={isHead}
              color={isHead ? col.head : shade(col.body, (i / snake.length) * 0.5)}
              glowColor={col.head}
              eyeSize={0}
              outlined={isHead && mine}
              badge={
                isHead ? (
                  <Text
                    style={[
                      styles.youBadge,
                      {
                        top: -cell * 0.85,
                        left: -cell * 1.5,
                        width: cell * 4,
                        textAlign: 'center',
                        color: mine ? '#fff' : col.head,
                      },
                      mine && { fontWeight: '800' },
                    ]}
                    numberOfLines={1}
                  >
                    {mine ? tr('youChip') : shortName(names[si])}
                  </Text>
                ) : undefined
              }
            />
          );
        });
      })}
      {state.foods.map((f, i) => (
        <FoodCell
          key={`f-${i}`}
          x={f.pos.x}
          y={f.pos.y}
          cell={cell}
          pad={1.5}
          kind={f.fat ? 'fat' : 'round'}
          color="#F4F8FF"
        />
      ))}
      {children}
    </View>
  );
}

function placeOf(state: PartyState, slot: number): number {
  const pos = state.placements.indexOf(slot);
  return pos < 0 ? 1 : state.snakes.length - pos;
}

function useBoardPx() {
  // Единый расчёт (src/lib/layout.ts): реальная высота управления + хром экрана матча.
  return useSharedBoardPx({ min: 260, max: 480, chrome: 170, sidePad: 20 });
}

// ── ЛОКАЛЬНАЯ ПРАКТИКА (vs боты) ──
function PracticeParty({ onExit }: { onExit: () => void }) {
  const boardPx = useBoardPx();
  const [count, setCount] = useState(5);
  const [state, setState] = useState<PartyState | null>(null);
  const overDone = useRef(false);

  const start = useCallback((n: number) => {
    overDone.current = false;
    track(EVENTS.partyStart, { mode: 'practice', players: n });
    setState(partyNewMatch(n));
  }, []);

  const doTurn = useCallback((dir: Direction) => {
    setState((s) => {
      if (!s || s.status !== 'playing' || !s.alive[0]) return s;
      hLight();
      return partyTurn(s, 0, dir);
    });
  }, []);

  useEffect(() => {
    if (!state || state.status !== 'playing') return;
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      setState((prev) => {
        if (!prev || prev.status !== 'playing') return prev;
        let s = prev;
        for (let i = 1; i < s.snakes.length; i++) if (s.alive[i]) s = partyTurn(s, i, partyBotDir(s, i));
        return partyStep(s);
      });
      id = setTimeout(tick, TICK_MS);
    };
    id = setTimeout(tick, TICK_MS);
    return () => clearTimeout(id);
  }, [state?.status]);

  // Между раундами best-of (локально): пауза → возрождение всех (partyNextRound).
  useEffect(() => {
    if (state?.status !== 'roundOver') return;
    const id = setTimeout(() => {
      setState((s) => (s && s.status === 'roundOver' ? partyNextRound(s) : s));
    }, ROUND_BREAK_MS);
    return () => clearTimeout(id);
  }, [state?.status]);

  useEffect(() => {
    if (!state || state.status !== 'matchOver' || overDone.current) return;
    overDone.current = true;
    const won = state.matchWinner === 0;
    track(EVENTS.partyEnd, { mode: 'practice', players: state.snakes.length, rounds: state.round, won, place: placeOf(state, 0) });
    playSfx(won ? 'win' : 'lose');
    if (won) hSuccess();
    else hError();
  }, [state?.status, state?.matchWinner]);

  const swipe = useSwipe(doTurn);
  useKeyboardTurn(doTurn, !!state && state.status === 'playing');

  if (!state) {
    return (
      <ScreenShell maxWidth={420}>
        <ScreenTitle>{tr('practice')}</ScreenTitle>
        <Text style={styles.subtitle}>{tr('practiceSub')}</Text>
        <View style={styles.countRow}>
          {COUNT_OPTIONS.map((n) => (
            <TouchScale
              key={n}
              style={[styles.countBtn, count === n && styles.countBtnActive]}
              onPress={() => setCount(n)}
              accessibilityLabel={`count-${n}`}
            >
              <Text style={[styles.countText, count === n && styles.countTextActive]}>{n}</Text>
            </TouchScale>
          ))}
        </View>
        <Text style={styles.subtle}>{tr('players')}</Text>
        <GameButton title={tr('start')} onPress={() => start(count)} a11y="party-start" style={styles.wideBtn} />
        <GameButton title={tr('back')} variant="ghost" onPress={onExit} a11y="party-back" />
      </ScreenShell>
    );
  }

  const aliveCount = state.alive.filter(Boolean).length;
  const names = state.snakes.map((_, i) => (i === 0 ? tr('you') : tr('botName', { n: i + 1 })));
  return (
    <MatchView
      state={state}
      mySlot={0}
      boardPx={boardPx}
      aliveCount={aliveCount}
      swipe={swipe}
      onTurn={doTurn}
      onAgain={() => start(count)}
      onExit={onExit}
      names={names}
      stake=""
      mode="practice"
    />
  );
}

// ── СЕТЕВОЙ МАТЧ (команда по коду) ──
function NetParty({ onExit, autoJoin }: { onExit: () => void; autoJoin?: string | null }) {
  const boardPx = useBoardPx();
  const room = usePartyRoom();
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [stakeText, setStakeText] = useState('');
  const [inviteNote, setInviteNote] = useState('');
  const overDone = useRef(false);
  const startTracked = useRef(false);

  // Пришли по ссылке-инвайту (?party=КОД): подставляем код, чистим URL — игрок вводит имя и жмёт Join.
  useEffect(() => {
    if (autoJoin) {
      setJoinCode(autoJoin.toUpperCase());
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [autoJoin]);

  const onShareInvite = useCallback(() => {
    const url = teamInviteUrl(room.code);
    if (!url) return;
    shareResult(tr('sharePartyInvite'), url).then((o) => {
      track(EVENTS.share, { where: 'party_invite', mode: 'net' });
      if (o === 'copied') {
        setInviteNote(tr('linkCopied'));
        setTimeout(() => setInviteNote(''), 1500);
      }
    });
  }, [room.code]);

  useEffect(() => {
    if (room.conn === 'playing' && room.state && !startTracked.current) {
      startTracked.current = true;
      track(EVENTS.partyStart, { mode: 'net', players: room.state.snakes.length, role: room.role });
    }
  }, [room.conn, room.state, room.role]);

  const handleExit = useCallback(() => {
    room.leave();
    onExit();
  }, [room, onExit]);

  const doTurn = useCallback(
    (dir: Direction) => {
      if (room.state?.status !== 'playing' || room.mySlot < 0 || !room.state.alive[room.mySlot]) return;
      hLight();
      room.turn(dir);
    },
    [room],
  );

  useEffect(() => {
    if (room.state?.status !== 'matchOver' || overDone.current) return;
    overDone.current = true;
    const won = room.state.matchWinner === room.mySlot;
    track(EVENTS.partyEnd, {
      mode: 'net',
      players: room.state.snakes.length,
      rounds: room.state.round,
      won,
      place: room.mySlot >= 0 ? placeOf(room.state, room.mySlot) : 0,
      role: room.role,
    });
    playSfx(won ? 'win' : 'lose');
    if (won) hSuccess();
    else hError();
  }, [room.state?.status, room.state?.matchWinner, room.mySlot]);

  const swipe = useSwipe(doTurn);
  useKeyboardTurn(doTurn, room.state?.status === 'playing');

  // Форма: имя + создать/войти.
  if (room.conn === 'idle' || room.conn === 'error') {
    return (
      <ScreenShell maxWidth={420}>
        <ScreenTitle>{tr('teamRoom')}</ScreenTitle>
        <Text style={styles.subtitle}>{tr('teamRoomSub')}</Text>
        {!!autoJoin && (
          <Text style={[styles.subtle, { color: palette.accent }]}>
            {tr('invitedToTeam', { c: joinCode || autoJoin })}
          </Text>
        )}
        {room.conn === 'error' && <Text style={styles.errText}>{tr('connErrRetry')}</Text>}
        <GameInput
          value={name}
          onChangeText={setName}
          placeholder={tr('yourName')}
          maxLength={20}
          a11y="party-name"
          style={styles.nameInput}
        />
        <GameButton title={tr('createTeamRoom')} onPress={() => room.createRoom(name)} a11y="party-create" style={styles.wideBtn} />
        <View style={styles.joinRow}>
          <GameInput
            value={joinCode}
            onChangeText={(v) => setJoinCode(v.toUpperCase())}
            placeholder={tr('codePlaceholderShort')}
            autoCapitalize="characters"
            maxLength={5}
            mono
            a11y="party-join-code"
            style={styles.codeInput}
          />
          <GameButton
            title={tr('join')}
            variant="secondary"
            onPress={() => joinCode.length >= 4 && room.joinRoom(joinCode, name)}
            a11y="party-join"
          />
        </View>
        <GameButton title={tr('back')} variant="ghost" onPress={onExit} a11y="party-back" />
      </ScreenShell>
    );
  }

  // Лобби (в комнате, матч ещё не начат).
  if (!room.state) {
    const isHost = room.role === 'host';
    const enough = room.players.length >= PARTY_MIN;
    return (
      <ScreenShell maxWidth={420}>
        <ScreenTitle>{tr('teamRoom')}</ScreenTitle>
        <CodeBox
          label={tr('roomCode')}
          code={room.code}
          a11y={`party-code-${room.code}`}
          hints={[tr('shareCodeTeam'), tr('keepOpenTeam')]}
        />
        <GameButton
          title={inviteNote || tr('shareInviteLink')}
          variant="secondary"
          onPress={onShareInvite}
          a11y="party-share-link"
        />
        <Text style={styles.subtitle}>{tr('playersLabel')} ({room.players.length}/{PARTY_MAX})</Text>
        <View style={styles.playerList}>
          {Array.from({ length: PARTY_MAX }, (_, i) => {
            const p = room.players.find((pl) => pl.slot === i);
            const col = PARTY_COLORS[i % PARTY_COLORS.length];
            const isYou = !!p && p.id === room.myId;
            return (
              <View key={i} style={styles.playerRow}>
                <View
                  style={[
                    styles.playerDot,
                    p
                      ? { backgroundColor: col.head }
                      : { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
                  ]}
                />
                <Text style={[styles.playerName, !p && styles.playerEmpty]}>
                  {p ? p.name : tr('openSlot')}
                  {isYou ? ` ${tr('youSuffix')}` : ''}
                  {p && p.slot === 0 ? ` ${tr('hostSuffix')}` : ''}
                </Text>
              </View>
            );
          })}
        </View>
        {isHost ? (
          <View style={styles.stakeBox}>
            <Text style={styles.stakeLabel}>{tr('onTheLineLabel')}</Text>
            <GameInput
              value={stakeText}
              onChangeText={(v) => {
                setStakeText(v);
                room.setStake(v);
              }}
              placeholder={tr('stakePlaceholder')}
              maxLength={80}
              a11y="party-stake"
              style={styles.stakeInput}
            />
            <View style={styles.stakeChips}>
              {(['stake1', 'stake2', 'stake3', 'stake4'] as const).map((k) => (
                <TouchScale
                  key={k}
                  style={styles.stakeChip}
                  onPress={() => {
                    setStakeText(tr(k));
                    room.setStake(tr(k));
                  }}
                  accessibilityLabel={`stake-${tr(k)}`}
                >
                  <Text style={styles.stakeChipText}>{tr(k)}</Text>
                </TouchScale>
              ))}
            </View>
          </View>
        ) : room.stake ? (
          <Text style={styles.stakePrize}>🏆 {room.stake}</Text>
        ) : null}

        {isHost ? (
          <GameButton
            title={enough ? tr('startMatch') : tr('needPlayers', { n: PARTY_MIN })}
            onPress={() => enough && room.startMatch()}
            disabled={!enough}
            a11y="party-start-match"
            style={styles.wideBtn}
          />
        ) : (
          <Text style={styles.status}>{tr('waitingHost')}</Text>
        )}
        <GameButton title={tr('leave')} variant="ghost" onPress={handleExit} a11y="party-leave" />
      </ScreenShell>
    );
  }

  // Матч / финиш.
  const aliveCount = room.state.alive.filter(Boolean).length;
  return (
    <MatchView
      state={room.state}
      mySlot={room.mySlot}
      boardPx={boardPx}
      aliveCount={aliveCount}
      swipe={swipe}
      onTurn={doTurn}
      onAgain={null}
      onExit={handleExit}
      names={room.names}
      stake={room.stake}
      mode="net"
      waitHost={room.role !== 'host'}
    />
  );
}

// ── общий вид матча (поле + HUD + D-pad + оверлей финиша) ──
function MatchView({
  state,
  mySlot,
  boardPx,
  aliveCount,
  swipe,
  onTurn,
  onAgain,
  onExit,
  names,
  stake,
  mode,
  waitHost,
}: {
  state: PartyState;
  mySlot: number;
  boardPx: number;
  aliveCount: number;
  swipe: ReturnType<typeof Gesture.Pan>;
  onTurn: (d: Direction) => void;
  onAgain: (() => void) | null;
  onExit: () => void;
  names: string[];
  stake: string;
  mode: 'net' | 'practice';
  waitHost?: boolean;
}) {
  const isDesktop = useIsDesktopWeb();
  const total = state.snakes.length;
  const spectator = mySlot < 0;
  const youAlive = !spectator && state.alive[mySlot];
  const youPlace = spectator ? 0 : placeOf(state, mySlot);
  const won = mySlot >= 0 && state.matchWinner === mySlot;
  const finishOrder = [...state.placements].reverse(); // выживший раунда — первым
  const [shareNote, setShareNote] = useState('');
  const nameOf = (slot: number) => names[slot] || tr('playerName', { n: slot + 1 });
  const myWins = mySlot >= 0 ? state.roundWins[mySlot] ?? 0 : 0;

  const onShare = () => {
    const winnerName = state.matchWinner >= 0 ? nameOf(state.matchWinner) : tr('nobody');
    const msg = won
      ? stake
        ? tr('sharePartyWinStake', { stake })
        : tr('sharePartyWin')
      : stake
        ? tr('sharePartyLossStake', { winner: winnerName, stake })
        : tr('sharePartyLoss', { winner: winnerName });
    shareResult(msg).then((o) => {
      track(EVENTS.share, { where: 'party', mode, won });
      if (o === 'copied') {
        setShareNote(tr('linkCopied'));
        setTimeout(() => setShareNote(''), 1500);
      }
    });
  };

  return (
    <GestureDetector gesture={swipe}>
    <ScreenShell maxWidth={560} center={false}>
      <View style={styles.hud}>
        <HudChip
          label={tr('youChip')}
          value={spectator ? '👁' : youAlive ? tr('aliveWord') : `#${youPlace}`}
          borderColor={spectator ? palette.borderGlass : PARTY_COLORS[mySlot % PARTY_COLORS.length].head}
        />
        <HudChip label={tr('aliveChip')} value={`${aliveCount}/${total}`} />
        <HudChip label={`${tr('round').toUpperCase()} ${state.round}`} value={`${tr('winShort')} ${myWins}/${PARTY_WINS_NEEDED}`} />
      </View>

      {!!stake && state.status === 'playing' && (
        <Text style={styles.stakeBar} numberOfLines={1}>🏆 {tr('onTheLine')}: {stake}</Text>
      )}

      <View style={styles.playArea}>
      <PartyBoard state={state} mySlot={mySlot} boardPx={boardPx} names={names}>
          {state.status === 'roundOver' && (
            <GameOverlay
              title={
                state.roundWinner < 0
                  ? tr('roundDraw')
                  : state.roundWinner === mySlot
                    ? tr('youWonRound')
                    : `${nameOf(state.roundWinner)} ${tr('wonTheRound')}`
              }
            >
              <Text style={styles.overlaySub}>
                {tr('firstTo')} {PARTY_WINS_NEEDED}
                {state.roundWinner >= 0 ? ` · ${nameOf(state.roundWinner)}: ${state.roundWins[state.roundWinner]}` : ''}
              </Text>
              <Text style={styles.overlaySub}>{tr('nextRound')}</Text>
            </GameOverlay>
          )}
          {state.status === 'matchOver' && (
            <GameOverlay
              title={won ? tr('dontWorkToday') : state.matchWinner < 0 ? tr('itsADraw') : `${nameOf(state.matchWinner)} ${tr('winsWord')}`}
              backdrop={won ? <Confetti /> : undefined}
            >
              {!!stake && <Text style={styles.stakePrize}>🏆 {stake}</Text>}
              {!spectator && !won && state.matchWinner >= 0 && (
                <Text style={styles.overlaySub}>{tr('youPlaced', { n: youPlace })}</Text>
              )}
              {finishOrder.length > 0 && (
                <View style={styles.finishList}>
                  {finishOrder.slice(0, 5).map((slot, idx) => (
                    <Text key={slot} style={styles.finishRow}>
                      <Text style={{ color: PARTY_COLORS[slot % PARTY_COLORS.length].head }}>
                        {idx === 0 ? '🏆 ' : `#${idx + 1} `}
                      </Text>
                      {nameOf(slot)}
                      {slot === mySlot ? ` ${tr('youSuffix')}` : ''}
                    </Text>
                  ))}
                </View>
              )}
              <GameButton title={shareNote || tr('shareResultBtn')} variant="secondary" onPress={onShare} a11y="party-share" />
              {onAgain ? (
                <GameButton title={tr('playAgain')} onPress={onAgain} a11y="party-again" />
              ) : waitHost ? (
                <Text style={styles.overlaySub}>{tr('waitingHost')}</Text>
              ) : null}
              <GameButton title={tr('back')} variant="ghost" onPress={onExit} a11y="party-back" />
            </GameOverlay>
          )}
        </PartyBoard>
      </View>

      {state.status === 'playing' && (
        <>
          <Text style={styles.hint}>
            {spectator
              ? tr('spectating')
              : youAlive
                ? isDesktop
                  ? tr('keyboardHint')
                  : tr('swipeOrDpad')
                : tr('youAreOut')}
          </Text>
          {!spectator && youAlive && !isDesktop && (
            <Dpad onTurn={onTurn} scheme={getCtrlScheme()} side={getCtrlSide()} />
          )}
        </>
      )}

      <GameButton title={tr('leave')} variant="ghost" onPress={onExit} a11y="party-leave" />
    </ScreenShell>
    </GestureDetector>
  );
}

function useSwipe(onTurn: (d: Direction) => void) {
  return useMemo(() => {
    let committed = false;
    // activeOffset: до 12px сдвига жест не активируется и не мешает тапам по D-pad/кнопкам.
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
          onTurn(dir);
        }
      });
  }, [onTurn]);
}

// Управление стрелками/WASD в браузере (в party раньше не было — баг плейтеста И1).
const KEY_DIR: Record<string, Direction> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
  ц: 'up', ы: 'down', ф: 'left', в: 'right', Ц: 'up', Ы: 'down', Ф: 'left', В: 'right',
};
function useKeyboardTurn(onTurn: (d: Direction) => void, enabled: boolean) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const dir = KEY_DIR[e.key];
      if (dir) {
        e.preventDefault();
        onTurn(dir);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onTurn, enabled]);
}

// ── маршрутизатор режима ──
export default function PartyGame({ onExit, autoJoin }: { onExit: () => void; autoJoin?: string | null }) {
  const [screen, setScreen] = useState<'home' | 'practice' | 'net'>(autoJoin ? 'net' : 'home');

  if (screen === 'practice') return <PracticeParty onExit={() => setScreen('home')} />;
  if (screen === 'net') return <NetParty onExit={() => setScreen('home')} autoJoin={autoJoin} />;

  return (
    <ScreenShell maxWidth={420}>
      <Text style={[styles.brandTitle]}>Shake Work Off</Text>
      <Text style={styles.subtitle}>{tr('partySub')}</Text>
      <GameButton title={tr('teamRoomBtn')} onPress={() => setScreen('net')} a11y="party-team" style={styles.wideBtn} />
      <GameButton title={tr('practiceVsBots')} variant="secondary" onPress={() => setScreen('practice')} a11y="party-practice" style={styles.wideBtn} />
      <GameButton title={tr('back')} variant="ghost" onPress={onExit} a11y="party-exit" />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  brandTitle: { fontFamily: fonts.brand, color: palette.text, fontSize: 28, letterSpacing: 1 },
  subtitle: { fontFamily: fonts.body, color: palette.textDim, fontSize: 13, textAlign: 'center', paddingHorizontal: 24 },
  errText: { fontFamily: fonts.bodyBold, color: palette.danger, fontSize: 13 },
  countRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  countBtn: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.borderGlass,
  },
  countBtnActive: { borderColor: palette.accent, backgroundColor: 'rgba(61,220,132,0.12)' },
  countText: { fontFamily: fonts.num, color: palette.textDim, fontSize: 22 },
  countTextActive: { color: palette.text },
  subtle: { fontFamily: fonts.body, color: palette.textDim, fontSize: 13 },
  wideBtn: { minWidth: 240 },
  nameInput: { width: 240 },
  codeInput: { width: 150, textAlign: 'center' },
  joinRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  status: { fontFamily: fonts.body, color: palette.text, fontSize: 16 },
  playerList: { gap: 6, alignItems: 'flex-start', minHeight: 40 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  playerDot: { width: 12, height: 12, borderRadius: 6 },
  playerName: { fontFamily: fonts.body, color: palette.text, fontSize: 15 },
  playerEmpty: { color: palette.textDim, opacity: 0.5 },
  youBadge: {
    position: 'absolute',
    fontFamily: fonts.bodyBold,
    color: '#fff',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  hud: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  playArea: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%' },
  boardWrap: {
    backgroundColor: palette.board,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: palette.borderGlow,
  },
  overlaySub: { fontFamily: fonts.body, color: palette.textDim, fontSize: 15, textAlign: 'center' },
  hint: { fontFamily: fonts.body, color: palette.textDim, fontSize: 12, textAlign: 'center', paddingHorizontal: 16 },
  stakeBar: { fontFamily: fonts.bodyBold, color: palette.coinHi, fontSize: 13, textAlign: 'center', paddingHorizontal: 16 },
  stakePrize: { fontFamily: fonts.bodyBold, color: palette.coinHi, fontSize: 16, textAlign: 'center', paddingHorizontal: 16 },
  stakeLabel: { fontFamily: fonts.body, color: palette.textDim, fontSize: 13 },
  finishList: { gap: 3, alignItems: 'center', marginTop: 2 },
  finishRow: { fontFamily: fonts.body, color: palette.text, fontSize: 14, textAlign: 'center' },
  stakeBox: { alignItems: 'center', gap: 8, width: '100%', maxWidth: 320 },
  stakeInput: { width: '100%' },
  stakeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  stakeChip: { backgroundColor: palette.surface, borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 12, borderWidth: 1, borderColor: palette.borderGlass },
  stakeChipText: { fontFamily: fonts.body, color: palette.textDim, fontSize: 12 },
});
