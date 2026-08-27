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
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const { differences, KEPT, measured, paintedFor, ported, stockedFor } = await import(
  new URL("../../tools/compare.mjs", import.meta.url));

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
  // Une pompe sans courant ne pompe rien. C'est le resultat, et le scenario existe pour
  // dire qu'il vaut zero et non un frame de plus.
  "pump-unpowered",
]);

const scenarios = readdirSync(KEPT)
  .filter((name) => name.endsWith(".json"))
  .map((name) => name.replace(/\.json$/, ""));

test("there are scenarios to check against", () => {
  assert.ok(scenarios.length >= 15, `${scenarios.length} scenarios mesures`);
});

for (const name of scenarios) {
  test(`${name} matches the engine`, async () => {
    const code = readFileSync(join(KEPT, `${name}.txt`), "utf8").trim();
    const engine = measured(name);
    const mine = await ported(code, engine.ticks, paintedFor(name),
                              stockedFor(name));

    const gaps = differences(mine, engine);
    assert.ok(gaps.length > 0 || NOTHING_HAPPENS.has(name),
              "le moteur a fait quelque chose de mesurable");

    const slack = KNOWN_GAPS[name] || 0.0001;
    for (const gap of gaps) {
      assert.ok(gap.gap <= slack,
                `${gap.what} : ${gap.mine} contre ${gap.theirs}, `
                + `${(gap.gap * 100).toFixed(1)}% d'ecart`);
    }
  });
}
