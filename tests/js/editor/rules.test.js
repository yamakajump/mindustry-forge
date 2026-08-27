/**
 * Ce que le jeu accepte qu'on pose, et ce qu'il refuse.
 *
 * Les règles viennent de `Build.validPlace`, `Block.canReplace`, `Drill.canMine` et
 * `Pump.canPlaceOn` de la v159.7. Celle qui commande les autres n'est pas du jeu : une
 * case sans sol peint n'a aucune règle. Un éditeur qui refuserait une foreuse sur une
 * toile vierge sous prétexte qu'il n'y voit pas de minerai serait un éditeur où l'on ne
 * peut rien construire.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { createBoard } from "../../../site/public/forge/editor/state.js";
import { canPlace } from "../../../site/public/forge/editor/rules.js";
import { loadCatalogue } from "../helpers.js";

const known = loadCatalogue();
const sizeOf = (name) => known.blocks[name]?.size || 1;
const board = (tiles = [], ground = {}) => createBoard({ tiles, ground, sizeOf });
const put = (plateau, plan) => canPlace(plateau, { rotation: 0, ...plan }, known);

/** Les quatre cases d'un bloc de deux, peintes du même sol. */
const carre = (layers) => ({
  "0,0": { ...layers }, "1,0": { ...layers },
  "0,1": { ...layers }, "1,1": { ...layers },
});

test("sans sol peint, tout se pose", () => {
  const plateau = board();
  assert.equal(put(plateau, { x: 0, y: 0, block: "mechanical-drill" }).ok, true);
  assert.equal(put(plateau, { x: 9, y: 9, block: "mechanical-pump" }).ok, true);
});

test("un refus porte toujours une raison lisible", () => {
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 0 }]);
  const refus = put(plateau, { x: 0, y: 0, block: "graphite-press" });
  assert.equal(refus.ok, false);
  assert.match(refus.why, /\S/);
});

test("un convoyeur remplace un convoyeur", () => {
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 0 }]);
  assert.equal(put(plateau, { x: 0, y: 0, block: "titanium-conveyor" }).ok, true);
});

test("une presse ne remplace pas un convoyeur", () => {
  // Groupes differents : la presse est dans `none`, la bande dans `transportation`.
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 0 }]);
  assert.equal(put(plateau, { x: 0, y: 0, block: "graphite-press" }).ok, false);
});

test("un coeur ne se remplace par rien, il est marque irremplacable", () => {
  const plateau = board([{ x: 0, y: 0, block: "core-shard", rotation: 0 }]);
  assert.equal(put(plateau, { x: 0, y: 0, block: "core-foundation" }).ok, false);
});

test("au dela de 64 tuiles, le jeu ne suit plus, et la raison le dit", () => {
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 0 }]);
  const refus = put(plateau, { x: 64, y: 0, block: "conveyor" });
  assert.equal(refus.ok, false);
  assert.match(refus.why, /64/);
});

test("rien ne se batit sur un mur", () => {
  const plateau = board([], { "0,0": { floor: "stone", wall: "stone-wall" } });
  assert.equal(put(plateau, { x: 0, y: 0, block: "conveyor" }).ok, false);
});

test("un liquide profond ne porte que ce qui flotte", () => {
  const plateau = board([], carre({ floor: "deep-water" }));
  assert.equal(put(plateau, { x: 0, y: 0, block: "conveyor" }).ok, false);
  // La thermogeneratrice est le seul bloc `floating` du jeu.
  assert.equal(put(plateau, { x: 0, y: 0, block: "thermal-generator" }).ok, true);
});

test("un liquide peu profond porte tout le monde", () => {
  const plateau = board([], carre({ floor: "sand-water" }));
  assert.equal(put(plateau, { x: 0, y: 0, block: "conveyor" }).ok, true);
});

