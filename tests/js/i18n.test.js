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
 * Every browser source that could name a key: the modules, and the static page.
 *
 * `i18n.js` is not one of them. It is the mechanism, not a caller, and the keys in its
 * documentation are examples of the shape rather than strings anyone puts on screen.
 */
function sources() {
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(at(dir))) {
      const path = `${dir}/${name}`;
      if (statSync(at(path)).isDirectory()) {
        if (name !== "lang") walk(path);
      } else if (name.endsWith(".js") && name !== "i18n.js") {
        found.push(path);
      }
    }
  };
  walk("public/forge");
  found.push("public/index.html");
  /* Les pages d'outils, qui portent leur script dans la page comme l'analyseur porte le
     sien. Parcourues plutot que nommees une a une : il en arrive une par chantier de
     parite, et une page oubliee ici est une page dont personne ne verifie les cles. */
  for (const name of readdirSync(at("public/outils"))) {
    if (name.endsWith(".html")) found.push(`public/outils/${name}`);
  }
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
