/**
 * Le brouillon garde dans le navigateur.
 *
 * Vingt minutes de construction ne doivent pas tenir a un onglet qu on ferme par erreur.
 * Teste sans navigateur avec un `localStorage` de comptoir : ce qui compte ici est la
 * decision de garder ou de jeter, pas l API du navigateur.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { ageOf, dropDraft, keepDraft, readDraft }
  from "../../../site/public/forge/editor/draft.js";

/** Un `localStorage` de comptoir, puisque Node n en a pas. */
function comptoir() {
  const box = new Map();
  globalThis.localStorage = {
    getItem: (k) => (box.has(k) ? box.get(k) : null),
    setItem: (k, v) => box.set(k, String(v)),
    removeItem: (k) => box.delete(k),
  };
  return box;
}

const plateau = (tiles = [], ground = {}) => ({ tiles, ground });
const bande = { x: 1, y: 2, block: "conveyor", rotation: 3 };

test("un plateau garni se garde et se relit", () => {
  comptoir();
  keepDraft(plateau([bande], { "0,0": { floor: "stone" } }), 1000);
  const kept = readDraft(1000);
  assert.equal(kept.tiles.length, 1);
  assert.deepEqual(kept.tiles[0], bande);
  assert.deepEqual(kept.ground, { "0,0": { floor: "stone" } });
});

test("un plateau vide n encombre rien", () => {
  const box = comptoir();
  keepDraft(plateau(), 1000);
  assert.equal(box.size, 0);
  assert.equal(readDraft(1000), null);
});

test("un brouillon de plus d une semaine ne se propose plus", () => {
  comptoir();
  const semaine = 7 * 24 * 60 * 60 * 1000;
  keepDraft(plateau([bande]), 0);
  assert.ok(readDraft(semaine - 1));
  assert.equal(readDraft(semaine + 1), null);
});

test("construire par dessus remplace le brouillon precedent", () => {
  comptoir();
  keepDraft(plateau([bande]), 0);
  keepDraft(plateau([bande, { ...bande, x: 9 }]), 10);
  assert.equal(readDraft(10).tiles.length, 2);
});

test("le jeter le jette", () => {
  comptoir();
  keepDraft(plateau([bande]), 0);
  dropDraft();
  assert.equal(readDraft(0), null);
});

test("un stockage qui refuse d ecrire ne fait pas tomber l editeur", () => {
  /* Navigation privee, quota plein : perdre le brouillon est ennuyeux, faire tomber
     l editeur pour ca serait absurde. */
  globalThis.localStorage = {
    getItem() { throw new Error("refus"); },
    setItem() { throw new Error("refus"); },
    removeItem() { throw new Error("refus"); },
  };
  assert.doesNotThrow(() => keepDraft(plateau([bande]), 0));
  assert.equal(readDraft(0), null);
  assert.doesNotThrow(() => dropDraft());
});

test("l age se dit comme on le dirait a voix haute", () => {
  const minute = 60000;
  assert.equal(ageOf(0, 30000), "à l'instant");
  assert.equal(ageOf(0, 59999), "à l'instant");
  assert.equal(ageOf(0, 5 * minute), "il y a 5 minutes");
  assert.equal(ageOf(0, 61 * minute), "il y a 1 heure");
  assert.equal(ageOf(0, 50 * 60 * minute), "il y a 2 jours");
});
