/**
 * Opening a schematic by its link keeps the marks its author saved.
 *
 * `read` has answered with them since the first day and the page assigns them, so this
 * looked done. It was not: `run()` clears the marks whenever the string in the box differs
 * from the one it analysed last, which is right for a paste and wrong here. Arriving on
 * `/?s=<slug>` is the first payload of the session, so it differs from nothing, and the
 * marks were wiped between being assigned and being used.
 *
 * What a reader saw was the page asking the schematic's own author where their schematic
 * plugs in, over a ceiling, on a page they had already marked and published. Found while
 * reproducing a report about something else.
 *
 * Checked on the source because the two halves are eight hundred lines apart in one file
 * and neither is a module: the assignment is in the `?s=` handler at the very bottom, the
 * reset is in `run()`. Only a test that reads both sees them together.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PAGE = readFileSync(
  fileURLToPath(new URL("../../site/public/index.html", import.meta.url)), "utf8");

/** The block that runs when the address carries `?s=`. */
function parLien() {
  const debut = PAGE.indexOf('new URLSearchParams(location.search).get("s")');
  assert.ok(debut > 0, "the `?s=` handler has moved; find it and update this test");
  return PAGE.slice(debut);
}

test("run() still resets the marks when the string changes, which is what this guards", () => {
  // If this ever stops being true the rest of the file is guarding nothing, because there
  // would be nothing left to lose the marks.
  assert.match(PAGE, /if \(payload !== lastPayload\) \{\s*\n\s*marked = \{\};/,
    "run() no longer resets on a new payload");
});

test("the link handler claims the payload before anything analyses it", () => {
  const bloc = parLien();
  /* The call, not the word. The comment above the assignment explains why `run()` would
     otherwise wipe the marks, and matching the bare word found that sentence instead. */
  const claimed = bloc.indexOf("lastPayload =");
  const analysed = bloc.search(/^\s*run\(\);/m);

  assert.ok(claimed > 0, "the `?s=` handler no longer claims lastPayload, so run() wipes the marks");
  assert.ok(claimed < analysed,
    "lastPayload is claimed after run(), which is too late: the marks are already gone");
});

test("the marks and the ground are both taken from the answer", () => {
  const bloc = parLien();

  assert.match(bloc, /marked = \{ \.\.\.\(found\.marked \|\| \{\}\) \}/,
    "the author's marks are no longer read back");
  assert.match(bloc, /ground = \{ \.\.\.\(found\.ground \|\| \{\}\) \}/,
    "the ground it was designed on is no longer read back");
});
