/**
 * A processor reaches the blocks it claims to drive, or it does not.
 *
 * A pasted schematic can carry a link the game will refuse, and nothing said so: the player
 * finds out in game, when the turret never receives an order. The link is stored as an
 * offset, so it is wrong in the same way wherever the schematic is pasted - which is what
 * makes it a fact about the layout rather than a guess.
 *
 * The rule is `LogicBlock.validLink`, read in the v159.7 bytecode:
 *
 *     other.within(this, range + other.block.size * tilesize / 2f)
 *
 * Three details in that line are the whole of these tests, because all three survive a
 * transcription and only show themselves at the boundary:
 *
 * - `Mathf.within` is `fcmpg` then `ifge`, so the comparison is **strict**. A link laid
 *   exactly at the range is refused. The game lets a player place it and saves it, then
 *   refuses it for ever, which is the same trap `bilan.js` already documents for the mass
 *   driver, where it cost a working figure to find.
 * - the radius takes the **target's** half-size, so a bigger block is reachable from
 *   further away. The processor's own size does not enter it.
 * - the distance runs between **centres**, not between stored tiles, and those differ by
 *   half a tile for every block of even size.
 *
 * Sizes are picked so the first two tests land on exact integers. A processor and a target
 * of the same parity sit on the same row of centres, and a 2x2 target gives a whole-numbered
 * radius: 22 + 1 = 23 against a distance of 23. Mixed parities put half a tile into the
 * other axis and the boundary stops being expressible, which is why the third test pins the
 * awkward number instead of dodging it.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { buildGraph } from "../../../site/public/forge/bilan.js";
import { logicOf, readProgram, writeProgram } from "../../../site/public/forge/logic.js";
import { loadCatalogue } from "../helpers.js";

loadCatalogue();

/** A logic processor at the origin, linked to whatever sits at `(x, 0)`. */
async function linked(target, x, name = "cible1") {
  const nodes = buildGraph([
    { x: 0, y: 0, block: "logic-processor", rotation: 0 },
    { x, y: 0, block: target, rotation: 0 },
  ]).nodes;
  nodes[0].program = await readProgram(await writeProgram({
    code: `control enabled ${name} 0 0 0 0\n`,
    links: [{ name, dx: x, dy: 0 }],
  }));
  return nodes;
}

test("a link laid exactly at the range is refused, as the game refuses it", async () => {
  /* A logic processor is 2x2 stored at (0, 0), so its centre is (1, 1); a container is 2x2
     stored at (23, 0), so its centre is (24, 1). Twenty-three tiles apart, on one row, and
     the radius is 22 + 1 = 23. Equal, therefore out: `<`, not `<=`.

     One tile closer it holds, which is what says this is a boundary and not an off-by-one
     living somewhere else. */
  const out = logicOf(await linked("container", 23));
  assert.equal(out.unreachable.length, 1, "23 is not less than 23");
  assert.equal(out.unreachable[0].to, "container");

  assert.deepEqual(logicOf(await linked("container", 22)).unreachable, [],
                   "22 tiles is within 23");
});

test("a bigger target is reachable from further, because its half-size counts", async () => {
  /* The same tile, twice, with two different answers. An impact reactor is 4x4, so its
     centre lands on the same row twenty-three tiles out - exactly where the container of
     the previous test stood and was refused - and its radius is 22 + 2 = 24.

     Forgetting the term is not a rounding error: it is a report that cries about a reactor
     the game accepts, and an alarm that cries about working layouts is one the reader turns
     off, along with the column it lives in. */
  assert.deepEqual(logicOf(await linked("impact-reactor", 23)).unreachable, []);
  assert.equal(logicOf(await linked("container", 23)).unreachable.length, 1);
});

