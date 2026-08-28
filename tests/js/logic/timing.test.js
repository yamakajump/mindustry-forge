/**
 * How long a program takes, and the field we refuse to use to say it.
 *
 * The catalogue carries two speed ceilings and only one count. `instructions_per_tick` is
 * what `updateTile` executes; `max_instructions_per_tick` is what `setrate` is allowed to
 * raise it to, and `updateTile` resets the speed to the block's own **every tick** on
 * anything not privileged. Of the three processors a schematic can contain, this second
 * ceiling is therefore never reached by anything.
 *
 * Mistaking one for the other would give a page that announces forty lines per tick on a
 * micro processor that actually does two: twenty times too many, and true nowhere. It is
 * the kind of mistake a plausible field name leads people to make, so it is tested.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { useCatalogue } from "../../../site/public/forge/logic/catalogue.js";
import { timingOf, ticksAsText, secondsAsText }
  from "../../../site/public/forge/logic/timing.js";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const catalogue = useCatalogue(JSON.parse(read("site/public/forge/logic/instructions.json")));

test("speeds come from the game, not from a table written here", () => {
  const game = JSON.parse(read("bench/data/blocks.json")).blocks;
  for (const processor of catalogue.processors) {
    assert.equal(processor.instructions_per_tick, game[processor.name].instructions_per_tick,
      `${processor.name}: the speed`);
    assert.equal(processor.max_instruction_scale, game[processor.name].max_instruction_scale,
      `${processor.name}: the catch-up ceiling`);
  }
});

test("the ceiling setrate targets is not in the page's catalogue", () => {
  /* Present in the game's dump, deliberately absent here. A field that only applies to the
     world processor, on a page that cannot produce one, is a number someone ends up
     displaying. */
  const game = JSON.parse(read("bench/data/blocks.json")).blocks;
  assert.equal(game["micro-processor"].max_instructions_per_tick, 40,
    "the field does exist on the game's side, otherwise this test guards nothing");

  for (const processor of catalogue.processors) {
    assert.ok(!("max_instructions_per_tick" in processor),
      `${processor.name} carries a ceiling none of its programs reach`);
  }
});

test("a pass counts the speed of the chosen processor", () => {
  assert.equal(timingOf("micro-processor", 100).ticks, 50);
  assert.equal(timingOf("logic-processor", 100).ticks, 12.5);
  assert.equal(timingOf("hyper-processor", 100).ticks, 4);
});

test("the remainder of a tick is not rounded up", () => {
  /* The accumulator keeps the credit from one tick to the next, so nine instructions at two
     per tick make four and a half ticks, not five. Rounding here would make the page say a
     program is eleven percent slower than it actually is. */
  assert.equal(timingOf("micro-processor", 9).ticks, 4.5);
});

test("the burst is five ticks of budget, not five instructions", () => {
  assert.equal(timingOf("micro-processor", 1).burst, 10);
  assert.equal(timingOf("logic-processor", 1).burst, 40);
  assert.equal(timingOf("hyper-processor", 1).burst, 125);
});

test("an empty program and an unknown block return nothing rather than zero", () => {
  assert.equal(timingOf("micro-processor", 0), null);
  assert.equal(timingOf("router", 100), null);
});

test("durations read at the precision that matters", () => {
  assert.equal(ticksAsText(4.5), "4,5");
  assert.equal(ticksAsText(203.7), "204");
  assert.equal(secondsAsText(0.075), "75 ms");
  assert.equal(secondsAsText(3.4), "3,4 s");
  assert.equal(secondsAsText(42.6), "43 s");
});
