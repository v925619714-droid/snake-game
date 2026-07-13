// Дуэль 1v1 через свой игровой сервер (Colyseus, wss://snake-rt). Сервер авторитетный:
// сам крутит симуляцию и рассылает 'state', клиент шлёт 'input'. Интерфейс хука сохранён
// 1:1 с прежним (Supabase Realtime), чтобы DuelGame не менялся.
// Протокол сервера (server/src/rooms/DuelRoom.ts): комната 'duel', filterBy ranked+code;
//   сервер→клиент: assign{index,ranked}, state(DuelState), vsBot{}, oppLeft{};
//   клиент→сервер: input{dir}. Матч авто-стартует по приходу 2-го игрока; одиночка → бот через 8с.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Client, type Room } from 'colyseus.js';
import { type DuelState } from '../game/duel';
import { type Direction } from '../game/logic';

export type Role = 'host' | 'guest';
export type Conn = 'idle' | 'searching' | 'connecting' | 'waiting' | 'ready' | 'error';

const WS_URL = process.env.EXPO_PUBLIC_GAME_WS || 'wss://snake-rt.skillmake.ru';
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
  const [duel, setDuel] = useState<DuelState | null>(null);
  // Сервер пока не обменивается рейтингом/uid соперника → ranked считает по клампу (апрокс).
  // Точный ELO по сопернику — доработка сервера (обмен opp uid/rating), в бэклоге.
  const [oppRating] = useState<number | null>(null);
  const [oppId] = useState<string | null>(null);
  const [vsBot, setVsBot] = useState(false);
  const [oppLeft, setOppLeft] = useState(false);
  const [netError, setNetError] = useState(false);
  const [joinFailed, setJoinFailed] = useState(false);

  const clientRef = useRef<Client | null>(null);
  const roomRef = useRef<Room | null>(null);

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
    room.onMessage('assign', (m: { index: 0 | 1 }) => {
      setRole(m.index === 0 ? 'host' : 'guest');
    });
    room.onMessage('state', (s: DuelState) => {
      setDuel(s);
    });
    room.onMessage('vsBot', () => setVsBot(true));
    room.onMessage('oppLeft', () => setOppLeft(true));
    room.onError(() => setNetError(true));
  }, [disposeRoom]);

  const resetFlags = () => {
    setDuel(null);
    setVsBot(false);
    setOppLeft(false);
    setNetError(false);
    setJoinFailed(false);
  };

  const quickMatch = useCallback(() => {
    resetFlags();
    setConn('searching');
    getClient()
      .joinOrCreate('duel', { ranked: 0, code: '' })
      .then((r) => { wire(r); setConn('waiting'); })
      .catch(() => setConn('error'));
  }, [wire]);

  const rankedMatch = useCallback((myRating: number, _myId: string) => {
    resetFlags();
    setConn('searching');
    getClient()
      .joinOrCreate('duel', { ranked: 1, code: '', rating: myRating })
      .then((r) => { wire(r); setConn('waiting'); })
      .catch(() => setConn('error'));
  }, [wire]);

  const createRoom = useCallback((): string => {
    resetFlags();
    const c = randomCode();
    setConn('connecting');
    getClient()
      .create('duel', { ranked: 0, code: c })
      .then((r) => { wire(r); setCode(c); setConn('waiting'); })
      .catch(() => setConn('error'));
    return c;
  }, [wire]);

  const joinRoom = useCallback((c: string) => {
    resetFlags();
    const cc = c.toUpperCase().trim();
    setConn('connecting');
    // join (НЕ create): падает, если комнаты с таким кодом нет → «комната не найдена».
    getClient()
      .join('duel', { ranked: 0, code: cc })
      .then((r) => { wire(r); setCode(cc); setConn('ready'); })
      .catch(() => setJoinFailed(true));
  }, [wire]);

  const rejoin = useCallback((c: string) => { joinRoom(c); }, [joinRoom]);

  const playBot = useCallback((_myRating: number) => {
    resetFlags();
    setConn('connecting');
    // Одиночная приватная комната → сервер подставит бота по таймауту (8с).
    getClient()
      .create('duel', { ranked: 0, code: 'B' + randomCode() })
      .then((r) => { wire(r); setConn('waiting'); })
      .catch(() => setConn('error'));
  }, [wire]);

  // Сервер авто-стартует матч по приходу 2-го игрока — ручной старт не нужен.
  const startGame = useCallback(() => {}, []);

  const turn = useCallback((dir: Direction) => {
    roomRef.current?.send('input', { dir });
  }, []);

  const leave = useCallback(() => {
    disposeRoom();
    setConn('idle');
    setRole(null);
    setCode('');
    resetFlags();
  }, [disposeRoom]);

  useEffect(() => () => { disposeRoom(); }, [disposeRoom]);

  return { conn, role, code, duel, oppRating, oppId, vsBot, oppLeft, netError, joinFailed, createRoom, joinRoom, rejoin, playBot, quickMatch, rankedMatch, startGame, turn, leave };
}
