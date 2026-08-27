/**
 * Ce qu'un bloc retient, et ce qu'on peut lui faire retenir.
 *
 * Un trieur retient l'objet qu'il laisse passer. C'est ecrit dans le format, `analyse.js`
 * sait le relire, et l'editeur ne savait pas le poser : une schematique construite ici
 * sortait avec ses trieurs vides, donc avec ses lignes qui ne trient rien.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { choicesFor, configFor, contentKind, readsAs }
  from "../../../site/public/forge/editor/configure.js";
import { loadCatalogue } from "../helpers.js";

const known = loadCatalogue();

test("la famille se lit sur la classe du jeu, pas sur le nom", () => {
  /* `Sorter` couvre le trieur et le trieur inverse, `LiquidSource` la source de liquide.
     Une liste de noms tenue a la main se met a mentir des que le jeu en ajoute un. */
  assert.equal(contentKind(known.blocks["sorter"]), "item");
  assert.equal(contentKind(known.blocks["inverted-sorter"]), "item");
  assert.equal(contentKind(known.blocks["unloader"]), "item");
  assert.equal(contentKind(known.blocks["liquid-source"]), "liquid");
  assert.equal(contentKind(known.blocks["router"]), null);
  assert.equal(contentKind(known.blocks["conveyor"]), null);
});

test("un trieur propose les objets, une source de liquide les liquides", () => {
  const objets = choicesFor(known.blocks["sorter"], known);
  const liquides = choicesFor(known.blocks["liquid-source"], known);
  assert.ok(objets.length > 15, `${objets.length} objets`);
  assert.ok(liquides.length >= 4, `${liquides.length} liquides`);
  assert.ok(objets.some((c) => c.name === "copper"));
  assert.ok(liquides.some((c) => c.name === "water"));
  // Dans l ordre du jeu, pas dans l alphabet : le cuivre est le premier objet.
  assert.equal(objets[0].name, "copper");
});

test("la configuration prend la forme que le format ecrit", () => {
  const cuivre = choicesFor(known.blocks["sorter"], known).find((c) => c.name === "copper");
  assert.deepEqual(configFor(cuivre), { type: 5, content: 0, id: known.items.copper.id });
});

test("et se relit en clair", () => {
  const cuivre = choicesFor(known.blocks["sorter"], known).find((c) => c.name === "copper");
  const trieur = { x: 0, y: 0, block: "sorter", rotation: 0, config: configFor(cuivre) };
  assert.equal(readsAs(trieur, known), "copper");
  assert.equal(readsAs({ x: 0, y: 0, block: "sorter" }, known), null);
});

test("un liquide se relit dans son propre registre", () => {
  const eau = choicesFor(known.blocks["liquid-source"], known).find((c) => c.name === "water");
  const source = { x: 0, y: 0, block: "liquid-source", config: configFor(eau) };
  assert.equal(readsAs(source, known), "water");
});
