/**
 * Ce que la palette propose, et dans quel ordre.
 *
 * Une palette est ce qui separe un editeur d un annuaire. Celle d avant montrait 253
 * pastilles a plat, sans categorie ni planete, dans l ordre ou le catalogue les avait
 * ecrites.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { buildables } from "../../../site/public/forge/editor/ui.js";
import { loadCatalogue } from "../helpers.js";

const known = loadCatalogue();
const palette = buildables(known);
const names = palette.map((entry) => entry.name);

test("la palette ne propose que ce qu un joueur peut poser", () => {
  assert.ok(palette.length > 200, `seulement ${palette.length} blocs`);
  // Ni sol, ni mur de decor, ni air, ni marqueur d apparition.
  for (const interdit of ["stone", "ore-copper", "deep-water", "stone-wall", "air", "spawn"]) {
    assert.ok(!names.includes(interdit), `${interdit} n a rien a faire dans la palette`);
  }
  assert.ok(names.includes("conveyor"));
  assert.ok(names.includes("duct"));
});

test("chaque bloc propose porte un cout, une categorie et une planete", () => {
  for (const { name, block } of palette) {
    assert.ok(block.cost, `${name} n a pas de cout`);
    assert.ok(block.category, `${name} n a pas de categorie`);
  }
  // Les blocs de bac a sable n appartiennent a aucun arbre technologique, donc a aucune
  // planete. Ils restent posables : le jeu les pose aussi.
  const sansPlanete = palette.filter(({ block }) => !block.planet);
  assert.ok(sansPlanete.length < 10,
            `${sansPlanete.length} blocs sans planete, c est trop pour du bac a sable`);
});

test("l ordre est celui du jeu, pas l alphabet", () => {
  /* Dans le registre du jeu, un convoyeur vient avant un convoyeur titane. L alphabet
     mettrait « titanium-conveyor » en premier, ce qui n est l ordre de rien et separe les
     deux moities d une meme famille. */
  assert.ok(names.indexOf("conveyor") < names.indexOf("titanium-conveyor"));
  assert.ok(names.indexOf("mechanical-drill") < names.indexOf("pneumatic-drill"));
});

test("filtrer par planete separe vraiment les deux jeux de blocs", () => {
  const serpulo = palette.filter(({ block }) => block.planet === "serpulo");
  const erekir = palette.filter(({ block }) => block.planet === "erekir");
  assert.ok(serpulo.length > 100 && erekir.length > 80,
            `${serpulo.length} serpuliens, ${erekir.length} erekiriens`);
  assert.equal(serpulo.some(({ name }) => name === "duct"), false);
  assert.equal(erekir.some(({ name }) => name === "conveyor"), false);
});

test("la palette montre ce que le menu du jeu montre, pas ce qui a un cout", () => {
  /* `buildVisibility` et `placeablePlayer` sont le tri du jeu. Trier sur « il a un cout de
     construction » laissait passer dix blocs que personne ne peut poser en partie : les
     rampes de lancement, le radar, l illuminateur, l accelerateur interplanetaire, et le
     coeur, qui n existe que dans sa zone. */
  for (const absent of ["launch-pad", "advanced-launch-pad", "core-shard", "radar",
                        "illuminator", "interplanetary-accelerator"]) {
    assert.ok(!names.includes(absent), `${absent} n a rien a faire dans la palette`);
  }
  for (const present of ["conveyor", "graphite-press", "duo", "power-node"]) {
    assert.ok(names.includes(present), `${present} devrait etre proposable`);
  }
});
