/**
 * Erekir's carriers, which the solve did not know existed.
 *
 * A duct had no branch in `accepts`, so it fell through to the last line of that function -
 * the one that asks a block for a recipe. A duct has none, so it accepted nothing from
 * anybody: seven ducts in a row had no edges between them, and thirteen recorded bench
 * scenarios read as inert. On the live site that meant **every Erekir layout reported
 * nothing moving through it**, with a throughput of zero printed as a fact.
 *
 * The rules below are the engine's, which the oracle already holds against a real v159.7
 * server. They are transcribed here rather than invented, and `node tools/gap.mjs` measures
 * the result against the same recordings.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { analyse } from "../../site/public/forge/analyse.js";
import { loadCatalogue, paste } from "./helpers.js";

const known = loadCatalogue();
const close = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-3, `${why}: ${a} vs ${b}`);
const beryllium = { content: 0, id: known.items["beryllium"].id };

/**
 * What reaches the vault, per second.
 *
 * Not `perMinute`, which is what **leaves** the schematic: a vault keeps what it is given,
 * so a line ending in one delivers nothing outward and reads as zero. The same trap took a
 * first pass of `tools/gap.mjs` and produced eighty-four scenarios apparently a hundred per
 * cent wrong, every one of them a vault doing its job. It is written down twice for that
 * reason.
 */
const intoVault = (report, item) => {
  const vault = report.detail.find((one) => one.role === "store");
  assert.ok(vault, "the layout has no vault");
  return vault.through[item] || 0;
};

/* A vault is three wide and is stored by its centre, so it has to sit **two** tiles past
   the carrier that feeds it: written one tile away its footprint swallows that carrier's
   own tile and the line silently loses its last block. Every layout below is spaced that
   way, and every one of them was wrong once for want of it. */

test("a line of ducts carries, which is the whole of the defect", async () => {
  const out = await analyse(paste([
    [0, 1, "item-source", 0, beryllium],
    [1, 1, "duct", 0], [2, 1, "duct", 0], [3, 1, "duct", 0], [4, 1, "duct", 0],
    [6, 1, "vault", 0],
  ]));
  close(intoVault(out, "beryllium"), 15, "fifteen a second, a duct's own rate");
});

test("a duct refuses what is pushed against the way it points", async () => {
  /* The same rule as a belt's, and the reason a graph built without it reports a working
     loop between two carriers aimed at each other. */
  const out = await analyse(paste([
    [0, 1, "item-source", 0, beryllium],
    [1, 1, "duct", 0], [2, 1, "duct", 2], [4, 1, "vault", 0],
  ]));
  assert.equal(intoVault(out, "beryllium"), 0, "the second duct faces the first");
});

test("an armoured duct takes from behind and from ducts, not from the side", async () => {
  /* `armored-duct` is the block a player puts down precisely so that the vault beside it
     cannot feed it. Treated as a plain duct it becomes a leak, and the wall the player paid
     for stops existing. */
  const behind = await analyse(paste([
    [0, 1, "item-source", 0, beryllium],
    [1, 1, "duct", 0], [2, 1, "armored-duct", 0], [4, 1, "vault", 0],
  ]));
  close(intoVault(behind, "beryllium"), 15, "a duct aimed at it gets through");

  /* The same layout twice, with one block swapped, because "nothing arrives" is a weak
     assertion on its own: it is also what a mistyped position gives. The plain duct is what
     says the shape can deliver at all. */
  const armoured = await analyse(paste([
    [0, 2, "item-source", 0, beryllium], [1, 2, "router", 0],
    [1, 1, "armored-duct", 0], [2, 1, "duct", 0], [3, 1, "duct", 0], [5, 1, "vault", 0],
  ]));
  assert.equal(intoVault(armoured, "beryllium"), 0,
               "a router against its side does not get through");

  const plain = await analyse(paste([
    [0, 2, "item-source", 0, beryllium], [1, 2, "router", 0],
    [1, 1, "duct", 0], [2, 1, "duct", 0], [3, 1, "duct", 0], [5, 1, "vault", 0],
  ]));
  close(intoVault(plain, "beryllium"), 15, "a plain duct, on the other hand, takes from the side");
});

test("a duct bridge aims rather than remembers, and a duct between two does not stop it",
     async () => {
  /* `DirectionBridge.findLink` walks up to its range and takes the first block **of the
     same name**, stepping over anything else. Written as "stop at the first block of any
     kind", the middle span of a chain linked to nothing because a plain duct sat in the
     way. */
  const out = await analyse(paste([
    [0, 1, "item-source", 0, beryllium],
    [1, 1, "duct", 0], [2, 1, "duct-bridge", 0],
    [3, 1, "duct", 0],
    [6, 1, "duct-bridge", 0], [7, 1, "duct", 0], [9, 1, "vault", 0],
  ]));
  close(intoVault(out, "beryllium"), 15, "the bridge steps over the duct sitting between the two");
});

test("the face a bridge beam lands on is closed to everything else", async () => {
  /* `acceptItem` tests `!occupied[(side + 2) % 4]`, and the sending bridge writes itself
     into the receiver's `occupied` at its own rotation. A duct pressed against that face is
     refused for ever - it looks like a fault in the layout and is a rule of the block.

     Without it the solve delivered a second stream the game never delivers, which is the
     worst shape of wrong: not a figure that is off, a figure that is invented. */
  const out = await analyse(paste([
    [0, 1, "item-source", 0, beryllium],
    [1, 1, "duct", 0], [2, 1, "duct-bridge", 0],
    [6, 1, "duct-bridge", 0], [7, 1, "duct", 0], [9, 1, "vault", 0],
    // A second feed pressed against the very face the beam arrives on.
    [5, 2, "item-source", 0, beryllium], [5, 1, "duct", 0],
  ]));
  close(intoVault(out, "beryllium"), 15,
        "only one line gets through, not two, because the face is taken");
});

test("a duct is not an infinite pipe", async () => {
  /* With no branch in `capacityFor` a duct fell through to `Infinity`, so the moment the
     edges existed a duct line would have carried whatever was poured into it. Two sources
     against one duct is the shape that catches it. */
  const out = await analyse(paste([
    [0, 1, "item-source", 0, beryllium], [1, 0, "item-source", 0, beryllium],
    [1, 1, "duct", 0], [2, 1, "duct", 0], [3, 1, "duct", 0], [5, 1, "vault", 0],
  ]));
  // Two sandbox taps pour a hundred a second each. One duct lets fifteen through.
  close(intoVault(out, "beryllium"), 15, "fifteen, not two hundred");
});
