/**
 * What the catalogue knows about a processor.
 *
 * Speed is the whole of what separates the three of them, and until now the catalogue held
 * none of it: a micro, a logic and a hyper processor were three entries with a category and
 * a class name and not one number between them. An editor cannot say "this program runs at
 * twenty-five lines a tick" from that.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { loadCatalogue } from "./helpers.js";

const known = loadCatalogue();

test("the three processors are told apart by their speed", () => {
  assert.equal(known.blocks["micro-processor"].instructions_per_tick, 2);
  assert.equal(known.blocks["logic-processor"].instructions_per_tick, 8);
  assert.equal(known.blocks["hyper-processor"].instructions_per_tick, 25);
});

test("a processor carries the cap on how far behind it may fall", () => {
  /* The second half of the answer. A processor accumulates `edelta * instructionsPerTick`
     and spends one per instruction, and the accumulator is capped at
     `maxInstructionScale * instructionsPerTick`. It catches up after a slow frame, but only
     by that many ticks' worth; past it the work is dropped rather than deferred. Timing a
     program on the per-tick figure alone times the best case. */
  for (const name of ["micro-processor", "logic-processor", "hyper-processor"]) {
    assert.equal(known.blocks[name].max_instruction_scale, 5);
  }
});

test("a processor knows how far it can link", () => {
  // In tiles, like every other distance in the catalogue.
  assert.equal(known.blocks["micro-processor"].logic_range, 10);
  assert.equal(known.blocks["logic-processor"].logic_range, 22);
  assert.equal(known.blocks["hyper-processor"].logic_range, 42);
});

test("the world processor is not in the catalogue at all", () => {
  /* It is privileged and costs nothing, so the trimmer drops it and no schematic can
     contain one. Worth pinning: its range is `Float.MAX_VALUE`, which divided by eight is
     4.25e37, and a page that ever started showing it would show that. */
  assert.equal(known.blocks["world-processor"], undefined);
});
