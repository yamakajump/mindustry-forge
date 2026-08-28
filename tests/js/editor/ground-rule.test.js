/**
 * The one-line rule a ground swatch is worth, read off the same catalogue fields `rules.js`
 * checks a placement against.
 *
 * Checked against the real catalogue rather than a fixture, for the same reason
 * `ground-families.test.js` is: a fixture agrees with whatever mistake wrote it.
 */

import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import { groundRule } from "../../../site/public/forge/editor/ui.js";
import { loadNames } from "../../../site/public/forge/noms.js";
import { loadCatalogue } from "../helpers.js";

/* `noms.js` fetches its table over HTTP, which does not exist here. Node has no relative
   `fetch`, and a bare URL throws rather than 404s, so `loadNames` would silently fall back
   to a dashed identifier for every name and this file would test a sentence nobody reads.
   Serving it the same file the browser gets is truer than skipping it: a name missing from
   `noms/fr.json` should fail this test, not fail silently. */
const namesPath = new URL("../../../site/public/forge/noms/fr.json", import.meta.url);
globalThis.fetch = async () => ({
  ok: true,
  json: async () => JSON.parse(readFileSync(namesPath, "utf8")),
});
await loadNames("fr");

const known = loadCatalogue();

test("a deep liquid repeats rules.js's own refusal, and names what it is", () => {
  /* `rules.js`'s `canPlace` refuses a non-floating block on a deep floor with exactly this
     sentence. A player who reads this rule and then hits that refusal should read one
     sentence, not two that mean the same thing differently worded. */
  const said = groundRule("deep-water", known);
  assert.match(said, /^un liquide profond ne porte que ce qui flotte/);
  assert.match(said, /de l'eau/);
  // 1.5x on this floor's own liquid_multiplier: worth a note, it changes a pump's yield.
  assert.match(said, /x1,5/);
});

test("a shallow liquid is not deep, and gets the pump sentence instead", () => {
  const said = groundRule("shallow-water", known);
  assert.equal(said, "une pompe y tire de l'eau");
});

test("a liquid at its default rate carries no multiplier note", () => {
  assert.doesNotMatch(groundRule("shallow-water", known), /x1(?!,)/);
});

test("a floor that only drops an item gets the drill sentence, in rules.js's own words", () => {
  const said = groundRule("sand-floor", known);
  assert.match(said, /foreuse/);
  assert.match(said, /creuser/);
  assert.match(said, /sable/);
});

test("`unmineable` never turns the drill sentence into a refusal", () => {
  /* sand-floor and darksand are both `unmineable`, and neither `Drill.canMine` nor this
     repository's own `minable()` in rules.js reads that field: `DumpBlocks.java` writes it
     from `floor.playerUnmineable`, which gates a unit's own hand, not a drill. Saying "can't
     be mined" here would be false for exactly the reason `unmineable` sounds like it. */
  for (const name of ["sand-floor", "darksand"]) {
    const said = groundRule(name, known);
    assert.doesNotMatch(said, /pas.*min|aucune.*min|impossible/i);
  }
});

test("an ore overlay gets the same drill sentence a floor's own drops would", () => {
  const said = groundRule("ore-copper", known);
  assert.match(said, /foreuse/);
  assert.match(said, /cuivre/);
});

test("a wall repeats rules.js's own refusal for building on it", () => {
  assert.equal(groundRule("stone-wall", known),
    "rien ne se construit sur un mur ; attributs : sable +1");
});

test("an attribute is said with its sign and its value", () => {
  assert.equal(groundRule("grass", known), "attributs : eau +0,1");
  assert.equal(groundRule("char", known), "attributs : eau -0,25");
});

test("two attributes on the same floor are both said", () => {
  const said = groundRule("hotrock", known);
  assert.match(said, /chaleur \+0,5/);
  assert.match(said, /eau -0,5/);
});

test("a liquid floor with an attribute says both, joined", () => {
  const said = groundRule("tainted-water", known);
  assert.match(said, /^une pompe y tire de l'eau/);
  assert.match(said, /spores \+0,15/);
});

test("a plain floor with none of these fields says nothing", () => {
  assert.equal(groundRule("stone", known), "");
});

test("an unknown name says nothing rather than throwing", () => {
  assert.doesNotThrow(() => groundRule("does-not-exist", known));
  assert.equal(groundRule("does-not-exist", known), "");
});
