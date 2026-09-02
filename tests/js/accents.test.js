/**
 * The accent a French sentence lost on the way in.
 *
 * `AGENTS.md` says accents are written, in both languages, and the font carries them. What
 * it cannot say is how they go missing: nobody decides to write "reseau". A sentence gets
 * typed on a keyboard that is not the usual one, or pasted out of a terminal that flattened
 * it, and it lands next to twenty sentences that are spelled properly. One pass over the
 * site fixed thirty of them and left fifty behind, which is the whole argument for this
 * file: a language rule nothing checks is a language rule that decays.
 *
 * The check needs no dictionary, because the site is one. Almost every word here is already
 * written accented somewhere, so a bare "reseau" next to four "réseau" is a typo and not a
 * choice, and the corpus is what says so. That also fixes the failure mode of a word list:
 * a list has to be maintained, and an unmaintained list is a check that quietly stops
 * seeing new words.
 *
 * TWO THINGS IT CANNOT SEE, said plainly so nobody trusts it further than it goes.
 *
 * A word the site only ever writes once, wrongly, has no accented neighbour to be measured
 * against: "Moderation" as a page title was found by reading, not by this. And a word whose
 * two spellings are both French - "mesure" and "mesuré", "cote" and "côté" - is listed in
 * HOMOGRAPHES below and deliberately let through, because failing on those would cry wolf
 * on ordinary sentences, and a check that cries wolf gets switched off.
 *
 * When this fails: read the sentence. If the accent is missing, write it. If the word is a
 * real French word that happens to look like an accented one, add it to HOMOGRAPHES with
 * the reason, in one line.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const racine = new URL("../../site/", import.meta.url);

/**
 * Words French writes both ways, so neither spelling can be called a mistake here.
 *
 * Each one is a pair of real words the site actually uses on both sides. Keeping the reason
 * next to the word is what stops this list from becoming the place where a typo goes to be
 * forgiven.
 */
const HOMOGRAPHES = new Set([
  "a",        // "il a" against "à"
  "la",       // the article against "là"
  "ou",       // "ou bien" against "où"
  "de", "du", "des",  // the articles against the die, "dû", "dés"
  "ce", "se", "ma", "sa", "ne",
  "sur",      // "sur le plan" against "sûr"
  "cote", "cotes",        // a mark on a drawing against "côté" and "côte"
  "mesure", "mesures",    // "il mesure" against "mesuré"
  "compte", "comptes",    // "il compte" against "compté"
  "pose", "poses",        // "il pose" against "posé"
  "marque", "marques",    // "il marque" against "marqué"
  "garde", "gardes",      // "il garde" against "gardé"
  "publie", "publies",    // "publie-le" against "publié"
  "copie", "copies",      // "il copie" against "copié"
  "calcule", "calcules",  // "il calcule" against "calculé"
  "importe",  // "peu importe" against "importé"
  "marche",   // "il marche" against "marché"
  "note", "notes",        // "ma note" against "noté"
  "page", "pages",        // the page against "pagé", which the sheet spells accented
  "tache", "taches",      // an ore patch against "tâche"
  "rate",     // "il rate" against "raté"
  "prive",    // "il prive" against "privé"
  "cle",      // the identifier `cle` against "clé"
  "suite",    // "la suite" against "suité"
  "programme", "programmes",  // "le programme" against "programmé"
  "filtre", "filtres",        // "ce filtre" against "filtré"
  "indique", "indiques",      // "indique ici" against "indiqué"
]);

/** A word, apostrophes and hyphens included: "lui-même" and "l'analyse" are one each. */
const MOT = /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]*/g;

/**
 * A sentence with its parameter names taken out.
 *
 * `{debit}` is a key, not a word: `i18n.test.js` checks that a translation carries the same
 * holes as the French, so accenting one silently empties the hole it was meant to fill.
 */
const sansTrous = (texte) => texte.replace(/\{[^{}]*\}/g, " ");

const accentue = (mot) => /[À-ÿ]/.test(mot);

/** The word stripped of its accents, which is what makes two spellings comparable. */
const nu = (mot) => mot.toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "");

const lire = (chemin) => readFileSync(new URL(chemin, racine), "utf8");

/** Script and style hold code, and code is written in English. */
const sansCode = (source) => source.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ");

