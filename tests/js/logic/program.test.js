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

test("un programme construit se lit comme il s'ecrit", () => {
  const program = new Program()
    .comment("deux lignes\net la suite")
    .label("debut")
    .line("set", "x", 1)
    .line("jump", "debut", "always");

  assert.equal(program.text(),
    "# deux lignes\n# et la suite\ndebut:\nset x 1\njump debut always\n");
});

test("un programme vide est une chaine vide, pas un saut de ligne", () => {
  assert.equal(new Program().text(), "");
});

test("une chaine perd ce que le jeu ne sait pas lire", () => {
  /* `LParser.string` has no escapes at all: it runs to the next quote. A quote kept inside
     a string does not produce odd text, it refuses the whole program. */
  assert.equal(quote('dit "bonjour"'), '"dit bonjour"');
  assert.equal(quote("deux\nlignes"), '"deuxlignes"');
});

test("la configuration d'un processeur fait l'aller-retour", async () => {
  const wanted = { code: "set x 1\nprint x\n",
                   links: [{ name: "message1", dx: -2, dy: 3 }] };
  assert.deepEqual(await readProgram(await writeProgram(wanted)), wanted);
});

test("un lien negatif garde son signe", async () => {
  const links = [{ name: "cell1", dx: -32768, dy: 32767 }];
  const back = await readProgram(await writeProgram({ code: "", links }));
  assert.deepEqual(back.links, links);
});

test("les accents survivent au voyage", async () => {
  const code = 'print "il y en a déjà trop"\n';
  assert.equal((await readProgram(await writeProgram({ code, links: [] }))).code, code);
});

test("la schematique produite se relit toute seule", async () => {
  const program = new Program().line("end").link("cell1", 1, 1);
  const [processor] = await fromSchematic(
    await program.toSchematic({ block: "hyper-processor" }));

  assert.equal(processor.block, "hyper-processor");
  assert.equal(processor.code, "end\n");
  assert.deepEqual(processor.links, [{ name: "cell1", dx: 1, dy: 1 }]);
  assert.equal(processor.unreadable, false);
});

test("la taille de la schematique vient du bloc choisi", async () => {
  const { read } = await import("../../../site/public/forge/schematic.js");

  for (const name of ["micro-processor", "logic-processor", "hyper-processor"]) {
    const schematic = await read(await toSchematicBytes({ code: "end\n", block: name }));
    const size = catalogue.processors.find((entry) => entry.name === name).size;
    assert.equal(schematic.width, size, `${name} : la largeur`);
    assert.equal(schematic.height, size, `${name} : la hauteur`);
  }
});

test("un bloc qui n'est pas un processeur est refuse plutot qu'ecrit", async () => {
  await assert.rejects(() => toSchematic({ code: "end\n", block: "router" }),
    /is not a processor/);
});

test("un programme trop gros pour la configuration est refuse avant d'etre ecrit", async () => {
  /* Text the compressor cannot crush, or a hundred kilobytes of the same letter fit in two
     hundred and the test tests nothing. */
  let code = "";
  for (let at = 0; code.length < catalogue.limits.code_bytes; at++) {
    code += `set v${at} ${(at * 2654435761) % 1000000007}\n`;
  }
  await assert.rejects(() => toSchematic({ code }), /le jeu en accepte/);
});

test("une schematique sans processeur ne rend rien plutot que d'inventer", async () => {
  const { toBase64 } = await import("../../../site/public/forge/schematic.js");
  const pasted = await toBase64([{ block: "router", x: 0, y: 0 }], { sizeOf: () => 1 });
  assert.deepEqual(await fromSchematic(pasted), []);
});
