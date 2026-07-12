// Игровой сервер Shake Work Off (Colyseus, авторитетный). Слушает WS; за TLS/доменом —
// Caddy (snake-rt.skillmake.ru). Комнаты: duel (1v1/ranked/friend), party (Office Royale).
import http from 'http';
import express from 'express';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { DuelRoom } from './rooms/DuelRoom';
import { PartyRoom } from './rooms/PartyRoom';

const port = Number(process.env.PORT || 2567);
const app = express();
app.get('/health', (_req, res) => res.send('ok'));

const httpServer = http.createServer(app);
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });

// filterBy: игроки с одинаковыми ranked+code попадают в одну комнату (quick = code:'' ranked:0;
// ranked = ranked:1; friend = свой code). Nearest-rating matchmaking — доработка позже.
gameServer.define('duel', DuelRoom).filterBy(['ranked', 'code']);
gameServer.define('party', PartyRoom).filterBy(['code']);

gameServer.listen(port);
console.log(`[gameserver] Colyseus on :${port} (duel, party)`);
