/**
 * Où l'on regarde, et quelle case est sous le curseur.
 *
 * Testé seul parce que c'est exactement l'endroit où vivent les erreurs d'une case : une
 * conversion fausse d'un demi pixel pose le bloc à côté de là où le joueur l'a vu, et rien
 * à l'écran ne dit pourquoi. C'est le genre de bug qu'on croit être un problème de clic.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { createCamera } from "../../../site/public/forge/editor/camera.js";

const vue = { width: 800, height: 600 };

test("le centre de la vue est la ou la camera regarde", () => {
  const camera = createCamera({ scale: 20, x: 10, y: 5 });
  assert.deepEqual(camera.toTile(400, 300, vue), { x: 10, y: 5 });
});

test("aller a l ecran et revenir rend la meme case", () => {
  const camera = createCamera({ scale: 17, x: -3, y: 8 });
  for (const [tx, ty] of [[0, 0], [-3, 8], [40, -12], [63, 63]]) {
    const { px, py } = camera.toScreen(tx, ty, vue);
    assert.deepEqual(camera.toTile(px, py, vue), { x: tx, y: ty },
                     `aller-retour casse en ${tx},${ty}`);
  }
});

test("l ecran compte vers le bas, la carte vers le haut", () => {
  const camera = createCamera({ scale: 20, x: 0, y: 0 });
  assert.ok(camera.toScreen(0, -1, vue).py > camera.toScreen(0, 1, vue).py,
            "l axe vertical n est pas inverse");
});

test("tout le rectangle d une case renvoie cette case", () => {
  /* La conversion arrondit vers le bas, jamais au plus proche : avec `Math.round`, la
     moitie de chaque tuile debordait sur sa voisine et un clic sur la droite d une case
     posait le bloc a cote.

     Le rectangle est demande a `rectOf` et non a `toScreen` : le point d une case est son
     coin bas gauche, son rectangle commence a son coin haut gauche, et l ecran compte a
     l envers de la carte. */
  const camera = createCamera({ scale: 20, x: 0, y: 0 });
  const { px, py, size } = camera.rectOf(3, 3, vue);
  assert.equal(size, 20);
  assert.deepEqual(camera.toTile(px + 1, py + 1, vue), { x: 3, y: 3 });
  assert.deepEqual(camera.toTile(px + size - 1, py + size - 1, vue), { x: 3, y: 3 });
});

test("deux cases voisines ont des rectangles jointifs", () => {
  const camera = createCamera({ scale: 20, x: 0, y: 0 });
  const bas = camera.rectOf(0, 0, vue);
  const haut = camera.rectOf(0, 1, vue);
  assert.equal(haut.py + haut.size, bas.py, "un lisere separe deux tuiles collees");
});

test("zoomer garde sous le curseur la case qui y etait", () => {
  const camera = createCamera({ scale: 20, x: 0, y: 0 });
  const avant = camera.toTile(650, 120, vue);
  camera.zoomAt(2, 650, 120, vue);
  assert.deepEqual(camera.toTile(650, 120, vue), avant);
});

test("le zoom est borne des deux cotes", () => {
  const camera = createCamera({ scale: 20, x: 0, y: 0 });
  for (let i = 0; i < 40; i++) camera.zoomAt(2, 400, 300, vue);
  assert.ok(camera.scale <= 64, `zoom parti a ${camera.scale}`);
  for (let i = 0; i < 80; i++) camera.zoomAt(0.5, 400, 300, vue);
  assert.ok(camera.scale >= 4, `zoom parti a ${camera.scale}`);
});

test("l echelle reste entiere, sinon les sprites scintillent", () => {
  const camera = createCamera({ scale: 20, x: 0, y: 0 });
  camera.zoomAt(1.1, 400, 300, vue);
  assert.equal(camera.scale, Math.round(camera.scale));
});

test("deplacer la vue se compte en pixels, comme le geste", () => {
  const camera = createCamera({ scale: 20, x: 0, y: 0 });
  // Tirer l image de vingt pixels vers la droite montre la carte vingt pixels plus a gauche.
  camera.pan(20, 0);
  assert.equal(camera.x, -1);
});

test("recadrer met la boite entiere dans la vue", () => {
  const camera = createCamera({ scale: 64, x: 0, y: 0 });
  camera.frame({ left: 0, bottom: 0, width: 60, height: 40 }, vue);
  for (const [tx, ty] of [[0, 0], [59, 39]]) {
    const { px, py } = camera.toScreen(tx, ty, vue);
    assert.ok(px >= 0 && px <= vue.width, `${px} hors de la vue`);
    assert.ok(py >= 0 && py <= vue.height, `${py} hors de la vue`);
  }
});

test("recadrer un plateau vide ne rend pas une echelle absurde", () => {
  const camera = createCamera({ scale: 20, x: 0, y: 0 });
  camera.frame({ left: 0, bottom: 0, width: 0, height: 0 }, vue);
  assert.ok(camera.scale >= 4 && camera.scale <= 64, `echelle ${camera.scale}`);
  assert.ok(Number.isFinite(camera.x) && Number.isFinite(camera.y));
});

test("cadrer un petit schema ne colle pas le nez au bloc", () => {
  /* Cinq convoyeurs dans une vue de 1160 pixels : l ajustement pur donne une echelle de
     165, ramenee au maximum de 64, et on arrive nez colle au bloc. Le cadrage s arrete
     donc a la taille native du sprite, alors que le zoom a la main garde ses 64 : au dela
     du natif on ne montre pas plus de choses, on montre les memes pixels en plus gros. */
  const camera = createCamera({ scale: 24, x: 0, y: 0 });
  camera.frame({ left: 0, bottom: 0, width: 5, height: 1 }, { width: 1160, height: 810 });
  assert.equal(camera.scale, 32);
});

test("cadrer un grand schema reduit autant qu il faut", () => {
  const camera = createCamera({ scale: 32, x: 0, y: 0 });
  camera.frame({ left: 0, bottom: 0, width: 64, height: 64 }, { width: 800, height: 600 });
  // 600 / 66 arrondi vers le bas, soit neuf pixels par tuile.
  assert.equal(camera.scale, 9);
});
