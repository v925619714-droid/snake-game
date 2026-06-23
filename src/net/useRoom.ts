import { type RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type CoopState, coopInitial, coopStep, coopTurn } from '../game/coop';
import { type Direction } from '../game/logic';
import { supabase } from '../lib/supabase';

export type Role = 'host' | 'guest';
export type Conn = 'idle' | 'connecting' | 'waiting' | 'ready' | 'error';

const TICK_MS = 150;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode(): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export function useRoom() {
  const [conn, setConn] = useState<Conn>('idle');
  const [role, setRole] = useState<Role | null>(null);
  const [code, setCode] = useState('');
  const [coop, setCoop] = useState<CoopState | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const coopRef = useRef<CoopState | null>(null);
  const roleRef = useRef<Role | null>(null);
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const peerRef = useRef(false);

  const applyCoop = useCallback((s: CoopState | null) => {
    coopRef.current = s;
    setCoop(s);
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
      const cur = coopRef.current;
      if (!cur || cur.status !== 'playing') return;
      const next = coopStep(cur);
      applyCoop(next);
      broadcast('state', { state: next });
    }, TICK_MS);
  }, [applyCoop, broadcast, stopLoop]);

  // Хост стартует/перезапускает партию.
  const startGame = useCallback(() => {
    if (roleRef.current !== 'host') return;
    const init = coopInitial();
    applyCoop(init);
    broadcast('state', { state: init });
    startLoop();
  }, [applyCoop, broadcast, startLoop]);

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
        if (roleRef.current === 'guest') applyCoop(payload.state as CoopState);
      });
      ch.on('broadcast', { event: 'input' }, ({ payload }) => {
        if (roleRef.current === 'host') {
          const cur = coopRef.current;
          if (cur) applyCoop(coopTurn(cur, 1, payload.dir as Direction));
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
    [applyCoop],
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

  // Поворот: хост — игрок 0 (локально), гость — игрок 1 (через сеть).
  const turn = useCallback(
    (dir: Direction) => {
      if (roleRef.current === 'host') {
        const cur = coopRef.current;
        if (cur) applyCoop(coopTurn(cur, 0, dir));
      } else {
        broadcast('input', { dir });
      }
    },
    [applyCoop, broadcast],
  );

  const leave = useCallback(() => {
    stopLoop();
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    roleRef.current = null;
    peerRef.current = false;
    applyCoop(null);
    setConn('idle');
    setRole(null);
    setCode('');
  }, [applyCoop, stopLoop]);

  useEffect(
    () => () => {
      stopLoop();
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    },
    [stopLoop],
  );

  return { conn, role, code, coop, createRoom, joinRoom, startGame, turn, leave };
}
