/**
 * What a processor is set to, without running it.
 *
 * A processor consumes nothing at all: no power, no items, no liquid. Its only reach into a
 * throughput is one instruction, `control`, aimed at a block it is linked to. Simulating
 * the whole interpreter to find out whether that instruction ever fires is the wrong trade,
 * and it fails silently when it fails: a property this engine does not model reads back as
 * null, the program branches somewhere else, and nothing says so.
 *
 * So it is declared rather than simulated, in two halves. The links come out of the
 * configuration, so a report can say **which** blocks are driven. And the program is plain
 * text, so a report can say whether it drives them at all: a processor that only reads and
 * prints changes no number anywhere, and that is most of the ones a schematic carries.
 *
 * `mindustry.world.blocks.logic.LogicBlock`, Mindustry v159.7.
 */

/**
 * `LogicBlock.compress`, read backwards.
 *
 * Deflate, then: one version byte, the code as a length-prefixed blob, and the links as a
 * count followed by a Java `writeUTF` name and two shorts each. In a schematic the two
 * shorts are **offsets** from the processor, because `relativeConnections` writes them that
 * way; on a map they are absolute.
 */
export async function readProgram(bytes) {
  if (!bytes?.length) return null;

  let body;
  try {
    const stream = new DecompressionStream("deflate");
    const writer = stream.writable.getWriter();
    writer.write(bytes);
    writer.close();
    body = new Uint8Array(await new Response(stream.readable).arrayBuffer());
  } catch {
    // A processor whose configuration did not survive the paste. Better a schematic with
    // one unread block than no schematic at all.
    return null;
  }

  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  let at = 0;
  const u8 = () => view.getUint8(at++);
  const i16 = () => { const v = view.getInt16(at); at += 2; return v; };
  const i32 = () => { const v = view.getInt32(at); at += 4; return v; };

  try {
    u8();
    const length = i32();
    const code = new TextDecoder("utf-8").decode(body.slice(at, at + length));
    at += length;

    const links = [];
    const count = i32();
    for (let i = 0; i < count; i++) {
      // `DataInputStream.readUTF`: two bytes of length, then the bytes.
      const size = view.getUint16(at);
      at += 2;
      const name = new TextDecoder("utf-8").decode(body.slice(at, at + size));
      at += size;
      links.push({ name, dx: i16(), dy: i16() });
    }
    return { code, links };
  } catch {
    return null;
  }
}

/**
 * Which instructions in a program can change what a block does.
 *
 * `control` is the whole of it: everything else a processor can aim at a linked block is a
 * read. `setrate` is the one exception worth naming, and it belongs to the world processor,
 * which a schematic cannot contain.
 */
const WRITERS = /^\s*(control|setblock|setrate)\b/m;

/** Whether this program drives anything, or merely watches. */
export const drives = (program) => Boolean(program?.code && WRITERS.test(program.code));

/**
 * What a schematic's processors amount to, for the report.
 *
 * Named blocks rather than a count, because "three processors" tells a reader nothing and
 * "three processors, none of which drives anything" tells them they can stop worrying.
 */
export function logicOf(nodes) {
  const processors = nodes.filter((node) => node.block.kind === "LogicBlock");
  if (!processors.length) return null;

  const at = new Map();
  for (const node of nodes) {
    for (const [x, y] of node.footprint) at.set(`${x},${y}`, node);
  }

  const driven = new Set();
  let writing = 0;
  for (const node of processors) {
    if (!drives(node.program)) continue;
    writing++;
    for (const link of node.program.links) {
      const other = at.get(`${node.x + link.dx},${node.y + link.dy}`);
      if (other && other !== node) driven.add(other.name);
    }
  }

  return {
    processors: processors.length,
    writing,
    // Sorted, so that the same schematic reads the same way twice.
    driven: [...driven].sort(),
  };
}

/**
 * `LogicBlock.compress`, forwards.
 *
 * The mirror of `readProgram`, and deliberately in the same file as it: a format written in
 * one place and read in another is a format that gets to disagree with itself. The round
 * trip is what the tests check, so a byte moved on one side fails on the other.
 *
 * The deflate is written here rather than borrowed from `schematic.js`, which keeps its own
 * private copy: this file already decompresses on its own, and the pair reads better than a
 * dependency across two formats that only happen to share a compression.
 */
export async function writeProgram({ code = "", links = [] } = {}) {
  const text = new TextEncoder().encode(code);
  const names = links.map((link) => new TextEncoder().encode(link.name));

  const size = 1 + 4 + text.length + 4
    + names.reduce((total, name) => total + 2 + name.length + 4, 0);
  const body = new Uint8Array(size);
  const view = new DataView(body.buffer);
  let at = 0;

  /* Version 1, which is the byte `LogicBlock.compress` writes. The reader above discards
     it, and so does the game's, so a zero here would have round tripped perfectly and
     shipped a file no version of Mindustry has ever written. `tools/LogicPaste.java` is
     what caught it: it compresses the same program with the game's own writer and compares. */
  view.setUint8(at++, 1);
  view.setInt32(at, text.length); at += 4;
  body.set(text, at); at += text.length;

  view.setInt32(at, links.length); at += 4;
  for (const [index, link] of links.entries()) {
    const name = names[index];
    // `DataOutputStream.writeUTF`: two bytes of length, then the bytes.
    view.setUint16(at, name.length); at += 2;
    body.set(name, at); at += name.length;
    view.setInt16(at, link.dx | 0); at += 2;
    view.setInt16(at, link.dy | 0); at += 2;
  }

  return deflate(body);
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
  const out = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
}
