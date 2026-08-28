/**
 * The draft kept in the browser.
 *
 * Twenty minutes of building should not hinge on a tab closed by mistake. Tested without a
 * browser with a mock `localStorage`: what matters here is the decision to keep or to
 * drop, not the browser API.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { ageOf, describeDraft, dropDraft, keepDraft, readDraft }
  from "../../../site/public/forge/editor/draft.js";

/** A mock `localStorage`, since Node has none. */
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

test("a filled board is kept and reads back", () => {
  comptoir();
  keepDraft(plateau([bande], { "0,0": { floor: "stone" } }), 1000);
  const kept = readDraft(1000);
  assert.equal(kept.tiles.length, 1);
  assert.deepEqual(kept.tiles[0], bande);
  assert.deepEqual(kept.ground, { "0,0": { floor: "stone" } });
});

test("an empty board takes up no room", () => {
  const box = comptoir();
  keepDraft(plateau(), 1000);
  assert.equal(box.size, 0);
  assert.equal(readDraft(1000), null);
});

test("a draft older than a week is no longer offered", () => {
  comptoir();
  const semaine = 7 * 24 * 60 * 60 * 1000;
  keepDraft(plateau([bande]), 0);
  assert.ok(readDraft(semaine - 1));
  assert.equal(readDraft(semaine + 1), null);
});

test("building on top replaces the previous draft", () => {
  comptoir();
  keepDraft(plateau([bande]), 0);
  keepDraft(plateau([bande, { ...bande, x: 9 }]), 10);
  assert.equal(readDraft(10).tiles.length, 2);
});

test("dropping it drops it", () => {
  comptoir();
  keepDraft(plateau([bande]), 0);
  dropDraft();
  assert.equal(readDraft(0), null);
});

test("storage that refuses to write does not bring the editor down", () => {
  /* Private browsing, a full quota: losing the draft is annoying, bringing the editor
     down over it would be absurd. */
  globalThis.localStorage = {
    getItem() { throw new Error("refused"); },
    setItem() { throw new Error("refused"); },
    removeItem() { throw new Error("refused"); },
  };
  assert.doesNotThrow(() => keepDraft(plateau([bande]), 0));
  assert.equal(readDraft(0), null);
  assert.doesNotThrow(() => dropDraft());
});

test("the age is phrased the way it would be said out loud", () => {
  const minute = 60000;
  assert.equal(ageOf(0, 30000), "à l'instant");
  assert.equal(ageOf(0, 59999), "à l'instant");
  assert.equal(ageOf(0, 5 * minute), "il y a 5 minutes");
  assert.equal(ageOf(0, 61 * minute), "il y a 1 heure");
  assert.equal(ageOf(0, 50 * 60 * minute), "il y a 2 jours");
});

/* --------------------------------------------------------------------------------------
   Frames in the draft.

   A draft from yesterday has never heard of frames: it carries `tiles` and `ground`, no
   `frames` key, and that needs no migration since the absence of a frame is already a
   state this board understands. From today on, a draft also keeps its frames, so that
   opening a tab closed by mistake does not lose the work of naming and outlining sites,
   not just the work of filling them in.
   -------------------------------------------------------------------------------------- */

const cadre = { id: "a", name: "fonderie", left: 0, bottom: 0, width: 10, height: 8 };

test("a frame is kept and reads back with the rest", () => {
  comptoir();
  keepDraft({ tiles: [bande], ground: {}, frames: [cadre] }, 1000);
  const kept = readDraft(1000);
  assert.equal(kept.frames.length, 1);
  assert.deepEqual(kept.frames[0], cadre);
});

test("a board with only a frame, no block, is still worth keeping", () => {
  const box = comptoir();
  keepDraft({ tiles: [], ground: {}, frames: [cadre] }, 1000);
  assert.ok(box.size > 0);
  assert.equal(readDraft(1000).frames.length, 1);
});

test("a draft from yesterday, with no frames key, still reads back: the list is empty", () => {
  comptoir();
  // Written by hand, the way the version before frames would have: no `frames`.
  globalThis.localStorage.setItem("forge:brouillon",
    JSON.stringify({ at: 1000, tiles: [bande], ground: {} }));
  const kept = readDraft(2000);
  assert.deepEqual(kept.tiles, [bande]);
  assert.deepEqual(kept.frames ?? [], []);
});

/* --------------------------------------------------------------------------------------
   Saying what a draft holds, not a number that answers a different question.

   A draft gets kept as soon as a single one of its three parts is non-empty (see above).
   "A draft of 0 blocks" for a draft that only has painted ground is the defect this suite
   flushes out by its name: an exact number, next to the wrong question.
   -------------------------------------------------------------------------------------- */

test("a single block is said in the singular", () => {
  assert.equal(describeDraft({ tiles: [bande], ground: {}, frames: [] }), "1 bloc");
});

test("several blocks are said in the plural", () => {
  assert.equal(describeDraft({ tiles: [bande, bande], ground: {}, frames: [] }), "2 blocs");
});

test("painted ground with no block at all is said for what it is, not 0 blocks", () => {
  const dit = describeDraft({ tiles: [], ground: { "0,0": { floor: "stone" } }, frames: [] });
  assert.equal(dit, "1 case de sol peinte");
});

test("several painted ground tiles are said in the plural", () => {
  const dit = describeDraft({
    tiles: [], ground: { "0,0": { floor: "stone" }, "1,0": { floor: "sand" } }, frames: [],
  });
  assert.equal(dit, "2 cases de sol peintes");
});

test("a single frame, with no block or ground, is said for what it is", () => {
  assert.equal(describeDraft({ tiles: [], ground: {}, frames: [cadre] }), "1 cadre");
});

test("several frames are said in the plural", () => {
  assert.equal(describeDraft({ tiles: [], ground: {}, frames: [cadre, { ...cadre, id: "b" }] }),
    "2 cadres");
});

test("two parts are joined by and, with no comma before it", () => {
  const dit = describeDraft({ tiles: [bande], ground: {}, frames: [cadre] });
  assert.equal(dit, "1 bloc et 1 cadre");
});

test("all three parts together are said comma, comma, and", () => {
  const dit = describeDraft({
    tiles: [bande, bande, bande],
    ground: { "0,0": { floor: "stone" } },
    frames: [cadre],
  });
  assert.equal(dit, "3 blocs, 1 case de sol peinte et 1 cadre");
});

test("a draft from yesterday with no frames key mentions no frame", () => {
  assert.equal(describeDraft({ tiles: [bande], ground: {} }), "1 bloc");
});
