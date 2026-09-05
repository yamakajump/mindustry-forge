/**
 * The bridge between the artisan command and the browser's analysis.
 *
 * `tools/ingest.mjs` computes nothing: it imports `bilan.js` as it is and hands it the
 * schematics the collector brought back. What is tested here is therefore not the
 * arithmetic, which has its own tests and the bench behind them, but the contract the PHP
 * side relies on: one line in, one line out, a line that blows up does not take the others
 * down with it, and what comes out fits in a JSON column.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { paste } from "./helpers.js";

const SCRIPT = fileURLToPath(new URL("../../tools/ingest.mjs", import.meta.url));

/** Run the script the way the artisan command does: through its standard input. */
const run = (lines) =>
  execFileSync(process.execPath, [SCRIPT], { input: `${lines.join("\n")}\n`, encoding: "utf8" })
    .trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));

const PANELS = paste([[0, 0, "solar-panel"], [1, 0, "solar-panel"]], "deux panneaux");

test("one line in, one line out, with the figures the database indexes", () => {
  const [out] = run([JSON.stringify({ id: 7, code: PANELS })]);

  assert.equal(out.id, 7);
  assert.equal(out.analyse.blocks, 2);
  assert.equal(out.analyse.width, 2);
  /* The four fields `Schematic::fromAnalysis` goes looking for. If one of them changes
     name here, fifteen thousand rows fill up with zeros and nothing objects. */
  for (const key of ["perMinute", "needs", "potential", "height"]) {
    assert.ok(key in out.analyse, `${key} is missing`);
  }
  assert.equal(out.analyse.potential.made, 14.4, "two panels");
});

test("what comes out is serialisable and stays small", () => {
  /* `analyse()`'s response carries `graph` and `tiles`, where the nodes point at each
     other: keeping that whole thing would not just be huge, `JSON.stringify` loops on it.
     And `offers` proposes a list of resources per tile, which over fifteen thousand
     schematics makes hundreds of megabytes nobody ever reads again. */
  const [out] = run([JSON.stringify({ id: 1, code: PANELS })]);

  for (const dropped of ["graph", "tiles", "detail", "offers", "ports", "feeds"]) {
    assert.ok(!(dropped in out.analyse), `${dropped} should have been left out`);
  }
  assert.ok(JSON.stringify(out.analyse).length < 8000);
});

test("an unreadable schematic does not kill the batch", () => {
  /* Among fifteen thousand entries collected elsewhere there will be mod blocks never seen
     before and truncated files. A batch that dies on the first would make the other
     forty-nine start over, forever. */
  const out = run([
    JSON.stringify({ id: 1, code: PANELS }),
    JSON.stringify({ id: 2, code: "ceci n est pas du base64" }),
    JSON.stringify({ id: 3, code: PANELS }),
  ]);

  assert.equal(out.length, 3, "three entries, three responses");
  assert.ok(out[0].analyse);
  assert.ok(out[1].erreur, "the second one says why");
  assert.ok(!out[1].analyse);
  assert.ok(out[2].analyse, "and the third went through anyway");
});

test("a line that is not even JSON is reported, not swallowed", () => {
  // Without a response, the PHP side would not know what to do with the line and would
  // pick it up again forever. A response with no id is at least a response.
  const out = run(["{ceci n est pas du json", JSON.stringify({ id: 9, code: PANELS })]);

  assert.equal(out.length, 2);
  assert.equal(out[0].id, null);
  assert.ok(out[0].erreur);
  assert.equal(out[1].id, 9);
});
