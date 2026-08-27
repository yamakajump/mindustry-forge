/**
 * Ce que le catalogue doit savoir pour qu'une pose soit décidable.
 *
 * `Block.canReplace` de la v159.7 lit `group`, `subclass`, `replaceable`, `alwaysReplace`,
 * `privileged` et `quickRotate`. Sans eux, remplacer un convoyeur par un convoyeur titane
 * n'est pas une question à laquelle l'éditeur peut répondre, et il refuse un geste que le
 * jeu accepte. Deviner depuis `role` ne marche pas non plus : `role` regroupe des blocs
 * que le jeu sépare, et l'inverse.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { loadCatalogue } from "../helpers.js";

const known = loadCatalogue();
const bloc = (name) => {
  const found = known.blocks[name];
  assert.ok(found, `${name} manque au catalogue`);
  return found;
};

test("chaque bloc constructible porte une categorie du jeu", () => {
  const categories = new Set(["turret", "production", "distribution", "liquid", "power",
                              "defense", "crafting", "units", "effect", "logic"]);
  const constructibles = Object.entries(known.blocks)
    .filter(([, b]) => b.cost && !b.floor);
  assert.ok(constructibles.length > 100, "le catalogue a perdu ses blocs constructibles");
  for (const [name, b] of constructibles) {
    assert.ok(categories.has(b.category), `${name} a la categorie ${b.category}`);
  }
});

test("deux convoyeurs partagent un groupe, ce qui les rend interchangeables", () => {
  assert.equal(bloc("conveyor").group, "transportation");
  assert.equal(bloc("titanium-conveyor").group, "transportation");
});

test("un glisse trace en L sur une bande, en ligne droite sur un routeur", () => {
  assert.equal(bloc("conveyor").conveyor_placement, true);
  assert.notEqual(bloc("router").conveyor_placement, true);
});

test("chaque bloc sait de quelle planete il vient", () => {
  assert.equal(bloc("conveyor").planet, "serpulo");
  assert.equal(bloc("duct").planet, "erekir");
});

test("un drapeau faux survit au trimmage du catalogue", () => {
  /* `placeableOn` et `replaceable` valent **vrai** par defaut dans le jeu et ne sont
     ecrits que la ou ils sont faux. Le trimmage jette les valeurs vides et `False == 0`
     en Python : sans precaution, ces deux champs perdaient la seule chose qu ils avaient
     a dire, et un vide se lit comme un defaut, donc comme l inverse de la verite. */
  assert.equal(bloc("space").placeable_on, false);
  assert.equal(bloc("core-shard").replaceable, false);
});

test("un liquide profond reste constructible, c est sa profondeur qui decide", () => {
  /* Piege : `placeable_on` de l eau profonde vaut vrai. Ce qui interdit d y batir est
     `deep`, teste separement dans `Build.validPlace`, et confondre les deux donnerait un
     editeur qui laisse poser un convoyeur au fond de l eau. */
  assert.notEqual(bloc("deep-water").placeable_on, false);
  assert.equal(bloc("deep-water").deep, true);
});