test("une foreuse veut du minerai sous elle", () => {
  const nu = board([], carre({ floor: "stone" }));
  assert.equal(put(nu, { x: 0, y: 0, block: "mechanical-drill" }).ok, false);

  const avec = board([], { ...carre({ floor: "stone" }),
                           "0,0": { floor: "stone", overlay: "ore-copper" } });
  assert.equal(put(avec, { x: 0, y: 0, block: "mechanical-drill" }).ok, true);
});

test("une foreuse mecanique ne creuse pas le titane, sa durete la depasse", () => {
  const titane = board([], { ...carre({ floor: "stone" }),
                             "0,0": { floor: "stone", overlay: "ore-titanium" } });
  // Palier 2 de la foreuse mecanique contre durete 3 du titane.
  assert.equal(put(titane, { x: 0, y: 0, block: "mechanical-drill" }).ok, false);
  assert.equal(put(titane, { x: 0, y: 0, block: "pneumatic-drill" }).ok, true);
});

test("une foreuse sur une case non peinte reste acceptee", () => {
  // Une seule des quatre cases est decrite, et elle est nue. Le terrain sous les trois
  // autres est inconnu, donc rien ne permet de dire que la foreuse ne creusera rien.
  const plateau = board([], { "0,0": { floor: "stone" } });
  assert.equal(put(plateau, { x: 0, y: 0, block: "mechanical-drill" }).ok, true);
});

test("une pompe veut du liquide sous chacune de ses cases", () => {
  const moitie = board([], { "0,0": { floor: "sand-water" }, "1,0": { floor: "stone" } });
  // La pompe mecanique fait une case et tombe sur le liquide.
  assert.equal(put(moitie, { x: 0, y: 0, block: "mechanical-pump" }).ok, true);
  // La rotative en fait deux et deborde sur la pierre.
  assert.equal(put(moitie, { x: 0, y: 0, block: "rotary-pump" }).ok, false);
});

test("une pompe entierement au sec est refusee, et le dit en tant que pompe", () => {
  /* Verifie que c est bien la regle de la pompe qui parle, et non celle du sol : sur de
     la pierre nue, rien n interdit de batir, seule la pompe a une raison de refuser. */
  const sec = board([], carre({ floor: "stone" }));
  const refus = put(sec, { x: 0, y: 0, block: "rotary-pump" });
  assert.equal(refus.ok, false);
  assert.match(refus.why, /liquide/i);
});

test("deux liquides differents sous une pompe passent par la regle du profond", () => {
  /* Mesure faite sur le catalogue : les cinq sols liquides peu profonds du jeu rendent
     tous de l eau, et tous les autres liquides sont profonds. Une pompe a cheval sur deux
     liquides differents chevauche donc necessairement du profond, et c est cette regle
     la qui la refuse en premier. Le test dit ce qui se passe, pas ce qu on imaginait. */
  const melange = board([], {
    "0,0": { floor: "sand-water" }, "1,0": { floor: "tar" },
    "0,1": { floor: "sand-water" }, "1,1": { floor: "sand-water" },
  });
  const refus = put(melange, { x: 0, y: 0, block: "rotary-pump" });
  assert.equal(refus.ok, false);
  assert.match(refus.why, /flotte/);
});

test("peindre une case de pierre a cote ne condamne pas la foreuse", () => {
  /* Une foreuse veut au moins une case de minerai. Tant qu une case de son empreinte
     n est pas decrite, elle pourrait en porter, et rien n autorise a refuser. La regle
     de la pompe est l inverse et se tranche des la premiere case seche : c est la
     difference entre « il existe » et « pour tout », et la confondre donnait un editeur
     qui punit le joueur des qu il commence a peindre. */
  const partiel = board([], { "0,0": { floor: "stone" }, "1,0": { floor: "stone" } });
  assert.equal(put(partiel, { x: 0, y: 0, block: "mechanical-drill" }).ok, true);

  const complet = board([], carre({ floor: "stone" }));
  assert.equal(put(complet, { x: 0, y: 0, block: "mechanical-drill" }).ok, false);
});
