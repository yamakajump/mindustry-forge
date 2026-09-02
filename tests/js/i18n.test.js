/**
 * The dictionary, and the promise that it covers what the site actually says.
 *
 * The lookup itself is small enough to read, so most of this file is the other test: every
 * key the browser code asks for has to exist, and every key that exists has to be asked
 * for. Without it a missing string is found in production, in a language nobody here
 * reads, which is exactly the failure this whole mechanism was built to make impossible.
 *
 * ONE THING TO KNOW BEFORE IT COSTS YOU AN HOUR: the scan reads comments too. A key
 * written in a docblock to explain the convention is reported like any other, and it has
 * already turned a branch red for the crime of documenting this file's own rule.
 *
 * That is deliberate rather than an oversight. A key sitting in a comment is usually a key
 * somebody just moved and forgot, which is precisely what this test is for, and telling
 * code from prose reliably would mean parsing the language rather than reading it.
 *
 * So write examples with the shape rather than with plausible names:
 *
 *     <domaine>.<ecran>.<element>      seen by nobody, says the same thing
 *     analyse.goulot.titre             reported as a key with no translation
 *
 * The cost is one sentence written carefully, once. The detection it buys is kept.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";

import {
  DEFAULT_LOCALE, currentLocale, t, translate, useDictionary, useLocale,
} from "../../site/public/forge/i18n.js";

const at = (path) => new URL(`../../site/${path}`, import.meta.url);
const read = (path) => readFileSync(at(path), "utf8");

const DICTIONARY = JSON.parse(read("public/forge/lang/fr.json"));

/* The domains the naming convention allows, from the conventions in CLAUDE.md. A key outside
   them is a typo or an invention, and both are worth failing on. */
const DOMAINS = ["nav", "vitrine", "schema", "analyse", "edition", "outils", "blocs", "compte", "dossiers"];
const DOMAIN = "(?:" + DOMAINS.join("|") + ")";

/* `<domaine>.<ecran>.<element>`, in a quote. Three segments at least: two would be a key
   that has stopped saying where it belongs.

   The dot is written `[.]` rather than escaped. This pattern is built from a string, so an
   escaped dot needs a doubled backslash, and a single one leaves a dot that matches any
   character: the first version read `schematic.js` and `schematic-background.png` as keys.
   A character class needs no backslash at all, so there is none to lose. */
const KEY = new RegExp("['\"`](" + DOMAIN + "(?:[.][a-z0-9-]+){2,})['\"`]", "g");

/* The same, but assembled at run time. Nothing can check a key that does not exist until
   the page runs, so the convention is that they are always written whole. */
const BUILT = new RegExp(DOMAIN + "(?:[.][a-z0-9-]*)+(?:[$][{]|[{][$])");

const ATTRIBUTE = /data-i18n(?:-[a-z-]+)?="([^"]+)"/g;

/**
 * Every browser source that could name a key: the modules, and the pages.
 *
 * Nothing is excluded, and that is deliberate. This scan used to skip any file called
 * `i18n.js`, on the grounds that the mechanism is not one of its own callers. It was a
 * name, not a place: the logic editor shipped its own `logic/i18n.js` relay holding fifty
 * strings, and the exclusion made every one of them invisible here. Excluding by exact
 * path would have closed that case; excluding nothing closes the ones nobody has invented
 * yet, and it costs a documentation example that no longer looks like a real key.
 */
function sources() {
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(at(dir))) {
      const path = `${dir}/${name}`;
      if (statSync(at(path)).isDirectory()) {
        if (name !== "lang") walk(path);
      } else if (name.endsWith(".js") || name.endsWith(".html")) {
        found.push(path);
      }
    }
  };

  /* Walked rather than listed one by one: a new page arrives with every parity chantier,
     and a page forgotten here is a page whose keys nobody checks. */
  walk("public");

  return found;
}

