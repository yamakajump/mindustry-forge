/**
 * Le brouillon garde dans le navigateur.
 *
 * Vingt minutes de construction ne doivent pas tenir a un onglet qu on ferme par erreur.
 * Teste sans navigateur avec un `localStorage` de comptoir : ce qui compte ici est la
 * decision de garder ou de jeter, pas l API du navigateur.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { ageOf, describeDraft, dropDraft, keepDraft, readDraft }
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

/* --------------------------------------------------------------------------------------
   Les cadres dans le brouillon.

   Un brouillon d hier n a jamais entendu parler de cadres : il porte `tiles` et `ground`,
   pas de cle `frames`, et ca ne demande aucune migration puisque l absence de cadre est
   deja un etat que ce plateau connait. A partir d aujourd hui, un brouillon garde aussi
   les cadres, pour qu ouvrir un onglet ferme par erreur ne fasse pas perdre le travail
   de nommer et de tracer des chantiers, pas seulement celui de les remplir.
   -------------------------------------------------------------------------------------- */

const cadre = { id: "a", name: "fonderie", left: 0, bottom: 0, width: 10, height: 8 };

test("un cadre se garde et se relit avec le reste", () => {
  comptoir();
  keepDraft({ tiles: [bande], ground: {}, frames: [cadre] }, 1000);
  const kept = readDraft(1000);
  assert.equal(kept.frames.length, 1);
  assert.deepEqual(kept.frames[0], cadre);
});

test("un plateau qui n a qu un cadre, sans bloc, vaut quand meme la peine d etre garde", () => {
  const box = comptoir();
  keepDraft({ tiles: [], ground: {}, frames: [cadre] }, 1000);
  assert.ok(box.size > 0);
  assert.equal(readDraft(1000).frames.length, 1);
});

test("un brouillon d hier, sans cle frames, se relit quand meme : la liste est vide", () => {
  comptoir();
  // Ecrit a la main, comme l aurait fait la version d avant les cadres : pas de `frames`.
  globalThis.localStorage.setItem("forge:brouillon",
    JSON.stringify({ at: 1000, tiles: [bande], ground: {} }));
  const kept = readDraft(2000);
  assert.deepEqual(kept.tiles, [bande]);
  assert.deepEqual(kept.frames ?? [], []);
});

/* --------------------------------------------------------------------------------------
   Dire ce qu un brouillon garde, pas un chiffre qui repond a une autre question.

   Un brouillon se garde des qu une seule de ses trois parts n est pas vide (voir plus
   haut). "Un brouillon de 0 blocs" pour un brouillon qui n a que du sol peint est le
   defaut que ce depot debusque par son nom : un chiffre exact, a cote de sa question.
   -------------------------------------------------------------------------------------- */

test("un seul bloc se dit au singulier", () => {
  assert.equal(describeDraft({ tiles: [bande], ground: {}, frames: [] }), "1 bloc");
});

test("plusieurs blocs se disent au pluriel", () => {
  assert.equal(describeDraft({ tiles: [bande, bande], ground: {}, frames: [] }), "2 blocs");
});

test("du sol peint sans aucun bloc se dit pour ce qu il est, pas 0 blocs", () => {
  const dit = describeDraft({ tiles: [], ground: { "0,0": { floor: "stone" } }, frames: [] });
  assert.equal(dit, "1 case de sol peinte");
});

test("plusieurs cases de sol peintes se disent au pluriel", () => {
  const dit = describeDraft({
    tiles: [], ground: { "0,0": { floor: "stone" }, "1,0": { floor: "sand" } }, frames: [],
  });
  assert.equal(dit, "2 cases de sol peintes");
});

test("un seul cadre, sans bloc ni sol, se dit pour ce qu il est", () => {
  assert.equal(describeDraft({ tiles: [], ground: {}, frames: [cadre] }), "1 cadre");
});

test("plusieurs cadres se disent au pluriel", () => {
  assert.equal(describeDraft({ tiles: [], ground: {}, frames: [cadre, { ...cadre, id: "b" }] }),
    "2 cadres");
});

test("deux parts se joignent par et, sans virgule avant", () => {
  const dit = describeDraft({ tiles: [bande], ground: {}, frames: [cadre] });
  assert.equal(dit, "1 bloc et 1 cadre");
});

test("les trois parts ensemble se disent virgule, virgule, et", () => {
  const dit = describeDraft({
    tiles: [bande, bande, bande],
    ground: { "0,0": { floor: "stone" } },
    frames: [cadre],
  });
  assert.equal(dit, "3 blocs, 1 case de sol peinte et 1 cadre");
});

test("un brouillon d hier sans cle frames ne dit pas de cadre", () => {
  assert.equal(describeDraft({ tiles: [bande], ground: {} }), "1 bloc");
});
