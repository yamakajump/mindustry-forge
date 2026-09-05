/**
 * The report says the names the game says, and keeps saying them.
 *
 * The analysis is keyed by the game's identifiers, `titanium-conveyor` and `graphite`,
 * because the catalogue is. The page is read by a French player, who knows « Convoyeur en
 * titane » and « Graphite ». Every identifier that reaches the page therefore has to go
 * through `lisible`, and one that does not looks exactly like a rendered name: the card
 * still lists three things and three rates, so nothing looks broken, and the reader is
 * simply told about a block that does not exist under that name anywhere they have seen.
 *
 * This has been fixed once already, over the whole report, and five more got through in
 * the same file afterwards: the ports card, the drill ceiling warning, the ground panel,
 * the bottleneck's feeder, and the list of what a schematic is short of. A rule nobody can
 * check is a rule that decays, so it is checked here.
 *
 * The check is on the source, and it works because the names in this file are regular: an
 * expression holding a resource or a block is called `resource`, `block`, `name` on a port
 * or a tile, and so on. `ALLOWED` is the list of the ones that are meant to stay raw, each
 * with the reason, which is the part worth reading when this test fails.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PAGE = readFileSync(
  fileURLToPath(new URL("../../site/public/index.html", import.meta.url)), "utf8");

/** What an identifier is called in this file, wherever it comes from. */
const IDENTIFIER = /\b(resource|\w*\.block|\w*\.name|over\.\w+|throttle\.\w+|dug\.\w+)\b/;

/**
 * The expressions that carry something other than a catalogue identifier, or that are not
 * read by a human. Written out rather than pattern matched: an exception nobody can see is
 * how the rule goes back to being unenforced.
 */
const ALLOWED = new Map([
  ["report.name", "the schematic's own name, as its author typed it"],
  ["editing ? editing.name : report.name", "the same, whichever of the two is in hand"],
  ["editing.name", "the same, on the schematic being edited"],
  ["regarde.name", "the same, on the one being looked at"],
  ["me.name", "the signed in account's name"],
  ["resource", "the mark chip's data-resource, which the engine reads back as a key"],
]);

/** Every `escape(...)` in the page, with its argument, balanced across one nesting level. */
function escapes(source) {
  const found = [];
  const pattern = /\bescape\(/g;
  let match;
  while ((match = pattern.exec(source))) {
    let depth = 1;
    let index = match.index + match[0].length;
    while (index < source.length && depth > 0) {
      if (source[index] === "(") depth++;
      else if (source[index] === ")") depth--;
      index++;
    }
    found.push(source.slice(match.index + match[0].length, index - 1).replace(/\s+/g, " ").trim());
  }
  return found;
}

test("every identifier the page prints goes through lisible", () => {
  const raw = escapes(PAGE)
    .filter((argument) => IDENTIFIER.test(argument))
    .filter((argument) => !/\blisible\(|\bnameOf\(|\bt\(/.test(argument))
    .filter((argument) => !ALLOWED.has(argument));

  assert.deepEqual(raw, [],
    "these print a game identifier where a player expects a name; wrap them in lisible(), "
    + "or add them to ALLOWED with the reason they are not a name");
});

test("the list of exceptions is real, not a leftover", () => {
  // An exception for an expression the page no longer contains hides the next mistake made
  // under the same name.
  const seen = new Set(escapes(PAGE));
  const stale = [...ALLOWED.keys()].filter((argument) => !seen.has(argument));
  assert.deepEqual(stale, [], "ALLOWED names expressions that are no longer in the page");
});

test("the reader of this file finds the escapes it is checking", () => {
  // If `escape(` ever stops being how the page escapes, the two tests above pass on an
  // empty list and guard nothing at all.
  assert.ok(escapes(PAGE).length > 50, "too few escape() calls found; the parsing is wrong");
});
