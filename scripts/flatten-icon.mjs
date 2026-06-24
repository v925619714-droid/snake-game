import sharp from 'sharp';
const p = 'assets/icon.png';
const meta = await sharp(p).metadata();
console.log('before: channels=' + meta.channels + ' hasAlpha=' + meta.hasAlpha + ' ' + meta.width + 'x' + meta.height);
if (meta.hasAlpha) {
  const buf = await sharp(p).flatten({ background: '#0B0F17' }).png().toBuffer();
  const { writeFileSync } = await import('fs');
  writeFileSync(p, buf);
  const m2 = await sharp(p).metadata();
  console.log('after: channels=' + m2.channels + ' hasAlpha=' + m2.hasAlpha);
} else {
  console.log('already opaque, no change');
}
