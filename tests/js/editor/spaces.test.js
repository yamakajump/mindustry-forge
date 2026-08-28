/**
 * Le module des espaces de travail, cote navigateur.
 *
 * Aucun vrai reseau ici : `fetch` est remplace par un double qui garde la derniere
 * requete, pour verifier ce que ce module envoie et non ce qu un serveur repond.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { importLocalDraft } from "../../../site/public/forge/editor/spaces.js";
import { keepDraft } from "../../../site/public/forge/editor/draft.js";

/** Un `localStorage` de comptoir, comme celui de `draft.test.js`. */
function comptoir() {
  const box = new Map();
  globalThis.localStorage = {
    getItem: (k) => (box.has(k) ? box.get(k) : null),
    setItem: (k, v) => box.set(k, String(v)),
    removeItem: (k) => box.delete(k),
  };
  return box;
}

function fetchDouble(response = { slug: "abc1234567", name: "importe" }) {
  const calls = [];
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options, body: options?.body ? JSON.parse(options.body) : null });
    return {
      ok: true,
      json: async () => response,
    };
  };
  globalThis.document = { cookie: "" };
  return calls;
}

const cadre = { id: "a", name: "fonderie", left: 0, bottom: 0, width: 10, height: 8 };

test("importer le brouillon local emporte aussi ses cadres, pas seulement les blocs", async () => {
  comptoir();
  const calls = fetchDouble();
  keepDraft({ tiles: [{ x: 0, y: 0, block: "conveyor", rotation: 0 }], ground: {}, frames: [cadre] }, Date.now());

  await importLocalDraft("mon plan");

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body.board.frames, [cadre]);
});

test("importer un brouillon sans cadre envoie une liste de cadres vide, pas absente", async () => {
  comptoir();
  const calls = fetchDouble();
  keepDraft({ tiles: [{ x: 0, y: 0, block: "conveyor", rotation: 0 }], ground: {} }, Date.now());

  await importLocalDraft("mon plan");

  assert.deepEqual(calls[0].body.board.frames, []);
});

test("importer sans brouillon local refuse plutot que d envoyer un plateau vide", async () => {
  comptoir();
  fetchDouble();
  await assert.rejects(() => importLocalDraft("mon plan"));
});
