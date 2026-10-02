// Reproducible dependency-free build. The recovered dependency runtime is
// intentionally unchanged; application source is maintained separately.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '../yakitori-machine-3d-viewer');
const inputs = ['vendor-runtime.js', 'model-viewer.js', 'layout-viewer.js'];
// The incumbent GLB embeds uncompressed BGRX DDS bytes mislabeled as PNG. Decode
// those exact pixels at build time so browsers can load the original normal map.
const glb = fs.readFileSync(path.join(root, 'models/layout_zone_sc4_yakitori.glb'));
const jsonLength = glb.readUInt32LE(12), model = JSON.parse(glb.toString('utf8', 20, 20 + jsonLength));
const imageView = model.bufferViews[model.images[0].bufferView], imageOffset = 28 + jsonLength + imageView.byteOffset;
const dds = glb.subarray(imageOffset, imageOffset + imageView.byteLength);
if (dds.toString('ascii', 0, 4) !== 'DDS ' || dds.readUInt32LE(84) !== 0 || dds.readUInt32LE(88) !== 32 || dds.readUInt32LE(92) !== 0xff0000 || dds.readUInt32LE(96) !== 0xff00 || dds.readUInt32LE(100) !== 0xff) throw Error('Embedded texture format changed; review its decoder');
const width = dds.readUInt32LE(16), height = dds.readUInt32LE(12), pixels = Buffer.alloc(height * (1 + width * 3));
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const sourcePixel = 128 + (y * width + x) * 4, targetPixel = y * (1 + width * 3) + 1 + x * 3;
  pixels[targetPixel] = dds[sourcePixel + 2]; pixels[targetPixel + 1] = dds[sourcePixel + 1]; pixels[targetPixel + 2] = dds[sourcePixel];
}
function chunk(type, data) {
  const bytes = Buffer.concat([Buffer.from(type), data]); let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1; }
  const result = Buffer.alloc(data.length + 12); result.writeUInt32BE(data.length); bytes.copy(result, 4); result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4); return result;
}
const imageHeader = Buffer.alloc(13); imageHeader.writeUInt32BE(width); imageHeader.writeUInt32BE(height, 4); imageHeader[8] = 8; imageHeader[9] = 2;
const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', imageHeader), chunk('IDAT', zlib.deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
// Git may check text out as CRLF on Windows. Hash the same LF source on every host.
const normalizeText = text => text.replace(/\r\n/g, '\n');
const source = inputs.map(name => normalizeText(fs.readFileSync(path.join(root, 'src', name), 'utf8'))).join('\n') + '\n(0,y.createRoot)(document.getElementById("root")).render(element(Hx, null));\n';
// Module syntax remains in the recovered runtime (import.meta for Draco).
if (/upsert_machine_layout|updateSelectedMachine|type:\s*[`'"]password|yakitori-machine-metadata-v3/.test(source)) throw new Error('Viewer contains an editor/write path');
const manifest = JSON.stringify({ build: 'readonly-v1', source: inputs.map(name => `src/${name}`), asset: 'assets/index-readonly.js', sha256: crypto.createHash('sha256').update(source).digest('hex'), texture: 'data/embedded-normal.png', textureSha256: crypto.createHash('sha256').update(png).digest('hex') }, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (normalizeText(fs.readFileSync(path.join(root, 'assets/index-readonly.js'), 'utf8')) !== source || normalizeText(fs.readFileSync(path.join(root, 'build-manifest.json'), 'utf8')) !== manifest) throw new Error('Viewer build is stale; run node scripts/build-machine-viewer.cjs');
  if (!fs.readFileSync(path.join(root, 'data/embedded-normal.png')).equals(png)) throw new Error('Viewer texture build is stale');
  console.log('Verified reproducible read-only viewer build');
} else {
  fs.writeFileSync(path.join(root, 'assets/index-readonly.js'), source);
  fs.writeFileSync(path.join(root, 'build-manifest.json'), manifest);
  fs.writeFileSync(path.join(root, 'data/embedded-normal.png'), png);
  console.log('Built read-only viewer:', source.length, 'characters');
}
