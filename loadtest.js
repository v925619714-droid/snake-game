// Нагрузочный тест Colyseus (wss://snake-rt.skillmake.ru): N дуэль-комнат с ботом.
// Каждый клиент заходит со СВОИМ code -> отдельная комната; через 8с сервер даёт бота
// и крутит авторитетную симуляцию (реальная нагрузка тика+broadcast).
// Запуск: node loadtest.js <N> <durationSec>
const { Client } = require('colyseus.js');

const N = Number(process.argv[2] || 50);
const DUR = Number(process.argv[3] || 90);
const WS = 'wss://snake-rt.skillmake.ru';
const DIRS = ['up', 'down', 'left', 'right'];

let joined = 0, failed = 0, states = 0, closed = 0;
const rooms = [];

async function spawn(i) {
  const c = new Client(WS);
  try {
    const room = await c.joinOrCreate('duel', { code: `LT${process.pid}_${i}`, ranked: 0 });
    joined++;
    rooms.push(room);
    room.onMessage('state', () => { states++; });
    room.onMessage('assign', () => {});
    room.onMessage('vsBot', () => {});
    room.onLeave(() => { closed++; });
    // Ввод как у живого игрока: раз в ~400мс случайный поворот.
    const t = setInterval(() => {
      try { room.send('input', { dir: DIRS[(Math.random() * 4) | 0] }); } catch {}
    }, 350 + Math.random() * 150);
    room.onLeave(() => clearInterval(t));
  } catch (e) {
    failed++;
  }
}

(async () => {
  console.log(`spawn ${N} rooms...`);
  // Волнами по 25, чтобы не захлебнуться на handshake.
  for (let i = 0; i < N; i += 25) {
    await Promise.all(Array.from({ length: Math.min(25, N - i) }, (_, k) => spawn(i + k)));
    process.stdout.write(`  joined=${joined} failed=${failed}\r`);
  }
  console.log(`\nall spawned: joined=${joined} failed=${failed}. Holding ${DUR}s...`);
  const t0 = Date.now();
  const int = setInterval(() => {
    const el = ((Date.now() - t0) / 1000) | 0;
    console.log(`[${el}s] rooms=${joined - closed} statesMsg/s=${(states / el || 0).toFixed(0)} closed=${closed}`);
    if (el >= DUR) {
      clearInterval(int);
      rooms.forEach((r) => { try { r.leave(); } catch {} });
      setTimeout(() => process.exit(0), 3000);
    }
  }, 15000);
})();
