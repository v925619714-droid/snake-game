// Авторитетная комната Office Royale (5–10). Хост (первый вошедший) даёт старт; сервер
// крутит partyStep и рассылает состояние. Гости шлют ввод по своему слоту. Поздний вход —
// зритель (slot=-1). Дисконнект во время матча — убиваем слот, матч продолжается.
import { Room, Client } from 'colyseus';
import {
  type PartyState,
  PARTY_MAX,
  PARTY_MIN,
  partyNewMatch,
  partyNextRound,
  partyStep,
  partyTurn,
  partyKill,
} from '../game/party';
import type { Direction } from '../game/logic';

const TICK_MS = 150;
const ROUND_BREAK_MS = 2600;

export class PartyRoom extends Room {
  maxClients = PARTY_MAX;
  private game: PartyState | null = null;
  private started = false;
  private roster: string[] = []; // sessionId по слотам (заморожен на старте)
  private names = new Map<string, string>();
  private stake = '';
  private breakTimer?: ReturnType<typeof setTimeout>;

  onCreate(options: any) {
    this.setMetadata({ code: options?.code || '' });

    this.onMessage('name', (client, msg: { name: string }) => {
      this.names.set(client.sessionId, String(msg?.name || 'Player').slice(0, 20));
      this.broadcastLobby();
    });
    this.onMessage('stake', (client, msg: { stake: string }) => {
      if (client.sessionId !== this.roster[0] && this.clients[0]?.sessionId !== client.sessionId) {
        // только хост (первый) задаёт ставку
      }
      this.stake = String(msg?.stake || '').slice(0, 80);
      this.broadcast('stake', { stake: this.stake });
    });
    this.onMessage('start', (client) => {
      // старт даёт только хост (первый клиент)
      if (this.started || this.clients[0]?.sessionId !== client.sessionId) return;
      if (this.clients.length < PARTY_MIN) return;
      this.startMatch();
    });
    this.onMessage('input', (client, msg: { dir: Direction }) => {
      const slot = this.roster.indexOf(client.sessionId);
      if (slot < 0 || !this.game || this.game.status !== 'playing' || !this.game.alive[slot]) return;
      this.game = partyTurn(this.game, slot, msg.dir);
    });
  }

  onJoin(client: Client, options: any) {
    this.names.set(client.sessionId, String(options?.name || 'Player').slice(0, 20));
    client.send('joined', { host: this.clients[0]?.sessionId === client.sessionId, code: this.metadata?.code });
    this.broadcastLobby();
  }

  private broadcastLobby() {
    if (this.started) return;
    this.broadcast('lobby', {
      players: this.clients.map((c) => ({ id: c.sessionId, name: this.names.get(c.sessionId) || 'Player' })),
      stake: this.stake,
    });
  }

  private startMatch() {
    this.started = true;
    this.lock();
    this.roster = this.clients.map((c) => c.sessionId);
    const namesArr = this.roster.map((id) => this.names.get(id) || 'Player');
    this.game = partyNewMatch(this.roster.length);
    this.broadcast('start', { names: namesArr, stake: this.stake });
    this.broadcast('state', this.game);
    this.setSimulationInterval(() => this.tick(), TICK_MS);
  }

  private tick() {
    if (!this.game || this.game.status !== 'playing') return;
    const next = partyStep(this.game);
    this.game = next;
    this.broadcast('state', next);
    if (next.status === 'roundOver') {
      this.breakTimer = setTimeout(() => {
        if (!this.game || this.game.status === 'matchOver') return;
        this.game = partyNextRound(this.game);
        this.broadcast('state', this.game);
      }, ROUND_BREAK_MS);
    }
  }

  onLeave(client: Client) {
    if (!this.started) {
      this.names.delete(client.sessionId);
      this.broadcastLobby();
      return;
    }
    // Игрок вышел во время матча — убиваем его слот, матч продолжается.
    const slot = this.roster.indexOf(client.sessionId);
    if (slot >= 0 && this.game && this.game.status === 'playing' && this.game.alive[slot]) {
      this.game = partyKill(this.game, slot);
      this.broadcast('state', this.game);
    }
  }

  onDispose() {
    if (this.breakTimer) clearTimeout(this.breakTimer);
  }
}
