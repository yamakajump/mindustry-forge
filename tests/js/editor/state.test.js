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

import { BOARD_SIZE, createBoard, legalFrame, MAX_SIZE }
  from "../../../site/public/forge/editor/state.js";
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

/* --------------------------------------------------------------------------------------
   Les cadres.

   Un cadre est un rectangle nomme, dessine a la main, d au plus 64 par 64 : c est
   `Vars.maxSchematicSize`, un refus dur et pas un avertissement. Sans aucun cadre, le
   plateau entier en tient lieu, plafonne a 64 exactement comme avant : c est la regle qui
   protege le cas simple, et les tests ci dessus la couvrent deja.

   Des qu un cadre existe, poser un bloc n est plus borne a 64 : le plateau lui meme
   devient l unite bornee, a 256, pour laisser plusieurs chantiers cote a cote. Le 64 se
   deplace sur le cadre, pas sur la pose.
   -------------------------------------------------------------------------------------- */

test("le plateau est fixe a 256, pas a grandir", () => {
  assert.equal(BOARD_SIZE, 256);
});

test("un cadre tient dans 64 par 64, jamais plus : refus dur, pas avertissement", () => {
  assert.equal(legalFrame({ width: 64, height: 64 }), true);
  assert.equal(legalFrame({ width: 65, height: 64 }), false);
  assert.equal(legalFrame({ width: 64, height: 65 }), false);
  assert.equal(legalFrame({ width: 1, height: 1 }), true);
});

test("un cadre nul ou negatif n est pas legal", () => {
  assert.equal(legalFrame({ width: 0, height: 5 }), false);
  assert.equal(legalFrame({ width: -1, height: 5 }), false);
});

test("des que des cadres existent, le plafond de pose porte sur le plateau entier, a 256", () => {
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 0 }]);
  plateau.apply({
    addFrames: [{ id: "a", name: "fonderie", left: 0, bottom: 0, width: 10, height: 10 }],
  });
  assert.equal(plateau.fits({ x: 64, y: 0, block: "conveyor", rotation: 0 }), true,
    "un cadre autorise a depasser 64, tant que le plateau tient dans 256");
  assert.equal(plateau.fits({ x: 255, y: 0, block: "conveyor", rotation: 0 }), true);
  assert.equal(plateau.fits({ x: 256, y: 0, block: "conveyor", rotation: 0 }), false);
});

test("dessiner un cadre s annule comme le reste", () => {
  const plateau = board();
  const cadre = { id: "a", name: "fonderie", left: 0, bottom: 0, width: 10, height: 8 };
  plateau.apply({ addFrames: [cadre] });
  assert.equal(plateau.frames.length, 1);
  assert.equal(plateau.undo(), true);
  assert.equal(plateau.frames.length, 0);
  assert.equal(plateau.redo(), true);
  assert.equal(plateau.frames.length, 1);
  assert.equal(plateau.frames[0].name, "fonderie");
});

test("renommer, deplacer ou redimensionner un cadre passe par retirer puis reposer", () => {
  const plateau = board();
  const cadre = { id: "a", name: "fonderie", left: 0, bottom: 0, width: 10, height: 8 };
  plateau.apply({ addFrames: [cadre] });
  const renomme = { ...plateau.frames[0], name: "assemblage" };
  plateau.apply({ removeFrames: [plateau.frames[0]], addFrames: [renomme] });
  assert.equal(plateau.frames.length, 1);
  assert.equal(plateau.frames[0].name, "assemblage");
  plateau.undo();
  assert.equal(plateau.frames[0].name, "fonderie");
});

test("supprimer un cadre laisse ses blocs en place", () => {
  const plateau = board([{ x: 1, y: 1, block: "conveyor", rotation: 0 }]);
  plateau.apply({
    addFrames: [{ id: "a", name: "fonderie", left: 0, bottom: 0, width: 5, height: 5 }],
  });
  plateau.apply({ removeFrames: [plateau.frames[0]] });
  assert.equal(plateau.frames.length, 0);
  assert.equal(plateau.tiles.length, 1);
});