test("the distance runs between centres, half tiles and all", async () => {
  /* A 3x3 vault against a 2x2 processor: odd against even, so the two centres are half a
     tile apart on the axis the link does not travel along. The true distance is therefore
     `hypot(22.5, 0.5)`, not 22.5, and the difference is six thousandths of a tile.

     Too small to change this verdict, and pinned anyway: subtracting stored tiles instead of
     centres yields exactly 22.5 here, so an implementation that skips `centre()` fails this
     line and nothing else. It is the cheapest place to catch a mistake that would otherwise
     surface as a schematic judged wrong by half a tile. */
  const [only] = logicOf(await linked("vault", 24)).unreachable;
  assert.equal(only.distance, Math.hypot(23.5, 0.5));
  assert.equal(only.reach, 23.5, "22 plus the vault's own half-width");

  assert.deepEqual(logicOf(await linked("vault", 23)).unreachable, [],
                   "half a tile nearer and it holds");
});

test("a block out of reach is not named among the blocks the schematic drives", async () => {
  /* `control` aimed past the range does nothing at all, so listing its target among the
     driven blocks would be a false statement in the one place a reader looks to find out
     what the processors touch.

     A block linked twice, once in reach and once not, still appears: the near link drives
     it, and that is true. Two containers with the same name are exactly the case that made
     this worth separating - the card would otherwise say "drives container" and "container
     out of reach" about two different blocks, in the same breath. */
  const out = logicOf(await linked("container", 23));
  assert.equal(out.writing, 1, "the program does hold a `control`");
  assert.deepEqual(out.driven, [], "and it reaches nothing with it");

  const nodes = buildGraph([
    { x: 0, y: 0, block: "logic-processor", rotation: 0 },
    { x: 10, y: 0, block: "container", rotation: 0 },
    { x: 23, y: 0, block: "container", rotation: 0 },
  ]).nodes;
  nodes[0].program = await readProgram(await writeProgram({
    code: "control enabled loin1 0 0 0 0\ncontrol enabled pres1 0 0 0 0\n",
    links: [{ name: "loin1", dx: 23, dy: 0 }, { name: "pres1", dx: 10, dy: 0 }],
  }));
  const both = logicOf(nodes);
  assert.deepEqual(both.driven, ["container"], "the near one is driven");
  assert.equal(both.unreachable.length, 1, "the far one is not");
  assert.deepEqual(both.unreachable[0].target, [23, 0]);
});

test("a link to a block the schematic does not contain is not called unreachable", async () => {
  /* Copying a layout out of a base keeps the links of processors whose targets were left
     behind, exactly as it keeps the links of bridges. Those are not broken schematics, and
     marking them would put a red flag on most real ones.

     The silence is the point: an absent target and an unreachable one are two different
     things, and only one of them is the layout's fault. */
  const nodes = buildGraph([
    { x: 0, y: 0, block: "logic-processor", rotation: 0 },
  ]).nodes;
  nodes[0].program = await readProgram(await writeProgram({
    code: "control enabled vault1 0 0 0 0\n",
    links: [{ name: "vault1", dx: 40, dy: 0 }],
  }));

  assert.deepEqual(logicOf(nodes).unreachable, []);
});

test("a processor that only reads still has its links checked", async () => {
  /* `drives` answers "does this change any number", and it has nothing to say about whether
     the processor can see what it reads. A `sensor` aimed past the range reads nothing, for
     ever, and the program branches on that nothing. */
  const nodes = await linked("container", 23);
  nodes[0].program = await readProgram(await writeProgram({
    code: "sensor x cible1 @enabled\nprint x\n",
    links: [{ name: "cible1", dx: 23, dy: 0 }],
  }));

  const out = logicOf(nodes);
  assert.equal(out.writing, 0, "it drives nothing");
  assert.equal(out.unreachable.length, 1, "and it still cannot see what it reads");
});

test("an unreachable link says where it is and what it would have taken", async () => {
  const [only] = logicOf(await linked("container", 23)).unreachable;
  assert.deepEqual(only, {
    from: "logic-processor", to: "container",
    at: [0, 0], target: [23, 0],
    distance: 23, reach: 23,
  });
});
