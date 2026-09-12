/**
 * A ratchet on the French still written into the report by hand.
 *
 * The report is the most-read code on the site and the least migrated: its cards were
 * built before there was a dictionary, and the migration is happening card by card. A
 * chantier like that has one failure mode, and it is not slowness -- it is that new strings
 * arrive faster than old ones leave, and what looked like a migration turns out to be a
 * debt with a nicer name.
 *
 * So this does not try to be a detector. Telling a displayed sentence from a class name
 * needs a parser, and a check that cries wolf gets switched off, which loses both the
 * check and the argument for having one. It counts instead, and refuses to let the count
 * grow.
 *
 * THE NUMBER ONLY EVER GOES DOWN. Lower it when you migrate a card. If your change raises
 * it, you have written a string where a key belongs: put it in `forge/lang/fr.json` and
 * call `t()` like its neighbours do. The failure prints what it found.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* Forty-two when this ratchet was set, after migrating three cards. The count has not
   dropped by as much: the logic card and the planner added some in the meantime. That is
   the argument for this file rather than against it -- a chantier losing ground while it
   is being drained does not need to go faster, it needs the tap shut.

   Thirty-seven since the bottleneck and waste cards moved to the dictionary. They did not
   move to lower this number: two of their sentences agreed in gender with a block name
   that supplies its own, so the page said « Foreuse Mécanique relié à rien » and « Eau
   arrive sans pouvoir être consommé ». A sentence that has to agree with a word it is
   handed cannot be written into the code around it.

   Thirty since the share card went to the top of the report. It was the oldest card in
   this file and the least touched, so it still carried its whole vocabulary in the markup:
   the two buttons, the three options of the visibility dropdown, both field labels and the
   sentence about overwriting. Rewriting a card is the cheap moment to migrate it, and the
   only one anybody ever takes.

   Twenty-five once five cards became one. "Une fois alimente a fond", "Branche comme il
   est", "Goulot", "Fabrique et consomme sur place" and "Ce qui se perd" were merged into
   the verdict and "Ce qu'il sort", and the three of them that still wrote their headings
   and their empty states by hand went with them. The strings did not move to lower this
   number; they had nowhere left to be.

   Twenty-one once the picture's legend went through the dictionary. It was migrated
   because the long explanation of why Forge asks where a schematic plugs in moved onto it
   from the ports card, and a sentence arriving from `fr.json` next to two written by hand
   is how a legend ends up half translated.

   Seventeen once marking left this file. The two buttons, the question about what arrives,
   the sentence about what comes out not being a choice and the one about a block with
   nothing to offer all went to `rapport/bulle.js`, through the dictionary, because a card
   being rewritten is the only moment anybody migrates its vocabulary.

   Thirteen once "Ce que dit le jeu" went the same way. Its comparison against the game's
   own panel was reworked, so its vocabulary went with it, and the sentence about overdrive
   projectors needed four keys rather than one: it agrees with two counts at once, and a
   single wording produced « 1 projecteurs couvrent 1 blocs » on the commonest case there
   is. */
const RESTANT = 13;

const MOTS = /(?<![\w-])(le|la|les|un|une|des|du|de|et|ou|qui|que|pas|sur|dans|pour|ce|il|elle|ne|se|est|sont|au|aux|en|par|plus|rien|tout|toute|avec|sans|son|sa|ses|cette|cet|tu|te|ton|ta|quoi|quand|comme|deja|encore|meme|leur|lui|on)(?![\w-])/i;

/** The report's rendered output, without its comments: a sentence in a comment does not display. */
function rapport() {
  const page = readFileSync(new URL("../../site/public/index.html", import.meta.url), "utf8");
  const lignes = page.split("\n");
  const debut = lignes.findIndex((l) => l.includes("const right = []"));
  const fin = lignes.findIndex((l) => l.includes("async function whoAmI"));
  assert.ok(debut > 0 && fin > debut, "the report's rendered output changed shape, update its bounds");

  return lignes.slice(debut, fin).join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

/**
 * The French sentences the code writes in by hand.
 *
 * Tags are stripped before comparison: a sentence must not count as a different one
 * because a style attribute moved, or the count would shift without anything having
 * been added, and the guard would turn into noise.
 */
function enDur(source) {
  const trouve = new Set();
  const morceaux = source.match(/>[^<>]{6,}?<|"[^"]{6,}?"|`[^`]{6,}?`/g) || [];

  for (const brut of morceaux) {
    const sansBalise = brut.slice(1, -1).replace(/<[^>]*>/g, " ");
    for (const bout of sansBalise.split(/[{}`]|\$\{/)) {
      const phrase = bout.replace(/\s+/g, " ").trim().replace(/^[^\wÀ-ÿ]+|[^\wÀ-ÿ.!?]+$/g, "");
      if (phrase.length >= 12 && MOTS.test(phrase) && !phrase.includes("=") && !phrase.includes('"')) {
        trouve.add(phrase);
      }
    }
  }
  return [...trouve].sort();
}

test("the hardcoded French in the report does not creep back up", () => {
  const restant = enDur(rapport());

  assert.ok(restant.length <= RESTANT,
    `${restant.length} hardcoded strings, the ratchet is at ${RESTANT}. Added:\n  `
    + restant.slice(RESTANT).join("\n  "));

  assert.equal(restant.length, RESTANT,
    `only ${restant.length} hardcoded strings left: lower the ratchet to ${restant.length}`);
});

test("the ratchet counts sentences, not markup", () => {
  /* Without this test the ratchet can drift unnoticed: a sentence captured together with
     its surrounding tag counts as a different sentence the moment the style changes. */
  const avec = enDur(`<p class="hint-line" style="margin:0">Rien de marque pour l'instant.</p>`);
  const sans = enDur(`<p>Rien de marque pour l'instant.</p>`);

  assert.deepEqual(avec, ["Rien de marque pour l'instant."]);
  assert.deepEqual(avec, sans, "style must not change what gets counted");
});

test("the ratchet sees an added string, and ignores a key", () => {
  const avant = enDur(`<h2>Il lui faut</h2>`);
  const apres = enDur(`<h2>Il lui faut</h2><p>Cette phrase est ecrite a la main.</p>`);
  assert.equal(apres.length, avant.length + 1, "an added sentence must count");

  assert.deepEqual(enDur(`<h2>${'${escape(t("analyse.besoins.titre"))}'}</h2>`), [],
    "a key passed through t() does not count");
});
