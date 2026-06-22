// Генерация иконок приложения из SVG. Запуск: node scripts/generate-icons.js
const sharp = require('sharp');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'assets');
const SIZE = 1024;
const CELL = 128;
const OX = 128;
const OY = 128;
const INSET = 8;
const SQ = 112;
const R = 26;
const BODY = '#3ddc84';
const HEAD = '#7cffb0';
const APPLE = '#ff5c5c';
const BG = '#0e1116';
const EYE = '#0e1116';

// Сегменты змейки (col,row) в сетке 6x6, форма буквы «S». Голова — последний.
const SNAKE = [
  [1, 1], [2, 1], [3, 1],
  [3, 2],
  [3, 3], [2, 3], [1, 3],
  [1, 4],
  [1, 5], [2, 5], [3, 5],
];
const HEAD_CELL = SNAKE[SNAKE.length - 1];

function cellRect([c, r], fill) {
  const x = OX + c * CELL + INSET;
  const y = OY + r * CELL + INSET;
  return `<rect x="${x}" y="${y}" width="${SQ}" height="${SQ}" rx="${R}" fill="${fill}"/>`;
}

function graphic() {
  let s = '';
  for (const cell of SNAKE) {
    const isHead = cell[0] === HEAD_CELL[0] && cell[1] === HEAD_CELL[1];
    s += cellRect(cell, isHead ? HEAD : BODY);
  }
  const hx = OX + HEAD_CELL[0] * CELL + INSET;
  const hy = OY + HEAD_CELL[1] * CELL + INSET;
  s += `<circle cx="${hx + 38}" cy="${hy + 44}" r="11" fill="${EYE}"/>`;
  s += `<circle cx="${hx + 78}" cy="${hy + 44}" r="11" fill="${EYE}"/>`;
  const ax = OX + 4 * CELL + 56;
  const ay = OY + 0 * CELL + 56;
  s += `<rect x="${ax - 6}" y="${ay - 80}" width="12" height="30" rx="6" fill="#7a3b1d"/>`;
  s += `<ellipse cx="${ax + 32}" cy="${ay - 60}" rx="26" ry="15" fill="${BODY}" transform="rotate(-25 ${ax + 32} ${ay - 60})"/>`;
  s += `<circle cx="${ax}" cy="${ay}" r="56" fill="${APPLE}"/>`;
  return s;
}

function svg({ bg = true, scale = 1 } = {}) {
  const inner = graphic();
  const off = (SIZE - SIZE * scale) / 2;
  const wrapped =
    scale === 1 ? inner : `<g transform="translate(${off},${off}) scale(${scale})">${inner}</g>`;
  const bgRect = bg ? `<rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${bgRect}${wrapped}</svg>`;
}

async function render(svgStr, file, size) {
  let img = sharp(Buffer.from(svgStr)).png();
  if (size) img = img.resize(size, size);
  await img.toFile(path.join(ASSETS, file));
  console.log('готово:', file);
}

(async () => {
  await render(svg({ bg: true }), 'icon.png');
  await render(svg({ bg: false, scale: 0.72 }), 'splash-icon.png');
  await render(svg({ bg: false, scale: 0.62 }), 'android-icon-foreground.png');
  await render(svg({ bg: true }), 'favicon.png', 64);
})();