/** What a source asks for, however it asks: `t("...")` in a script, `data-i18n` in markup. */
function asked(path) {
  const text = read(path);
  const keys = new Set();
  for (const [, key] of text.matchAll(KEY)) keys.add(key);
  for (const [, key] of text.matchAll(ATTRIBUTE)) keys.add(key);
  return keys;
}

test("a requested key renders its line, and its holes are filled", () => {
  useDictionary({
    "analyse.goulot.titre": "Le goulot",
    "analyse.goulot.bloc": "{bloc} tient tout le reste",
  });

  assert.equal(t("analyse.goulot.titre"), "Le goulot");
  assert.equal(t("analyse.goulot.bloc", { bloc: "conveyor" }), "conveyor tient tout le reste");
});

test("a missing key reads on screen rather than disappearing", () => {
  useDictionary({});
  assert.equal(t("analyse.goulot.titre"), "analyse.goulot.titre",
    "an empty string would be a bug nobody reports");
});

test("a hole someone forgot to fill shows too", () => {
  useDictionary({ "analyse.goulot.bloc": "{bloc} tient tout le reste" });
  assert.equal(t("analyse.goulot.bloc", {}), "{bloc} tient tout le reste");
});

test("the current locale follows the installed dictionary", () => {
  useDictionary({}, "en");
  assert.equal(currentLocale(), "en");
  useDictionary(DICTIONARY, DEFAULT_LOCALE);
  assert.equal(currentLocale(), DEFAULT_LOCALE);
});

test("a locale that is not one does not go looking for a file", async () => {
  await assert.rejects(() => useLocale("../../etc/passwd"), /langue invalide/);
  await assert.rejects(() => useLocale(""), /langue invalide/);
});

test("translating a page already written in its language leaves it untouched", () => {
  const page = { querySelectorAll: () => assert.fail("French is already on the page") };

  useDictionary(DICTIONARY, DEFAULT_LOCALE);
  translate(page);

  useDictionary(DICTIONARY, "en");
  assert.throws(() => translate(page), /French is already on the page/,
    "and in another language, it does have to walk the page");
});

test("every key the browser asks for exists in the dictionary", () => {
  const missing = [];
  const built = [];

  for (const path of sources()) {
    if (BUILT.test(read(path))) built.push(path);
    for (const key of asked(path)) {
      if (!(key in DICTIONARY)) missing.push(`${path} : ${key}`);
    }
  }

  assert.deepEqual(built, [], "a key assembled at runtime cannot be checked by anyone");
  assert.deepEqual(missing, [], "these keys would print verbatim on screen");
});

test("every key in the dictionary is asked for somewhere", () => {
  const all = new Set(sources().flatMap((path) => [...asked(path)]));
  const orphans = Object.keys(DICTIONARY).filter((key) => !all.has(key));

  assert.deepEqual(orphans, [],
    "a key nobody asks for anymore is a line translated for nothing");
});

/**
 * The pages that carry French of their own, waiting for the dictionary to be fetched.
 *
 * `data-i18n` marks an element whose text the dictionary replaces, and what sits inside it
 * meanwhile is what a reader sees for the first frame, and all of what a crawler sees.
 */
const PAGES = ["public/index.html", "public/outils/logique.html",
  "public/outils/planificateur.html"];

test("what a page shows before the dictionary arrives is what the dictionary says", () => {
  /* Two copies of a sentence drift, and the copy nobody tests is the one that drifts. It
     happened: three tool-page sentences kept an unaccented spelling months after the
     dictionary was corrected, and nothing showed it because the fix is invisible one frame
     later. Whitespace is not compared - the page wraps its paragraphs to fit a column. */
  const serre = (texte) => texte.trim().replace(/\s+/g, " ");
  const ecarts = [];

  for (const page of PAGES) {
    const source = read(page);
    for (const [, key, texte] of source.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]*)</g)) {
      if (!serre(texte)) continue;
      if (!(key in DICTIONARY)) continue;  // the test above is the one that says so
      if (serre(texte) !== serre(DICTIONARY[key])) {
        ecarts.push(`${page} ${key}\n    page : ${serre(texte)}`
          + `\n    dict : ${serre(DICTIONARY[key])}`);
      }
    }
  }

  assert.deepEqual(ecarts, [], `\n  ${ecarts.join("\n  ")}\n`);
});

