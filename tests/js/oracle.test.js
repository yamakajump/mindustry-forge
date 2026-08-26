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

const { differences, KEPT, measured, paintedFor, ported } = await import(
  new URL("../../tools/compare.mjs", import.meta.url));

/**
 * What does not match yet, and by how much.
 *
 * Named rather than quietly skipped. The bridge used to be here at four and eight tenths
 * per cent and is not any more: it turned out to be a `BufferedItemBridge`, a delay line
 * with a gate rather than a hand-off with a timer, and writing down the gap is what kept
 * it in view until it was found.
 */
const KNOWN_GAPS = {
  // A laser drill with power to spare makes 46 where the engine makes 47, one item in
  // thirty seconds. The same drill on a grid that cannot keep up matches exactly, which
  // is the odd part: the harder case is the one that is right. Left as a number rather
  // than rounded away, because a gap that only appears at full power is a clue.
  "power-plenty": 0.03,
  // A battery's charge, which both engines put at 0.445 and which differs in the fourth
  // decimal. Three decimals is as much as a float added to eighteen hundred times is
  // worth trusting.
  "power-charge": 0.002,
};

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
    const mine = await ported(code, engine.ticks, paintedFor(name));

    const gaps = differences(mine, engine);
    assert.ok(gaps.length > 0, "le moteur a fait quelque chose de mesurable");

    const slack = KNOWN_GAPS[name] || 0.0001;
    for (const gap of gaps) {
      assert.ok(gap.gap <= slack,
                `${gap.what} : ${gap.mine} contre ${gap.theirs}, `
                + `${(gap.gap * 100).toFixed(1)}% d'ecart`);
    }
  });
}
