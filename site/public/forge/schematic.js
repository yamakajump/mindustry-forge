/**
 * Read the format the game reads, in the browser.
 *
 * The layout is taken from `Schematics.write` and `TypeIO` in Mindustry v159.7, the
 * version pinned throughout this repository:
 *
 *     'm' 's' 'c' 'h'                     magic, four bytes
 *     version                             one byte, currently 1
 *     --- everything past here is deflate compressed ---
 *     short width, short height
 *     byte tagCount,   then writeUTF key, writeUTF value, per tag
 *     byte paletteSize, then writeUTF blockName, per entry
 *     int tileCount
 *     per tile: byte paletteIndex, int packedPosition, config, byte rotation
 *
 * `writeUTF` is a big-endian two byte length followed by the bytes. A position is packed
 * as `(x << 16) | (y & 0xFFFF)`.
 *
 * Reading a format from a wiki is how a tool comes to disagree with the game about what a
 * player pasted, which is why this cites the class it came from.
 */

const HEADER = "msch";
const VERSION = 1;

/**
 * The most a paste is allowed to decompress to, derived rather than picked.
 *
 * Deflate has no bound of its own: a kilobyte of it expands to a megabyte, and a megabyte
 * to a gigabyte, at the reader's expense. That was tolerable while the only string this
 * site read was one its visitor had just copied out of their own game. It stopped being
 * tolerable the day the marketplace started serving fifteen thousand schematics fetched
 * from two other sites, because the same reader now runs on bytes nobody here chose, in a
 * visitor's browser when they open a page and under Node when the collector measures.
 *
 * The ceiling is what Mindustry itself can write, so nothing a player could legitimately
 * make is refused:
 *
 *   * 64 by 64 tiles, from `Vars.maxSchematicSize` with `Schematics.limitSchematicSize`;
 *   * per tile, a palette index, a packed position, a rotation, and at worst a processor's
 *     whole configuration, which `LogicBlock.maxCompressedLen` caps at 16 000 bytes;
 *   * plus the header, the tags and a 255 entry palette, generously rounded.
 *
 * Mindustry v8 build 159.7.
 */
const MAX_TILES = 64 * 64;
const MAX_TILE_BYTES = 1 + 4 + 1 + 4 + 16000 + 1;
const MAX_BODY = MAX_TILES * MAX_TILE_BYTES + 64 * 1024;

/** Bytes from what the clipboard carries, tolerating a paste wrapped by a chat client. */
export function bytesFromBase64(text) {
  const clean = String(text).replace(/\s+/g, "");
  if (!clean) throw new Error("aucune schématique fournie");
  let binary;
  try {
    binary = atob(clean);
  } catch {
    throw new Error("ce n'est pas une schématique : le texte n'est pas du base64");
  }
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Undo the deflate the game applied.
 *
 * `DecompressionStream("deflate")` is the zlib-wrapped variant, which is what Java's
 * `DeflaterOutputStream` writes. Asking for "deflate-raw" here reads the two byte zlib
 * header as data and fails on a file that is perfectly valid.
 */
/**
 * Undo the deflate the game applied, keeping whatever came out.
 *
 * `DecompressionStream("deflate")` is the zlib-wrapped variant, which is what Java's
 * `DeflaterOutputStream` writes. Asking for "deflate-raw" on the whole body reads the two
 * byte zlib header as data and fails on a file that is perfectly valid.
 *
 * Read chunk by chunk rather than through `new Response(stream)`. Two reasons, both found
 * the hard way. `Response` reported every failure as "Failed to fetch" in Chrome, which
 * says nothing at all and hid the real cause for an hour. And a stream that errors partway
 * still handed over everything it had decoded before it did, which turns out to be the
 * whole schematic: measured on the first one a player pasted, 1,102 bytes out and then
 * "Junk found after end of compressed data" over the four trailing checksum bytes.
 *
 * So a string damaged by a chat client is read anyway, and the caller is told it looked
 * altered rather than being handed nothing.
 */
async function pump(data, format) {
  const stream = new DecompressionStream(format);
  const writer = stream.writable.getWriter();
  writer.write(data).catch(() => {});
  writer.close().catch(() => {});

  const reader = stream.readable.getReader();
  const chunks = [];
  let length = 0;
  let complete = false;
  let overflowed = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) { complete = true; break; }
      chunks.push(value);
      length += value.length;

      /* Stopped while it is happening rather than after, because after the fact the memory
         has already been taken. The stream is cancelled so the decompressor stops working
         on something nobody is going to read.

         Flagged rather than thrown: the catch below exists to keep what decoded before a
         checksum failure, and it would swallow a throw here just as happily. Overflowing is
         not a damaged paste, it is a refusal, and it has to leave this function as one. */
      if (length > MAX_BODY) {
        overflowed = true;
        await reader.cancel().catch(() => {});
        break;
      }
    }
  } catch {
    // Kept on purpose. What decoded before the error is the schematic; what failed is the
    // checksum after it.
  }

  if (overflowed) {
    chunks.length = 0;
    throw new Error(`la schématique se dilate au-delà de ${MAX_BODY} octets`);
  }

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return { body: out, complete };
}

