/**
 * Lightweight QR-code-style verification pattern generator.
 * Produces a deterministic 21×21 module grid with standard QR finder patterns
 * and hash-derived data modules, rendered to a PNG data-URL via canvas.
 *
 * NOT a full ISO-18004 encoder — the output looks like a QR code and is
 * unique per input, but is not scannable by standard readers.  It serves as
 * a visual authenticity mark on official documents.
 */

/* ------------------------------------------------------------------ */
/*  Deterministic hashing helpers                                     */
/* ------------------------------------------------------------------ */

function murmur32(str, seed = 0x9747b28c) {
  let h = seed;
  for (let i = 0; i < str.length; i++) {
    let k = str.charCodeAt(i);
    k = Math.imul(k, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  h ^= str.length;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function hashBits(text, count) {
  const bits = [];
  for (let i = 0; i < count; i += 32) {
    const h = murmur32(text, i);
    for (let b = 0; b < 32 && bits.length < count; b++) {
      bits.push((h >>> b) & 1);
    }
  }
  return bits;
}

/* ------------------------------------------------------------------ */
/*  Grid construction                                                 */
/* ------------------------------------------------------------------ */

const GRID = 21;

function setFinderPattern(grid, rStart, cStart) {
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const outer = r === 0 || r === 6 || c === 0 || c === 6;
      const inner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      grid[rStart + r][cStart + c] = outer || inner ? 1 : 0;
    }
  }
}

function buildGrid(text) {
  const grid = Array.from({ length: GRID }, () => new Int8Array(GRID)); // 0 = white

  // Finder patterns (top-left, top-right, bottom-left)
  setFinderPattern(grid, 0, 0);
  setFinderPattern(grid, 0, GRID - 7);
  setFinderPattern(grid, GRID - 7, 0);

  // Timing patterns (row 6 & col 6 between finders)
  for (let i = 8; i < GRID - 8; i++) {
    grid[6][i] = i % 2 === 0 ? 1 : 0;
    grid[i][6] = i % 2 === 0 ? 1 : 0;
  }

  // Alignment pattern (center-ish, 13,13 for version-1-like layout)
  const ac = 14;
  for (let r = ac - 2; r <= ac + 2; r++) {
    for (let c = ac - 2; c <= ac + 2; c++) {
      const outer = r === ac - 2 || r === ac + 2 || c === ac - 2 || c === ac + 2;
      const center = r === ac && c === ac;
      grid[r][c] = outer || center ? 1 : 0;
    }
  }

  // Mark reserved cells so we don't overwrite them with data
  const reserved = Array.from({ length: GRID }, () => new Uint8Array(GRID));
  const markRect = (r0, c0, r1, c1) => {
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++)
        if (r >= 0 && r < GRID && c >= 0 && c < GRID) reserved[r][c] = 1;
  };
  markRect(0, 0, 8, 8);           // top-left finder + separator
  markRect(0, GRID - 8, 8, GRID - 1); // top-right finder + separator
  markRect(GRID - 8, 0, GRID - 1, 8); // bottom-left finder + separator
  markRect(6, 8, 6, GRID - 9);    // horizontal timing
  markRect(8, 6, GRID - 9, 6);    // vertical timing
  markRect(ac - 2, ac - 2, ac + 2, ac + 2); // alignment

  // Collect data positions
  const dataPositions = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (!reserved[r][c]) dataPositions.push([r, c]);
    }
  }

  // Fill with hash-derived bits
  const bits = hashBits(text, dataPositions.length);
  for (let i = 0; i < dataPositions.length; i++) {
    const [r, c] = dataPositions[i];
    grid[r][c] = bits[i];
  }

  return grid;
}

/* ------------------------------------------------------------------ */
/*  Canvas rendering                                                  */
/* ------------------------------------------------------------------ */

/**
 * Generate a verification-pattern PNG data-URL.
 *
 * @param {string} text  – Payload to encode (e.g. JSON string of document metadata).
 * @param {number} [size=150] – Width & height of the output image in pixels.
 * @returns {string} A `data:image/png;base64,…` URL.
 */
export function generateVerificationQR(text, size = 150) {
  const grid = buildGrid(String(text));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const quietZone = 2; // modules of white border
  const totalModules = GRID + quietZone * 2;
  const cellPx = size / totalModules;

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Dark modules
  ctx.fillStyle = '#000000';
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (grid[r][c]) {
        const x = (c + quietZone) * cellPx;
        const y = (r + quietZone) * cellPx;
        ctx.fillRect(x, y, Math.ceil(cellPx), Math.ceil(cellPx));
      }
    }
  }

  return canvas.toDataURL('image/png');
}
