/**
 * The dictionary, and the promise that it covers what the site actually says.
 *
 * The lookup itself is small enough to read, so most of this file is the other test: every
 * key the browser code asks for has to exist, and every key that exists has to be asked
 * for. Without it a missing string is found in production, in a language nobody here
 * reads, which is exactly the failure this whole mechanism was built to make impossible.
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

/* The domains the naming convention allows, from docs/fonctionnalites.md. A key outside
   them is a typo or an invention, and both are worth failing on. */
const DOMAINS = ["nav", "vitrine", "schema", "analyse", "edition", "outils", "blocs", "compte"];
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

  /* Parcourus plutot que nommes un a un : il arrive une page par chantier de parite, et
     une page oubliee ici est une page dont personne ne verifie les cles. */
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

test("une cle demandee rend sa ligne, et ses trous sont remplis", () => {
  useDictionary({
    "analyse.goulot.titre": "Le goulot",
    "analyse.goulot.bloc": "{bloc} tient tout le reste",
  });

  assert.equal(t("analyse.goulot.titre"), "Le goulot");
  assert.equal(t("analyse.goulot.bloc", { bloc: "conveyor" }), "conveyor tient tout le reste");
});

test("une cle absente se lit a l'ecran plutot que de disparaitre", () => {
  useDictionary({});
  assert.equal(t("analyse.goulot.titre"), "analyse.goulot.titre",
    "une chaine vide serait un bug que personne ne signale");
});

test("un trou qu'on a oublie de remplir se voit aussi", () => {
  useDictionary({ "analyse.goulot.bloc": "{bloc} tient tout le reste" });
  assert.equal(t("analyse.goulot.bloc", {}), "{bloc} tient tout le reste");
});

test("la langue courante suit le dictionnaire installe", () => {
  useDictionary({}, "en");
  assert.equal(currentLocale(), "en");
  useDictionary(DICTIONARY, DEFAULT_LOCALE);
  assert.equal(currentLocale(), DEFAULT_LOCALE);
});

test("une langue qui n'en est pas une ne part pas chercher un fichier", async () => {
  await assert.rejects(() => useLocale("../../etc/passwd"), /langue invalide/);
  await assert.rejects(() => useLocale(""), /langue invalide/);
});

test("traduire une page deja ecrite dans sa langue ne la touche pas", () => {
  const page = { querySelectorAll: () => assert.fail("le francais est deja dans la page") };

  useDictionary(DICTIONARY, DEFAULT_LOCALE);
  translate(page);

  useDictionary(DICTIONARY, "en");
  assert.throws(() => translate(page), /le francais est deja dans la page/,
    "et dans une autre langue, il faut bien qu'il la parcoure");
});

test("toute cle demandee par le navigateur existe dans le dictionnaire", () => {
  const missing = [];
  const built = [];

  for (const path of sources()) {
    if (BUILT.test(read(path))) built.push(path);
    for (const key of asked(path)) {
      if (!(key in DICTIONARY)) missing.push(`${path} : ${key}`);
    }
  }

  assert.deepEqual(built, [], "une cle assemblee a l'execution ne peut etre verifiee par personne");
  assert.deepEqual(missing, [], "ces cles seraient imprimees telles quelles a l'ecran");
});

test("toute cle du dictionnaire est demandee quelque part", () => {
  const all = new Set(sources().flatMap((path) => [...asked(path)]));
  const orphans = Object.keys(DICTIONARY).filter((key) => !all.has(key));

  assert.deepEqual(orphans, [],
    "une cle que plus personne ne demande est une ligne a faire traduire pour rien");
});

test("le dictionnaire respecte la convention de nommage", () => {
  const shape = new RegExp("^" + DOMAIN + "(?:[.][a-z0-9-]+){2,}$");
  const wrong = Object.keys(DICTIONARY).filter((key) => !shape.test(key));

  assert.deepEqual(wrong, [], "attendu <domaine>.<ecran>.<element>");
});

test("le dictionnaire est range, pour que deux voies le modifient sans se croiser", () => {
  const keys = Object.keys(DICTIONARY);
  assert.deepEqual(keys, [...keys].sort(),
    "des cles triees, c'est un conflit de fusion par ligne au lieu d'un par fichier");
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

test("garde les unites en mots nus, pour qu'un chiffre ne disparaisse jamais", () => {
  /* Une cle absente rend la cle, sans rien substituer. Une unite ecrite `{n} cases` ferait
     donc disparaitre le 160 et pas le mot. Ecrite en mot nu et accolee au nombre par la
     vue, la page degradee dit `160 blocs.unite.cases` : illisible, mais pas faux.

     La regle s'arrete aux quantites. Interpoler un nom dans une phrase reste libre, parce
     que son absence se voit. */
  const wrong = Object.entries(DICTIONARY)
    .filter(([key, line]) => key.includes(".unite.") && holesIn(line).length)
    .map(([key]) => key);

  assert.deepEqual(wrong, [], "une unite est un mot nu que la vue accole au nombre");
});

test("sait reconnaitre une traduction trouee, sur un exemple fabrique", () => {
  /* Le test suivant ne peut rien prouver tant qu'une seule langue est livree. Celui-ci
     montre que la comparaison mord, pour qu'on sache que la deuxieme sera surveillee par
     autre chose qu'une boucle vide. */
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

test("livre chaque langue avec les memes cles et les memes trous que le francais", () => {
  const others = readdirSync(at("public/forge/lang"))
    .filter((name) => name.endsWith(".json") && name !== `${DEFAULT_LOCALE}.json`);

  for (const name of others) {
    assert.deepEqual(localeGaps(DICTIONARY, JSON.parse(read(`public/forge/lang/${name}`))), [],
      `la langue ${name} a derive`);
  }
});
