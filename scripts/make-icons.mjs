/**
 * Generates the app icons in public/icons/ — the favicon and the PWA icons
 * used when FetchWave is installed to a phone's home screen.
 *
 *   npm run icons
 *
 * Written by hand so the repo needs no image dependencies.
 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
let SIZE = 512;
let PAD = 0; // fraction of the tile kept clear, for maskable icons
const SS = 3; // supersampling factor per axis, for clean edges

/* ---- palette (matches the CSS accent defaults) ---- */
const VIOLET = [0xa7, 0x8b, 0xfa];
const CYAN = [0x22, 0xd3, 0xee];
const INK = [0x08, 0x08, 0x0e];

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Signed distance to a rounded rectangle, <= 0 inside. */
function roundedRectSD(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(qx, qy), 0) - r;
}

function inRect(px, py, x0, y0, x1, y1) {
  return px >= x0 && px <= x1 && py >= y0 && py <= y1;
}

/** Downward-pointing isosceles triangle. */
function inTriangle(px, py, cx, apexY, halfW, topY) {
  if (py < topY || py > apexY) return false;
  const t = (py - topY) / (apexY - topY); // 0 at the wide top, 1 at the tip
  const w = halfW * (1 - t);
  return Math.abs(px - cx) <= w;
}

/** Samples one point of the artwork; returns [r,g,b,a] premultiplied-free. */
function sample(px, py) {
  const S = SIZE;
  const inset = S * PAD;
  const bodySD = roundedRectSD(px, py, S / 2, S / 2, S / 2 - inset, S / 2 - inset, (S - 2 * inset) * 0.235);
  if (bodySD > 0) return [0, 0, 0, 0];

  // Diagonal gradient across the tile.
  const t = clamp01(((px + py) / (2 * S)) ** 1.35);
  let col = [
    lerp(VIOLET[0], CYAN[0], t),
    lerp(VIOLET[1], CYAN[1], t),
    lerp(VIOLET[2], CYAN[2], t),
  ];

  // Soft highlight in the upper-left so the tile reads as lit, not flat.
  const hx = (px - S * 0.3) / (S * 0.62);
  const hy = (py - S * 0.24) / (S * 0.62);
  const glow = clamp01(1 - Math.sqrt(hx * hx + hy * hy)) ** 2.4 * 0.16;
  col = col.map((c) => Math.min(255, c + 255 * glow));

  /* ---- download glyph, drawn in the dark ink colour ---- */
  // Glyph geometry is relative to the inner tile, so it shrinks with PAD
  // instead of spilling past the maskable safe area.
  const B = S - 2 * inset;
  const g = (f) => inset + B * f;
  const cx = S / 2;
  const stemHalf = B * 0.062;
  const stemTop = g(0.235);
  const stemBottom = g(0.545);
  const headHalf = B * 0.165;
  const headTip = g(0.70);
  const barY0 = g(0.775);
  const barY1 = barY0 + B * 0.072;
  const barHalf = B * 0.225;

  const onGlyph =
    inRect(px, py, cx - stemHalf, stemTop, cx + stemHalf, stemBottom) ||
    inTriangle(px, py, cx, headTip, headHalf, stemBottom) ||
    roundedRectSD(px, py, cx, (barY0 + barY1) / 2, barHalf, (barY1 - barY0) / 2, B * 0.03) <= 0;

  if (onGlyph) col = INK.slice();

  return [col[0], col[1], col[2], 255];
}

function render(outPath) {
/* ---- rasterise with supersampling ---- */
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1)); // +1 filter byte per scanline
let p = 0;

for (let y = 0; y < SIZE; y++) {
  raw[p++] = 0; // filter: none
  for (let x = 0; x < SIZE; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const [sr, sg, sb, sa] = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
        const w = sa / 255;
        r += sr * w; g += sg * w; b += sb * w; a += sa;
      }
    }
    const n = SS * SS;
    const alpha = a / n;
    const cover = alpha > 0 ? (a / 255) : 1; // weight colour by covered samples
    raw[p++] = Math.round(r / cover);
    raw[p++] = Math.round(g / cover);
    raw[p++] = Math.round(b / cover);
    raw[p++] = Math.round(alpha);
  }
}

/* ---- PNG container ---- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // colour type: RGBA
ihdr[10] = 0; // deflate
ihdr[11] = 0; // adaptive filtering
ihdr[12] = 0; // no interlace

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, png);
  console.log(
    `wrote ${path.relative(process.cwd(), outPath)}  ${SIZE}x${SIZE}  ${(png.length / 1024).toFixed(1)} KB`,
  );
}

// One artwork, three targets: two plain PWA sizes plus a maskable variant
// whose glyph sits inside Android's safe area.
const PUB = path.join(DIR, '..', 'public', 'icons');
for (const [size, pad, out] of [
  [512, 0, path.join(PUB, 'icon-512.png')],
  [192, 0, path.join(PUB, 'icon-192.png')],
  [512, 0.10, path.join(PUB, 'maskable-512.png')],
]) {
  SIZE = size;
  PAD = pad;
  render(out);
}
