/**
 * What a block remembers, and what we can make it remember.
 *
 * A sorter remembers the item it lets through. That is written into the format,
 * `bilan.js` can read it back, and the editor did not know how to write it: a schematic
 * built here came out with its sorters empty, so with its lines sorting nothing.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { choicesFor, configFor, contentKind, readsAs }
  from "../../../site/public/forge/editor/configure.js";
import { loadCatalogue } from "../helpers.js";

const known = loadCatalogue();

test("the family is read off the game's own class, not off the name", () => {
  /* `Sorter` covers the sorter and the inverted sorter, `LiquidSource` the liquid source.
     A hand-kept list of names starts lying the moment the game adds a new one. */
  assert.equal(contentKind(known.blocks["sorter"]), "item");
  assert.equal(contentKind(known.blocks["inverted-sorter"]), "item");
  assert.equal(contentKind(known.blocks["unloader"]), "item");
  assert.equal(contentKind(known.blocks["liquid-source"]), "liquid");
  assert.equal(contentKind(known.blocks["router"]), null);
  assert.equal(contentKind(known.blocks["conveyor"]), null);
});

test("a sorter offers items, a liquid source offers liquids", () => {
  const objets = choicesFor(known.blocks["sorter"], known);
  const liquides = choicesFor(known.blocks["liquid-source"], known);
  assert.ok(objets.length > 15, `${objets.length} items`);
  assert.ok(liquides.length >= 4, `${liquides.length} liquids`);
  assert.ok(objets.some((c) => c.name === "copper"));
  assert.ok(liquides.some((c) => c.name === "water"));
  // In the game's own order, not the alphabet: copper is the first item.
  assert.equal(objets[0].name, "copper");
});

test("the config takes the shape the format writes", () => {
  const cuivre = choicesFor(known.blocks["sorter"], known).find((c) => c.name === "copper");
  assert.deepEqual(configFor(cuivre), { type: 5, content: 0, id: known.items.copper.id });
});

test("and reads back in plain terms", () => {
  const cuivre = choicesFor(known.blocks["sorter"], known).find((c) => c.name === "copper");
  const trieur = { x: 0, y: 0, block: "sorter", rotation: 0, config: configFor(cuivre) };
  assert.equal(readsAs(trieur, known), "copper");
  assert.equal(readsAs({ x: 0, y: 0, block: "sorter" }, known), null);
});

test("a liquid reads back from its own registry", () => {
  const eau = choicesFor(known.blocks["liquid-source"], known).find((c) => c.name === "water");
  const source = { x: 0, y: 0, block: "liquid-source", config: configFor(eau) };
  assert.equal(readsAs(source, known), "water");
});
