// Сетевой контур корпоративного режима «Shake Work Off» (FFA 5–10), host-authoritative
// на Supabase Broadcast. ОТДЕЛЬНЫЙ хук — НЕ трогает useRoom.ts (1v1/ranked).
//
// Модель: все в канале party-<code>. Presence по уникальному id игрока. Хост = минимальный
// id (детерминированно). Хост на старте «замораживает» roster (sorted ids → слоты 0..N-1),
// рассылает pstart{roster,state}, затем каждый тик гоняет partyStep и рассылает pstate.
// Гости шлют pinput{pid,dir}; хост применяет partyTurn. Гости лишь рендерят снапшот.
// Поздний вход — только зритель (slot=-1), в roster не попадает. Реэлекция хоста и
// обработка дисконнекта — в Ф4 (здесь host-drop замораживает матч — известное ограничение).
import { type RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type Direction } from '../game/logic';
import { type PartyState, PARTY_MIN, partyKill, partyNewMatch, partyStep, partyTurn } from '../game/party';
import { supabase } from '../lib/supabase';

export type PartyConn = 'idle' | 'connecting' | 'lobby' | 'playing' | 'ended' | 'error';
export type PartyRole = 'host' | 'guest';
export interface PartyPlayer {
  id: string;
  name: string;
  slot: number;
}

