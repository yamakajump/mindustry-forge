/**
 * Combien de temps un programme met, et le champ qu'on refuse d'employer pour le dire.
 *
 * Le catalogue porte deux plafonds de vitesse et un seul compte. `instructions_per_tick` est
 * ce que `updateTile` execute ; `max_instructions_per_tick` est ce a quoi `setrate` a le
 * droit de monter, et `updateTile` remet la vitesse a celle du bloc **a chaque tick** sur
 * tout ce qui n'est pas privilegie. Sur les trois processeurs qu'une schematique peut
 * contenir, ce second plafond n'est donc jamais atteint par quoi que ce soit.
 *
 * Le prendre pour l'autre donnerait une page qui annonce quarante lignes par tick sur un
 * micro processeur qui en fait deux : vingt fois trop, et vrai nulle part. C'est le genre
 * d'erreur qu'un nom de champ plausible fait commettre, donc elle est testee.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { useCatalogue } from "../../../site/public/forge/logic/catalogue.js";
import { timingOf, ticksAsText, secondsAsText }
  from "../../../site/public/forge/logic/timing.js";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const catalogue = useCatalogue(JSON.parse(read("site/public/forge/logic/instructions.json")));

test("les vitesses viennent du jeu, pas d'une table ecrite ici", () => {
  const game = JSON.parse(read("bench/data/blocks.json")).blocks;
  for (const processor of catalogue.processors) {
    assert.equal(processor.instructions_per_tick, game[processor.name].instructions_per_tick,
      `${processor.name} : la vitesse`);
    assert.equal(processor.max_instruction_scale, game[processor.name].max_instruction_scale,
      `${processor.name} : le plafond de rattrapage`);
  }
});

test("le plafond que setrate vise n'est pas dans le catalogue de la page", () => {
  /* Present dans le dump du jeu, volontairement absent d'ici. Un champ qui ne s'applique
     qu'au processeur du monde, dans une page qui ne peut pas en produire un, est un nombre
     que quelqu'un finit par afficher. */
  const game = JSON.parse(read("bench/data/blocks.json")).blocks;
  assert.equal(game["micro-processor"].max_instructions_per_tick, 40,
    "le champ existe bien cote jeu, sinon ce test ne garde rien");

  for (const processor of catalogue.processors) {
    assert.ok(!("max_instructions_per_tick" in processor),
      `${processor.name} porte un plafond qu'aucun de ses programmes n'atteint`);
  }
});

test("un passage compte la vitesse du processeur choisi", () => {
  assert.equal(timingOf("micro-processor", 100).ticks, 50);
  assert.equal(timingOf("logic-processor", 100).ticks, 12.5);
  assert.equal(timingOf("hyper-processor", 100).ticks, 4);
});

test("le reste d'un tick n'est pas arrondi vers le haut", () => {
  /* L'accumulateur garde le credit d'un tick a l'autre, donc neuf instructions a deux par
     tick font quatre ticks et demi, pas cinq. Arrondir ici ferait dire a la page qu'un
     programme est onze pour cent plus lent qu'il n'est. */
  assert.equal(timingOf("micro-processor", 9).ticks, 4.5);
});

test("la rafale est cinq ticks de budget, et pas cinq instructions", () => {
  assert.equal(timingOf("micro-processor", 1).burst, 10);
  assert.equal(timingOf("logic-processor", 1).burst, 40);
  assert.equal(timingOf("hyper-processor", 1).burst, 125);
});

test("un programme vide et un bloc inconnu ne rendent rien plutot que zero", () => {
  assert.equal(timingOf("micro-processor", 0), null);
  assert.equal(timingOf("router", 100), null);
});

test("les durees se lisent a la precision qui sert", () => {
  assert.equal(ticksAsText(4.5), "4,5");
  assert.equal(ticksAsText(203.7), "204");
  assert.equal(secondsAsText(0.075), "75 ms");
  assert.equal(secondsAsText(3.4), "3,4 s");
  assert.equal(secondsAsText(42.6), "43 s");
});
