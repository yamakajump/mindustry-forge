/**
 * Ce qu'un glissé pose, d'après `Placement.calculateNodes` de la v159.7.
 *
 * Un convoyeur trace en L et chaque segment regarde le suivant. C'est la mécanique qui
 * fait la différence entre poser trente convoyeurs en un geste, et les poser en trente
 * clics suivis de quatre-vingt-dix clics pour les orienter un par un, ce qui est
 * exactement ce que l'éditeur d'avant demandait.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { lineOf } from "../../../site/public/forge/editor/lines.js";
import { loadCatalogue } from "../helpers.js";

const known = loadCatalogue();
const line = (from, to, block, rotation = 0) => lineOf(from, to, block, known, rotation);
const cells = (posee) => posee.map((t) => [t.x, t.y]);

test("un glisse droit pose une bande orientee vers l arrivee", () => {
  const posee = line({ x: 0, y: 0 }, { x: 3, y: 0 }, "conveyor");
  assert.deepEqual(cells(posee), [[0, 0], [1, 0], [2, 0], [3, 0]]);
  // Rotation 0 est l est, comptee dans le sens antihoraire comme le jeu la compte.
  assert.deepEqual(posee.map((t) => t.rotation), [0, 0, 0, 0]);
});

test("un glisse vers l ouest oriente les bandes vers l ouest", () => {
  const posee = line({ x: 3, y: 0 }, { x: 0, y: 0 }, "conveyor");
  assert.deepEqual(cells(posee), [[3, 0], [2, 0], [1, 0], [0, 0]]);
  assert.deepEqual(posee.map((t) => t.rotation), [2, 2, 2, 2]);
});

test("un glisse vers le nord oriente vers le nord", () => {
  const posee = line({ x: 0, y: 0 }, { x: 0, y: 2 }, "conveyor");
  assert.deepEqual(posee.map((t) => t.rotation), [1, 1, 1]);
});

test("un glisse en diagonale fait un coude, et le coude tourne", () => {
  const posee = line({ x: 0, y: 0 }, { x: 2, y: 2 }, "conveyor");
  assert.deepEqual(cells(posee), [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]]);
  // Chaque bloc regarde celui d apres ; le dernier garde le cap de son segment.
  assert.deepEqual(posee.map((t) => t.rotation), [0, 0, 1, 1, 1]);
});

test("le coude suit l axe le plus long, pas toujours le meme", () => {
  // Le glisse est surtout vertical : il monte d abord, puis part sur le cote.
  const posee = line({ x: 0, y: 0 }, { x: 1, y: 3 }, "conveyor");
  assert.deepEqual(cells(posee), [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3]]);
});

test("un bloc sans trace en L reste sur une ligne droite", () => {
  const posee = line({ x: 0, y: 0 }, { x: 3, y: 1 }, "router");
  assert.deepEqual(cells(posee), [[0, 0], [1, 0], [2, 0], [3, 0]]);
});

test("un bloc sans trace en L garde la rotation qu il avait en main", () => {
  const posee = line({ x: 0, y: 0 }, { x: 2, y: 0 }, "unloader", 3);
  assert.deepEqual(posee.map((t) => t.rotation), [3, 3, 3]);
});

test("un gros bloc s espace de sa taille au lieu de se chevaucher", () => {
  const posee = line({ x: 0, y: 0 }, { x: 6, y: 0 }, "mechanical-drill");
  assert.deepEqual(posee.map((t) => t.x), [0, 2, 4, 6]);
});

test("un gros bloc ne deborde jamais de l arrivee", () => {
  // De 0 a 5 avec un pas de deux : 0, 2, 4. Le suivant serait en 6, au dela du glisse.
  const posee = line({ x: 0, y: 0 }, { x: 5, y: 0 }, "mechanical-drill");
  assert.deepEqual(posee.map((t) => t.x), [0, 2, 4]);
});

test("un glisse d une seule case pose un seul bloc", () => {
  const posee = line({ x: 2, y: 2 }, { x: 2, y: 2 }, "conveyor", 3);
  assert.equal(posee.length, 1);
  assert.deepEqual([posee[0].x, posee[0].y], [2, 2]);
  // Rien n indique une direction, donc la bande garde celle qu elle avait en main.
  assert.equal(posee[0].rotation, 3);
});

test("chaque case n est posee qu une fois", () => {
  const posee = line({ x: 0, y: 0 }, { x: 4, y: 4 }, "conveyor");
  assert.equal(new Set(posee.map((t) => `${t.x},${t.y}`)).size, posee.length);
});
