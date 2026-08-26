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

/** Bytes from what the clipboard carries, tolerating a paste wrapped by a chat client. */
export function bytesFromBase64(text) {
  const clean = String(text).replace(/\s+/g, "");
  if (!clean) throw new Error("aucune schematique fournie");
  let binary;
  try {
    binary = atob(clean);
  } catch {
    throw new Error("ce n'est pas une schematique : le texte n'est pas du base64");
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
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) { complete = true; break; }
      chunks.push(value);
      length += value.length;
    }
  } catch {
    // Kept on purpose. What decoded before the error is the schematic; what failed is the
    // checksum after it.
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
  if (!best.body.length) throw new Error("la decompression n'a rien rendu");
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
    case 14: { const n = reader.i32(); reader.skip(n); return { type }; }
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
      throw new Error("la schematique se termine au milieu d'un champ");
    }
  }
  u8() { this.need(1); return this.view.getUint8(this.at++); }
  skip(count) { this.need(count); this.at += count; }
  i16() { this.need(2); const v = this.view.getInt16(this.at); this.at += 2; return v; }
  i32() { this.need(4); const v = this.view.getInt32(this.at); this.at += 4; return v; }
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
    throw new Error("ce n'est pas une schematique Mindustry");
  }
  if (bytes[4] > VERSION) {
    throw new Error(`format de schematique ${bytes[4]}, plus recent que ${VERSION}`);
  }

  let body, altered;
  try {
    ({ body, altered } = await inflate(bytes.slice(5)));
  } catch {
    throw new Error("schematique illisible : la decompression a echoue");
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
      const config = readConfig(reader);
      const rotation = reader.u8();
      tiles.push({
        x: (packed >> 16) & 0xFFFF,
        y: packed & 0xFFFF,
        block: palette[index],
        rotation,
        config,
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
