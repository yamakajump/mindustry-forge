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

/* Quarante-deux au moment ou ce cliquet est pose, apres la migration de trois cartes.
   Le compte n'a pas baisse d'autant : la carte logique et le planificateur en ont ajoute
   pendant ce temps. C'est l'argument pour ce fichier plutot que contre lui -- un chantier
   qui perd du terrain pendant qu'on le vide n'a pas besoin d'aller plus vite, il a besoin
   qu'on ferme le robinet. */
const RESTANT = 42;

const MOTS = /(?<![\w-])(le|la|les|un|une|des|du|de|et|ou|qui|que|pas|sur|dans|pour|ce|il|elle|ne|se|est|sont|au|aux|en|par|plus|rien|tout|toute|avec|sans|son|sa|ses|cette|cet|tu|te|ton|ta|quoi|quand|comme|deja|encore|meme|leur|lui|on)(?![\w-])/i;

/** Le rendu du rapport, sans ses commentaires : une phrase en commentaire ne s'affiche pas. */
function rapport() {
  const page = readFileSync(new URL("../../site/public/index.html", import.meta.url), "utf8");
  const lignes = page.split("\n");
  const debut = lignes.findIndex((l) => l.includes("const right = []"));
  const fin = lignes.findIndex((l) => l.includes("async function whoAmI"));
  assert.ok(debut > 0 && fin > debut, "le rendu du rapport a change de forme, releve ses bornes");

  return lignes.slice(debut, fin).join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

/**
 * Les phrases francaises que le code pose lui-meme.
 *
 * Les balises sont retirees avant comparaison : une phrase ne doit pas compter pour une
 * autre parce qu'on a deplace un style, sinon le compte bouge sans que rien n'ait ete
 * ajoute et le garde-fou devient du bruit.
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

test("le francais ecrit en dur dans le rapport ne remonte pas", () => {
  const restant = enDur(rapport());

  assert.ok(restant.length <= RESTANT,
    `${restant.length} chaines en dur, le cliquet est a ${RESTANT}. Ajoutees :\n  `
    + restant.slice(RESTANT).join("\n  "));

  assert.equal(restant.length, RESTANT,
    `plus que ${restant.length} chaines en dur : descends le cliquet a ${restant.length}`);
});

test("le cliquet compte des phrases et pas du balisage", () => {
  /* Sans ce test le cliquet peut se derégler sans qu'on le voie : une phrase capturee avec
     sa balise autour compte pour une phrase differente des qu'on touche au style. */
  const avec = enDur(`<p class="hint-line" style="margin:0">Rien de marque pour l'instant.</p>`);
  const sans = enDur(`<p>Rien de marque pour l'instant.</p>`);

  assert.deepEqual(avec, ["Rien de marque pour l'instant."]);
  assert.deepEqual(avec, sans, "le style ne doit pas changer ce qui est compte");
});

test("le cliquet voit une chaine ajoutee, et ignore une cle", () => {
  const avant = enDur(`<h2>Il lui faut</h2>`);
  const apres = enDur(`<h2>Il lui faut</h2><p>Cette phrase est ecrite a la main.</p>`);
  assert.equal(apres.length, avant.length + 1, "une phrase ajoutee doit compter");

  assert.deepEqual(enDur(`<h2>${'${escape(t("analyse.besoins.titre"))}'}</h2>`), [],
    "une cle passee par t() ne compte pas");
});
