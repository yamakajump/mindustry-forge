/**
 * The workspaces module, browser side.
 *
 * No real network here: `fetch` is replaced with a double that keeps the last request, to
 * check what this module sends rather than what a server answers.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { importLocalDraft } from "../../../site/public/forge/editor/spaces.js";
import { keepDraft } from "../../../site/public/forge/editor/draft.js";

/** A mock `localStorage`, like the one in `draft.test.js`. */
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

test("importing the local draft also carries its frames, not just the blocks", async () => {
  comptoir();
  const calls = fetchDouble();
  keepDraft({ tiles: [{ x: 0, y: 0, block: "conveyor", rotation: 0 }], ground: {}, frames: [cadre] }, Date.now());

  await importLocalDraft("mon plan");

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body.board.frames, [cadre]);
});

test("importing a draft with no frame sends an empty frame list, not a missing one", async () => {
  comptoir();
  const calls = fetchDouble();
  keepDraft({ tiles: [{ x: 0, y: 0, block: "conveyor", rotation: 0 }], ground: {} }, Date.now());

  await importLocalDraft("mon plan");

  assert.deepEqual(calls[0].body.board.frames, []);
});

test("importing with no local draft refuses instead of sending an empty board", async () => {
  comptoir();
  fetchDouble();
  await assert.rejects(() => importLocalDraft("mon plan"));
});
