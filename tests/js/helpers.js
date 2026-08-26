/**
 * Building a schematic to test against, and loading the catalogue without a browser.
 *
 * The tests run the same modules the page loads. A second copy of the analysis for testing
 * would be a second thing to be wrong, which is the whole reason there is only one.
 */

import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

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
  const sizes = { "mechanical-drill": 2, "pneumatic-drill": 2, "graphite-press": 2,
                  "silicon-smelter": 2, "kiln": 2, "distributor": 2, "laser-drill": 3,
                  "overdrive-projector": 2, "steam-generator": 2, "thorium-reactor": 3,
                  "coal-centrifuge": 2, "cultivator": 2, "spore-press": 2 };
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
