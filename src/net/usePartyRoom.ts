// Office Royale (5–10) через свой игровой сервер (Colyseus, wss://snake-rt). Сервер
// авторитетный: хост даёт старт, сервер крутит partyStep и рассылает 'state'. Интерфейс
// хука сохранён 1:1 с прежним (Supabase), чтобы PartyGame не менялся.
// Протокол (server/src/rooms/PartyRoom.ts): комната 'party', filterBy code;
//   сервер→клиент: joined{host,code}, lobby{players:[{id,name}],stake}, stake{stake},
//     start{names,stake}, state(PartyState);
//   клиент→сервер: name{name}, stake{stake}, start{}, input{dir}. Слот = порядок входа.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Client, type Room } from 'colyseus.js';
import { type PartyState } from '../game/party';
import { type Direction } from '../game/logic';

export type PartyConn = 'idle' | 'connecting' | 'lobby' | 'playing' | 'ended' | 'error';
export type PartyRole = 'host' | 'guest';
export interface PartyPlayer {
  id: string;
  name: string;
  slot: number;
}

const WS_URL = process.env.EXPO_PUBLIC_GAME_WS || 'wss://snake-rt.skillmake.ru';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(): string {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export function usePartyRoom() {
  const [conn, setConn] = useState<PartyConn>('idle');
  const [role, setRole] = useState<PartyRole | null>(null);
  const [code, setCode] = useState('');
  const [players, setPlayers] = useState<PartyPlayer[]>([]);
  const [mySlot, setMySlot] = useState<number>(-1);
  const [state, setState] = useState<PartyState | null>(null);
  const [stake, setStakeState] = useState('');
  const [names, setNames] = useState<string[]>([]);
  const [myId, setMyId] = useState('');

  const clientRef = useRef<Client | null>(null);
  const roomRef = useRef<Room | null>(null);
  const playersRef = useRef<PartyPlayer[]>([]);
  const startedRef = useRef(false);

  const getClient = (): Client => {
    if (!clientRef.current) clientRef.current = new Client(WS_URL);
    return clientRef.current;
  };

  const disposeRoom = useCallback(() => {
    const r = roomRef.current;
    roomRef.current = null;
    if (r) {
      try {
        r.removeAllListeners();
        r.leave();
      } catch {}
    }
  }, []);

  const wire = useCallback((room: Room) => {
    disposeRoom();
    roomRef.current = room;
    setMyId(room.sessionId);
    startedRef.current = false;

    room.onMessage('joined', (m: { host: boolean; code: string }) => {
      setRole(m.host ? 'host' : 'guest');
      if (m.code) setCode(m.code);
      setConn('lobby');
    });
    room.onMessage('lobby', (m: { players: { id: string; name: string }[]; stake: string }) => {
      const ps = m.players.map((p, i) => ({ id: p.id, name: p.name, slot: i }));
      playersRef.current = ps;
      setPlayers(ps);
      setStakeState(m.stake || '');
      if (!startedRef.current) setConn('lobby');
    });
    room.onMessage('stake', (m: { stake: string }) => setStakeState(m.stake || ''));
    room.onMessage('start', (m: { names: string[]; stake: string }) => {
      startedRef.current = true;
      setNames(m.names || []);
      setStakeState(m.stake || '');
      // Слот = позиция моего sessionId в замороженном ростере (= порядок лобби).
      const slot = playersRef.current.findIndex((p) => p.id === room.sessionId);
      setMySlot(slot);
      setConn('playing');
    });
    room.onMessage('state', (s: PartyState) => {
      setState(s);
      if (s.status === 'matchOver') setConn('ended');
    });
    room.onError(() => setConn('error'));
  }, [disposeRoom]);

  const createRoom = useCallback((name: string): string => {
    const c = randomCode();
    setConn('connecting');
    getClient()
      .create('party', { code: c, name: (name || 'Player').slice(0, 20) })
      .then((r) => { wire(r); setCode(c); })
      .catch(() => setConn('error'));
    return c;
  }, [wire]);

  const joinRoom = useCallback((c: string, name: string) => {
    const cc = c.toUpperCase().trim();
    setConn('connecting');
    getClient()
      .joinOrCreate('party', { code: cc, name: (name || 'Player').slice(0, 20) })
      .then((r) => { wire(r); setCode(cc); })
      .catch(() => setConn('error'));
  }, [wire]);

  const setStake = useCallback((text: string) => {
    const t = text.slice(0, 80);
    setStakeState(t);
    roomRef.current?.send('stake', { stake: t });
  }, []);

  const startMatch = useCallback(() => {
    roomRef.current?.send('start', {});
  }, []);

  const turn = useCallback((dir: Direction) => {
    roomRef.current?.send('input', { dir });
  }, []);

  const leave = useCallback(() => {
    disposeRoom();
    startedRef.current = false;
    playersRef.current = [];
    setConn('idle');
    setRole(null);
    setCode('');
    setPlayers([]);
    setMySlot(-1);
    setState(null);
    setStakeState('');
    setNames([]);
  }, [disposeRoom]);

  useEffect(() => () => { disposeRoom(); }, [disposeRoom]);

  return { conn, role, code, players, mySlot, myId, state, stake, names, setStake, createRoom, joinRoom, startMatch, turn, leave };
}