test("the dictionary follows the naming convention", () => {
  const shape = new RegExp("^" + DOMAIN + "(?:[.][a-z0-9-]+){2,}$");
  const wrong = Object.keys(DICTIONARY).filter((key) => !shape.test(key));

  assert.deepEqual(wrong, [], "expected <domain>.<screen>.<element>");
});

test("the dictionary is sorted, so two branches can edit it without colliding", () => {
  const keys = Object.keys(DICTIONARY);
  assert.deepEqual(keys, [...keys].sort(),
    "sorted keys turn a merge conflict into one line instead of one file");
});

/** The holes in a line. */
function holesIn(line) {
  return [...line.matchAll(/\{(\w+)\}/g)].map(([, name]) => name).sort();
}

/**
 * What a translated dictionary is missing next to the one the site is written in.
 *
 * Two failures, and the second is the one nobody expects. A key a translation does not
 * define falls back to the key itself. A key it does define but whose holes it dropped is
 * worse: nothing is substituted, and the number that was going into the hole is gone from
 * the page without a trace.
 */
function localeGaps(reference, other) {
  const gaps = [];
  for (const [key, line] of Object.entries(reference)) {
    if (!(key in other)) { gaps.push(`${key} : absente`); continue; }
    const [mine, theirs] = [holesIn(line), holesIn(other[key])];
    if (String(mine) !== String(theirs)) {
      gaps.push(`${key} : trous differents, ${mine} contre ${theirs}`);
    }
  }
  for (const key of Object.keys(other)) {
    if (!(key in reference)) gaps.push(`${key} : en trop`);
  }
  return gaps;
}

test("keeps units as bare words, so a number never disappears", () => {
  /* A missing key renders the key, substituting nothing. A unit written `{n} cases` would
     therefore make the 160 disappear along with the word. Written as a bare word and stuck
     next to the number by the view, the degraded page reads `160 blocs.unite.cases`:
     unreadable, but not wrong.

     The rule stops at quantities. Interpolating a noun into a sentence stays free, because
     its absence is noticed. */
  const wrong = Object.entries(DICTIONARY)
    .filter(([key, line]) => key.includes(".unite.") && holesIn(line).length)
    .map(([key]) => key);

  assert.deepEqual(wrong, [], "a unit is a bare word the view sticks next to the number");
});

test("recognizes a translation with holes, on a made-up example", () => {
  /* The next test cannot prove anything as long as only one locale ships. This one shows
     the comparison actually bites, so we know the second locale will be watched by more
     than an empty loop. */
  const reference = { "blocs.page.debit": "{n} par seconde", "blocs.page.cout": "Cout" };

  assert.deepEqual(localeGaps(reference, reference), []);
  assert.deepEqual(localeGaps(reference, { "blocs.page.cout": "Cost" }),
    ["blocs.page.debit : absente"]);
  assert.deepEqual(
    localeGaps(reference, { "blocs.page.debit": "per second", "blocs.page.cout": "Cost" }),
    ["blocs.page.debit : trous differents, n contre "]);
  assert.deepEqual(localeGaps(reference, { ...reference, "blocs.page.orpheline": "x" }),
    ["blocs.page.orpheline : en trop"]);
});

test("ships every locale with the same keys and the same holes as French", () => {
  const others = readdirSync(at("public/forge/lang"))
    .filter((name) => name.endsWith(".json") && name !== `${DEFAULT_LOCALE}.json`);

  for (const name of others) {
    assert.deepEqual(localeGaps(DICTIONARY, JSON.parse(read(`public/forge/lang/${name}`))), [],
      `the ${name} locale has drifted`);
  }
});
