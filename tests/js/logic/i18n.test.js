/**
 * The two tables in the editor that a static test cannot follow.
 *
 * `tests/js/i18n.test.js` does the bulk of the work: every key written anywhere exists in
 * the dictionary, every key in the dictionary is asked for somewhere, and no key is
 * assembled at run time. Since this tool's keys are written out whole, it covers them all.
 *
 * What is left is what it cannot see: the two places where a key is chosen **by a value**
 * rather than written on the spot. Suggestions go through `KINDS[entry.kind]`, diagnostics
 * through the key the parser put in the problem. In both cases a new value without its key
 * gives `t(undefined)`, which fails nowhere and shows a player nothing at all.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { KINDS } from "../../../site/public/forge/logic/editor.js";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const DICTIONARY = JSON.parse(read("site/public/forge/lang/fr.json"));

test("chaque famille de suggestion a une etiquette", () => {
  /* The families as the editor actually uses them, read back from its calls to `add`, and
     not as `KINDS` declares them: the gap between the two is exactly what would leave the
     hole. */
  const source = read("site/public/forge/logic/editor.js");
  const used = new Set([...source.matchAll(/add\([^;]*?, "(\w+)",/g)]
    .map((found) => found[1]));
  used.add("monde");                       // chosen by a ternary, not by a literal

  const orphans = [...used].filter((kind) => !KINDS[kind]);
  assert.deepEqual(orphans, [], "des familles que la liste afficherait sans etiquette");

  for (const [kind, key] of Object.entries(KINDS)) {
    assert.ok(key in DICTIONARY, `${kind} pointe sur ${key}, absente du dictionnaire`);
  }
});

test("les diagnostics produits et les phrases ecrites sont les memes", () => {
  const source = read("site/public/forge/logic/syntax.js")
    + read("site/public/outils/logique.html");

  const produced = new Set([...source.matchAll(/"(outils\.logique\.probleme\.[\w-]+)"/g)]
    .map((found) => found[1]));
  const written = Object.keys(DICTIONARY)
    .filter((key) => key.startsWith("outils.logique.probleme."));

  /* Both directions, and no expected count written here: a hard number in a test gets
     updated without a thought the first time it gets in the way. */
  assert.deepEqual([...produced].sort(), [...written].sort(),
    "un diagnostic sans phrase s'afficherait vide, une phrase sans diagnostic est morte");
});
