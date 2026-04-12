const fs = require('fs');
const zlib = require('zlib');

function createPNG(size, filename) {
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const rx = Math.floor(size * 0.19);

      // Rounded rectangle check
      let inside = true;
      if (x < rx && y < rx) inside = Math.hypot(x - rx, y - rx) <= rx;
      else if (x >= size - rx && y < rx) inside = Math.hypot(x - (size - rx), y - rx) <= rx;
      else if (x < rx && y >= size - rx) inside = Math.hypot(x - rx, y - (size - rx)) <= rx;
      else if (x >= size - rx && y >= size - rx) inside = Math.hypot(x - (size - rx), y - (size - rx)) <= rx;

      if (!inside) {
        pixels[i] = 0; pixels[i + 1] = 0; pixels[i + 2] = 0; pixels[i + 3] = 0;
        continue;
      }

      // Gradient: amber (#f59e0b) to teal (#14b8a6)
      const t = (x + y) / (2 * size);
      const r = Math.round(245 + (20 - 245) * t);
      const g = Math.round(158 + (184 - 158) * t);
      const b = Math.round(11 + (166 - 11) * t);

      // 'R' letter shape
      const letterW = size * 0.5;
      const letterH = size * 0.55;
      const lx = x - (size / 2 - letterW / 2);
      const ly = y - (size / 2 - letterH / 2);
      const stroke = Math.max(Math.round(size * 0.12), 2);

      let isLetter = false;
      if (lx >= 0 && lx <= letterW && ly >= 0 && ly <= letterH) {
        if (lx < stroke) isLetter = true; // left bar
        if (ly < stroke) isLetter = true; // top bar
        if (ly < letterH / 2 && lx > letterW - stroke) isLetter = true; // right bar top
        if (ly >= letterH / 2 - stroke / 2 && ly <= letterH / 2 + stroke / 2) isLetter = true; // middle bar
        // diagonal leg
        const diagT = (ly - letterH / 2) / (letterH / 2);
        if (diagT >= 0 && diagT <= 1) {
          const diagX = letterW - stroke - diagT * (letterW - stroke);
          if (lx >= diagX - stroke / 2 && lx <= diagX + stroke / 2) isLetter = true;
        }
      }

      if (isLetter) {
        pixels[i] = 255; pixels[i + 1] = 255; pixels[i + 2] = 255; pixels[i + 3] = 255;
      } else {
        pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = 255;
      }
    }
  }

  // Build PNG
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type, data) {
    const typeB = Buffer.from(type);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crcData = Buffer.concat([typeB, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(crcData) >>> 0);
    return Buffer.concat([len, typeB, data, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  const rawData = Buffer.alloc(size * (size * 4 + 1));
  for (let row = 0; row < size; row++) {
    rawData[row * (size * 4 + 1)] = 0;
    pixels.copy(rawData, row * (size * 4 + 1) + 1, row * size * 4, (row + 1) * size * 4);
  }
  const compressed = zlib.deflateSync(rawData);

  const png = Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  fs.writeFileSync(filename, png);
  console.log(`Created ${filename} (${png.length} bytes, ${size}x${size})`);
}

createPNG(16, 'icon16.png');
createPNG(48, 'icon48.png');
createPNG(128, 'icon128.png');
