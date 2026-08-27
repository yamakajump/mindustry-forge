/**
 * Build a program, and wrap it in the schematic a player pastes.
 *
 * Two chantiers after this one produce processor code rather than type it: an image turned
 * into `draw` calls for a display, and an image turned into a canvas. So this is written to
 * be **called**, not only typed into. `Program` is the seam: something assembles lines, and
 * `toSchematic` turns them into the one string the game accepts, without the caller having
 * to know that a processor's configuration is a deflated blob inside a `TypeIO` byte array
 * inside a deflated schematic.
 *
 * The layers, outermost first:
 *
 *     .msch          `schematic.js`, following `Schematics.write`
 *      └ config      one tile's `TypeIO.writeObject`, type 14, a length-prefixed byte[]
 *         └ program  `logic.js`, following `LogicBlock.compress`
 *
 * Each of those three is written where its format is read, so neither half can drift alone.
 */

import { readProgram, writeProgram } from "../logic.js";
import { write as writeSchematic, read as readSchematic,
         bytesFromBase64 } from "../schematic.js";
import { catalogueOf } from "./catalogue.js";

/** `TypeIO.writeObject`: a `byte[]`, which is what a processor's whole configuration is. */
const BYTE_ARRAY = 14;

/**
 * A program under construction.
 *
 * Deliberately dumb about meaning: it appends lines and remembers links, and it does not
 * know what `draw` does. Everything that knows the language is in `catalogue.js`, checked
 * against the game, and a builder that also had opinions would be a second place to hold
 * them.
 */
export class Program {
  constructor() {
    this.lines = [];
    this.links = [];
  }

  /** One instruction. Operands are written as given, in order. */
  line(name, ...operands) {
    this.lines.push([name, ...operands.map(String)].join(" "));
    return this;
  }

  /** A jump target, by name. The game resolves these itself, per `LParser`. */
  label(name) {
    this.lines.push(`${name}:`);
    return this;
  }

  /** A comment. Kept in the configuration: the game stores the text the player wrote. */
  comment(text) {
    for (const piece of String(text).split("\n")) this.lines.push(`# ${piece}`);
    return this;
  }

  /**
   * Wire the processor to a block, by name and by where it sits relative to the processor.
   *
   * In a schematic the two numbers are offsets, because `relativeConnections` writes them
   * that way. On a map they would be absolute, and a program built here is for a schematic.
   */
  link(name, dx, dy) {
    this.links.push({ name, dx: dx | 0, dy: dy | 0 });
    return this;
  }

  /** The program, as the player would read it. */
  text() {
    return this.lines.length ? `${this.lines.join("\n")}\n` : "";
  }

  /** The schematic string, ready for the clipboard. */
  toSchematic(options) {
    return toSchematic({ code: this.text(), links: this.links, ...options });
  }
}

/**
 * A string literal, quoted for `print`.
 *
 * The game's own lexer has no escapes at all: `LParser.string` runs to the next `"` and
 * stops. So a quote cannot be put in a string, and the only honest thing to do with one is
 * to drop it rather than emit a program that ends mid-line. A newline is dropped for the
 * same reason: `LParser` refuses the whole program over one.
 */
export function quote(value) {
  return `"${String(value).replace(/["\n]/g, "")}"`;
}

/** How big a processor is, from the catalogue rather than from a table kept here. */
function processor(name) {
  const found = catalogueOf().processors.find((entry) => entry.name === name);
  if (!found) throw new Error(`${name} is not a processor`);
  return found;
}

/**
 * One processor, holding this program, as the string pasted into the game.
 *
 * A one block schematic rather than a bare configuration, because a bare configuration is
 * not something a player can do anything with: the clipboard is how code gets into
 * Mindustry, and the clipboard speaks `.msch`.
 */
export async function toSchematicBytes({ code = "", links = [], block = "micro-processor",
                                         name = null, description = null } = {}) {
  const config = await writeProgram({ code, links });

  const limits = catalogueOf().limits;
  if (config.length > limits.config_bytes) {
    /* French, and not by oversight: this one reaches a player, because the page shows the
       message of whatever the copy button threw. It should be a dictionary key like every
       other sentence a player reads, and it is not one yet. */
    throw new Error(
      `configuration de ${config.length} octets, le jeu en accepte ${limits.config_bytes}`);
  }

  const raw = new Uint8Array(5 + config.length);
  new DataView(raw.buffer).setUint8(0, BYTE_ARRAY);
  new DataView(raw.buffer).setInt32(1, config.length);
  raw.set(config, 5);

  const size = processor(block).size;
  return writeSchematic([{ block, x: 0, y: 0, rotation: 0, raw }], {
    sizeOf: () => size,
    tags: { name, description },
  });
}

/** The same schematic, as the string a player pastes. */
export async function toSchematic(options) {
  const bytes = await toSchematicBytes(options);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * The processors in a pasted schematic, with their programs already decoded.
 *
 * The way back in: a player who has a processor in a build and wants to read it here pastes
 * the build, not a file. Returns them in the order the schematic stores them, which is the
 * order the game builds them in.
 */
export async function fromSchematic(pasted) {
  const bytes = typeof pasted === "string" ? bytesFromBase64(pasted.trim()) : pasted;
  const schematic = await readSchematic(bytes);

  const processors = [];
  for (const tile of schematic.tiles) {
    if (!catalogueOf().processors.some((entry) => entry.name === tile.block)) continue;
    const program = tile.config?.bytes ? await readProgram(tile.config.bytes) : null;
    processors.push({
      block: tile.block,
      x: tile.x,
      y: tile.y,
      code: program?.code ?? "",
      links: program?.links ?? [],
      /* Told rather than hidden: a configuration that did not survive the paste reads back
         as nothing, and an empty editor with no explanation looks like a working import. */
      unreadable: Boolean(tile.config?.bytes) && !program,
    });
  }
  return processors;
}
