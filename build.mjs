// Baut index.html: eine einzige Datei mit Three.js und Spielcode eingebettet.
// Aufruf: node build.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const three = readFileSync('vendor/three.min.js', 'utf8')
  .replace(/^console\.warn\([^\n]*\),\n/, 'void 0,\n'); // Deprecation-Hinweis entfernen, Komma-Ausdruck behalten
// Alle Module aus src/ in fester Reihenfolge (Dateiname) in EINE Funktion packen
const modules = readdirSync('src').filter((f) => f.endsWith('.js')).sort();
const game = "(function () {\n'use strict';\n" +
  modules.map((f) => '// ===== ' + f + ' =====\n' + readFileSync('src/' + f, 'utf8')).join('\n') +
  '\n})();\n';
const tpl = readFileSync('src/template.html', 'utf8');
if (game.includes('</script')) throw new Error('Spielcode darf kein </script enthalten');
const html = tpl
  .replace('/*THREE_JS*/', () => three)
  .replace('/*GAME_JS*/', () => game);
writeFileSync('index.html', html);

// App-Icon (PNG) für „Zum Home-Bildschirm“
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x / size, y / size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const icon = (u, v) => {
  // Himmel, grüne Insel, Holzrampe
  if (v > 0.72) return [90, 163, 74];
  if (v > 0.3 && u > 0.2 && u < 0.8 && (0.72 - v) < (u - 0.2) * 0.75 && (0.72 - v) > (u - 0.2) * 0.75 - 0.1) return [181, 131, 90];
  if (u > 0.62 && u < 0.8 && v > 0.27 && v < 0.72) return [181, 131, 90];
  const t = v;
  return [Math.round(40 + 120 * t), Math.round(90 + 110 * t), Math.round(190 + 50 * t)];
};
for (const s of [180, 512]) writeFileSync(`icon-${s}.png`, png(s, icon));
console.log(`index.html gebaut aus ${modules.length} Modulen: ${(html.length / 1024).toFixed(0)} KB`);
