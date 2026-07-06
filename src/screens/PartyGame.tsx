// Экран корпоративного режима «Shake Work Off» (FFA 5–10).
// Главный экран маршрутизирует: Practice vs bots (локально) ИЛИ Team room (по сети).
// Рендер поля общий (PartyBoard). Существующие режимы не затронуты — отдельный модуль.
import { type ReactNode, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { fonts, shade } from '../theme/tokens';
import { TouchScale, FadePop, Confetti } from '../ui/anim';
import { hLight, hSuccess, hError, getCtrlScheme, getCtrlSide } from '../lib/settings';
import { Dpad } from '../ui/Dpad';
import { t as tr } from '../lib/i18n';
import { useBoardPx as useSharedBoardPx } from '../lib/layout';
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

const C = {
  bg: '#0B0F17',
  board: '#0C111B',
  text: '#E8F0FB',
  textDim: '#8395AE',
  surface: '#121826',
  border: 'rgba(255,255,255,0.08)',
  accent: '#3DDC84',
};

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
            <View
              key={`${si}-${i}`}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: cell,
                height: cell,
                padding: 0.5,
                transform: [{ translateX: p.x * cell }, { translateY: p.y * cell }],
              }}
            >
              <View
                style={[
                  {
                    flex: 1,
                    borderRadius: cell * (isHead ? 0.34 : 0.28),
                    backgroundColor: isHead ? col.head : shade(col.body, (i / snake.length) * 0.5),
                  },
                  isHead && {
                    shadowColor: col.head,
                    shadowOpacity: 0.9,
                    shadowRadius: mine ? 7 : 4,
                    shadowOffset: { width: 0, height: 0 },
                    elevation: mine ? 7 : 4,
                  },
                  isHead && mine && { borderWidth: 1.5, borderColor: '#fff' },
                ]}
              >
                {isHead && (
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
                )}
              </View>
            </View>
          );
        });
      })}
      {state.foods.map((f, i) => (
        <View
          key={`f-${i}`}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: cell,
            height: cell,
            padding: 1.5,
            transform: [{ translateX: f.pos.x * cell }, { translateY: f.pos.y * cell }],
          }}
        >
          <View
            style={{
              flex: 1,
              borderRadius: cell / 2,
              backgroundColor: f.fat ? '#FFE680' : '#F4F8FF',
              shadowColor: f.fat ? '#FFD75E' : '#cfe0ff',
              shadowOpacity: f.fat ? 1 : 0.9,
              shadowRadius: f.fat ? 7 : 5,
              shadowOffset: { width: 0, height: 0 },
              elevation: f.fat ? 7 : 5,
            }}
          />
        </View>
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
  const insets = useSafeAreaInsets();
  const boardPx = useBoardPx();
  const [count, setCount] = useState(5);
  const [state, setState] = useState<PartyState | null>(null);
  const overDone = useRef(false);
  const pad = { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 };

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
      <View style={[styles.container, pad]}>
        <Text style={styles.title}>{tr('practice')}</Text>
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
        <TouchScale style={styles.bigBtn} onPress={() => start(count)} accessibilityLabel="party-start">
          <Text style={styles.bigBtnText}>{tr('start')}</Text>
        </TouchScale>
        <TouchScale style={styles.backBtn} onPress={onExit} accessibilityLabel="party-back">
          <Text style={styles.backText}>{tr('back')}</Text>
        </TouchScale>
      </View>
    );
  }

  const aliveCount = state.alive.filter(Boolean).length;
  const names = state.snakes.map((_, i) => (i === 0 ? tr('you') : tr('botName', { n: i + 1 })));
  return (
    <MatchView
      state={state}
      mySlot={0}
      boardPx={boardPx}
      pad={pad}
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
  const insets = useSafeAreaInsets();
  const boardPx = useBoardPx();
  const room = usePartyRoom();
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [stakeText, setStakeText] = useState('');
  const [inviteNote, setInviteNote] = useState('');
  const overDone = useRef(false);
  const startTracked = useRef(false);
  const pad = { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 };

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
      <View style={[styles.container, pad]}>
        <Text style={styles.title}>{tr('teamRoom')}</Text>
        <Text style={styles.subtitle}>{tr('teamRoomSub')}</Text>
        {!!autoJoin && (
          <Text style={[styles.subtle, { color: C.accent }]}>
            {tr('invitedToTeam', { c: joinCode || autoJoin })}
          </Text>
        )}
        {room.conn === 'error' && <Text style={styles.errText}>{tr('connErrRetry')}</Text>}
        <TextInput
          style={styles.nameInput}
          value={name}
          onChangeText={setName}
          placeholder={tr('yourName')}
          placeholderTextColor={C.textDim}
          maxLength={20}
          accessibilityLabel="party-name"
        />
        <TouchScale style={styles.bigBtn} onPress={() => room.createRoom(name)} accessibilityLabel="party-create">
          <Text style={styles.bigBtnText}>{tr('createTeamRoom')}</Text>
        </TouchScale>
        <View style={styles.joinRow}>
          <TextInput
            style={styles.codeInput}
            value={joinCode}
            onChangeText={(t) => setJoinCode(t.toUpperCase())}
            placeholder={tr('codePlaceholderShort')}
            placeholderTextColor={C.textDim}
            autoCapitalize="characters"
            maxLength={5}
            accessibilityLabel="party-join-code"
          />
          <TouchScale
            style={styles.joinBtn}
            onPress={() => joinCode.length >= 4 && room.joinRoom(joinCode, name)}
            accessibilityLabel="party-join"
          >
            <Text style={styles.altBtnText}>{tr('join')}</Text>
          </TouchScale>
        </View>
        <TouchScale style={styles.backBtn} onPress={onExit} accessibilityLabel="party-back">
          <Text style={styles.backText}>{tr('back')}</Text>
        </TouchScale>
      </View>
    );
  }

  // Лобби (в комнате, матч ещё не начат).
  if (!room.state) {
    const isHost = room.role === 'host';
    const enough = room.players.length >= PARTY_MIN;
    return (
      <View style={[styles.container, pad]}>
        <Text style={styles.title}>{tr('teamRoom')}</Text>
        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>{tr('roomCode')}</Text>
          <Text style={styles.codeValue} accessibilityLabel={`party-code-${room.code}`}>{room.code}</Text>
          <Text style={styles.codeHint}>{tr('shareCodeTeam')}</Text>
          <Text style={styles.codeHint}>{tr('keepOpenTeam')}</Text>
        </View>
        <TouchScale style={styles.shareBtn} onPress={onShareInvite} accessibilityLabel="party-share-link">
          <Text style={styles.shareBtnText}>{inviteNote || tr('shareInviteLink')}</Text>
        </TouchScale>
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
            <Text style={styles.codeLabel}>{tr('onTheLineLabel')}</Text>
            <TextInput
              style={styles.stakeInput}
              value={stakeText}
              onChangeText={(t) => {
                setStakeText(t);
                room.setStake(t);
              }}
              placeholder={tr('stakePlaceholder')}
              placeholderTextColor={C.textDim}
              maxLength={80}
              accessibilityLabel="party-stake"
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
          <TouchScale
            style={[styles.bigBtn, !enough && styles.bigBtnDisabled]}
            onPress={() => enough && room.startMatch()}
            accessibilityLabel="party-start-match"
          >
            <Text style={styles.bigBtnText}>{enough ? tr('startMatch') : tr('needPlayers', { n: PARTY_MIN })}</Text>
          </TouchScale>
        ) : (
          <Text style={styles.status}>{tr('waitingHost')}</Text>
        )}
        <TouchScale style={styles.backBtn} onPress={handleExit} accessibilityLabel="party-leave">
          <Text style={styles.backText}>{tr('leave')}</Text>
        </TouchScale>
      </View>
    );
  }

  // Матч / финиш.
  const aliveCount = room.state.alive.filter(Boolean).length;
  return (
    <MatchView
      state={room.state}
      mySlot={room.mySlot}
      boardPx={boardPx}
      pad={pad}
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
  pad,
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
  pad: { paddingTop: number; paddingBottom: number };
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
    <View style={[styles.matchContainer, pad]}>
      <View style={styles.hud}>
        <View style={[styles.chip, { borderColor: spectator ? C.border : PARTY_COLORS[mySlot % PARTY_COLORS.length].head }]}>
          <Text style={styles.chipLabel}>{tr('youChip')}</Text>
          <Text style={styles.chipVal}>{spectator ? '👁' : youAlive ? tr('aliveWord') : `#${youPlace}`}</Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipLabel}>{tr('aliveChip')}</Text>
          <Text style={styles.chipVal}>{aliveCount}/{total}</Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipLabel}>{tr('round').toUpperCase()} {state.round}</Text>
          <Text style={styles.chipVal}>{tr('winShort')} {myWins}/{PARTY_WINS_NEEDED}</Text>
        </View>
      </View>

      {!!stake && state.status === 'playing' && (
        <Text style={styles.stakeBar} numberOfLines={1}>🏆 {tr('onTheLine')}: {stake}</Text>
      )}

      <View style={styles.playArea}>
      <PartyBoard state={state} mySlot={mySlot} boardPx={boardPx} names={names}>
          {state.status === 'roundOver' && (
            <View style={styles.overlay}>
              <FadePop style={styles.overlayInner}>
                <Text style={styles.overlayTitle}>
                  {state.roundWinner < 0
                    ? tr('roundDraw')
                    : state.roundWinner === mySlot
                      ? tr('youWonRound')
                      : `${nameOf(state.roundWinner)} ${tr('wonTheRound')}`}
                </Text>
                <Text style={styles.overlaySub}>
                  {tr('firstTo')} {PARTY_WINS_NEEDED}
                  {state.roundWinner >= 0 ? ` · ${nameOf(state.roundWinner)}: ${state.roundWins[state.roundWinner]}` : ''}
                </Text>
                <Text style={styles.overlaySub}>{tr('nextRound')}</Text>
              </FadePop>
            </View>
          )}
          {state.status === 'matchOver' && (
            <View style={styles.overlay}>
              {won && <Confetti />}
              <FadePop style={styles.overlayInner}>
                <Text style={styles.overlayTitle}>
                  {won ? tr('dontWorkToday') : state.matchWinner < 0 ? tr('itsADraw') : `${nameOf(state.matchWinner)} ${tr('winsWord')}`}
                </Text>
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
                <TouchScale style={styles.shareBtn} onPress={onShare} accessibilityLabel="party-share">
                  <Text style={styles.shareBtnText}>{shareNote || tr('shareResultBtn')}</Text>
                </TouchScale>
                {onAgain ? (
                  <TouchScale style={styles.bigBtn} onPress={onAgain} accessibilityLabel="party-again">
                    <Text style={styles.bigBtnText}>{tr('playAgain')}</Text>
                  </TouchScale>
                ) : waitHost ? (
                  <Text style={styles.overlaySub}>{tr('waitingHost')}</Text>
                ) : null}
                <TouchScale style={styles.backBtn} onPress={onExit} accessibilityLabel="party-back">
                  <Text style={styles.backText}>{tr('back')}</Text>
                </TouchScale>
              </FadePop>
            </View>
          )}
        </PartyBoard>
      </View>

      {state.status === 'playing' && (
        <>
          <Text style={styles.hint}>
            {spectator
              ? tr('spectating')
              : youAlive
                ? tr('swipeOrDpad')
                : tr('youAreOut')}
          </Text>
          {!spectator && youAlive && (
            <Dpad onTurn={onTurn} scheme={getCtrlScheme()} side={getCtrlSide()} />
          )}
        </>
      )}

      <TouchScale style={styles.leaveBtn} onPress={onExit} accessibilityLabel="party-leave">
        <Text style={styles.backText}>{tr('leave')}</Text>
      </TouchScale>
    </View>
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
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<'home' | 'practice' | 'net'>(autoJoin ? 'net' : 'home');
  const pad = { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 };

  if (screen === 'practice') return <PracticeParty onExit={() => setScreen('home')} />;
  if (screen === 'net') return <NetParty onExit={() => setScreen('home')} autoJoin={autoJoin} />;

  return (
    <View style={[styles.container, pad]}>
      <Text style={[styles.title, { fontFamily: fonts.brand }]}>Shake Work Off</Text>
      <Text style={styles.subtitle}>{tr('partySub')}</Text>
      <TouchScale style={styles.bigBtn} onPress={() => setScreen('net')} accessibilityLabel="party-team">
        <Text style={styles.bigBtnText}>{tr('teamRoomBtn')}</Text>
      </TouchScale>
      <TouchScale style={styles.altBtn} onPress={() => setScreen('practice')} accessibilityLabel="party-practice">
        <Text style={styles.altBtnText}>{tr('practiceVsBots')}</Text>
      </TouchScale>
      <TouchScale style={styles.backBtn} onPress={onExit} accessibilityLabel="party-exit">
        <Text style={styles.backText}>{tr('back')}</Text>
      </TouchScale>
    </View>
  );
}

