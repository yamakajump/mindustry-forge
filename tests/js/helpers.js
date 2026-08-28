/**
 * Building a schematic to test against, and loading the catalogue without a browser.
 *
 * The tests run the same modules the page loads. A second copy of the analysis for testing
 * would be a second thing to be wrong, which is the whole reason there is only one.
 */

import { readFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";

import { useCatalogue } from "../../site/public/forge/analyse.js";

export function loadCatalogue() {
  return useCatalogue(JSON.parse(
    readFileSync(new URL("../../site/public/forge/blocks.json", import.meta.url), "utf8")));
}

const utf = (text) => {
  const bytes = Buffer.from(text, "utf8");
  return Buffer.concat([Buffer.from([bytes.length >> 8, bytes.length & 0xFF]), bytes]);
};

/**
 * Write tiles as the string the game puts on the clipboard.
 *
 * Written here rather than imported, on purpose: the reader is the thing under test, and a
 * reader checked against a writer that shares its assumptions checks nothing. This follows
 * `Schematics.write` in Mindustry v159.7 and nothing else.
 */
export function paste(tiles, name = "essai") {
  /* Block sizes out of the catalogue rather than a table kept here.
  
     The writer below is deliberately independent of the reader, so that a round trip
     tests something; how big a block is is not a format assumption though, it is block
     data, and a hand-kept list of it was a landmine. A vault missing from it was written
     as one tile wide, read back as three, and the test that followed measured a schematic
     nobody had described. */
  const sizes = Object.fromEntries(
    Object.entries(loadCatalogue().blocks).map(([name, block]) => [name, block.size || 1]));
  const spans = tiles.map(([x, y, block]) => {
    const size = sizes[block] || 1;
    const offset = Math.trunc(-(size - 1) / 2);
    return [x + offset, y + offset, size];
  });
  const left = Math.min(...spans.map(([x]) => x));
  const bottom = Math.min(...spans.map(([, y]) => y));
  const right = Math.max(...spans.map(([x, , s]) => x + s - 1));
  const top = Math.max(...spans.map(([, y, s]) => y + s - 1));

  const palette = [];
  for (const [, , block] of tiles) if (!palette.includes(block)) palette.push(block);

  const parts = [];
  const header = Buffer.alloc(4);
  header.writeInt16BE(right - left + 1, 0);
  header.writeInt16BE(top - bottom + 1, 2);
  parts.push(header);

  parts.push(Buffer.from([1]), utf("name"), utf(name));
  parts.push(Buffer.from([palette.length]), ...palette.map(utf));

  const count = Buffer.alloc(4);
  count.writeInt32BE(tiles.length, 0);
  parts.push(count);

  for (const [x, y, block, rotation, config] of tiles) {
    const head = Buffer.alloc(5);
    head.writeUInt8(palette.indexOf(block), 0);
    head.writeInt32BE((((x - left) << 16) | ((y - bottom) & 0xFFFF)) | 0, 1);
    parts.push(head);

    // Configuration type 5 is a piece of content: the item a sorter passes, the liquid a
    // source pours. A content type and a short, which is all the game writes.
    if (config) {
      const body = Buffer.alloc(4);
      body.writeUInt8(5, 0);
      body.writeUInt8(config.content, 1);
      body.writeInt16BE(config.id, 2);
      parts.push(body);
    } else {
      parts.push(Buffer.from([0]));
    }
    parts.push(Buffer.from([(rotation || 0) & 0xFF]));
  }

  const body = deflateSync(Buffer.concat(parts));
  return Buffer.concat([Buffer.from("msch"), Buffer.from([1]), body]).toString("base64");
}

/**
 * Where things go in, said the way a player says it.
 *
 * Since the guess was dropped, nothing is fed unless somebody marked a tile for it. A test
 * that hands a schematic four copper a second now has to say which belt it arrives on,
 * which is the same thing the page asks for.
 */
export const inAt = (...marks) => Object.fromEntries(
  marks.map(([x, y, resource]) => [`${x},${y}`, { side: "in", resource }]));

/**
 * An 8 bit RGBA PNG, decoded far enough to look at a pixel.
 *
 * There is no image library here and there should not be one: this exists so a test can ask
 * the atlas what it actually contains rather than trust a measurement somebody wrote down in
 * a comment. `atlas.png` is written by Pillow as 8 bit RGBA, so the four filter types and one
 * colour type below are the whole of what has to be understood; anything else throws rather
 * than guessing.
 *
 * `rows` stops the walk early, because a caller usually wants one 96 pixel sheet out of a
 * 2048 by 2864 atlas and the filters make scanlines readable only in order.
 */
export function decodePng(path, rows = Infinity) {
  const file = readFileSync(path);
  let at = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colour = 0;
  const parts = [];
  while (at < file.length) {
    const length = file.readUInt32BE(at);
    const type = file.toString("ascii", at + 4, at + 8);
    if (type === "IHDR") {
      const body = file.subarray(at + 8, at + 8 + length);
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colour = body[9];
    } else if (type === "IDAT") {
      parts.push(file.subarray(at + 8, at + 8 + length));
    } else if (type === "IEND") {
      break;
    }
    at += 12 + length;
  }
  if (depth !== 8 || colour !== 6) {
    throw new Error(`${path}: expected 8 bit RGBA, got depth ${depth} colour type ${colour}`);
  }

  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * 4;
  const wanted = Math.min(height, rows);
  const pixels = Buffer.alloc(wanted * stride);
  for (let y = 0; y < wanted; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const up = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      // The four bytes to the left, above, and above-left: PNG's a, b and c.
      const a = i >= 4 ? out[i - 4] : 0;
      const b = up ? up[i] : 0;
      const c = up && i >= 4 ? up[i - 4] : 0;
      let value = line[i];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        // Paeth: whichever of the three neighbours the linear estimate lands nearest.
        const guess = a + b - c;
        const da = Math.abs(guess - a);
        const db = Math.abs(guess - b);
        const dc = Math.abs(guess - c);
        value += da <= db && da <= dc ? a : db <= dc ? b : c;
      } else if (filter !== 0) {
        throw new Error(`${path}: unknown scanline filter ${filter} on row ${y}`);
      }
      out[i] = value & 0xFF;
    }
  }
  return { width, height, rows: wanted, pixels };
}
