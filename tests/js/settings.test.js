/**
 * A preference is untrusted input.
 *
 * It was written by an older version of the page and is read by this one, which is the same
 * shape as a query string somebody edited by hand: a planet that no longer exists, a tool
 * that was renamed, a number that came back as a string. A panel handed one of those fails
 * in a way nobody can reproduce, because the value lives on one machine and nowhere else.
 *
 * So what is tested here is mostly the refusals.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { forget, recall, recallNumber, remember } from "../../site/public/forge/settings.js";

/** A mock `localStorage`, since Node has none. Same shape as `draft.test.js`'s. */
function comptoir() {
  const box = new Map();
  globalThis.localStorage = {
    getItem: (k) => (box.has(k) ? box.get(k) : null),
    setItem: (k, v) => box.set(k, String(v)),
    removeItem: (k) => box.delete(k),
  };
  return box;
}

test("what was kept comes back", () => {
  const box = comptoir();
  remember("editeur.planete", "erekir");

  assert.equal(recall("editeur.planete", "serpulo", ["", "serpulo", "erekir"]), "erekir");
  // Under the site's own prefix, so nothing here can collide with another page's key.
  assert.equal(box.get("forge:editeur.planete"), "erekir");
});

test("nothing kept is the default", () => {
  comptoir();
  assert.equal(recall("editeur.planete", "serpulo", ["serpulo", "erekir"]), "serpulo");
  assert.equal(recallNumber("editeur.taille", 1, 1, 9), 1);
});

test("a value that is no longer acceptable is the default", () => {
  comptoir();

  // The world this player last chose has been renamed since.
  remember("editeur.planete", "sirius");
  assert.equal(recall("editeur.planete", "serpulo", ["serpulo", "erekir"]), "serpulo");

  // A predicate, for the cases where the list is not written down.
  remember("outil", "gomme");
  assert.equal(recall("outil", "crayon", (v) => v.startsWith("cr")), "crayon");
});

test("a number outside its bounds is the default", () => {
  comptoir();

  remember("editeur.taille", 400);
  assert.equal(recallNumber("editeur.taille", 1, 1, 9), 1);

  remember("editeur.taille", "large");
  assert.equal(recallNumber("editeur.taille", 1, 1, 9), 1);

  // And a legitimate one is kept, including at the bounds.
  remember("editeur.taille", 9);
  assert.equal(recallNumber("editeur.taille", 1, 1, 9), 9);
});

test("an empty string is a value, forgetting is how you say there is none", () => {
  comptoir();

  /* "Tout" on the planet filter is the empty string, and it has to survive a reload like
     any other choice: read as "nothing stored", it would put the filter back on Serpulo
     every time somebody widened it. */
  remember("editeur.planete", "");
  assert.equal(recall("editeur.planete", "serpulo", ["", "serpulo"]), "");

  forget("editeur.planete");
  assert.equal(recall("editeur.planete", "serpulo", ["", "serpulo"]), "serpulo");
});

test("a browser that refuses to store loses the preference and nothing else", () => {
  globalThis.localStorage = {
    getItem() { throw new Error("private mode"); },
    setItem() { throw new Error("quota"); },
    removeItem() { throw new Error("nope"); },
  };

  // Private browsing and a full quota both throw. A preference is worth less than the page
  // it is on, so all three swallow.
  assert.doesNotThrow(() => remember("editeur.planete", "erekir"));
  assert.doesNotThrow(() => forget("editeur.planete"));
  assert.equal(recall("editeur.planete", "serpulo", ["serpulo"]), "serpulo");
});