const styles = StyleSheet.create({
  // paddingTop/Bottom приходят снаружи через pad (safe-area insets), не хардкодим.
  container: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  // Матч: шапка сверху, поле центрируется в свободном пространстве, D-pad снизу.
  matchContainer: { flex: 1, backgroundColor: C.bg, alignItems: 'center', gap: 12 },
  playArea: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%' },
  title: { fontFamily: fonts.display, color: C.text, fontSize: 28, letterSpacing: 1 },
  subtitle: { fontFamily: fonts.body, color: C.textDim, fontSize: 13, textAlign: 'center', paddingHorizontal: 24 },
  errText: { fontFamily: fonts.bodyBold, color: '#ff6b6b', fontSize: 13 },
  countRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  countBtn: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  countBtnActive: { borderColor: C.accent, backgroundColor: 'rgba(61,220,132,0.12)' },
  countText: { fontFamily: fonts.num, color: C.textDim, fontSize: 22 },
  countTextActive: { color: C.text },
  subtle: { color: C.textDim, fontSize: 13 },
  bigBtn: { backgroundColor: C.accent, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 40, alignItems: 'center', minWidth: 240 },
  bigBtnDisabled: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  bigBtnText: { fontFamily: fonts.display, color: '#06180E', fontSize: 17 },
  altBtn: { backgroundColor: C.surface, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 28, borderWidth: 1, borderColor: C.border, alignItems: 'center', minWidth: 240 },
  altBtnText: { fontFamily: fonts.bodyBold, color: C.text, fontSize: 15 },
  backBtn: { paddingVertical: 8, paddingHorizontal: 20 },
  backText: { color: C.textDim, fontSize: 15 },
  leaveBtn: { paddingVertical: 6, paddingHorizontal: 20 },
  nameInput: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    color: C.text,
    fontSize: 18,
    textAlign: 'center',
    paddingVertical: 12,
    width: 240,
  },
  joinRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  codeInput: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    color: C.text,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
    paddingVertical: 10,
    width: 150,
  },
  joinBtn: { backgroundColor: C.surface, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 22, borderWidth: 1, borderColor: C.border },
  codeBox: { alignItems: 'center', gap: 6, backgroundColor: C.surface, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 36, borderWidth: 1, borderColor: C.border },
  codeLabel: { color: C.textDim, fontSize: 13 },
  codeValue: { fontFamily: fonts.num, color: '#7CF7D4', fontSize: 42, letterSpacing: 10 },
  codeHint: { color: C.textDim, fontSize: 12 },
  status: { color: C.text, fontSize: 16 },
  playerList: { gap: 6, alignItems: 'flex-start', minHeight: 40 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  playerDot: { width: 12, height: 12, borderRadius: 6 },
  playerName: { fontFamily: fonts.body, color: C.text, fontSize: 15 },
  playerEmpty: { color: C.textDim, opacity: 0.5 },
  youBadge: {
    position: 'absolute',
    fontFamily: fonts.bodyBold,
    color: '#fff',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  hud: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  chip: {
    backgroundColor: C.surface,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 18,
    alignItems: 'center',
    minWidth: 90,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipLabel: { fontFamily: fonts.bodyBold, color: C.textDim, fontSize: 10, letterSpacing: 1 },
  chipVal: { fontFamily: fonts.num, color: C.text, fontSize: 18 },
  boardWrap: {
    backgroundColor: C.board,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(124,247,212,0.20)',
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
  },
  overlayInner: { alignItems: 'center', gap: 12, paddingHorizontal: 20 },
  overlayTitle: { fontFamily: fonts.display, color: C.text, fontSize: 24, textAlign: 'center' },
  overlaySub: { fontFamily: fonts.body, color: C.textDim, fontSize: 15, textAlign: 'center' },
  hint: { fontFamily: fonts.body, color: C.textDim, fontSize: 12, textAlign: 'center', paddingHorizontal: 16 },
  stakeBar: { fontFamily: fonts.bodyBold, color: '#FFE680', fontSize: 13, textAlign: 'center', paddingHorizontal: 16 },
  stakePrize: { fontFamily: fonts.bodyBold, color: '#FFE680', fontSize: 16, textAlign: 'center', paddingHorizontal: 16 },
  finishList: { gap: 3, alignItems: 'center', marginTop: 2 },
  finishRow: { fontFamily: fonts.body, color: C.text, fontSize: 14, textAlign: 'center' },
  shareBtn: { paddingVertical: 9, paddingHorizontal: 22, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  shareBtnText: { fontFamily: fonts.bodyBold, color: C.text, fontSize: 14 },
  stakeBox: { alignItems: 'center', gap: 8, width: '100%', maxWidth: 320 },
  stakeInput: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    color: C.text,
    fontSize: 15,
    textAlign: 'center',
    paddingVertical: 10,
    width: '100%',
  },
  stakeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  stakeChip: { backgroundColor: C.surface, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12, borderWidth: 1, borderColor: C.border },
  stakeChipText: { fontFamily: fonts.body, color: C.textDim, fontSize: 12 },
});
