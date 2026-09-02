/**
 * Remembering how somebody reads the catalogue, without breaking a shared link.
 *
 * The rule the issue writes down is the whole of this file: an address wins over a memory.
 * `/schemas?tri=seen` pasted into a thread has to open on `seen` for whoever follows it,
 * whatever their own last sort was, or a link stops meaning one thing. This repository has
 * already paid for getting that backwards once, on the `/schematiques` redirect that dropped
 * the filters somebody had shared.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { DEFAUT, decision } from "../../site/public/forge/classement.js";

const OFFERTS = ["best", "dense", "output", "small", "new", "seen"];
const quoi = (search, garde = DEFAUT) => decision({ search, offerts: OFFERTS, garde });

test("a bare address takes the memory", () => {
  assert.deepEqual(quoi("", "seen"), { aller: "?tri=seen" });
});

test("an address naming a sort keeps it, and becomes the memory", () => {
  // The reader chose it, by clicking a tab or by following somebody's link.
  assert.deepEqual(quoi("?tri=small", "seen"), { retenir: "small" });
});

test("an address saying anything else is left alone", () => {
  /* The shared link this rule exists for. A filtered address says what it means, and
     silently sorting it differently from what its sender saw is the same defect as
     dropping the filter. */
  assert.equal(quoi("?produit=silicon", "seen"), null);
  assert.equal(quoi("?page=3", "seen"), null);
});

test("nothing is done to arrive where the server already is", () => {
  // A round trip to land on the default is a round trip for nothing, and a redirect loop
  // the day the default and the memory agree.
  assert.equal(quoi("", DEFAUT), null);
  assert.equal(quoi("", null), null);
});

test("a stored sort that no longer exists is not handed to the query builder", () => {
  /* A stored value is untrusted input: it was written by an older version of this page,
     the same shape as a query string somebody edited. */
  assert.equal(quoi("", "par-couleur"), null);
  assert.equal(quoi("?tri=par-couleur", "seen"), null, "and neither is one in the address");
});

test("the memory is never written from an address that did not choose", () => {
  for (const search of ["", "?produit=silicon", "?tri=inconnu"]) {
    assert.ok(!quoi(search, "seen")?.retenir, `${search} chose nothing`);
  }
});

test("a sort this page cannot honour is not restored", () => {
  /* Three of the six compare what a schematic produces and have nothing to compare while
     no item is chosen: the page greys them and the server falls back. Restoring one gave an
     address saying `tri=dense` above a list sorted by date, which is worse than forgetting.
     Caught by following the redirect and reading the tab it landed on. */
  const restaurables = ["small", "new", "seen"];

  assert.equal(decision({ search: "", offerts: OFFERTS, restaurables, garde: "dense" }), null);
  assert.deepEqual(decision({ search: "", offerts: OFFERTS, restaurables, garde: "seen" }),
    { aller: "?tri=seen" });
});

test("an address naming one of them is still obeyed, because it is the reader's", () => {
  // The page will grey the tab and the server will fall back, which is what it already did
  // before any of this existed. What must not happen is this file adding a redirect to it.
  assert.deepEqual(
    decision({ search: "?tri=dense", offerts: OFFERTS, restaurables: ["new"], garde: "seen" }),
    { retenir: "dense" });
});
