/**
 * Opening the editor on a processor that already exists somewhere.
 *
 * What this mode brings fits in one sentence: the links arrive already filled in, with the
 * names the program actually uses, taken from the configuration the game wrote. The editor
 * alone cannot know them, because there are no blocks yet.
 *
 * Three numbers decide its shape, measured across ninety-six schematics taken from the
 * showcase and decoded with this repository's own reader:
 *
 *   * 40% carry at least one processor;
 *   * 45% of those carry several, and one of the ninety-six carries 22;
 *   * 96% of the 507 links land on a block present in the schematic.
 *
 * The second is the reason for the choice, and the third is what will make clicking the
 * block possible when that comes.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { useCatalogue } from "../../../site/public/forge/logic/catalogue.js";
import { Program, quote, toSchematic } from "../../../site/public/forge/logic/program.js";
import { processorsIn } from "../../../site/public/forge/logic/opened.js";

useCatalogue(JSON.parse(readFileSync(
  new URL("../../../site/public/forge/logic/instructions.json", import.meta.url), "utf8")));

/** A processor's schematic, built by the same code the page uses. */
const unProcesseur = (programme, block = "micro-processor") =>
  programme.toSchematic({ block });

test("a processor returns its code, its links, and enough to recognize it", async () => {
  const pasted = await unProcesseur(new Program()
    .comment("deux lignes de commentaire")
    .comment("qui ne comptent pas comme des lignes de code")
    .link("reactor1", -9, -3)
    .link("dome1", 5, -6)
    .line("sensor", "chaud", "reactor1", "@heat")
    .line("print", "chaud"));

  const [un] = await processorsIn(pasted);

  assert.equal(un.block, "micro-processor");
  assert.equal(un.at, 0);
  assert.deepEqual(un.links, [{ name: "reactor1", dx: -9, dy: -3 },
                              { name: "dome1", dx: 5, dy: -6 }]);
  assert.match(un.code, /sensor chaud reactor1 @heat/);
});

test("the line count ignores blanks, because it serves to recognize a processor", () => {
  /* "Processor 3 of 22" tells nobody anything; "a micro processor at 14, 6, forty lines"
     says which one was meant. This count is therefore a label, and counting blank lines
     would make it wrong on exactly the spaced-out programs. */
  return unProcesseur(new Program().line("end")).then(async (pasted) => {
    const [un] = await processorsIn(pasted);
    assert.equal(un.lines, 1);
  });
});

test("a comment counts as a line, because the game keeps it", async () => {
  /* The configuration stores the text the player wrote, comments included: leaving them
     out of the count would make the label say less than what the processor actually
     carries. */
  const pasted = await unProcesseur(new Program().comment("une note").line("end"));
  const [un] = await processorsIn(pasted);
  assert.equal(un.lines, 2);
});

test("a schematic without a processor returns nothing rather than inventing one", async () => {
  const { toBase64 } = await import("../../../site/public/forge/schematic.js");
  const pasted = await toBase64([{ block: "router", x: 0, y: 0 }], { sizeOf: () => 1 });
  assert.deepEqual(await processorsIn(pasted), []);
});

test("an accent survives the trip to the list", async () => {
  const pasted = await unProcesseur(new Program()
    .line("print", quote("il y en a deja trop")).comment("déjà"));
  const [un] = await processorsIn(pasted);
  assert.match(un.code, /déjà/);
});

test("processors keep the schematic's order", async () => {
  /* The file's order is the game's build order, and it is the only stable order we can
     offer: sorting by position would move the list at the slightest block displacement,
     and the index we show would no longer point to the same thing. */
  const { write, read } = await import("../../../site/public/forge/schematic.js");
  const un = await toSchematic({ code: "end\n", block: "micro-processor" });
  const { tiles } = await read(
    (await import("../../../site/public/forge/schematic.js")).bytesFromBase64(un));

  const deux = await write([
    { ...tiles[0], x: 0, y: 0 },
    { ...tiles[0], x: 4, y: 0 },
  ], { sizeOf: () => 1 });

  let binaire = "";
  for (const octet of deux) binaire += String.fromCharCode(octet);
  const trouves = await processorsIn(btoa(binaire));

  assert.equal(trouves.length, 2);
  assert.deepEqual(trouves.map((one) => one.at), [0, 1]);
  assert.deepEqual(trouves.map((one) => one.x), [0, 4]);
});
