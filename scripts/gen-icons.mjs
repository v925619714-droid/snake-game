// Генерация иконки/сплэша/фавикона «Neon Arena» (спираль-coil) через sharp.
// Запуск: node scripts/gen-icons.mjs
import sharp from 'sharp';

const SIZE = 1024;
const cx = SIZE / 2;
const cy = SIZE / 2;

function spiralPath(turns, rMax, startR) {
  const steps = 480;
  const thetaMax = turns * 2 * Math.PI;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * thetaMax;
    const r = startR + (rMax - startR) * (th / thetaMax);
    const x = cx + r * Math.cos(th);
    const y = cy + r * Math.sin(th);
    d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
  }
  const thEnd = thetaMax;
  const hx = cx + rMax * Math.cos(thEnd);
  const hy = cy + rMax * Math.sin(thEnd);
  return { d, hx, hy };
}

// scale: масштаб спирали (для android-foreground оставляем safe-zone).
function svg({ bg, scale = 1 }) {
  const rMax = 360 * scale;
  const { d, hx, hy } = spiralPath(3.15, rMax, 34 * scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7CF7D4"/>
      <stop offset="50%" stop-color="#5CC8FF"/>
      <stop offset="100%" stop-color="#9B6CFF"/>
    </linearGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#2BB4E0" stop-opacity="0.5"/>
      <stop offset="60%" stop-color="#0B0F17" stop-opacity="0"/>
    </radialGradient>
  </defs>
  ${bg ? `<rect width="${SIZE}" height="${SIZE}" fill="#0B0F17"/>` : ''}
  <rect width="${SIZE}" height="${SIZE}" fill="url(#halo)"/>
  <g fill="none" stroke-linecap="round">
    <path d="${d}" stroke="url(#g)" stroke-width="${120 * scale}" opacity="0.10"/>
    <path d="${d}" stroke="url(#g)" stroke-width="${78 * scale}" opacity="0.16"/>
    <path d="${d}" stroke="url(#g)" stroke-width="${46 * scale}"/>
  </g>
  <circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="${44 * scale}" fill="#9CFCE6" opacity="0.4"/>
  <circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="${30 * scale}" fill="#EDFFFA"/>
</svg>`;
}

async function out(name, options, size = SIZE) {
  await sharp(Buffer.from(svg(options))).resize(size, size).png().toFile(`./assets/${name}`);
  console.log('wrote', name, size);
}

await out('icon.png', { bg: true }); // iOS/основная — полный квадрат с фоном
await out('favicon.png', { bg: true }, 64);
await out('splash-icon.png', { bg: false }); // прозрачный фон, сплэш сам красит #0B0F17
await out('android-icon-foreground.png', { bg: false, scale: 0.66 }); // safe-zone для adaptive
console.log('done');
