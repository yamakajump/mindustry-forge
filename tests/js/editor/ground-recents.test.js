/**
 * The recents row's list logic, kept pure so it is testable without a browser.
 *
 * Painting uses four floors, not the eighty-six the catalogue offers. `pushRecent` is the
 * whole decision: what moves to the front, what never duplicates, what falls off once the
 * row is full. Getting this wrong is invisible in a screenshot (the floor is in the list
 * either way) and only shows up once somebody paints the same floor twice in a session.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { pushRecent, readRecents, writeRecents } from "../../../site/public/forge/editor/ui.js";

const entry = (name, layer = "floor") => ({ name, layer });

/** A counter `localStorage`, since Node has none: see draft.test.js for the same trick. */
function counter() {
  const box = new Map();
  globalThis.localStorage = {
    getItem: (k) => (box.has(k) ? box.get(k) : null),
    setItem: (k, v) => box.set(k, String(v)),
    removeItem: (k) => box.delete(k),
  };
  return box;
}

test("a fresh entry lands at the front", () => {
  const list = pushRecent([entry("sand-floor")], entry("shale"));
  assert.deepEqual(list, [entry("shale"), entry("sand-floor")]);
});

test("picking a floor already in the list moves it to the front, not a duplicate", () => {
  const list = pushRecent(
    [entry("shale"), entry("sand-floor"), entry("basalt")],
    entry("sand-floor"),
  );
  assert.deepEqual(list, [entry("sand-floor"), entry("shale"), entry("basalt")]);
  assert.equal(list.filter((e) => e.name === "sand-floor").length, 1);
});

test("the list never grows past its cap", () => {
  const start = ["a", "b", "c", "d", "e", "f"].map((n) => entry(n));
  const list = pushRecent(start, entry("g"), 6);
  assert.equal(list.length, 6);
});

test("past the cap, the oldest falls off first", () => {
  const start = ["a", "b", "c", "d", "e", "f"].map((n) => entry(n));
  const list = pushRecent(start, entry("g"), 6);
  assert.deepEqual(list.map((e) => e.name), ["g", "a", "b", "c", "d", "e"]);
  assert.ok(!list.some((e) => e.name === "f"), "f was the oldest and should have fallen off");
});

test("moving an entry already present to the front never grows the list", () => {
  const start = ["a", "b", "c", "d", "e", "f"].map((n) => entry(n));
  const list = pushRecent(start, entry("d"), 6);
  assert.equal(list.length, 6);
  assert.deepEqual(list.map((e) => e.name), ["d", "a", "b", "c", "e", "f"]);
});

test("the same floor picked from a different layer still counts as the same entry", () => {
  /* A block is filed by name in exactly one layer, so this should not happen in practice,
     but the dedupe key is the name: two entries that only differ by layer would otherwise
     silently double the row. */
  const list = pushRecent([entry("arkycite-floor", "floor-liquid")],
                           entry("arkycite-floor", "floor-liquid"));
  assert.equal(list.length, 1);
});

test("the row survives a reload: written, then read back the same", () => {
  counter();
  writeRecents([entry("sand-floor"), entry("shale")]);
  assert.deepEqual(readRecents(), [entry("sand-floor"), entry("shale")]);
});

test("nothing kept yet reads back as an empty row, not a crash", () => {
  counter();
  assert.deepEqual(readRecents(), []);
});

test("corrupted storage reads back as empty rather than throwing", () => {
  globalThis.localStorage = { getItem: () => "{not json", setItem() {}, removeItem() {} };
  assert.doesNotThrow(() => readRecents());
  assert.deepEqual(readRecents(), []);
});

test("a storage that refuses to write does not bring the row down", () => {
  /* Private browsing, a full quota: see draft.js for the same reasoning. */
  globalThis.localStorage = {
    getItem() { throw new Error("refused"); },
    setItem() { throw new Error("refused"); },
    removeItem() { throw new Error("refused"); },
  };
  assert.doesNotThrow(() => writeRecents([entry("sand-floor")]));
  assert.doesNotThrow(() => readRecents());
  assert.deepEqual(readRecents(), []);
});
