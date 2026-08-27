/**
 * Les deux tables de l'editeur qu'un test statique ne peut pas suivre.
 *
 * `tests/js/i18n.test.js` verifie le gros du travail : toute cle ecrite quelque part existe
 * dans le dictionnaire, toute cle du dictionnaire est demandee quelque part, et aucune cle
 * n'est assemblee a l'execution. Depuis que les cles de cet outil sont ecrites entieres,
 * il les couvre toutes.
 *
 * Reste ce qu'il ne peut pas voir : les deux endroits ou une cle est choisie **par une
 * valeur** plutot qu'ecrite sur place. Les suggestions passent par `KINDS[entry.kind]`, et
 * les diagnostics par la cle que l'analyseur a mise dans le probleme. Dans les deux cas une
 * valeur nouvelle sans sa cle donne `t(undefined)`, ce qui n'echoue nulle part et affiche
 * du vide a un joueur.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { KINDS } from "../../../site/public/forge/logic/editor.js";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const DICTIONARY = JSON.parse(read("site/public/forge/lang/fr.json"));

test("chaque famille de suggestion a une etiquette", () => {
  /* Les familles telles que l'editeur les emploie vraiment, relues dans ses appels a
     `add`, et pas telles que `KINDS` les declare : c'est justement l'ecart entre les deux
     qui ferait le trou. */
  const source = read("site/public/forge/logic/editor.js");
  const used = new Set([...source.matchAll(/add\([^;]*?, "(\w+)",/g)]
    .map((found) => found[1]));
  used.add("monde");                       // choisie par un ternaire, pas par un litteral

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

  /* Les deux sens, et pas de compte attendu ecrit ici : un nombre en dur dans un test se
     met a jour sans reflechir des la premiere fois qu'il gene. */
  assert.deepEqual([...produced].sort(), [...written].sort(),
    "un diagnostic sans phrase s'afficherait vide, une phrase sans diagnostic est morte");
});
