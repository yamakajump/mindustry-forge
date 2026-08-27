/**
 * Le pont entre la commande artisan et l'analyse du navigateur.
 *
 * `tools/ingest.mjs` ne calcule rien : il importe `analyse.js` telle quelle et lui passe
 * les schematiques que le collecteur a ramenees. Ce qui se teste ici n'est donc pas
 * l'arithmetique - elle a ses propres tests, et le banc derriere eux - mais le contrat que
 * le cote PHP suppose : une ligne entre, une ligne sort, une ligne qui explose n'emporte
 * pas les autres, et ce qui sort tient dans une colonne JSON.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { paste } from "./helpers.js";

const SCRIPT = fileURLToPath(new URL("../../tools/ingest.mjs", import.meta.url));

/** Faire tourner le script comme la commande artisan le fait : par son entree standard. */
const run = (lines) =>
  execFileSync(process.execPath, [SCRIPT], { input: `${lines.join("\n")}\n`, encoding: "utf8" })
    .trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));

const PANELS = paste([[0, 0, "solar-panel"], [1, 0, "solar-panel"]], "deux panneaux");

test("une ligne entre, une ligne sort, avec les chiffres que la base indexe", () => {
  const [out] = run([JSON.stringify({ id: 7, code: PANELS })]);

  assert.equal(out.id, 7);
  assert.equal(out.analyse.blocks, 2);
  assert.equal(out.analyse.width, 2);
  /* Les quatre champs que `Schematic::fromAnalysis` va chercher. S'ils changent de nom
     ici, quinze mille lignes se remplissent de zeros sans que rien ne proteste. */
  for (const key of ["perMinute", "needs", "potential", "height"]) {
    assert.ok(key in out.analyse, `${key} manque`);
  }
  assert.equal(out.analyse.potential.made, 14.4, "deux panneaux");
});

test("ce qui sort est serialisable et reste petit", () => {
  /* La reponse de `analyse()` porte `graph` et `tiles`, ou les noeuds se pointent les uns
     les autres : la garder entiere ne serait pas seulement enorme, `JSON.stringify` part
     en boucle dessus. Et `offers` propose une liste de ressources par case, ce qui sur
     quinze mille schematiques fait des centaines de megaoctets que personne ne relit. */
  const [out] = run([JSON.stringify({ id: 1, code: PANELS })]);

  for (const dropped of ["graph", "tiles", "detail", "offers", "ports", "feeds"]) {
    assert.ok(!(dropped in out.analyse), `${dropped} aurait du etre laisse de cote`);
  }
  assert.ok(JSON.stringify(out.analyse).length < 8000);
});

test("une schematique illisible ne tue pas le lot", () => {
  /* Sur quinze mille entrees collectees ailleurs il y aura des blocs de mods jamais vus et
     des fichiers tronques. Un lot qui meurt sur la premiere ferait recommencer les
     quarante-neuf autres, indefiniment. */
  const out = run([
    JSON.stringify({ id: 1, code: PANELS }),
    JSON.stringify({ id: 2, code: "ceci n est pas du base64" }),
    JSON.stringify({ id: 3, code: PANELS }),
  ]);

  assert.equal(out.length, 3, "trois entrees, trois reponses");
  assert.ok(out[0].analyse);
  assert.ok(out[1].erreur, "la deuxieme dit pourquoi");
  assert.ok(!out[1].analyse);
  assert.ok(out[2].analyse, "et la troisieme est passee quand meme");
});

test("une ligne qui n est meme pas du JSON est signalee, pas avalee", () => {
  // Sans reponse, le cote PHP ne saurait pas quoi faire de la ligne et la reprendrait pour
  // toujours. Une reponse sans identifiant est au moins une reponse.
  const out = run(["{ceci n est pas du json", JSON.stringify({ id: 9, code: PANELS })]);

  assert.equal(out.length, 2);
  assert.equal(out[0].id, null);
  assert.ok(out[0].erreur);
  assert.equal(out[1].id, 9);
});
