import { type RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { botDirection } from '../game/bot';
import { type DuelState, WINS_NEEDED, duelNewMatch, duelNextRound, duelStep, duelTurn } from '../game/duel';
import { type Direction } from '../game/logic';
import { supabase } from '../lib/supabase';

export type Role = 'host' | 'guest';
export type Conn = 'idle' | 'searching' | 'connecting' | 'waiting' | 'ready' | 'error';

const TICK_MS = 150;
// Темп матча против бота: быстрее обычного. Бот безошибочен на любой скорости, а у
// человека есть время реакции → высокая скорость и есть главный рычаг сложности.
const BOT_TICK_MS = 100;
const ROUND_BREAK_MS = 2600;
// Сколько ждём реального соперника в ranked, прежде чем подставить бота.
const BOT_FALLBACK_MS = 7000;
// Quick match: столько ждём случайного соперника, иначе тоже играем с ботом
// (иначе при пустом онлайне поиск висит вечно).
const QUICK_FALLBACK_MS = 8000;
// Соперник найден в очереди, но не зашёл в комнату за это время → бот-фолбэк.
const ROOM_PEER_TIMEOUT_MS = 10000;
// Устойчивость связи: пинг-heartbeat и порог «соперник пропал».
const HEARTBEAT_MS = 2000;
const PEER_TIMEOUT_MS = 7000; // нет вестей от соперника столько → считаем, что он отвалился
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode(): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// Технический выигрыш: соперник покинул матч/пропал → выживший побеждает форфейтом.
function forfeitWin(cur: DuelState, winner: 0 | 1): DuelState {
  const wins: [number, number] = [cur.matchWins[0], cur.matchWins[1]];
  wins[winner] = WINS_NEEDED;
  return { ...cur, status: 'matchOver', roundWinner: winner, matchWinner: winner, matchWins: wins };
}

export function useRoom() {
  const [conn, setConn] = useState<Conn>('idle');
  const [role, setRole] = useState<Role | null>(null);
  const [code, setCode] = useState('');
  const [duel, setDuel] = useState<DuelState | null>(null);
  const [oppRating, setOppRating] = useState<number | null>(null);
  const [oppId, setOppId] = useState<string | null>(null); // auth.uid() соперника (для серверного анти-чита)
  const [vsBot, setVsBot] = useState(false);
  // Соперник покинул матч (мы победили форфейтом) / наш канал потерял связь во время матча.
  const [oppLeft, setOppLeft] = useState(false);
  const [netError, setNetError] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const duelRef = useRef<DuelState | null>(null);
  const roleRef = useRef<Role | null>(null);
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const breakRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerRef = useRef(false);
  const peerEverRef = useRef(false); // соперник хоть раз подключался к комнате
  const mmRef = useRef<RealtimeChannel | null>(null);
  const matchedRef = useRef(false);
  const rankedRef = useRef(false);
  const botRef = useRef(false);
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Устойчивость связи.
  const lastPeerRef = useRef(0); // время последнего сообщения от соперника
  const hbRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelOkRef = useRef(false); // наш канал сейчас подписан (связь жива)
  const expectPeerRef = useRef(false); // ждём соперника в комнате (matched quick/ranked)
  const joinWatchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myRatingRef = useRef(1000); // для бот-фолбэка
  const botFallbackRef = useRef<(() => void) | null>(null);

  const apply = useCallback((s: DuelState | null) => {
    duelRef.current = s;
    setDuel(s);
  }, []);

  const broadcast = useCallback((event: string, payload: Record<string, unknown>) => {
    channelRef.current?.send({ type: 'broadcast', event, payload });
  }, []);

  const stopLoop = useCallback(() => {
    if (loopRef.current) {
      clearInterval(loopRef.current);
      loopRef.current = null;
    }
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (hbRef.current) {
      clearInterval(hbRef.current);
      hbRef.current = null;
    }
  }, []);

  const stopWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const clearJoinWatch = useCallback(() => {
    if (joinWatchRef.current) {
      clearTimeout(joinWatchRef.current);
      joinWatchRef.current = null;
    }
  }, []);

  // Соперник пропал во время матча (вышел или потерял связь) → технический выигрыш.
  const handleOppGone = useCallback(() => {
    const cur = duelRef.current;
    if (!cur || cur.status === 'matchOver') return;
    stopLoop();
    if (breakRef.current) clearTimeout(breakRef.current);
    stopHeartbeat();
    stopWatchdog();
    const me: 0 | 1 = roleRef.current === 'guest' ? 1 : 0;
    apply(forfeitWin(cur, me));
    setOppLeft(true);
  }, [apply, stopLoop, stopHeartbeat, stopWatchdog]);

  const startLoop = useCallback(() => {
    stopLoop();
    loopRef.current = setInterval(() => {
      const cur = duelRef.current;
      if (!cur || cur.status !== 'playing') return;
      const next = duelStep(cur);
      apply(next);
      broadcast('state', { state: next });
      if (next.status === 'roundOver') {
        stopLoop();
        breakRef.current = setTimeout(() => {
          const nr = duelNextRound(duelRef.current!);
          apply(nr);
          broadcast('state', { state: nr });
          startLoop();
        }, ROUND_BREAK_MS);
      } else if (next.status === 'matchOver') {
        stopLoop();
      }
    }, TICK_MS);
  }, [apply, broadcast, stopLoop]);

  const startGame = useCallback(() => {
    if (roleRef.current !== 'host') return;
    if (breakRef.current) clearTimeout(breakRef.current);
    setOppLeft(false);
    const init = duelNewMatch();
    apply(init);
    broadcast('state', { state: init });
    startLoop();
  }, [apply, broadcast, startLoop]);

  // Heartbeat: периодический пинг сопернику (для детекта тихого обрыва связи).
  const startHeartbeat = useCallback(() => {
    stopHeartbeat();
    hbRef.current = setInterval(() => {
      channelRef.current?.send({ type: 'broadcast', event: 'ping', payload: { t: Date.now() } });
    }, HEARTBEAT_MS);
  }, [stopHeartbeat]);

  // Watchdog: следит, что соперник на связи во время матча. Если НАШ канал жив, а от
  // соперника давно нет вестей — он отвалился (форфейт-победа нам). Если упал НАШ канал —
  // это наш обрыв, победу себе не присуждаем, показываем «связь потеряна».
  const startWatchdog = useCallback(() => {
    stopWatchdog();
    watchdogRef.current = setInterval(() => {
      const cur = duelRef.current;
      const active = cur && (cur.status === 'playing' || cur.status === 'roundOver');
      if (!active || botRef.current || !peerEverRef.current) return;
      if (!channelOkRef.current) {
        setNetError(true); // наша связь упала
        return;
      }
      if (Date.now() - lastPeerRef.current > PEER_TIMEOUT_MS) {
        handleOppGone();
      }
    }, 1500);
  }, [stopWatchdog, handleOppGone]);

  const connect = useCallback(
    (asRole: Role, roomCode: string, expectPeer = false) => {
      setConn('connecting');
      setRole(asRole);
      roleRef.current = asRole;
      setCode(roomCode);
      setOppLeft(false);
      setNetError(false);
      peerEverRef.current = false;
      expectPeerRef.current = expectPeer;
      channelOkRef.current = false;
      lastPeerRef.current = Date.now();

      const ch = supabase.channel(`room-${roomCode}`, {
        config: { broadcast: { self: false }, presence: { key: asRole } },
      });
      channelRef.current = ch;

      ch.on('broadcast', { event: 'state' }, ({ payload }) => {
        lastPeerRef.current = Date.now();
        if (roleRef.current === 'guest') apply(payload.state as DuelState);
      });
      ch.on('broadcast', { event: 'input' }, ({ payload }) => {
        lastPeerRef.current = Date.now();
        if (roleRef.current === 'host') {
          const cur = duelRef.current;
          if (cur) apply(duelTurn(cur, 1, payload.dir as Direction));
        }
      });
      ch.on('broadcast', { event: 'ping' }, () => {
        lastPeerRef.current = Date.now();
      });
      // Гость просит снимок состояния (после переподключения/входа во время паузы раунда).
      ch.on('broadcast', { event: 'resync' }, () => {
        lastPeerRef.current = Date.now();
        if (roleRef.current === 'host' && duelRef.current) {
          broadcast('state', { state: duelRef.current });
        }
      });
      ch.on('presence', { event: 'sync' }, () => {
        const keys = Object.keys(ch.presenceState());
        const peer = asRole === 'host' ? keys.includes('guest') : keys.includes('host');
        peerRef.current = peer;
        if (peer) {
          peerEverRef.current = true;
          lastPeerRef.current = Date.now();
          clearJoinWatch();
        }
        const cur = duelRef.current;
        const inMatch = cur && (cur.status === 'playing' || cur.status === 'roundOver');
        if (inMatch) {
          // Соперник чисто вышел во время матча (закрыл вкладку / нажал Leave).
          if (!peer && peerEverRef.current && channelOkRef.current) handleOppGone();
        } else {
          setConn(peer ? 'ready' : 'waiting');
        }
      });

      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channelOkRef.current = true;
          setNetError(false);
          lastPeerRef.current = Date.now();
          ch.track({ role: asRole, at: Date.now() });
          setConn(peerRef.current ? 'ready' : 'waiting');
          startHeartbeat();
          startWatchdog();
          // Гость после (пере)подключения просит у хоста актуальный снимок.
          if (asRole === 'guest') broadcast('resync', {});
          // Соперник найден в очереди, но не заходит в комнату → бот-фолбэк.
          if (expectPeerRef.current) {
            clearJoinWatch();
            joinWatchRef.current = setTimeout(() => {
              if (peerEverRef.current || duelRef.current) return;
              if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
              }
              stopHeartbeat();
              stopWatchdog();
              expectPeerRef.current = false;
              botFallbackRef.current?.();
            }, ROOM_PEER_TIMEOUT_MS);
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          channelOkRef.current = false;
          const cur = duelRef.current;
          const inMatch = cur && (cur.status === 'playing' || cur.status === 'roundOver');
          if (inMatch) setNetError(true); // наш обрыв во время матча — Realtime сам переподключится
          else setConn('error');
        }
      });
    },
    [apply, broadcast, startHeartbeat, startWatchdog, handleOppGone, clearJoinWatch, stopHeartbeat, stopWatchdog],
  );

  const createRoom = useCallback(() => {
    const c = randomCode();
    connect('host', c, false);
    return c;
  }, [connect]);

  const joinRoom = useCallback(
    (c: string) => {
      connect('guest', c.toUpperCase().trim(), false);
    },
    [connect],
  );

  const cleanupMM = useCallback(() => {
    if (mmRef.current) {
      supabase.removeChannel(mmRef.current);
      mmRef.current = null;
    }
  }, []);

  const clearBotTimer = useCallback(() => {
    if (botTimerRef.current) {
      clearTimeout(botTimerRef.current);
      botTimerRef.current = null;
    }
  }, []);

  // Локальный бот-цикл: каждый тик решает ход бота (игрок 1), шагает, без сети.
  const startBotLoop = useCallback(() => {
    stopLoop();
    loopRef.current = setInterval(() => {
      const cur = duelRef.current;
      if (!cur || cur.status !== 'playing') return;
      const next = duelStep(duelTurn(cur, 1, botDirection(cur, 1)));
      apply(next);
      if (next.status === 'roundOver') {
        stopLoop();
        breakRef.current = setTimeout(() => {
          const nr = duelNextRound(duelRef.current!);
          apply(nr);
          startBotLoop();
        }, ROUND_BREAK_MS);
      } else if (next.status === 'matchOver') {
        stopLoop();
      }
    }, BOT_TICK_MS);
  }, [apply, stopLoop]);

  // Старт матча против бота (фолбэк, когда нет живого соперника).
  // Игрок — host (player 0, Red), бот — player 1 (Blue). Рейтинг бота близок к нашему.
  const startBotMatch = useCallback(
    (myRating: number) => {
      stopHeartbeat();
      stopWatchdog();
      clearJoinWatch();
      expectPeerRef.current = false;
      botRef.current = true;
      setVsBot(true);
      setOppLeft(false);
      setNetError(false);
      roleRef.current = 'host';
      setRole('host');
      const r = Math.max(100, Math.round(myRating + (Math.random() * 100 - 50)));
      setOppRating(r);
      setOppId(null); // бот — без uid, серверный рейтинг по клиентскому oppRating (в рамках)
      const init = duelNewMatch();
      apply(init);
      setConn('ready');
      startBotLoop();
    },
    [apply, startBotLoop, stopHeartbeat, stopWatchdog, clearJoinWatch],
  );
  botFallbackRef.current = () => startBotMatch(myRatingRef.current);

  // Быстрый матч со случайным игроком (без рейтинга).
  // Очередь — общий presence-канал; детерминированный паринг: меньший id = хост.
  // Если за QUICK_FALLBACK_MS никого нет (или сеть недоступна) — играем с ботом.
  const quickMatch = useCallback(() => {
    matchedRef.current = false;
    rankedRef.current = false;
    botRef.current = false;
    myRatingRef.current = 1000;
    const myId = randomId();
    setConn('searching');
    setRole(null);
    setVsBot(false);
    const mm = supabase.channel('matchmaking', { config: { presence: { key: myId } } });
    mmRef.current = mm;

    mm.on('broadcast', { event: 'match' }, ({ payload }) => {
      if (matchedRef.current) return;
      if (payload.guest === myId) {
        matchedRef.current = true;
        clearBotTimer();
        cleanupMM();
        connect('guest', payload.room as string, true);
      }
    });
    mm.on('presence', { event: 'sync' }, () => {
      if (matchedRef.current) return;
      const ids = Object.keys(mm.presenceState()).sort();
      if (ids.length >= 2 && ids[0] === myId) {
        matchedRef.current = true;
        clearBotTimer();
        const room = randomCode();
        mm.send({ type: 'broadcast', event: 'match', payload: { host: ids[0], guest: ids[1], room } });
        cleanupMM();
        connect('host', room, true);
      }
    });
    mm.subscribe((s) => {
      if (s === 'SUBSCRIBED') {
        mm.track({ id: myId, t: Date.now() });
      } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
        // Нет сети для матчмейкинга → сразу к боту.
        if (matchedRef.current) return;
        matchedRef.current = true;
        clearBotTimer();
        cleanupMM();
        startBotMatch(myRatingRef.current);
      }
    });

    // Фолбэк на бота, если живого соперника нет.
    botTimerRef.current = setTimeout(() => {
      if (matchedRef.current) return;
      matchedRef.current = true;
      cleanupMM();
      startBotMatch(myRatingRef.current);
    }, QUICK_FALLBACK_MS);
  }, [cleanupMM, connect, clearBotTimer, startBotMatch]);

  // Ranked-матч: подбор по ближайшему рейтингу + обмен рейтингами.
  // Если за BOT_FALLBACK_MS живой соперник не нашёлся — подставляем бота.
  const rankedMatch = useCallback(
    (myRating: number, myUid: string) => {
      matchedRef.current = false;
      rankedRef.current = true;
      myRatingRef.current = myRating;
      const myId = randomId();
      setConn('searching');
      setRole(null);
      setOppRating(null);
      setOppId(null);
      setVsBot(false);
      botRef.current = false;
      const mm = supabase.channel('mm-ranked', { config: { presence: { key: myId } } });
      mmRef.current = mm;

      mm.on('broadcast', { event: 'match' }, ({ payload }) => {
        if (matchedRef.current) return;
        if (payload.guest === myId) {
          matchedRef.current = true;
          clearBotTimer();
          setOppRating(typeof payload.hostRating === 'number' ? payload.hostRating : null);
          setOppId(typeof payload.hostUid === 'string' ? payload.hostUid : null);
          cleanupMM();
          connect('guest', payload.room as string, true);
        }
      });
      mm.on('presence', { event: 'sync' }, () => {
        if (matchedRef.current) return;
        const st = mm.presenceState() as Record<string, Array<{ rating?: number; uid?: string }>>;
        const ids = Object.keys(st).sort();
        if (ids.length >= 2 && ids[0] === myId) {
          const others = ids.slice(1);
          let guest = others[0];
          let best = Infinity;
          for (const oid of others) {
            const r = st[oid]?.[0]?.rating ?? 1000;
            const d = Math.abs(r - myRating);
            if (d < best) {
              best = d;
              guest = oid;
            }
          }
          matchedRef.current = true;
          clearBotTimer();
          setOppRating(st[guest]?.[0]?.rating ?? null);
          setOppId(st[guest]?.[0]?.uid ?? null);
          const room = randomCode();
          mm.send({ type: 'broadcast', event: 'match', payload: { host: myId, guest, room, hostRating: myRating, hostUid: myUid } });
          cleanupMM();
          connect('host', room, true);
        }
      });
      mm.subscribe((s) => {
        if (s === 'SUBSCRIBED') {
          mm.track({ id: myId, rating: myRating, uid: myUid, t: Date.now() });
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
          if (matchedRef.current) return;
          matchedRef.current = true;
          clearBotTimer();
          cleanupMM();
          startBotMatch(myRating);
        }
      });

      // Фолбэк на бота, если живого соперника нет.
      botTimerRef.current = setTimeout(() => {
        if (matchedRef.current) return;
        matchedRef.current = true;
        cleanupMM();
        startBotMatch(myRating);
      }, BOT_FALLBACK_MS);
    },
    [cleanupMM, connect, clearBotTimer, startBotMatch],
  );

  const turn = useCallback(
    (dir: Direction) => {
      if (roleRef.current === 'host') {
        const cur = duelRef.current;
        if (cur) apply(duelTurn(cur, 0, dir));
      } else {
        broadcast('input', { dir });
      }
    },
    [apply, broadcast],
  );

  const leave = useCallback(() => {
    stopLoop();
    if (breakRef.current) clearTimeout(breakRef.current);
    clearBotTimer();
    clearJoinWatch();
    stopHeartbeat();
    stopWatchdog();
    cleanupMM();
    matchedRef.current = false;
    rankedRef.current = false;
    botRef.current = false;
    peerEverRef.current = false;
    expectPeerRef.current = false;
    channelOkRef.current = false;
    setVsBot(false);
    setOppLeft(false);
    setNetError(false);
    setOppRating(null);
    setOppId(null);
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    roleRef.current = null;
    peerRef.current = false;
    apply(null);
    setConn('idle');
    setRole(null);
    setCode('');
  }, [apply, cleanupMM, stopLoop, clearBotTimer, clearJoinWatch, stopHeartbeat, stopWatchdog]);

  useEffect(
    () => () => {
      stopLoop();
      if (breakRef.current) clearTimeout(breakRef.current);
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
      if (joinWatchRef.current) clearTimeout(joinWatchRef.current);
      if (hbRef.current) clearInterval(hbRef.current);
      if (watchdogRef.current) clearInterval(watchdogRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (mmRef.current) supabase.removeChannel(mmRef.current);
    },
    [stopLoop],
  );

  return { conn, role, code, duel, oppRating, oppId, vsBot, oppLeft, netError, createRoom, joinRoom, quickMatch, rankedMatch, startGame, turn, leave };
}
