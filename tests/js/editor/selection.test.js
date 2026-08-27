/**
 * Ce qu'on fait d'un groupe de blocs une fois qu'il est sélectionné.
 *
 * Tourner une sélection n'est pas tourner chaque bloc sur place : les positions tournent
 * aussi, autour de la boîte. Les confondre donne une sélection qui explose dès le premier
 * quart de tour, et l'aller-retour est le test qui l'attrape.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { flip, inBox, rotateBy, translate }
  from "../../../site/public/forge/editor/selection.js";
import { loadCatalogue } from "../helpers.js";

const known = loadCatalogue();
const sizeOf = (name) => known.blocks[name]?.size || 1;
const bande = (x, y, rotation = 0) => ({ x, y, block: "conveyor", rotation });
const cle = (t) => `${t.x},${t.y},${t.block},${t.rotation}`;
const trie = (tiles) => tiles.map(cle).sort();

test("la selection prend ce que la boite couvre, et rien d autre", () => {
  const tiles = [bande(0, 0), bande(5, 5), bande(2, 2)];
  const prise = inBox(tiles, { left: 0, bottom: 0, width: 3, height: 3 }, sizeOf);
  assert.equal(prise.length, 2);
});

test("un gros bloc est pris des qu une seule de ses cases est dans la boite", () => {
  // La foreuse posee en (2, 2) couvre (2, 2) a (3, 3) ; la boite ne touche que (3, 3).
  const tiles = [{ x: 2, y: 2, block: "mechanical-drill", rotation: 0 }];
  assert.equal(inBox(tiles, { left: 3, bottom: 3, width: 1, height: 1 }, sizeOf).length, 1);
});

test("deplacer deplace tout du meme pas", () => {
  const bouge = translate([bande(0, 0), bande(1, 0)], 3, -2);
  assert.deepEqual(bouge.map((t) => [t.x, t.y]), [[3, -2], [4, -2]]);
});

test("un quart de tour tourne les positions et les blocs ensemble", () => {
  // Deux bandes cote a cote qui vont vers l est deviennent deux bandes l une sur l autre
  // qui vont vers le nord.
  const tourne = rotateBy([bande(0, 0), bande(1, 0)], 1, known);
  assert.deepEqual(tourne.map((t) => t.rotation), [1, 1]);
  assert.equal(tourne[0].x, tourne[1].x, "elles devraient etre alignees verticalement");
  assert.notEqual(tourne[0].y, tourne[1].y);
});

test("quatre quarts de tour rendent la selection de depart", () => {
  const depart = [bande(0, 0), bande(3, 1, 2), bande(1, 4, 3)];
  let tourne = depart;
  for (let i = 0; i < 4; i++) tourne = rotateBy(tourne, 1, known);
  assert.deepEqual(trie(tourne), trie(depart));
});

test("quatre quarts de tour rendent aussi les gros blocs, sans deriver", () => {
  /* Un bloc de deux se range par son centre avec un decalage tronque. Tourner le centre au
     lieu de l empreinte le fait sortir de la boite d une demi case a chaque quart, et le
     quatrieme ne rend plus rien de reconnaissable. */
  const depart = [
    { x: 0, y: 0, block: "mechanical-drill", rotation: 0 },
    { x: 3, y: 3, block: "graphite-press", rotation: 0 },
    bande(0, 3),
  ];
  let tourne = depart;
  for (let i = 0; i < 4; i++) tourne = rotateBy(tourne, 1, known);
  assert.deepEqual(trie(tourne), trie(depart));
});

test("tourner d un coup ou quart par quart donne la meme chose", () => {
  const depart = [bande(0, 0), bande(2, 1, 1), { x: 4, y: 0, block: "mechanical-drill", rotation: 0 }];
  const troisFois = rotateBy(rotateBy(rotateBy(depart, 1, known), 1, known), 1, known);
  assert.deepEqual(trie(rotateBy(depart, 3, known)), trie(troisFois));
});

test("un miroir retourne les positions et retourne les bandes avec", () => {
  const mire = flip([bande(0, 0, 0), bande(1, 0, 0)], "x", known);
  // Une bande qui allait vers l est va vers l ouest.
  assert.deepEqual(mire.map((t) => t.rotation), [2, 2]);
  // Et les deux ont echange leurs places.
  assert.deepEqual(mire.map((t) => t.x).sort(), [0, 1]);
});

test("un miroir sur X ne touche pas le nord et le sud", () => {
  const mire = flip([bande(0, 0, 1), bande(1, 0, 3)], "x", known);
  assert.deepEqual(mire.map((t) => t.rotation), [1, 3]);
});

test("un miroir sur Y echange le nord et le sud, pas l est et l ouest", () => {
  const mire = flip([bande(0, 0, 1), bande(0, 1, 0)], "y", known);
  assert.deepEqual(mire.map((t) => t.rotation).sort(), [0, 3]);
});

test("un miroir deux fois rend la selection de depart", () => {
  const depart = [bande(0, 0, 1), bande(2, 3, 0),
                  { x: 5, y: 5, block: "mechanical-drill", rotation: 0 }];
  for (const axis of ["x", "y"]) {
    assert.deepEqual(trie(flip(flip(depart, axis, known), axis, known)), trie(depart),
                     `le miroir sur ${axis} ne revient pas`);
  }
});

test("un bloc qui ne tourne pas garde sa rotation quoi qu il arrive", () => {
  const presse = [{ x: 0, y: 0, block: "graphite-press", rotation: 0 }];
  assert.equal(rotateBy(presse, 1, known)[0].rotation, 0);
  assert.equal(flip(presse, "x", known)[0].rotation, 0);
});

test("une selection vide ne casse rien", () => {
  assert.deepEqual(rotateBy([], 1, known), []);
  assert.deepEqual(flip([], "x", known), []);
  assert.deepEqual(translate([], 3, 3), []);
});

test("le seul bloc a miroir inverse du jeu se retourne dans l autre sens", () => {
  /* `Block.invertFlip` : « schematic flips with this block are inverted ». Un seul bloc du
     jeu le porte, l electrolyseur, et une table de rotations a quatre entrees le retournait
     dans le mauvais sens sans que rien ne le dise. La formule du jeu, elle, le gere :

         if((x == (rotation % 2 == 0)) != invertFlip) rotation += 2
  */
  assert.equal(known.blocks["electrolyzer"].invert_flip, true);
  const normal = { x: 0, y: 0, block: "thermal-generator", rotation: 0 };
  const inverse = { x: 0, y: 0, block: "electrolyzer", rotation: 0 };

  // Sur l axe X, une rotation paire bascule... sauf pour celui qui inverse.
  assert.notEqual(flip([inverse], "x", known)[0].rotation,
                  flip([{ ...normal, block: "conveyor" }], "x", known)[0].rotation);
});
