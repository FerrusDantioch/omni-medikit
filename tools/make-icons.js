#!/usr/bin/env node
/* Génère les icônes PNG de l'application Omni-MediKit (aucune dépendance) :
   fond "nuit" #14111d, croix médicale "omni" #a777ff avec halo #d6c2ff,
   dans l'esprit de la charte graphique d'omni-systeme. */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'icons');

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function hex(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

const NUIT = hex('#14111d'), TRAIT = hex('#332c47'), OMNI = hex('#a777ff'), HALO = hex('#d6c2ff');

class Canvas {
  constructor(size) { this.size = size; this.px = new Float32Array(size * size * 4); }
  blend(x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size || a <= 0) return;
    const i = (y * this.size + x) * 4;
    const p = this.px;
    const ia = 1 - a;
    p[i] = r * a + p[i] * ia;
    p[i + 1] = g * a + p[i + 1] * ia;
    p[i + 2] = b * a + p[i + 2] * ia;
    p[i + 3] = Math.min(255, p[i + 3] + a * 255);
  }
  fillRect(x0, y0, x1, y1, c, a = 1) {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(this.size, Math.ceil(y1)); y++)
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(this.size, Math.ceil(x1)); x++)
        this.blend(x, y, c[0], c[1], c[2], a);
  }
  fillCircle(cx, cy, r, c, a = 1) {
    for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(this.size, Math.ceil(cy + r)); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(this.size, Math.ceil(cx + r)); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d <= r) this.blend(x, y, c[0], c[1], c[2], a);
      }
  }
  strokeCircle(cx, cy, r, w, c, a = 1) {
    for (let y = Math.max(0, Math.floor(cy - r - w)); y < Math.min(this.size, Math.ceil(cy + r + w)); y++)
      for (let x = Math.max(0, Math.floor(cx - r - w)); x < Math.min(this.size, Math.ceil(cx + r + w)); x++) {
        const d = Math.abs(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - r);
        if (d <= w / 2) this.blend(x, y, c[0], c[1], c[2], a);
      }
  }
  fillRoundRect(x0, y0, x1, y1, rad, c, a = 1) {
    rad = Math.max(0, Math.min(rad, (x1 - x0) / 2, (y1 - y0) / 2));
    this.fillRect(x0, y0 + rad, x1, y1 - rad, c, a);
    this.fillRect(x0 + rad, y0, x1 - rad, y1, c, a);
    for (const [ccx, ccy] of [[x0 + rad, y0 + rad], [x1 - rad, y0 + rad], [x0 + rad, y1 - rad], [x1 - rad, y1 - rad]])
      this.fillCircle(ccx, ccy, rad, c, a);
  }
  downsample(f) {
    const n = Math.max(1, Math.round(this.size / f));
    const out = Buffer.alloc(n * n * 4);
    const k = this.size / n;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        let r = 0, g = 0, b = 0, a = 0, cnt = 0;
        const ys = Math.floor(y * k), ye = Math.min(this.size, Math.ceil((y + 1) * k));
        const xs = Math.floor(x * k), xe = Math.min(this.size, Math.ceil((x + 1) * k));
        for (let sy = ys; sy < ye; sy++)
          for (let sx = xs; sx < xe; sx++) {
            const i = (sy * this.size + sx) * 4;
            r += this.px[i]; g += this.px[i + 1]; b += this.px[i + 2]; a += this.px[i + 3]; cnt++;
          }
        const o = (y * n + x) * 4;
        out[o] = Math.round(r / cnt); out[o + 1] = Math.round(g / cnt);
        out[o + 2] = Math.round(b / cnt); out[o + 3] = Math.round(a / cnt);
      }
    return { width: n, height: n, data: out };
  }
}

function draw(size, contentScale, fullBleed) {
  const c = new Canvas(size);
  const u = size / 512;
  if (fullBleed) c.fillRect(0, 0, size, size, NUIT, 1);
  else c.fillRoundRect(0, 0, size, size, 112 * u, NUIT, 1);
  const s = size / 2, sc = contentScale;
  for (let r = 250; r > 80; r -= 16) c.fillCircle(s, s, r * u * sc, OMNI, 0.018);
  for (let r = 110; r > 50; r -= 12) c.fillCircle(s, s, r * u * sc, HALO, 0.03);
  const arm = 66 * u * sc, len = 304 * u * sc, cx = s - len / 2, cy = s - arm / 2;
  for (const [dx, dy, grow] of [[0, 0, 26], [0, 0, 14], [0, 0, 0]]) {
    const a = grow === 0 ? 1 : 0.22;
    c.fillRoundRect(cx - grow * u * sc, cy - grow * u * sc, cx + len + grow * u * sc, cy + arm + grow * u * sc, (arm / 2 + grow) * u * sc, OMNI, a);
    c.fillRoundRect(s - arm / 2 - grow * u * sc, s - len / 2 - grow * u * sc, s + arm / 2 + grow * u * sc, s + len / 2 + grow * u * sc, (arm / 2 + grow) * u * sc, OMNI, a);
  }
  c.fillRoundRect(1.5 * u, 1.5 * u, size - 1.5 * u, size - 1.5 * u, 110 * u, [0, 0, 0], 0);
  return c;
}

function border(canvas) {
  const size = canvas.size, u = size / 512;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const inside = x > 2 * u && y > 2 * u && x < size - 2 * u && y < size - 2 * u;
      const edge = x <= 2 * u || y <= 2 * u || x >= size - 2 * u || y >= size - 2 * u;
      if (edge && inside) canvas.blend(x, y, TRAIT[0], TRAIT[1], TRAIT[2], 0.9);
    }
}

fs.mkdirSync(OUT, { recursive: true });
const S = 4;
for (const [name, target, scale, full] of [
  ['icon-512.png', 512, 1, false],
  ['icon-192.png', 192, 1, false],
  ['icon-maskable-512.png', 512, 0.72, true],
]) {
  const c = draw(512 * S, scale, full);
  border(c);
  const img = c.downsample(512 * S / target);
  fs.writeFileSync(path.join(OUT, name), encodePNG(img.width, img.height, img.data));
  console.log('écrit', name, img.width + 'x' + img.height);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#14111d"/>
  <rect x="1.5" y="1.5" width="509" height="509" rx="110" fill="none" stroke="#332c47" stroke-width="3"/>
  <circle cx="256" cy="256" r="190" fill="#a777ff" opacity="0.14"/>
  <circle cx="256" cy="256" r="130" fill="#d6c2ff" opacity="0.12"/>
  <g fill="#a777ff">
    <rect x="106" y="224" width="300" height="64" rx="32"/>
    <rect x="224" y="106" width="64" height="300" rx="32"/>
  </g>
</svg>
`;
fs.writeFileSync(path.join(OUT, 'icon.svg'), svg);
console.log('écrit icon.svg');
