// Смоук-тест: два клиента заходят в duel, сервер спаривает (0/1) и рассылает state.
import { Client } from 'colyseus.js';
const url = 'ws://127.0.0.1:2567';
const st = { a1: null, a2: null, s1: 0, s2: 0, matchOver: false };
const main = async () => {
  const r1 = await new Client(url).joinOrCreate('duel', { ranked: 0, code: '' });
  r1.onMessage('assign', (m) => (st.a1 = m.index));
  r1.onMessage('state', (s) => { st.s1++; if (s.status === 'matchOver') st.matchOver = true; });
  const r2 = await new Client(url).joinOrCreate('duel', { ranked: 0, code: '' });
  r2.onMessage('assign', (m) => (st.a2 = m.index));
  r2.onMessage('state', () => st.s2++);
  // немного поиграем: шлём вводы, чтобы тик крутился
  const dirs = ['up', 'right', 'down', 'left'];
  let k = 0;
  const iv = setInterval(() => { try { r1.send('input', { dir: dirs[k++ % 4] }); } catch {} }, 200);
  await new Promise((r) => setTimeout(r, 3000));
  clearInterval(iv);
  console.log(JSON.stringify({ assign1: st.a1, assign2: st.a2, stateMsgs1: st.s1, stateMsgs2: st.s2, sameRoom: r1.id === r2.id }));
  process.exit(0);
};
main().catch((e) => { console.log('ERR ' + e.message); process.exit(1); });
