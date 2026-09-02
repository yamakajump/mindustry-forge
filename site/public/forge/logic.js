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

import { centre } from "./geometry.js";

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
    body = await expand(bytes);
  } catch {
    // A processor whose configuration did not survive the paste, or one that expands past
    // anything the game could have written. Better a schematic with one unread block than
    // no schematic at all; `fromSchematic` reports it as unreadable rather than as empty.
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
 * Whether a processor could actually link to a block, by the game's own rule.
 *
 * `LogicBlock.validLink`, read in the v159.7 bytecode rather than from a wiki:
 *
 *     other.within(this, range + other.block.size * tilesize / 2f)
 *
 * with `Building.within` reaching `Mathf.within`, whose body is `dst2 < dst * dst`. Three
 * things in that one line, each of which is a wrong number rather than an exception when it
 * is missed:
 *
 * - the distance is euclidean and runs between **centres**, which is why `centre()` is
 *   imported rather than the stored tiles being subtracted;
 * - the radius takes the **target's** half-size, so a 3x3 vault is reachable a tile and a
 *   half further than a 1x1 conveyor standing in the same place. The processor's own size
 *   does not enter it;
 * - the comparison is **strict**. The game lets a player lay a link at exactly the range,
 *   saves it, and then refuses it for ever. `analyse.js` documents the same trap for the
 *   mass driver, which it cost a working figure to find.
 */
function reaches(processor, target) {
  const [px, py] = centre(processor);
  const [tx, ty] = centre(target);
  const distance = Math.hypot(tx - px, ty - py);
  const reach = (processor.block.logic_range || 0) + (target.block.size || 1) / 2;
  /* The distance comes back out rather than being measured again by the caller for the
     report. It was computed twice for one commit, and the two copies were not the same
     computation for long: a mutation that made the check subtract stored tiles left the
     reported figure correct, so every test still passed while the rule had changed. One
     number, one place, or the report describes a decision that was not taken. */
  return { within: distance < reach, distance, reach };
}

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
  const unreachable = [];
  let writing = 0;
  for (const node of processors) {
    const writes = drives(node.program);
    if (writes) writing++;

    for (const link of node.program?.links || []) {
      const other = at.get(`${node.x + link.dx},${node.y + link.dy}`);
      if (!other || other === node) continue;

      /* Checked whether the processor writes or only reads. `drives` answers "does this
         change any number", which has nothing to say about whether the processor can see
         what it reads: a `sensor` aimed past the range reads nothing, for ever, and the
         program branches on that nothing. */
      const { within, distance, reach } = reaches(node, other);

      /* Named as driven only when the processor can actually reach it. A `control` aimed
         past the range does nothing at all, so listing its target among the blocks a
         schematic drives is a false statement in the one place a reader goes to find out
         what the processors touch. A block linked twice, once in reach and once not, still
         appears: the near link drives it and that is true. */
      if (writes && within) driven.add(other.name);
      if (within) continue;
      unreachable.push({
        from: node.name, to: other.name,
        at: [node.x, node.y], target: [other.x, other.y],
        distance, reach,
      });
    }
  }

  return {
    processors: processors.length,
    writing,
    // Sorted, so that the same schematic reads the same way twice.
    driven: [...driven].sort(),
    /* A link whose target is not in the schematic is **not** in here. Copying a layout out
       of a base keeps the links of processors whose targets were left behind, exactly as it
       keeps the links of bridges, and those are not broken layouts: saying so would put a
       red mark on most real schematics. An absent target and an unreachable one are two
       different things and only one of them is the layout's fault. */
    unreachable,
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

/**
 * The most a processor's configuration is allowed to expand to, derived rather than picked.
 *
 * The same trap as the schematic body, one layer down and worse: a configuration is a
 * deflated blob inside a schematic, so a bounded schematic can still carry a blob that
 * expands without end. Measured before this ceiling existed, eight hundred kilobytes of
 * configuration took two and a half gigabytes of memory to read, and the fifteen thousand
 * schematics the collector brought back come from two sites nobody here controls.
 *
 * The ceiling is what `LogicBlock.compress` can write, so no real processor is refused:
 *
 *   * a version byte and two counts;
 *   * the code, which `maxByteLen` caps at 102 400 bytes;
 *   * the links, `maxLinks` of them at `maxNameLength` plus a length and two shorts each.
 *
 * Mindustry v8 build 159.7.
 */
const MAX_CODE_BYTES = 102400;
const MAX_LINKS = 6000;
const MAX_LINK_BYTES = 2 + 32 + 2 + 2;
const MAX_PROGRAM = 1 + 4 + MAX_CODE_BYTES + 4 + MAX_LINKS * MAX_LINK_BYTES;

/**
 * Inflate, and stop rather than follow a stream that has stopped being plausible.
 *
 * Read chunk by chunk instead of through `new Response(stream).arrayBuffer()`, which is
 * shorter and has no way to say "enough": by the time it resolves, the memory is taken.
 */
async function expand(bytes) {
  const stream = new DecompressionStream("deflate");
  const writer = stream.writable.getWriter();
  writer.write(bytes).catch(() => {});
  writer.close().catch(() => {});

  const reader = stream.readable.getReader();
  const chunks = [];
  let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    length += value.length;
    if (length > MAX_PROGRAM) {
      await reader.cancel().catch(() => {});
      throw new Error(`configuration dilatée au-delà de ${MAX_PROGRAM} octets`);
    }
  }

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
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
  const out = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
}
