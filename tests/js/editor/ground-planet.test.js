/**
 * The planet filter on the ground palette, checked against the shipped data.
 *
 * The build grid has had this filter since it was written; the ground grid had none, and a
 * player building on Erekir was offered grass, snow and ice among the floors that actually
 * exist there. A fixture would agree with whatever mistake wrote it, so this reads the
 * `sols.json` the page reads and the catalogue the page reads, and asks the question the
 * palette asks.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { grounds, onPlanet } from "../../../site/public/forge/editor/ui.js";
import { loadCatalogue } from "../helpers.js";

const sols = JSON.parse(readFileSync(
  new URL("../../../site/public/forge/sols.json", import.meta.url), "utf8"));
const homes = sols.planets;
const families = grounds(loadCatalogue());
const offered = families.flatMap((family) => family.blocks);

const shown = (planet) => offered.filter((name) => onPlanet(name, planet, homes));

test("the ground palette knows which planet puts each piece of ground down", () => {
  assert.ok(homes, "sols.json carries no planets");
  assert.ok(Object.keys(homes).length > 100,
            `only ${Object.keys(homes).length} pieces of ground placed by any planet`);
});

test("no filter shows the whole palette", () => {
  assert.equal(shown("").length, offered.length);
});

test("each planet hides the other's ground and keeps its own", () => {
  const serpulo = shown("serpulo");
  const erekir = shown("erekir");

  /* Both are worth painting on: a filter that empties one of the two grids reads as a
     broken palette rather than as a filter. */
  assert.ok(serpulo.length > 40, `only ${serpulo.length} pieces of ground on Serpulo`);
  assert.ok(erekir.length > 20, `only ${erekir.length} pieces of ground on Erekir`);
  assert.ok(serpulo.length < offered.length, "Serpulo hides nothing");
  assert.ok(erekir.length < offered.length, "Erekir hides nothing");

  for (const name of ["sand-floor", "snow", "ice", "spore-moss", "ore-copper", "stone-wall"]) {
    assert.ok(serpulo.includes(name), `${name} is Serpulo's and Serpulo hides it`);
    assert.ok(!erekir.includes(name), `${name} is Serpulo's and Erekir offers it`);
  }
  for (const name of ["arkyic-stone", "rhyolite", "yellow-stone", "ore-tungsten",
                      "carbon-wall"]) {
    assert.ok(erekir.includes(name), `${name} is Erekir's and Erekir hides it`);
    assert.ok(!serpulo.includes(name), `${name} is Erekir's and Serpulo offers it`);
  }
});

test("ground that belongs to no planet stays under every filter", () => {
  /* `air` is what an empty layer reads as and no planet ever puts it down. Hiding it would
     take the eraser's own swatch out of the grid on a planet, which is the filter causing
     the defect it exists to remove. */
  for (const planet of ["", "serpulo", "erekir"]) {
    assert.ok(onPlanet("air", planet, homes), `air disappeared under ${planet || "no"} filter`);
  }
});

test("a page whose sols.json never arrived filters nothing away", () => {
  for (const homes of [null, undefined, {}]) {
    assert.ok(onPlanet("sand-floor", "erekir", homes));
    assert.ok(onPlanet("arkyic-stone", "serpulo", homes));
  }
});
