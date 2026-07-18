// Generates ai-mysteries-web/public/favicon.ico (a magnifying glass, matching --color-accent).
// Local-only helper; run manually if the icon design changes:
//   node scripts/gen-favicon.cjs
const fs = require('fs');
const path = require('path');

const ACCENT = [0x5b, 0x8f, 0xb9]; // matches --color-accent

function makeImage(size) {
  const px = new Array(size * size).fill(null); // null = transparent, else [r,g,b,a]

  const cx = size * 0.44;
  const cy = size * 0.44;
  const r = size * 0.28;
  const ringWidth = Math.max(1.4, size * 0.1);

  const hx1 = cx + r * Math.SQRT1_2;
  const hy1 = cy + r * Math.SQRT1_2;
  const hx2 = size * 0.9;
  const hy2 = size * 0.9;
  const handleWidth = Math.max(1.6, size * 0.12);

  function distToSegment(px_, py_, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((px_ - x1) * dx + (py_ - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const ex = x1 + t * dx;
    const ey = y1 + t * dy;
    return Math.hypot(px_ - ex, py_ - ey);
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = x + 0.5;
      const sy = y + 0.5;
      const dCenter = Math.hypot(sx - cx, sy - cy);
      const ringDist = Math.abs(dCenter - r);
      const onRing = ringDist <= ringWidth / 2;
      const onHandle = distToSegment(sx, sy, hx1, hy1, hx2, hy2) <= handleWidth / 2;
      if (onRing || onHandle) {
        px[y * size + x] = [...ACCENT, 255];
      }
    }
  }
  return px;
}

function buildDib(size, pixels) {
  const headerSize = 40;
  const rowSize = size * 4;
  const xorSize = rowSize * size;
  const andRowSize = Math.ceil(size / 32) * 4;
  const andSize = andRowSize * size;

  const buf = Buffer.alloc(headerSize + xorSize + andSize);
  let o = 0;
  buf.writeUInt32LE(headerSize, o); o += 4;
  buf.writeInt32LE(size, o); o += 4;
  buf.writeInt32LE(size * 2, o); o += 4; // height = xor + and
  buf.writeUInt16LE(1, o); o += 2; // planes
  buf.writeUInt16LE(32, o); o += 2; // bitcount
  buf.writeUInt32LE(0, o); o += 4; // no compression
  buf.writeUInt32LE(xorSize, o); o += 4;
  buf.writeInt32LE(0, o); o += 4;
  buf.writeInt32LE(0, o); o += 4;
  buf.writeUInt32LE(0, o); o += 4;
  buf.writeUInt32LE(0, o); o += 4;

  // XOR (BGRA), bottom-up
  for (let y = size - 1; y >= 0; y--) {
    for (let x = 0; x < size; x++) {
      const p = pixels[y * size + x];
      if (p) {
        buf[o++] = p[2];
        buf[o++] = p[1];
        buf[o++] = p[0];
        buf[o++] = p[3];
      } else {
        buf[o++] = 0;
        buf[o++] = 0;
        buf[o++] = 0;
        buf[o++] = 0;
      }
    }
  }
  // AND mask: 0 everywhere (fully opaque per-pixel alpha handles transparency in 32bpp icons)
  o += andSize;

  return buf;
}

function buildIco(sizes) {
  const images = sizes.map((s) => ({ size: s, dib: buildDib(s, makeImage(s)) }));
  const dirSize = 6 + 16 * images.length;
  let offset = dirSize;
  const dir = Buffer.alloc(dirSize);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(images.length, 4);

  const entries = [];
  images.forEach((img, i) => {
    const e = 6 + i * 16;
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, e);
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, e + 1);
    dir.writeUInt8(0, e + 2);
    dir.writeUInt8(0, e + 3);
    dir.writeUInt16LE(1, e + 4);
    dir.writeUInt16LE(32, e + 6);
    dir.writeUInt32LE(img.dib.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += img.dib.length;
  });

  return Buffer.concat([dir, ...images.map((i) => i.dib)]);
}

const out = buildIco([16, 32, 48]);
fs.writeFileSync(path.join(__dirname, '..', 'ai-mysteries-web', 'public', 'favicon.ico'), out);
console.log('wrote', out.length, 'bytes');