async function inflate(bytes) {
  const zlib = await pump(bytes, "deflate");
  if (zlib.complete && zlib.body.length) return { body: zlib.body, altered: false };

  // The zlib wrapper checks a sum at the end, and a paste that lost a character fails it
  // while the compressed data itself is intact. Skipping the two byte header and reading
  // the deflate stream directly gets the build back.
  const raw = await pump(bytes.slice(2), "deflate-raw");
  const best = raw.body.length >= zlib.body.length ? raw : zlib;
  if (!best.body.length) throw new Error("la décompression n'a rien rendu");
  return { body: best.body, altered: true };
}

/**
 * A block's stored configuration, following `TypeIO.writeObject` in v159.7.
 *
 * Real schematics are full of these and the first version refused all of them: a bridge
 * remembers where it reaches, a power node remembers what it is wired to, a sorter
 * remembers which item it passes. Skipping the bytes blind is not an option either, since
 * every type is a different length and one wrong guess turns the rest of the file into
 * noise.
 */
function readConfig(reader) {
  const type = reader.u8();
  switch (type) {
    case 0: return null;
    case 1: return { type, value: reader.i32() };
    case 2: reader.skip(8); return { type };
    case 3: reader.skip(4); return { type };
    case 4: return { type, value: reader.u8() ? reader.text() : null };
    case 5: return { type, content: reader.u8(), id: reader.i16() };
    case 6: { const n = reader.i16(); reader.skip(4 * n); return { type }; }
    // A Point2 is written as two whole ints, not as one packed one. Reading it as four
    // bytes desynchronises after the very first bridge in a schematic.
    case 7: return { type, dx: reader.i32(), dy: reader.i32() };
    case 8: { const n = reader.u8(); const links = [];
              for (let i = 0; i < n; i++) links.push(reader.i32());
              return { type, links }; }
    case 9: reader.skip(3); return { type };
    case 10: reader.skip(1); return { type };
    case 11: reader.skip(8); return { type };
    case 12: reader.skip(4); return { type };
    case 13: reader.skip(2); return { type };
    /* A `byte[]`, which is what a processor's whole configuration is: its program and its
       links, deflated. Skipped blind, a schematic full of processors read as a schematic
       full of blocks that are set to nothing. */
    case 14: { const n = reader.i32(); return { type, bytes: reader.bytes(n) }; }
    case 16: { const n = reader.i32(); reader.skip(n); return { type }; }
    case 17: reader.skip(4); return { type };
    case 18: { const n = reader.i16(); reader.skip(8 * n); return { type }; }
    case 19: reader.skip(8); return { type };
    case 20: reader.skip(1); return { type };
    case 21: { const n = reader.i16(); reader.skip(4 * n); return { type }; }
    case 22: { const n = reader.i32();
               for (let i = 0; i < n; i++) readConfig(reader);
               return { type }; }
    case 23: reader.skip(2); return { type };
    default:
      throw new Error(`configuration de type ${type} inconnue`);
  }
}

class Reader {
  constructor(bytes) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.at = 0;
  }
  need(count) {
    if (this.at + count > this.view.byteLength) {
      throw new Error("la schématique se termine au milieu d'un champ");
    }
  }
  u8() { this.need(1); return this.view.getUint8(this.at++); }
  skip(count) { this.need(count); this.at += count; }
  i16() { this.need(2); const v = this.view.getInt16(this.at); this.at += 2; return v; }
  i32() { this.need(4); const v = this.view.getInt32(this.at); this.at += 4; return v; }
  bytes(count) {
    this.need(count);
    const slice = new Uint8Array(this.view.buffer, this.view.byteOffset + this.at, count);
    this.at += count;
    return slice.slice();
  }
  text() {
    const length = (this.need(2), this.view.getUint16(this.at));
    this.at += 2;
    this.need(length);
    const slice = new Uint8Array(this.view.buffer,
      this.view.byteOffset + this.at, length);
    this.at += length;
    return new TextDecoder("utf-8").decode(slice);
  }
}

