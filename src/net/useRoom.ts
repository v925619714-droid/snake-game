import { type RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { botDirection } from '../game/bot';
import { type DuelState, duelNewMatch, duelNextRound, duelStep, duelTurn } from '../game/duel';
import { type Direction } from '../game/logic';
import { supabase } from '../lib/supabase';

export type Role = 'host' | 'guest';
export type Conn = 'idle' | 'searching' | 'connecting' | 'waiting' | 'ready' | 'error';

const TICK_MS = 150;
const ROUND_BREAK_MS = 2600;
// Сколько ждём реального соперника в ranked, прежде чем подставить бота.
const BOT_FALLBACK_MS = 7000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode(): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function useRoom() {
  const [conn, setConn] = useState<Conn>('idle');
  const [role, setRole] = useState<Role | null>(null);
  const [code, setCode] = useState('');
  const [duel, setDuel] = useState<DuelState | null>(null);
  const [oppRating, setOppRating] = useState<number | null>(null);
  const [vsBot, setVsBot] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const duelRef = useRef<DuelState | null>(null);
  const roleRef = useRef<Role | null>(null);
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const breakRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerRef = useRef(false);
  const mmRef = useRef<RealtimeChannel | null>(null);
  const matchedRef = useRef(false);
  const rankedRef = useRef(false);
  const botRef = useRef(false);
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const init = duelNewMatch();
    apply(init);
    broadcast('state', { state: init });
    startLoop();
  }, [apply, broadcast, startLoop]);

  const connect = useCallback(
    (asRole: Role, roomCode: string) => {
      setConn('connecting');
      setRole(asRole);
      roleRef.current = asRole;
      setCode(roomCode);

      const ch = supabase.channel(`room-${roomCode}`, {
        config: { broadcast: { self: false }, presence: { key: asRole } },
      });
      channelRef.current = ch;

      ch.on('broadcast', { event: 'state' }, ({ payload }) => {
        if (roleRef.current === 'guest') apply(payload.state as DuelState);
      });
      ch.on('broadcast', { event: 'input' }, ({ payload }) => {
        if (roleRef.current === 'host') {
          const cur = duelRef.current;
          if (cur) apply(duelTurn(cur, 1, payload.dir as Direction));
        }
      });
      ch.on('presence', { event: 'sync' }, () => {
        const keys = Object.keys(ch.presenceState());
        const peer = asRole === 'host' ? keys.includes('guest') : keys.includes('host');
        peerRef.current = peer;
        setConn(peer ? 'ready' : 'waiting');
      });

      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          ch.track({ role: asRole, at: Date.now() });
          setConn(peerRef.current ? 'ready' : 'waiting');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConn('error');
        }
      });
    },
    [apply],
  );

  const createRoom = useCallback(() => {
    const c = randomCode();
    connect('host', c);
    return c;
  }, [connect]);

  const joinRoom = useCallback(
    (c: string) => {
      connect('guest', c.toUpperCase().trim());
    },
    [connect],
  );

  const cleanupMM = useCallback(() => {
    if (mmRef.current) {
      supabase.removeChannel(mmRef.current);
      mmRef.current = null;
    }
  }, []);

  // Быстрый матч со случайным игроком (без рейтинга).
  // Очередь — общий presence-канал; детерминированный паринг: меньший id = хост.
  const quickMatch = useCallback(() => {
    matchedRef.current = false;
    const myId = randomId();
    setConn('searching');
    setRole(null);
    const mm = supabase.channel('matchmaking', { config: { presence: { key: myId } } });
    mmRef.current = mm;

    mm.on('broadcast', { event: 'match' }, ({ payload }) => {
      if (matchedRef.current) return;
      if (payload.guest === myId) {
        matchedRef.current = true;
        cleanupMM();
        connect('guest', payload.room as string);
      }
    });
    mm.on('presence', { event: 'sync' }, () => {
      if (matchedRef.current) return;
      const ids = Object.keys(mm.presenceState()).sort();
      if (ids.length >= 2 && ids[0] === myId) {
        matchedRef.current = true;
        const room = randomCode();
        mm.send({ type: 'broadcast', event: 'match', payload: { host: ids[0], guest: ids[1], room } });
        cleanupMM();
        connect('host', room);
      }
    });
    mm.subscribe((s) => {
      if (s === 'SUBSCRIBED') mm.track({ id: myId, t: Date.now() });
    });
  }, [cleanupMM, connect]);

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
    }, TICK_MS);
  }, [apply, stopLoop]);

  // Старт ranked-матча против бота (фолбэк, когда нет живого соперника).
  // Игрок — host (player 0, Red), бот — player 1 (Blue). Рейтинг бота близок к нашему.
  const startBotMatch = useCallback(
    (myRating: number) => {
      botRef.current = true;
      setVsBot(true);
      roleRef.current = 'host';
      setRole('host');
      const r = Math.max(100, Math.round(myRating + (Math.random() * 100 - 50)));
      setOppRating(r);
      const init = duelNewMatch();
      apply(init);
      setConn('ready');
      startBotLoop();
    },
    [apply, startBotLoop],
  );

  // Ranked-матч: подбор по ближайшему рейтингу + обмен рейтингами.
  // Если за BOT_FALLBACK_MS живой соперник не нашёлся — подставляем бота.
  const rankedMatch = useCallback(
    (myRating: number) => {
      matchedRef.current = false;
      rankedRef.current = true;
      const myId = randomId();
      setConn('searching');
      setRole(null);
      setOppRating(null);
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
          cleanupMM();
          connect('guest', payload.room as string);
        }
      });
      mm.on('presence', { event: 'sync' }, () => {
        if (matchedRef.current) return;
        const st = mm.presenceState() as Record<string, Array<{ rating?: number }>>;
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
          const room = randomCode();
          mm.send({ type: 'broadcast', event: 'match', payload: { host: myId, guest, room, hostRating: myRating } });
          cleanupMM();
          connect('host', room);
        }
      });
      mm.subscribe((s) => {
        if (s === 'SUBSCRIBED') mm.track({ id: myId, rating: myRating, t: Date.now() });
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
    cleanupMM();
    matchedRef.current = false;
    rankedRef.current = false;
    botRef.current = false;
    setVsBot(false);
    setOppRating(null);
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
  }, [apply, cleanupMM, stopLoop, clearBotTimer]);

  useEffect(
    () => () => {
      stopLoop();
      if (breakRef.current) clearTimeout(breakRef.current);
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (mmRef.current) supabase.removeChannel(mmRef.current);
    },
    [stopLoop],
  );

  return { conn, role, code, duel, oppRating, vsBot, createRoom, joinRoom, quickMatch, rankedMatch, startGame, turn, leave };
}
