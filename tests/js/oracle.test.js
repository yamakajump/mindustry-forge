/**
 * The port, held against the engine it was transcribed from.
 *
 * Every scenario under `bench/data/oracle` is one schematic that was run in a real
 * Mindustry v159.7 server for thirty seconds, with what its containers and its pipes ended
 * up holding written down. The same string goes through the port here, and the two are
 * counted in items rather than compared as rates: "a hundred and eighty two both times"
 * leaves nowhere to hide, where "about six and a half" hides a six per cent error.
 *
 * This is the check that makes the port a port rather than a plausible invention, and it
 * runs on every `npm test` because a regression in it is not a matter of opinion.
 *
 * The comparison itself lives in `tools/compare.mjs`, shared with `npm run oracle`. It was
 * briefly two copies and they drifted within the hour.
 *
 * The measurements are re-taken with `npm run oracle:measure`, which needs the provisioned
 * server in `_run`. They are committed, so this test needs nothing but the repository.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const { differences, KEPT, measured, paintedFor, ported, stockedFor } = await import(
  new URL("../../tools/compare.mjs", import.meta.url));
const { SCENARIOS } = await import(new URL("../../tools/oracle.mjs", import.meta.url));

/**
 * What does not match yet, and by how much.
 *
 * **Nothing.** Every scenario is exact, and the table is kept empty rather than deleted,
 * because naming a gap is what got the last two closed.
 *
 * The two that lived here longest both turned out to be the same thing wearing two hats:
 * the game counts in single precision and this counted in double. A source pours a hundred
 * items a second into sixty frames, so its counter spends six tenths of a frame at a time
 * and `0.6f` is a hair above six tenths; a machine adds a ninetieth ninety times and lands
 * a hair under one in double and a hair over it in float; a belt takes on a third item when
 * the one behind has moved exactly `itemSpace`. Each of them is a comparison that falls on
 * the wrong side once in a run, and once is enough.
 *
 * They were found with `node tools/trace.mjs <scenario>`, which writes a line per frame on
 * both sides and names the first one that differs. A total after eighteen hundred frames
 * cannot tell you which frame it was.
 */
const KNOWN_GAPS = {};

/**
 * Scenarios whose answer is "nothing at all", on purpose.
 *
 * The guard below exists to catch a scenario that measures nothing by accident: a belt
 * stopping a tile short, a source configured with nothing. For these the emptiness **is**
 * the result, and a disagreement would still show, because a vault the game filled and the
 * port did not is a difference in that vault whether or not anything else moved.
 */
const NOTHING_HAPPENS = new Set([
  // An armoured duct refuses a side feed from anything that is not a duct. That is the
  // whole block, and it reads as a vault that never gets a single item.
  "duct-armored-side",
  // Same rule on the other carrier: an armoured belt takes from a belt or from directly
  // behind, and a source standing beside it is not either.
  "conveyor-armored-side",
  // An unpowered pump pumps nothing. That is the result, and the scenario exists to say
  // it is worth zero, not one frame more.
  "pump-unpowered",
  /* A slag incinerator with no slag is a wall. Its recipe asks for zero slag a frame, so
     its efficiency is zero divided by zero, and any comparison against `NaN` is false: it
     accepts nothing at all. The emptiness **is** the measurement, and the pair with
     `incinerator-slag` is what gives it meaning. */
  "incinerator-dry",
]);

const scenarios = readdirSync(KEPT)
  .filter((name) => name.endsWith(".json"))
  .map((name) => name.replace(/\.json$/, ""));

test("there are scenarios to check against", () => {
  assert.ok(scenarios.length >= 15, `${scenarios.length} scenarios measured`);
});

/**
 * The list of scenarios and the files recorded for them, held against each other.
 *
 * A scenario is two halves kept apart: its shape, in `SCENARIOS`, and what the game
 * answered, in `bench/data/oracle/`. Nothing joined them, so either half could go missing
 * while the other stayed, and both did. Two scenarios were renamed or set aside and left
 * their inputs behind, where a `.txt` measured for a shape that no longer exists waits to
 * be compared against today's analysis the moment somebody reuses the name. Two others
 * were added and never measured, and the only thing that knew was a line the replay
 * printed, which is prose rather than a barrier.
 *
 * The loop below cannot catch either, because it walks the recorded measurements: a
 * scenario with no measurement is a scenario it never hears of.
 */
const INPUTS = [".txt", ".sol", ".stock"];

/** Every scenario written in the file that decides what a measurement run asks for. */
const named = new Set(Object.keys(SCENARIOS));

/** And every name the directory carries, whichever of the four files it comes from. */
const recorded = new Set(readdirSync(KEPT)
  // The one file in there that belongs to the run rather than to a scenario.
  .filter((file) => file !== "commands.txt")
  .map((file) => file.replace(/\.[^.]+$/, "")));

test("nothing is recorded for a scenario that no longer exists", () => {
  const orphans = [...recorded].filter((name) => !named.has(name)).sort();
  assert.deepEqual(orphans, [], `${orphans.join(", ")}: files under bench/data/oracle `
    + "with no scenario in tools/oracle.mjs. Delete them, or put the scenario back.");
});

test("every scenario has been put to the game", () => {
  const unmeasured = [...named].filter((name) => !existsSync(join(KEPT, `${name}.json`)));
  assert.deepEqual(unmeasured, [], `${unmeasured.join(", ")}: in SCENARIOS and never `
    + "measured. A scenario nothing has answered is a question, not a check.");
});

test("every scenario keeps the input it was measured from", () => {
  const partial = [...named]
    .flatMap((name) => INPUTS.map((kind) => `${name}${kind}`))
    .filter((file) => !existsSync(join(KEPT, file)))
    .sort();
  assert.deepEqual(partial, [], `${partial.join(", ")}: missing. The measurement is only `
    + "reproducible beside the schematic, the ground and the stock it was taken from.");
});

test("commands.txt asks for exactly the scenarios there are", () => {
  const lines = readFileSync(join(KEPT, "commands.txt"), "utf8").trim().split("\n");
  const asked = lines.map((line) => /oracle\/(\S+)\.json/.exec(line)?.[1]).sort();
  assert.deepEqual(asked, [...named].sort(), "commands.txt is what a reader takes for the "
    + "record of what the server was asked. Re-run npm run oracle:measure to rewrite it.");
});

for (const name of scenarios) {
  test(`${name} matches the engine`, async () => {
    const code = readFileSync(join(KEPT, `${name}.txt`), "utf8").trim();
    const engine = measured(name);
    const mine = await ported(code, engine.ticks, paintedFor(name),
                              stockedFor(name));

    const gaps = differences(mine, engine);
    assert.ok(gaps.length > 0 || NOTHING_HAPPENS.has(name),
              "the engine did something measurable");

    const slack = KNOWN_GAPS[name] || 0.0001;
    for (const gap of gaps) {
      assert.ok(gap.gap <= slack,
                `${gap.what}: ${gap.mine} vs ${gap.theirs}, `
                + `${(gap.gap * 100).toFixed(1)}% off`);
    }
  });
}