/** Parse `.msch` bytes into width, height, tags and tiles. */
export async function read(bytes) {
  const magic = new TextDecoder().decode(bytes.slice(0, 4));
  if (magic !== HEADER) {
    throw new Error("ce n'est pas une schématique Mindustry");
  }
  if (bytes[4] > VERSION) {
    throw new Error(`format de schématique ${bytes[4]}, plus récent que ${VERSION}`);
  }

  let body, altered;
  try {
    ({ body, altered } = await inflate(bytes.slice(5)));
  } catch (error) {
    /* One reason is worth passing through rather than flattening: a paste that expands past
       what the game could ever have written is refused on purpose, and a reader told only
       that "decompression failed" would go looking for a damaged copy that does not exist. */
    if (error.message.includes("se dilate")) throw error;
    throw new Error("schématique illisible : la décompression a échoué");
  }

  const reader = new Reader(body);
  const width = reader.i16();
  const height = reader.i16();

  const tags = {};
  const tagCount = reader.u8();
  for (let i = 0; i < tagCount; i++) {
    const key = reader.text();
    tags[key] = reader.text();
  }

  const palette = [];
  const paletteSize = reader.u8();
  for (let i = 0; i < paletteSize; i++) palette.push(reader.text());

  const tiles = [];
  const count = reader.i32();
  let truncated = 0;
  for (let i = 0; i < count; i++) {
    try {
      const index = reader.u8();
      const packed = reader.i32();
      const from = reader.at;
      const config = readConfig(reader);
      // The configuration bytes exactly as they were written.
      //
      // Reading them is lossy on purpose: most of the twenty-odd types are skipped rather
      // than parsed, because the analysis only cares about three of them. That is fine
      // until the schematic has to be written back out, and then a logic processor's
      // program or a unit factory's plan would come back as a zero byte. Kept whole here
      // and copied through untouched, so editing one block cannot damage another.
      const raw = body.slice(from, reader.at);
      const rotation = reader.u8();
      tiles.push({
        x: (packed >> 16) & 0xFFFF,
        y: packed & 0xFFFF,
        block: palette[index],
        rotation,
        config,
        raw,
      });
    } catch {
      // A string damaged on its way through a chat loses its tail, not its head. Keeping
      // the blocks that did read is far more useful than refusing the lot, so long as the
      // report says how many were lost rather than quietly reporting on a partial base.
      truncated = count - tiles.length;
      break;
    }
  }

  return { width, height, tags, palette, tiles, altered, truncated };
}

export async function fromBase64(text) {
  return read(bytesFromBase64(text));
}

/* Writing ------------------------------------------------------------------------------

   The other direction, so a schematic can be changed and handed back to the game. Same
   layout as the reader above and the same source: `Schematics.write` in v159.7.

   Configuration bytes are copied through exactly as they were read rather than rebuilt
   from the parsed value. The reader only parses the three types the analysis needs and
   skips the rest, so rebuilding would turn a logic processor's program into a zero byte.
   Copying means editing one block cannot damage another, which is the property that makes
   an editor safe to use on somebody's real base. */

class Writer {
  constructor() {
    this.parts = [];
  }
  bytes(chunk) { this.parts.push(chunk); return this; }
  u8(value) { return this.bytes(new Uint8Array([value & 0xFF])); }
  i16(value) {
    const out = new Uint8Array(2);
    new DataView(out.buffer).setInt16(0, value);
    return this.bytes(out);
  }
  i32(value) {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setInt32(0, value | 0);
    return this.bytes(out);
  }
  /** `writeUTF`: a big-endian two byte length, then the bytes. */
  text(value) {
    const encoded = new TextEncoder().encode(String(value));
    return this.i16(encoded.length).bytes(encoded);
  }
  done() {
    const size = this.parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(size);
    let at = 0;
    for (const part of this.parts) { out.set(part, at); at += part.length; }
    return out;
  }
}

/**
 * The bytes of a schematic, ready for the clipboard.
 *
 * `sizeOf` is asked for rather than kept here: how big a block is belongs to the block
 * registry the game printed, and a second copy of that table in this file is a second
 * thing to be wrong.
 */