/**
 * Everything a player reads, with where it was found.
 *
 * The dictionary and the language files are read as values only: a key like `page.cout` is
 * an identifier, and asking it to carry an accent would be asking for a broken lookup.
 */
function chaines() {
  const trouvees = [];
  const prendre = (texte, source) => {
    if (texte && /[A-Za-zÀ-ÿ]{3}/.test(texte)) trouvees.push([source, sansTrous(texte)]);
  };

  const dictionnaire = JSON.parse(lire("public/forge/lang/fr.json"));
  for (const [cle, valeur] of Object.entries(dictionnaire)) {
    if (typeof valeur === "string") prendre(valeur, `fr.json ${cle}`);
  }

  for (const nom of readdirSync(new URL("lang/fr/", racine))) {
    const source = sansCode(lire(`lang/fr/${nom}`))
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^\s*\/\/.*$/gm, " ");
    for (const [, valeur] of source.matchAll(/=>\s*'((?:[^'\\]|\\.)*)'/g)) {
      prendre(valeur.replace(/\\'/g, "'"), `lang/fr/${nom}`);
    }
    for (const [, valeur] of source.matchAll(/=>\s*"((?:[^"\\]|\\.)*)"/g)) {
      prendre(valeur, `lang/fr/${nom}`);
    }
  }

  for (const nom of ["public/index.html", "public/outils/logique.html",
    "public/outils/planificateur.html"]) {
    const source = sansCode(lire(nom));
    for (const [, texte] of source.matchAll(/>([^<>{}]+)</g)) prendre(texte, nom);
    for (const [, , valeur] of
      source.matchAll(/\b(title|placeholder|aria-label|alt)="([^"{}]+)"/g)) {
      prendre(valeur, nom);
    }
  }

  const parcourir = (dossier, prefixe) => {
    for (const entree of readdirSync(new URL(dossier, racine), { withFileTypes: true })) {
      if (entree.isDirectory()) {
        parcourir(`${dossier}${entree.name}/`, `${prefixe}${entree.name}/`);
        continue;
      }
      if (!entree.name.endsWith(".blade.php")) continue;
      // `{{ }}` and `@if` hold PHP, so a text run is cut at either of them.
      const source = sansCode(lire(`${dossier}${entree.name}`));
      for (const [, texte] of source.matchAll(/>([^<>{}@]+)</g)) {
        prendre(texte, `${prefixe}${entree.name}`);
      }
    }
  };
  parcourir("resources/views/", "");

  return trouvees;
}

test("a word the site writes accented is never written bare next to it", () => {
  const textes = chaines();
  assert.ok(textes.length > 300, `only ${textes.length} strings read, the collection broke`);

  /* The vocabulary, from the same corpus that is being checked. A word is "known accented"
     as soon as one sentence spells it properly, which is the whole mechanism. */
  const connues = new Map();
  for (const [, texte] of textes) {
    for (const mot of texte.match(MOT) ?? []) {
      if (!accentue(mot)) continue;
      const cle = nu(mot);
      if (!connues.has(cle)) connues.set(cle, new Set());
      connues.get(cle).add(mot.toLowerCase());
    }
  }

  const fautes = [];
  for (const [source, texte] of textes) {
    for (const mot of texte.match(MOT) ?? []) {
      if (accentue(mot) || HOMOGRAPHES.has(mot.toLowerCase())) continue;
      const bonnes = connues.get(nu(mot));
      if (!bonnes) continue;
      fautes.push(`${source}: « ${mot} » where the site writes «`
        + ` ${[...bonnes].join(" / ")} » -- ${texte.trim().replace(/\s+/g, " ").slice(0, 110)}`);
    }
  }

  assert.deepEqual(fautes, [], `\n  ${fautes.join("\n  ")}\n`);
});

test("it sees a missing accent, and lets a real homograph through", () => {
  const connues = new Map([["reseau", new Set(["réseau"])], ["compte", new Set(["compté"])]]);
  const juger = (texte) => (texte.match(MOT) ?? []).filter((mot) =>
    !accentue(mot) && !HOMOGRAPHES.has(mot.toLowerCase()) && connues.has(nu(mot)));

  assert.deepEqual(juger("le reseau est plein"), ["reseau"]);
  assert.deepEqual(juger("le réseau est plein"), []);
  // "compte" is a verb as often as it is a past participle, so it stays out of the way.
  assert.deepEqual(juger("le programme en compte trois"), []);
});
