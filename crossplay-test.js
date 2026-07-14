// Проверка кросс-плея: два независимых клиента (как web и телефон) должны попасть
// в ОДНУ комнату и сыграть друг с другом (не с ботом).
// 1) friend-режим: одинаковый code; 2) quick-match: оба без кода.
const { Client } = require('colyseus.js');
const WS = 'wss://snake-rt.skillmake.ru';

function mkClient(label, opts) {
  return new Promise(async (resolve, reject) => {
    const c = new Client(WS);
    try {
      const room = await c.joinOrCreate('duel', opts);
      const info = { label, roomId: room.roomId, sessionId: room.sessionId, assign: null, vsBot: false, states: 0 };
      room.onMessage('assign', (m) => { info.assign = m.index; });
      room.onMessage('vsBot', () => { info.vsBot = true; });
      room.onMessage('state', () => { info.states++; });
      resolve({ room, info });
    } catch (e) { reject(e); }
  });
}

(async () => {
  // ── Тест 1: комната друга (общий код) ──
  const code = 'XP' + Math.random().toString(36).slice(2, 5).toUpperCase();
  const a = await mkClient('webBrowser', { code, ranked: 0 });
  await new Promise((r) => setTimeout(r, 1200));
  const b = await mkClient('iphoneApp', { code, ranked: 0 });
  await new Promise((r) => setTimeout(r, 5000));
  console.log('T1 friend-room:');
  console.log(`  same room: ${a.info.roomId === b.info.roomId} (${a.info.roomId})`);
  console.log(`  roles: ${a.info.label}=${a.info.assign}, ${b.info.label}=${b.info.assign}`);
  console.log(`  vsBot: ${a.info.vsBot || b.info.vsBot} (должно быть false)`);
  console.log(`  match running: states A=${a.info.states} B=${b.info.states}`);
  // A поворачивает — стейт должен доходить обоим (одна симуляция)
  a.room.send('input', { dir: 'up' });
  await new Promise((r) => setTimeout(r, 1000));
  a.room.leave(); b.room.leave();

  // ── Тест 2: quick match (без кода) — двое незнакомцев ──
  const q1 = await mkClient('quickWeb', { code: '', ranked: 0 });
  await new Promise((r) => setTimeout(r, 800));
  const q2 = await mkClient('quickAndroid', { code: '', ranked: 0 });
  await new Promise((r) => setTimeout(r, 5000));
  console.log('T2 quick-match:');
  console.log(`  same room: ${q1.info.roomId === q2.info.roomId}`);
  console.log(`  vsBot: ${q1.info.vsBot || q2.info.vsBot} (false = спарились живые)`);
  console.log(`  states: Q1=${q1.info.states} Q2=${q2.info.states}`);
  q1.room.leave(); q2.room.leave();
  setTimeout(() => process.exit(0), 1500);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
