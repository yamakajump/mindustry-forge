/**
 * Finding a block in a list of two hundred and fifty-four.
 *
 * The catalogue's block filter was a text field: you had to know that the reactor is called
 * `thorium-reactor` before you could ask for it. A player knows the sprite and the French
 * name the game shows them, so both of those have to find it, and so does what somebody in
 * a hurry types, which carries no accents.
 *
 * The drawing itself is not tested here: it is `innerHTML` against a live document, and it
 * was checked by driving a browser. What is tested is the part that decides, which is the
 * part that can be wrong without looking wrong.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { parFamille, retenus } from "../../site/public/forge/bloc-choix.js";

const CATALOGUE = [
  { n: "thorium-reactor", t: "Réacteur à Thorium", c: "power", p: "serpulo" },
  { n: "impact-reactor", t: "Réacteur à Impact", c: "power", p: "serpulo" },
  { n: "duo", t: "Duo", c: "turret", p: "serpulo" },
  { n: "breach", t: "Brèche", c: "turret", p: "erekir" },
  { n: "conveyor", t: "Convoyeur", c: "distribution", p: "serpulo" },
  // A block on neither world belongs to both, the way the catalogue reads it.
  { n: "core-shard", t: "Noyau : Éclat", c: "effect", p: null },
];

test("finds a block by the name the game shows", () => {
  assert.deepEqual(retenus(CATALOGUE, "Réacteur", "").map((b) => b.n),
    ["thorium-reactor", "impact-reactor"]);
});

test("finds it without the accents, which is what gets typed", () => {
  assert.deepEqual(retenus(CATALOGUE, "reacteur", "").map((b) => b.n),
    ["thorium-reactor", "impact-reactor"]);
});

test("finds it by the identifier too, which is what a wiki gives you", () => {
  assert.deepEqual(retenus(CATALOGUE, "thorium-", "").map((b) => b.n), ["thorium-reactor"]);
});

test("an empty search keeps everything, rather than nothing", () => {
  assert.equal(retenus(CATALOGUE, "", "").length, CATALOGUE.length);
  assert.equal(retenus(CATALOGUE, "   ", "").length, CATALOGUE.length);
});

test("a world narrows to it, and keeps what belongs to both", () => {
  const erekir = retenus(CATALOGUE, "", "erekir").map((b) => b.n);

  assert.ok(erekir.includes("breach"));
  assert.ok(!erekir.includes("duo"), "a Serpulo turret has no business on Erekir");
  assert.ok(erekir.includes("core-shard"), "on neither world means on both");
});

test("the two narrowings apply together", () => {
  assert.deepEqual(retenus(CATALOGUE, "e", "erekir").map((b) => b.n), ["breach", "core-shard"]);
});

test("the families come in the game's order, and empty ones do not come at all", () => {
  const familles = parFamille(CATALOGUE).map(([nom, dedans]) => [nom, dedans.length]);

  assert.deepEqual(familles, [
    ["Tourelles", 2], ["Transport", 1], ["Énergie", 2], ["Stockage et effets", 1],
  ]);
});

test("a search that finds nothing leaves no heading behind", () => {
  assert.deepEqual(parFamille(retenus(CATALOGUE, "zzz", "")), []);
});