test("un point tombe dans le cadre qui le couvre, borne comme une boite normale", () => {
  const plateau = board();
  plateau.apply({
    addFrames: [{ id: "a", name: "fonderie", left: 0, bottom: 0, width: 10, height: 10 }],
  });
  assert.equal(plateau.frameAt(5, 5)?.id, "a");
  assert.equal(plateau.frameAt(10, 5), null, "le bord haut est exclu, comme une boite normale");
  assert.equal(plateau.frameAt(-1, 5), null);
});

test("un bloc entierement dans le cadre lui appartient", () => {
  const plateau = board([{ x: 5, y: 5, block: "conveyor", rotation: 0 }]);
  plateau.apply({
    addFrames: [{ id: "a", name: "fonderie", left: 0, bottom: 0, width: 10, height: 10 }],
  });
  const [cadre] = plateau.frames;
  assert.deepEqual(plateau.tilesIn(cadre).map((t) => t.block), ["conveyor"]);
  assert.deepEqual(plateau.orphans(), []);
});

test("un bloc qui deborde du cadre d une seule case n y appartient pas", () => {
  // Une foreuse mecanique posee en (9, 9) couvre (9, 9) a (10, 10) : elle deborde d une
  // case d un cadre de 10 par 10 pose en (0, 0). Un cadre ne se prouve qu entier.
  const plateau = board([{ x: 9, y: 9, block: "mechanical-drill", rotation: 0 }]);
  plateau.apply({
    addFrames: [{ id: "a", name: "fonderie", left: 0, bottom: 0, width: 10, height: 10 }],
  });
  const [cadre] = plateau.frames;
  assert.deepEqual(plateau.tilesIn(cadre), []);
  assert.equal(plateau.orphans().length, 1);
});

test("sans aucun cadre, rien n est orphelin : le plateau entier en tient lieu", () => {
  const plateau = board([{ x: 900, y: -400, block: "conveyor", rotation: 0 }]);
  assert.deepEqual(plateau.orphans(), []);
});

test("la taille utilisee d un cadre est la boite de ce qu il contient, pas sa taille dessinee", () => {
  const plateau = board([{ x: 1, y: 1, block: "conveyor", rotation: 0 }]);
  plateau.apply({
    addFrames: [{ id: "a", name: "fonderie", left: 0, bottom: 0, width: 20, height: 20 }],
  });
  assert.deepEqual(plateau.frameBox(plateau.frames[0]), { left: 1, bottom: 1, width: 1, height: 1 });
});

test("un cadre vide a une boite utilisee vide", () => {
  const plateau = board();
  plateau.apply({
    addFrames: [{ id: "a", name: "fonderie", left: 0, bottom: 0, width: 20, height: 20 }],
  });
  assert.deepEqual(plateau.frameBox(plateau.frames[0]), { left: 0, bottom: 0, width: 0, height: 0 });
});

test("un plateau reconstruit sans cle frames part avec une liste vide", () => {
  // Le cas d un brouillon d hier, qui n a jamais entendu parler de cadres.
  const plateau = createBoard({ tiles: [], ground: {}, sizeOf });
  assert.deepEqual(plateau.frames, []);
});

test("la boite de tous les cadres sert a cadrer le chantier entier d un coup", () => {
  const plateau = board();
  plateau.apply({
    addFrames: [
      { id: "a", name: "fonderie", left: 0, bottom: 0, width: 10, height: 10 },
      { id: "b", name: "assemblage", left: 40, bottom: -5, width: 8, height: 8 },
    ],
  });
  assert.deepEqual(plateau.framesBox(), { left: 0, bottom: -5, width: 48, height: 15 });
});

test("sans aucun cadre, la boite des cadres est vide plutot que des infinis", () => {
  assert.deepEqual(board().framesBox(), { left: 0, bottom: 0, width: 0, height: 0 });
});
