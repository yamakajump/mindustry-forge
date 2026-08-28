/**
 * The output format, from the side of whoever will call it.
 *
 * Two chantiers to come produce processor code instead of typing it: an image onto a
 * display, an image onto a canvas. Both will go through `Program` and `toSchematic` without
 * ever typing a line by hand. So what is tested here is not the editor, it is the interface:
 * what a caller gets, and what it gets when it asks for the impossible.
 *
 * The round trip against the real game is in `collee.test.js`. Here, the edges.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { useCatalogue } from "../../../site/public/forge/logic/catalogue.js";
import { Program, quote, toSchematic, toSchematicBytes, fromSchematic }
  from "../../../site/public/forge/logic/program.js";
import { readProgram, writeProgram } from "../../../site/public/forge/logic.js";

const catalogue = useCatalogue(JSON.parse(readFileSync(
  new URL("../../../site/public/forge/logic/instructions.json", import.meta.url), "utf8")));

test("a built program reads back the way it was written", () => {
  const program = new Program()
    .comment("deux lignes\net la suite")
    .label("debut")
    .line("set", "x", 1)
    .line("jump", "debut", "always");

  assert.equal(program.text(),
    "# deux lignes\n# et la suite\ndebut:\nset x 1\njump debut always\n");
});

test("an empty program is an empty string, not a line break", () => {
  assert.equal(new Program().text(), "");
});

test("a string loses what the game cannot read", () => {
  /* `LParser.string` has no escapes at all: it runs to the next quote. A quote kept inside
     a string does not produce odd text, it refuses the whole program. */
  assert.equal(quote('dit "bonjour"'), '"dit bonjour"');
  assert.equal(quote("deux\nlignes"), '"deuxlignes"');
});

test("a processor's configuration makes the round trip", async () => {
  const wanted = { code: "set x 1\nprint x\n",
                   links: [{ name: "message1", dx: -2, dy: 3 }] };
  assert.deepEqual(await readProgram(await writeProgram(wanted)), wanted);
});

test("a negative link keeps its sign", async () => {
  const links = [{ name: "cell1", dx: -32768, dy: 32767 }];
  const back = await readProgram(await writeProgram({ code: "", links }));
  assert.deepEqual(back.links, links);
});

test("accents survive the trip", async () => {
  const code = 'print "il y en a déjà trop"\n';
  assert.equal((await readProgram(await writeProgram({ code, links: [] }))).code, code);
});

test("the produced schematic reads itself back", async () => {
  const program = new Program().line("end").link("cell1", 1, 1);
  const [processor] = await fromSchematic(
    await program.toSchematic({ block: "hyper-processor" }));

  assert.equal(processor.block, "hyper-processor");
  assert.equal(processor.code, "end\n");
  assert.deepEqual(processor.links, [{ name: "cell1", dx: 1, dy: 1 }]);
  assert.equal(processor.unreadable, false);
});

test("the schematic's size comes from the chosen block", async () => {
  const { read } = await import("../../../site/public/forge/schematic.js");

  for (const name of ["micro-processor", "logic-processor", "hyper-processor"]) {
    const schematic = await read(await toSchematicBytes({ code: "end\n", block: name }));
    const size = catalogue.processors.find((entry) => entry.name === name).size;
    assert.equal(schematic.width, size, `${name}: the width`);
    assert.equal(schematic.height, size, `${name}: the height`);
  }
});

test("a block that is not a processor is refused rather than written", async () => {
  await assert.rejects(() => toSchematic({ code: "end\n", block: "router" }),
    /is not a processor/);
});

test("a program too big for the configuration is refused before being written", async () => {
  /* Text the compressor cannot crush, or a hundred kilobytes of the same letter fit in two
     hundred and the test tests nothing. */
  let code = "";
  for (let at = 0; code.length < catalogue.limits.code_bytes; at++) {
    code += `set v${at} ${(at * 2654435761) % 1000000007}\n`;
  }
  await assert.rejects(() => toSchematic({ code }), /le jeu en accepte/);
});

test("a schematic without a processor returns nothing rather than inventing one", async () => {
  const { toBase64 } = await import("../../../site/public/forge/schematic.js");
  const pasted = await toBase64([{ block: "router", x: 0, y: 0 }], { sizeOf: () => 1 });
  assert.deepEqual(await fromSchematic(pasted), []);
});