/**
 * Write a configuration, in the encoding of `TypeIO.writeObject` in v159.7.
 *
 * The reader keeps the raw bytes of what it read and the writer replays them unchanged, so
 * a schematic pasted and copied back out comes out identical without this file having to
 * know how to write anything at all. That is enough for as long as nothing **creates** a
 * configuration.
 *
 * The editor creates them. Dragging a run of bridges lays a chain whose every link points
 * at the next, and without these few lines that chain left the site as a row of bridges
 * ignoring each other: the picture was right, the file was wrong, and nothing said so.
 *
 * Only two types are written, because only two are created here: the relative point of a
 * bridge or a power node, and the content of a sorter or a source. A configuration of any
 * other type, read from a file, leaves again through its raw bytes, untouched.
 */
function writeConfig(writer, tile) {
  if (tile.raw?.length) return writer.bytes(tile.raw);
  const config = tile.config;
  if (!config) return writer.u8(0);

  if (config.type === 7) {
    return writer.u8(7).i32(config.dx | 0).i32(config.dy | 0);
  }
  if (config.type === 5) {
    return writer.u8(5).u8(config.content).i16(config.id);
  }
  /* A power node's links: one count byte, then one packed position per link.
     `render.js` already draws them by reading this same type back, and the editor could
     not write them: a power network built here came out as nodes that do not talk to each
     other, which looks like a network in the picture and feeds nothing. */
  if (config.type === 8) {
    writer.u8(8).u8(Math.min(255, config.links.length));
    for (const packed of config.links.slice(0, 255)) writer.i32(packed);
    return writer;
  }
  /* A type we cannot write is written as "nothing", and not at random: inventing bytes
     shifts everything after it and leaves the file unreadable by the game. */
  return writer.u8(0);
}

export async function write(tiles, { tags = {}, sizeOf = () => 1,
                                     priorityOf = () => 0 } = {}) {
  if (!tiles.length) throw new Error("une schématique vide ne se copie pas");

  /* The order things are written in is the order they are built in, and the game uses it.
     `Block.schematicPriority` runs from +10 for a plastanium wall to -15 for an overdrive
     projector: what protects is built first, what connects last, once the thing it has to
     connect exists. Twelve of the game's blocks carry one, and writing in the order they
     were placed puts a power node down before the reactors it was meant to feed.

     Stable sort: at equal priority the original order is kept, otherwise two exports of
     the same schematic would produce two different files. */
  tiles = tiles
    .map((tile, at) => ({ tile, at }))
    .sort((a, b) => (priorityOf(b.tile.block) - priorityOf(a.tile.block)) || (a.at - b.at))
    .map((entry) => entry.tile);

  // The box, from what the blocks cover rather than from what they are stored at: a two
  // by two press stored at its centre reaches a tile further right and a tile up.
  let left = Infinity, bottom = Infinity, right = -Infinity, top = -Infinity;
  for (const tile of tiles) {
    const size = sizeOf(tile.block);
    const offset = Math.trunc(-(size - 1) / 2);
    left = Math.min(left, tile.x + offset);
    bottom = Math.min(bottom, tile.y + offset);
    right = Math.max(right, tile.x + offset + size - 1);
    top = Math.max(top, tile.y + offset + size - 1);
  }

  const palette = [];
  for (const tile of tiles) {
    if (!palette.includes(tile.block)) palette.push(tile.block);
  }
  if (palette.length > 255) throw new Error("plus de 255 blocs differents");

  const body = new Writer();
  body.i16(right - left + 1).i16(top - bottom + 1);

  const entries = Object.entries(tags).filter(([, value]) => value != null);
  body.u8(entries.length);
  for (const [key, value] of entries) body.text(key).text(value);

  body.u8(palette.length);
  for (const name of palette) body.text(name);

  body.i32(tiles.length);
  for (const tile of tiles) {
    body.u8(palette.indexOf(tile.block));
    body.i32(((tile.x - left) << 16) | ((tile.y - bottom) & 0xFFFF));
    writeConfig(body, tile);
    body.u8(tile.rotation || 0);
  }

  const squeezed = await deflate(body.done());
  const out = new Uint8Array(5 + squeezed.length);
  out.set(new TextEncoder().encode(HEADER), 0);
  out[4] = VERSION;
  out.set(squeezed, 5);
  return out;
}

/** Zlib-wrapped deflate, which is what Java's `DeflaterOutputStream` writes. */
async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  const chunks = [];
  const reader = stream.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
}

/** The string a player pastes into the game. */
export async function toBase64(tiles, options) {
  const bytes = await write(tiles, options);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
