/**
 * Ce que la caméra change au cadrage, testé sans navigateur.
 *
 * `draw` a besoin d'un canvas et Node n'en a pas. Ce qui se teste, et qui est ce qui casse,
 * est la décision de cadrage : quelle région du monde tombe dans la vue. Tout le reste du
 * rendu en découle, puisque chaque sprite est placé relativement à cette boîte.
 *
 * Les deux premiers tests valent régression : le rapport d'analyse partage ce dessinateur
 * et son cadrage ne doit pas bouger d'un pixel parce que l'éditeur, lui, a besoin d'une
 * caméra.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { viewportBox } from "../../../site/public/forge/render.js";
import { createCamera } from "../../../site/public/forge/editor/camera.js";

const vue = { width: 800, height: 600 };

test("sans camera, le cadrage reste celui du rapport", () => {
  const box = viewportBox({ tight: { left: 2, bottom: 3, width: 10, height: 8 }, apron: 0 });
  assert.deepEqual(box, { left: 2, bottom: 3, width: 10, height: 8 });
});

test("le pourtour s ouvre autour de la boite", () => {
  const box = viewportBox({ tight: { left: 0, bottom: 0, width: 4, height: 4 }, apron: 2 });
  assert.deepEqual(box, { left: -2, bottom: -2, width: 8, height: 8 });
});

test("avec une camera, le cadrage vient de la vue et non du contenu", () => {
  const camera = createCamera({ scale: 20, x: 0, y: 0 });
  const box = viewportBox({
    tight: { left: 0, bottom: 0, width: 2, height: 2 },
    apron: 0, camera, viewport: vue,
  });
  // 800 / 20 = 40 tuiles de large, centrees sur zero.
  assert.equal(box.width, 40);
  assert.equal(box.height, 30);
  assert.equal(box.left, -20);
  assert.equal(box.bottom, -15);
});

test("le cadrage de la camera et sa conversion en tuiles disent la meme chose", () => {
  /* Le bord gauche de la vue est la case que la camera dit etre sous le pixel zero. Deux
     facons de repondre a la meme question vivent dans deux fichiers : si elles divergent,
     le bloc se dessine a un endroit et se pose a un autre, et rien a l ecran ne le dit. */
  const camera = createCamera({ scale: 17, x: 12, y: -4 });
  const box = viewportBox({ tight: { left: 0, bottom: 0, width: 1, height: 1 },
                            apron: 0, camera, viewport: vue });
  assert.equal(Math.floor(box.left), camera.toTile(0, 0, vue).x);
  assert.equal(Math.floor(box.bottom), camera.toTile(0, vue.height, vue).y);
});

test("le canvas de la camera fait exactement la taille de la vue", () => {
  // `draw` dimensionne le canvas en `box.width * scale`. Avec une camera, ca doit retomber
  // sur la vue au pixel pres, sinon l image deborde de son cadre ou laisse une bande vide.
  const camera = createCamera({ scale: 23, x: 3, y: 7 });
  const box = viewportBox({ tight: { left: 0, bottom: 0, width: 1, height: 1 },
                            apron: 0, camera, viewport: vue });
  assert.equal(box.width * camera.scale, vue.width);
  assert.equal(box.height * camera.scale, vue.height);
});
