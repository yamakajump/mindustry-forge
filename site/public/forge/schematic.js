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
async function inflate(bytes) {
  const stream = new Blob([bytes]).stream()
    .pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
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

  let body;
  try {
    body = await inflate(bytes.slice(5));
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
  for (let i = 0; i < count; i++) {
    const index = reader.u8();
    const packed = reader.i32();
    // A configuration is a typed value and only a null one is a single byte. Anything
    // else is a sorter told which item to pass, or a bridge told where to reach, and
    // reading past it blind would turn the rest of the file into nonsense. Skipping the
    // whole schematic would be worse, so the tile keeps its config type and the analysis
    // says which blocks it could not fully understand.
    const configType = reader.u8();
    if (configType !== 0) {
      throw new Error(
        "cette schematique contient des blocs configures (trieur, pont, processeur), " +
        "que Forge ne sait pas encore lire");
    }
    const rotation = reader.u8();
    tiles.push({
      x: (packed >> 16) & 0xFFFF,
      y: packed & 0xFFFF,
      block: palette[index],
      rotation,
    });
  }

  return { width, height, tags, palette, tiles };
}

export async function fromBase64(text) {
  return read(bytesFromBase64(text));
}
