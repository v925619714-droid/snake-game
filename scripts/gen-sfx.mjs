// Синтез коротких звуковых эффектов в WAV (16-bit PCM mono, без внешних зависимостей).
// Запуск: node scripts/gen-sfx.mjs → assets/sfx/*.wav. Тон — чистые синусы с мягкой
// огибающей (без щелчков); приятно и «не дёшево».
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const SR = 22050;
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sfx');
mkdirSync(outDir, { recursive: true });

function envelope(t, dur, attack = 0.006, release = 0.07) {
  if (t < attack) return t / attack;
  const relStart = dur - release;
  if (t > relStart) return Math.max(0, (dur - t) / release);
  return 1;
}

// freqAt: число или функция p∈[0,1]→Гц. type: 'sine' | 'square' | 'tri'
function tone(freqAt, dur, vol = 0.5, type = 'sine') {
  const n = Math.floor(SR * dur);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = typeof freqAt === 'function' ? freqAt(t / dur) : freqAt;
    phase += (2 * Math.PI * f) / SR;
    let s = Math.sin(phase);
    if (type === 'square') s = Math.sign(s) * 0.7;
    else if (type === 'tri') s = (2 / Math.PI) * Math.asin(Math.sin(phase));
    out[i] = s * vol * envelope(t, dur);
  }
  return out;
}

function concat(...arrs) {
  const total = arrs.reduce((a, b) => a + b.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

function toWav(f32) {
  const n = f32.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, f32[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

const sounds = {
  eat: tone((p) => 660 + p * 330, 0.09, 0.5), // короткий восходящий «pluck»
  boost: concat(tone(880, 0.06, 0.4), tone((p) => 1320 + p * 440, 0.12, 0.4)), // искристый взлёт
  crash: tone((p) => 320 - p * 190, 0.26, 0.55, 'tri'), // нисходящий «удар»
  lose: concat(tone(392, 0.16, 0.4), tone(294, 0.26, 0.4)), // грустные две ноты вниз
  ui: tone(1000, 0.035, 0.28), // мягкий клик
  win: concat(tone(523, 0.11, 0.45), tone(659, 0.11, 0.45), tone(784, 0.16, 0.5)), // арпеджио C-E-G
};

for (const [name, data] of Object.entries(sounds)) {
  writeFileSync(join(outDir, `${name}.wav`), toWav(data));
}
console.log('SFX →', outDir, Object.keys(sounds).join(', '));
