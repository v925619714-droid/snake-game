// Авторитетная комната дуэли 1v1. Сервер сам крутит симуляцию (duelStep) и рассылает
// состояние — клиент лишь шлёт ввод и рендерит. Это закрывает анти-чит (клиент не может
// подделать игру у соперника) и даёт основу для интерполяции.
import { Room, Client } from 'colyseus';
import {
  type DuelState,
  WINS_NEEDED,
  duelNewMatch,
  duelNextRound,
  duelStep,
  duelTurn,
} from '../game/duel';
import { botDirection } from '../game/bot';
import type { Direction } from '../game/logic';

const TICK_MS = 150;
const ROUND_BREAK_MS = 2600;
const BOT_FALLBACK_MS = 8000; // нет живого соперника за это время → бот

export class DuelRoom extends Room {
  maxClients = 2;
  private duel: DuelState | null = null;
  private idx = new Map<string, 0 | 1>(); // sessionId -> индекс игрока
  private vsBot = false;
  private breakTimer?: ReturnType<typeof setTimeout>;
  private botTimer?: ReturnType<typeof setTimeout>;

  onCreate(options: any) {
    // Для matchmaking: ranked/code — Colyseus сведёт в одну комнату игроков с равными полями.
    this.setMetadata({
      ranked: options?.ranked ? 1 : 0,
      code: options?.code || '',
      rating: options?.rating || 1000,
    });

    this.onMessage('input', (client, msg: { dir: Direction }) => {
      const i = this.idx.get(client.sessionId);
      if (i === undefined || !this.duel || this.duel.status !== 'playing') return;
      this.duel = duelTurn(this.duel, i, msg.dir);
    });
  }

  onJoin(client: Client, options: any) {
    const i: 0 | 1 = this.idx.size === 0 ? 0 : 1;
    this.idx.set(client.sessionId, i);
    client.send('assign', { index: i, ranked: this.metadata?.ranked === 1 });

    if (this.idx.size === 1) {
      // ждём второго; если не пришёл — играем с ботом (как quick/ranked-фолбэк в старом коде)
      this.botTimer = setTimeout(() => this.startVsBot(), BOT_FALLBACK_MS);
    } else if (this.idx.size >= 2) {
      if (this.botTimer) clearTimeout(this.botTimer);
      this.lock();
      this.startMatch();
    }
  }

  private startMatch() {
    this.duel = duelNewMatch();
    this.broadcast('state', this.duel);
    this.setSimulationInterval(() => this.tick(), TICK_MS);
  }

  private startVsBot() {
    this.vsBot = true;
    this.lock();
    this.broadcast('vsBot', {});
    this.startMatch();
  }

  private tick() {
    if (!this.duel || this.duel.status !== 'playing') return;
    if (this.vsBot) this.duel = duelTurn(this.duel, 1, botDirection(this.duel, 1));
    const next = duelStep(this.duel);
    this.duel = next;
    this.broadcast('state', next);

    if (next.status === 'roundOver') {
      // пауза между раундами → возрождение (пока status=roundOver, tick не шагает)
      this.breakTimer = setTimeout(() => {
        if (!this.duel) return;
        this.duel = duelNextRound(this.duel);
        this.broadcast('state', this.duel);
      }, ROUND_BREAK_MS);
    } else if (next.status === 'matchOver') {
      // матч закончен — симуляцию можно остановить; комната разойдётся по выходу игроков
    }
  }

  onLeave(client: Client) {
    const i = this.idx.get(client.sessionId);
    this.idx.delete(client.sessionId);
    // Соперник вышел во время матча → технический выигрыш оставшемуся (форфейт).
    if (this.duel && this.duel.status !== 'matchOver' && i !== undefined && !this.vsBot) {
      const winner: 0 | 1 = i === 0 ? 1 : 0;
      const wins: [number, number] = [this.duel.matchWins[0], this.duel.matchWins[1]];
      wins[winner] = WINS_NEEDED;
      this.duel = { ...this.duel, status: 'matchOver', roundWinner: winner, matchWinner: winner, matchWins: wins };
      this.broadcast('state', this.duel);
      this.broadcast('oppLeft', {});
    }
  }

  onDispose() {
    if (this.breakTimer) clearTimeout(this.breakTimer);
    if (this.botTimer) clearTimeout(this.botTimer);
  }
}
