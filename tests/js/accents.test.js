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
  "refuse",   // "le jeu refuse" against "refusé"
  "consomme", // "il consomme" against "consommé"
  "clique",   // "Clique une bande" against "cliqué"
  "glisse",   // "glisse pour sélectionner" against "glissé"
  "survole",  // "Survole ou choisis" against "survolé"
  "branche",  // "où elle se branche" against "branché"
  "propose",  // "il propose" against "proposé"
  "vise",     // "ce saut vise" against "visé"
  "dilate",   // "se dilate" against "dilaté"
  "alimente", // "ce qui l'alimente" against "alimenté"
  "enregistre", // "il l'enregistre" against "enregistré"
  "aime",     // "j'aime" against "aimé"
  "affiche",  // "le chiffre s'affiche" against "affiché"
]);

/** A word, apostrophes and hyphens included: "lui-même" and "l'analyse" are one each. */
const MOT = /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]*/g;

/** The elisions French glues onto the front of a word: `l'`, `d'`, `qu'`, and the rest. */
const ELISION = /^(?:[cdjlmnst]|qu)'/i;

/**
 * The words of a sentence, with elisions taken off the front.
 *
 * `d'aperçu` is one token to the expression above, and that is what made this file miss an
 * `aria-label="Apercu de ..."` sitting three files away from a `pas d'aperçu`: the corpus
 * knew `d'aperçu` and was never asked about `aperçu`. The article is not part of the word.
 */
function mots(texte) {
  return (texte.match(MOT) ?? []).map((mot) => mot.replace(ELISION, ""))
    .filter((mot) => mot.length > 1);
}

/**
 * A sentence with everything that is not a sentence taken out.
 *
 * Four kinds of thing look like French words and are not, and each of them would be
 * forgiven for the wrong reason if it went into HOMOGRAPHES: the list is meant to hold real
 * French, and an identifier parked in it stops the check on a word that also is one. So
 * they come out here instead, structurally.
 *
 *   - `{debit}` and `${count}` are parameter names. `i18n.test.js` checks that a
 *     translation carries the same holes as the French, so accenting one empties the hole.
 *   - `class="range size"` and `id="to-editor"` are CSS and DOM names, in the HTML these
 *     files build as strings. `range` is not `rangé`, `active` is not `activé`.
 *   - `schema.comparer.par` is a translation key. `schema` there is not `schéma`, and
 *     forgiving it everywhere would forgive it in a sentence too, where it would be one.
 *   - `$recent` is a PHP variable.
 */
const sansTrous = (texte) => texte
  .replace(/\$\{[^{}]*\}/g, " ")
  .replace(/\{[^{}]*\}/g, " ")
  /* `aria-label` is deliberately absent from this list: it is read out loud, so it is
     French like any other, and an `aria-label="Apercu de ..."` is exactly the kind this
     file exists to catch. Only the aria attributes that carry a state or a reference go. */
  .replace(new RegExp('\\b(?:class|id|for|name|type|rel|href|src|viewBox|d|style'
    + '|data-[\\w-]+|aria-hidden|aria-pressed|aria-expanded|aria-controls'
    + '|aria-labelledby)="[^"]*"', "g"), " ")
  .replace(/\b[a-z][\w-]*(?:\.[a-z][\w-]*)+\b/gi, " ")
  .replace(/\$[A-Za-z_]\w*/g, " ");

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
      /* The expressions come out rather than cutting the sentence in two.
         Reading `>([^<>{}@]+)<` skipped every paragraph holding a `{{ }}`, which is most of
         the interesting ones: "il peut etre incomplet" sat in one for months, on the page
         with the most traffic on the site, invisible to this file. */
      const source = sansCode(lire(`${dossier}${entree.name}`))
        .replace(/\{\{--[\s\S]*?--\}\}/g, " ");
      for (const [, texte] of source.matchAll(/>([^<>]+)</g)) {
        prendre(texte.replace(/\{\{[\s\S]*?\}\}|\{!![\s\S]*?!!\}|@\w+/g, " "),
          `${prefixe}${entree.name}`);
      }
    }
  };
  parcourir("resources/views/", "");

  /* What the browser and the server say at the moment something goes wrong.
     An error message is French a reader meets on their worst day, and it is written in a
     string literal, where no scan of text nodes will ever find it: "Cette schematique n'a
     pas pu etre chargee" was there from the first day. Only strings that look like a
     sentence are kept, since a literal in this codebase is as often a key or a class. */
  const FRANCAIS = /(?<![\w-])(le|la|les|un|une|des|du|de|et|ou|qui|que|pas|sur|dans|pour|ce|il|elle|ne|se|est|sont|au|aux|en|par|plus|rien|tout|avec|sans|son|sa|ses|cette|tu|te|ton|quoi|quand|comme|leur|lui|on)(?![\w-])/i;

  const litteraux = (source) => [
    ...source.matchAll(/"((?:[^"\\\n]|\\.)*)"/g),
    ...source.matchAll(/'((?:[^'\\\n]|\\.)*)'/g),
    ...source.matchAll(/`((?:[^`\\]|\\.)*)`/g),
  ].map(([, texte]) => texte).filter((texte) => FRANCAIS.test(texte));

  const sansCommentaire = (source) => source
    .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

  const walk = (dossier, suffixe, prefixe) => {
    for (const entree of readdirSync(new URL(dossier, racine), { withFileTypes: true })) {
      if (entree.isDirectory()) walk(`${dossier}${entree.name}/`, suffixe, `${prefixe}${entree.name}/`);
      else if (entree.name.endsWith(suffixe)) {
        for (const texte of litteraux(sansCommentaire(lire(`${dossier}${entree.name}`)))) {
          prendre(texte, `${prefixe}${entree.name}`);
        }
      }
    }
  };
  walk("public/forge/", ".js", "");
  walk("app/", ".php", "app/");

  for (const nom of ["public/index.html", "public/outils/logique.html",
    "public/outils/planificateur.html"]) {
    for (const texte of litteraux(sansCommentaire(lire(nom)))) prendre(texte, nom);
  }

  return trouvees;
}

test("a word the site writes accented is never written bare next to it", () => {
  const textes = chaines();
  assert.ok(textes.length > 300, `only ${textes.length} strings read, the collection broke`);

  /* The vocabulary, from the same corpus that is being checked. A word is "known accented"
     as soon as one sentence spells it properly, which is the whole mechanism. */
  const connues = new Map();
  for (const [, texte] of textes) {
    for (const mot of mots(texte)) {
      if (!accentue(mot)) continue;
      const cle = nu(mot);
      if (!connues.has(cle)) connues.set(cle, new Set());
      connues.get(cle).add(mot.toLowerCase());
    }
  }

  const fautes = [];
  for (const [source, texte] of textes) {
    for (const mot of mots(texte)) {
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
  const juger = (texte) => mots(texte).filter((mot) =>
    !accentue(mot) && !HOMOGRAPHES.has(mot.toLowerCase()) && connues.has(nu(mot)));

  assert.deepEqual(juger("le reseau est plein"), ["reseau"]);
  assert.deepEqual(juger("le réseau est plein"), []);
  // "compte" is a verb as often as it is a past participle, so it stays out of the way.
  assert.deepEqual(juger("le programme en compte trois"), []);
});
