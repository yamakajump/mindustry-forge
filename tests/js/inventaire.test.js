/**
 * The inventory: one entry per kind of block, with its count.
 *
 * `detail` already carried this, one object per block, and that is exactly why `held`
 * exists. `tools/ingest.mjs` keeps a whitelist of the fields worth storing, `detail` was
 * never on it, and putting it there would mean writing two and a half thousand objects of
 * fifteen fields each for one schematic to answer a question a thirty-entry dictionary
 * answers. `schematic_blocks` was empty on all 15,533 collected rows for want of it.
 *
 * The browser posts the whole report, so the interactive path always worked - which is why
 * nothing looked broken from the inside.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { analyse } from "../../site/public/forge/bilan.js";
import { loadCatalogue, paste } from "./helpers.js";

loadCatalogue();

test("every kind of block is counted once, by name", async () => {
  const out = await analyse(paste([
    [0, 0, "conveyor", 0], [1, 0, "conveyor", 0], [2, 0, "conveyor", 0],
    [3, 0, "router", 0],
  ]));
  assert.deepEqual(out.held, { conveyor: 3, router: 1 });
});

test("the inventory agrees with the count the report already gave", async () => {
  /* Two figures for the same thing are two chances to be wrong. `blocks` is what the page
     prints and what the database column holds, so the dictionary has to add up to it. */
  const out = await analyse(paste([
    [0, 0, "silicon-smelter", 0], [3, 0, "graphite-press", 0],
    [0, 3, "conveyor", 0], [1, 3, "conveyor", 0], [6, 0, "vault", 0],
  ]));
  const total = Object.values(out.held).reduce((sum, n) => sum + n, 0);
  assert.equal(total, out.blocks, `${total} vs ${out.blocks}`);
});

test("a block the catalogue has never seen is still inventoried", async () => {
  /* A mod block is read as a wall and reported under `unknown`, and it is still a block the
     schematic is built from: a build cost that silently dropped it would understate what
     the layout takes to put down. */
  const out = await analyse(paste([[0, 0, "conveyor", 0], [1, 0, "un-bloc-de-mod", 0]]));
  assert.equal(out.held["un-bloc-de-mod"], 1);
});

test("the sandbox blocks are named, so a creative layout can be told apart", async () => {
  /* The first of the three things waiting on this, and the reason it is decided on blocks
     rather than on a name: `useless box` and `Server lagger` carry no keyword and belong to
     the same lot as `Def Mega Base (sandbox)`. `build_visibility` is the game's own word. */
  const out = await analyse(paste([
    [0, 0, "power-source", 0], [2, 0, "silicon-smelter", 0],
  ]));
  assert.equal(out.held["power-source"], 1);
  assert.equal(out.held["silicon-smelter"], 1);
});