const TICK_MS = 150;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(): string {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function usePartyRoom() {
  const [conn, setConn] = useState<PartyConn>('idle');
  const [role, setRole] = useState<PartyRole | null>(null);
  const [code, setCode] = useState('');
  const [players, setPlayers] = useState<PartyPlayer[]>([]);
  const [mySlot, setMySlot] = useState<number>(-1);
  const [state, setState] = useState<PartyState | null>(null);

  const chRef = useRef<RealtimeChannel | null>(null);
  const myIdRef = useRef('');
  const myNameRef = useRef('Player');
  const roleRef = useRef<PartyRole | null>(null);
  const stateRef = useRef<PartyState | null>(null);
  const rosterRef = useRef<string[]>([]); // ids в порядке слотов (заморожен на старте)
  const mySlotRef = useRef(-1);
  const startedRef = useRef(false);
  const presenceIdsRef = useRef<string[]>([]); // текущие id в лобби (sorted)
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seqRef = useRef(0);
  const lastSeqRef = useRef(0);
  const inputRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apply = useCallback((s: PartyState | null) => {
    stateRef.current = s;
    setState(s);
    if (s && s.status === 'over') setConn('ended');
  }, []);

  const stopLoop = useCallback(() => {
    if (loopRef.current) {
      clearInterval(loopRef.current);
      loopRef.current = null;
    }
  }, []);

  const broadcastState = useCallback((s: PartyState) => {
    seqRef.current += 1;
    chRef.current?.send({ type: 'broadcast', event: 'pstate', payload: { state: s, seq: seqRef.current } });
  }, []);

  const startLoop = useCallback(() => {
    stopLoop();
    loopRef.current = setInterval(() => {
      const cur = stateRef.current;
      if (!cur || cur.status !== 'playing') return;
      const next = partyStep(cur);
      apply(next);
      broadcastState(next);
      if (next.status !== 'playing') stopLoop();
    }, TICK_MS);
  }, [apply, broadcastState, stopLoop]);

  const connect = useCallback(
    (asRole: PartyRole, roomCode: string, name: string) => {
      setConn('connecting');
      setRole(asRole);
      roleRef.current = asRole;
      setCode(roomCode);
      myIdRef.current = randomId();
      myNameRef.current = (name || 'Player').slice(0, 20);
      startedRef.current = false;
      rosterRef.current = [];
      mySlotRef.current = -1;
      setMySlot(-1);
      seqRef.current = 0;
      lastSeqRef.current = 0;
      presenceIdsRef.current = [];

      const ch = supabase.channel(`party-${roomCode}`, {
        config: { broadcast: { self: false }, presence: { key: myIdRef.current } },
      });
      chRef.current = ch;

      ch.on('presence', { event: 'sync' }, () => {
        const st = ch.presenceState() as Record<string, Array<{ name?: string; at?: number }>>;
        const ids = Object.keys(st).sort();
        presenceIdsRef.current = ids;

        if (!startedRef.current) {
          // Лобби: список игроков, хост = минимальный id.
          setPlayers(ids.map((id, idx) => ({ id, name: st[id]?.[0]?.name ?? 'Player', slot: idx })));
          const host = ids[0];
          const r: PartyRole = myIdRef.current === host ? 'host' : 'guest';
          roleRef.current = r;
          setRole(r);
          setConn('lobby');
          return;
        }

        // МАТЧ (Ф4 устойчивость): авторитет = присутствующий участник roster с наименьшим
        // слотом. Если ушёл хост — авторитет переходит к следующему (переизбрание); ушедшие
        // слоты убиваем, матч продолжается.
        const roster = rosterRef.current;
        if (roster.length === 0) return;
        const present = new Set(ids);
        let authSlot = -1;
        for (let s = 0; s < roster.length; s++) {
          if (present.has(roster[s])) {
            authSlot = s;
            break;
          }
        }
        const amHost = authSlot >= 0 && roster[authSlot] === myIdRef.current;
        if (amHost) {
          if (roleRef.current !== 'host') {
            // переизбрание: подхватываем авторитет и продолжаем цикл с последнего снапшота
            roleRef.current = 'host';
            setRole('host');
            seqRef.current = lastSeqRef.current;
            startLoop();
          }
          const cur = stateRef.current;
          if (cur && cur.status === 'playing') {
            let s2 = cur;
            let changed = false;
            for (let s = 0; s < roster.length; s++) {
              if (!present.has(roster[s]) && s2.alive[s]) {
                s2 = partyKill(s2, s);
                changed = true;
              }
            }
            if (changed) {
              apply(s2);
              broadcastState(s2);
            }
          }
        } else if (roleRef.current === 'host') {
          // потеряли авторитет (редкий случай) — прекращаем вести симуляцию
          roleRef.current = 'guest';
          setRole('guest');
          stopLoop();
        }
      });

      // Старт матча: roster (id→слот) + начальное состояние.
      ch.on('broadcast', { event: 'pstart' }, ({ payload }) => {
        const roster = payload.roster as string[];
        startedRef.current = true;
        rosterRef.current = roster;
        const slot = roster.indexOf(myIdRef.current);
        mySlotRef.current = slot;
        setMySlot(slot);
        lastSeqRef.current = 0;
        apply(payload.state as PartyState);
        setConn('playing');
      });

      // Снапшот от хоста (гости применяют, дропая устаревшие).
      ch.on('broadcast', { event: 'pstate' }, ({ payload }) => {
        if (roleRef.current === 'host') return;
        const seq = typeof payload.seq === 'number' ? payload.seq : 0;
        if (seq && seq <= lastSeqRef.current) return;
        lastSeqRef.current = seq;
        apply(payload.state as PartyState);
      });

      // Ввод гостя (применяет только хост).
      ch.on('broadcast', { event: 'pinput' }, ({ payload }) => {
        if (roleRef.current !== 'host') return;
        const cur = stateRef.current;
        if (cur) apply(partyTurn(cur, payload.pid as number, payload.dir as Direction));
      });

      // Поздний/переподключившийся клиент просит синхронизацию.
      ch.on('broadcast', { event: 'phello' }, () => {
        if (roleRef.current === 'host' && startedRef.current && stateRef.current) {
          ch.send({ type: 'broadcast', event: 'pstart', payload: { roster: rosterRef.current, state: stateRef.current } });
        }
      });

      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          ch.track({ name: myNameRef.current, at: Date.now() });
          if (!startedRef.current) setConn('lobby');
          ch.send({ type: 'broadcast', event: 'phello', payload: {} });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (!startedRef.current) setConn('error');
        }
      });
    },
    [apply, startLoop, stopLoop, broadcastState],
  );

  const createRoom = useCallback(
    (name: string) => {
      const c = randomCode();
      connect('host', c, name);
      return c;
    },
    [connect],
  );

  const joinRoom = useCallback(
    (c: string, name: string) => {
      connect('guest', c.toUpperCase().trim(), name);
    },
    [connect],
  );

  const startMatch = useCallback(() => {
    if (roleRef.current !== 'host' || startedRef.current) return;
    const roster = presenceIdsRef.current.slice();
    if (roster.length < PARTY_MIN) return;
    startedRef.current = true;
    rosterRef.current = roster;
    const slot = roster.indexOf(myIdRef.current);
    mySlotRef.current = slot;
    setMySlot(slot);
    const init = partyNewMatch(roster.length);
    apply(init);
    setConn('playing');
    chRef.current?.send({ type: 'broadcast', event: 'pstart', payload: { roster, state: init } });
    startLoop();
  }, [apply, startLoop]);

  const turn = useCallback((dir: Direction) => {
    const slot = mySlotRef.current;
    if (slot < 0) return; // зритель
    if (roleRef.current === 'host') {
      const cur = stateRef.current;
      if (cur) apply(partyTurn(cur, slot, dir));
    } else {
      chRef.current?.send({ type: 'broadcast', event: 'pinput', payload: { pid: slot, dir } });
      if (inputRetryRef.current) clearTimeout(inputRetryRef.current);
      inputRetryRef.current = setTimeout(() => {
        chRef.current?.send({ type: 'broadcast', event: 'pinput', payload: { pid: slot, dir } });
      }, 80);
    }
  }, [apply]);

  const leave = useCallback(() => {
    stopLoop();
    if (inputRetryRef.current) clearTimeout(inputRetryRef.current);
    startedRef.current = false;
    rosterRef.current = [];
    presenceIdsRef.current = [];
    mySlotRef.current = -1;
    seqRef.current = 0;
    lastSeqRef.current = 0;
    if (chRef.current) {
      supabase.removeChannel(chRef.current);
      chRef.current = null;
    }
    roleRef.current = null;
    stateRef.current = null;
    setState(null);
    setPlayers([]);
    setMySlot(-1);
    setRole(null);
    setCode('');
    setConn('idle');
  }, [stopLoop]);

  useEffect(
    () => () => {
      if (loopRef.current) clearInterval(loopRef.current);
      if (inputRetryRef.current) clearTimeout(inputRetryRef.current);
      if (chRef.current) supabase.removeChannel(chRef.current);
    },
    [],
  );

  return { conn, role, code, players, mySlot, state, createRoom, joinRoom, startMatch, turn, leave };
}
