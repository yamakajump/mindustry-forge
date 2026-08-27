/**
 * Le plateau : ce qui est pose, ce qui est peint, et ce qu on peut defaire.
 *
 * La limite de 64 vient de `Vars.maxSchematicSize` de la v159.7. Elle porte sur la boite
 * englobante, murs des gros blocs compris, et pas sur le nombre de blocs : une ligne de
 * mille convoyeurs enroulee sur elle-meme est acceptee, deux blocs distants de soixante
 * cinq ne le sont pas.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { createBoard, MAX_SIZE } from "../../../site/public/forge/editor/state.js";
import { loadCatalogue } from "../helpers.js";

const known = loadCatalogue();
const sizeOf = (name) => known.blocks[name]?.size || 1;
const board = (tiles = [], ground = {}) => createBoard({ tiles, ground, sizeOf });

test("la limite est celle du jeu", () => {
  assert.equal(MAX_SIZE, 64);
});

test("la boite se mesure sur ce que les blocs couvrent", () => {
  // Une foreuse mecanique fait deux de cote et se range par son centre, donc posee en
  // (5, 5) elle couvre jusqu a (6, 6).
  const plateau = board([{ x: 5, y: 5, block: "mechanical-drill", rotation: 0 }]);
  assert.deepEqual(plateau.box(), { left: 5, bottom: 5, width: 2, height: 2 });
});

test("un plateau vide a une boite vide plutot que des infinis", () => {
  assert.deepEqual(board().box(), { left: 0, bottom: 0, width: 0, height: 0 });
});

test("un bloc qui ferait deborder de 64 ne rentre pas", () => {
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 0 }]);
  assert.equal(plateau.fits({ x: 63, y: 0, block: "conveyor", rotation: 0 }), true);
  assert.equal(plateau.fits({ x: 64, y: 0, block: "conveyor", rotation: 0 }), false);
});

test("un gros bloc compte par ce qu il couvre, pas par son centre", () => {
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 0 }]);
  // La foreuse posee en (62, 0) couvre (62, 0) a (63, 1) : la boite fait 64 de large.
  assert.equal(plateau.fits({ x: 62, y: 0, block: "mechanical-drill", rotation: 0 }), true);
  assert.equal(plateau.fits({ x: 63, y: 0, block: "mechanical-drill", rotation: 0 }), false);
});

test("un plateau vide accepte n importe quel premier bloc", () => {
  assert.equal(board().fits({ x: 900, y: -400, block: "conveyor", rotation: 0 }), true);
});

test("ce qui couvre une case se retrouve par cette case", () => {
  const plateau = board([{ x: 5, y: 5, block: "mechanical-drill", rotation: 0 }]);
  assert.equal(plateau.at(6, 6)?.block, "mechanical-drill");
  assert.equal(plateau.at(7, 7), null);
});

test("un geste s annule d un coup, meme s il a pose trente blocs", () => {
  const plateau = board();
  const ligne = Array.from({ length: 30 },
    (_, i) => ({ x: i, y: 0, block: "conveyor", rotation: 0 }));
  plateau.apply({ place: ligne });
  assert.equal(plateau.tiles.length, 30);
  assert.equal(plateau.undo(), true);
  assert.equal(plateau.tiles.length, 0);
  assert.equal(plateau.redo(), true);
  assert.equal(plateau.tiles.length, 30);
});

test("annuler sans rien a annuler ne casse rien", () => {
  const plateau = board();
  assert.equal(plateau.undo(), false);
  assert.equal(plateau.redo(), false);
});

test("un nouveau geste jette ce qui avait ete defait", () => {
  const plateau = board();
  plateau.apply({ place: [{ x: 0, y: 0, block: "conveyor", rotation: 0 }] });
  plateau.undo();
  plateau.apply({ place: [{ x: 5, y: 5, block: "router", rotation: 0 }] });
  assert.equal(plateau.redo(), false);
  assert.equal(plateau.tiles.length, 1);
  assert.equal(plateau.tiles[0].block, "router");
});

test("le sol s annule comme le reste", () => {
  const plateau = board();
  plateau.apply({ paint: { "3,4": { floor: "sand" } } });
  assert.equal(plateau.ground["3,4"].floor, "sand");
  plateau.undo();
  assert.equal(plateau.ground["3,4"], undefined);
});

test("repeindre par dessus se defait vers l ancien sol, pas vers rien", () => {
  const plateau = board([], { "3,4": { floor: "stone" } });
  plateau.apply({ paint: { "3,4": { floor: "sand" } } });
  assert.equal(plateau.ground["3,4"].floor, "sand");
  plateau.undo();
  assert.equal(plateau.ground["3,4"].floor, "stone");
});

test("un minerai se pose par dessus le sol au lieu de le remplacer", () => {
  const plateau = board([], { "0,0": { floor: "stone" } });
  plateau.apply({ paint: { "0,0": { overlay: "ore-copper" } } });
  assert.deepEqual(plateau.ground["0,0"], { floor: "stone", overlay: "ore-copper" });
});

test("effacer une case la retire au lieu de la vider", () => {
  const plateau = board([], { "0,0": { floor: "stone" } });
  plateau.apply({ paint: { "0,0": null } });
  assert.equal(plateau.ground["0,0"], undefined);
  plateau.undo();
  assert.deepEqual(plateau.ground["0,0"], { floor: "stone" });
});

test("poser sur une case occupee remplace au lieu d empiler", () => {
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 0 }]);
  plateau.apply({ place: [{ x: 0, y: 0, block: "titanium-conveyor", rotation: 1 }] });
  assert.equal(plateau.tiles.length, 1);
  assert.equal(plateau.tiles[0].block, "titanium-conveyor");
  assert.equal(plateau.tiles[0].rotation, 1);
});

test("un gros bloc chasse tout ce qu il recouvre, pas seulement son centre", () => {
  const plateau = board([
    { x: 0, y: 0, block: "conveyor", rotation: 0 },
    { x: 1, y: 1, block: "conveyor", rotation: 0 },
    { x: 5, y: 5, block: "conveyor", rotation: 0 },
  ]);
  plateau.apply({ place: [{ x: 0, y: 0, block: "mechanical-drill", rotation: 0 }] });
  assert.equal(plateau.tiles.length, 2);
  assert.equal(plateau.at(5, 5)?.block, "conveyor");
});

test("annuler une pose qui a recouvert rend ce qui etait dessous", () => {
  const plateau = board([{ x: 1, y: 1, block: "conveyor", rotation: 0 }]);
  plateau.apply({ place: [{ x: 0, y: 0, block: "mechanical-drill", rotation: 0 }] });
  assert.equal(plateau.tiles.length, 1);
  plateau.undo();
  assert.equal(plateau.tiles.length, 1);
  assert.equal(plateau.tiles[0].block, "conveyor");
});

test("retirer un bloc se defait aussi", () => {
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 2 }]);
  plateau.apply({ remove: [plateau.at(0, 0)] });
  assert.equal(plateau.tiles.length, 0);
  plateau.undo();
  assert.equal(plateau.tiles[0].rotation, 2);
});

test("un geste vide ne remplit pas l historique", () => {
  const plateau = board();
  assert.equal(plateau.apply({ place: [] }), false);
  assert.equal(plateau.undo(), false);
});

test("une fournee entiere est jugee ensemble, pas bloc par bloc", () => {
  /* Cent convoyeurs sur un plateau vide : chacun mesure une case de large et tient donc
     tout seul dans les 64. C est ensemble qu ils debordent, et c est ensemble qu il faut
     les juger, sinon un glisse assez long fabrique une schematique que le jeu refuse. */
  const plateau = board();
  const ligne = Array.from({ length: 100 },
    (_, i) => ({ x: i, y: 0, block: "conveyor", rotation: 0 }));
  assert.equal(plateau.fits(ligne[99]), true, "un bloc seul tient toujours");
  assert.equal(plateau.fits(ligne), false, "la ligne entiere devrait deborder");
  assert.equal(plateau.fits(ligne.slice(0, 64)), true);
  assert.equal(plateau.fits(ligne.slice(0, 65)), false);
});
