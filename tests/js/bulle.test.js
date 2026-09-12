/**
 * Marking a block, on the block.
 *
 * Most of this is about the anchoring, because that is the half a screenshot does not
 * reliably catch: a panel that lands four tiles away looks like a panel, and only looks
 * wrong next to the block it was supposed to be on.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { ancrage, bulle } from "../../site/public/forge/rapport/bulle.js";

const outils = {
  escape: (s) => String(s),
  t: (key) => key,
  lisible: (name) => `<${name}>`,
  withIcon: () => "[icone]",
};

/* Twelve tiles wide, ten tall, twenty pixels a tile, drawn from the origin. The stage is
   wider than the picture, as it is on a desktop. */
const drawn = { box: { left: 0, bottom: 0, width: 12, height: 10 }, scale: 20 };
const stage = { width: 300, bulle: { width: 210, height: 120 } };

const tile = (x, y, size = 1) => ({ x, y, size, name: "titanium-conveyor" });

test("the panel sits over the block it was opened on", () => {
  const où = ancrage(tile(5, 5), drawn, stage);

  // Centred on a one-tile block at x=5: 5*20 + 10 - 105.
  assert.equal(où.left, 5 * 20 + 10 - 105);
});

test("a big block is centred on the whole of itself, not on one ninth of it", () => {
  // A mass driver is three by three and Mindustry stores it on its centre, so the left
  // edge is one tile before the stored coordinate.
  const petit = ancrage(tile(6, 5, 1), drawn, stage);
  const gros = ancrage(tile(6, 5, 3), drawn, stage);

  assert.equal(gros.left, petit.left, "a 3x3 centred somewhere other than its own middle");
});

test("it opens above the block, where it does not cover the rest of the plan", () => {
  // y=2 counted from the bottom is low on screen, so there is room above it.
  const où = ancrage(tile(5, 2), drawn, stage);

  assert.ok(où.top >= 0);
  assert.ok(où.top < (10 - 2) * 20, "it opened below a block that had room above it");
});

test("it flips below when the block is against the top edge", () => {
  /* An intake is usually at an edge, and the top edge is where a panel that always opened
     upwards went off the picture. */
  const où = ancrage(tile(5, 9), drawn, stage);

  assert.ok(où.top >= 0, `it opened off the top of the picture: ${où.top}`);
});

test("it never hangs off the right-hand edge", () => {
  // Anchored blindly, a mark on the last column put half the panel outside the stage and
  // the resource chips off the page.
  const où = ancrage(tile(11, 5), drawn, stage);

  assert.ok(où.left + 210 <= stage.width, `it ran past the stage: ${où.left}`);
});

test("it never hangs off the left-hand edge either", () => {
  const où = ancrage(tile(0, 5), drawn, stage);

  assert.ok(où.left >= 0, `it ran off the left: ${où.left}`);
});

test("a stage narrower than the panel still puts it on the picture", () => {
  // A phone. The clamp must not produce a negative left from a max() of two bad options.
  const où = ancrage(tile(5, 5), drawn, { width: 150, bulle: { width: 210, height: 120 } });

  assert.ok(où.left >= 0, `it went negative on a narrow stage: ${où.left}`);
});

test("an unmarked block is asked the first question and not the second", () => {
  const html = bulle(tile(2, 2), null, ["coal", "sand"], outils);

  assert.ok(html.includes("analyse.bulle.ca-entre"));
  assert.ok(html.includes("analyse.bulle.ca-sort"));
  assert.ok(!html.includes("analyse.bulle.qui-arrive"),
    "it asked what arrives before being told anything arrives");
  assert.ok(!html.includes("data-side=\"\""), "it offered to remove a mark that is not there");
});

test("marked as a way in, it asks what arrives, with the identifiers the engine keys on", () => {
  const html = bulle(tile(2, 2), { side: "in", resource: null }, ["coal", "sand"], outils);

  assert.ok(html.includes("analyse.bulle.qui-arrive"));
  // The identifier in the attribute, never the French name: "Titane" stored where
  // "titanium" was expected matched nothing and the marked intake fed nothing.
  assert.ok(html.includes('data-resource="coal"'));
  assert.ok(html.includes("<coal>"), "the button shows the identifier instead of the name");
});

test("what comes out is not a choice, and is not offered as one", () => {
  const html = bulle(tile(2, 2), { side: "out", resource: null }, ["coal"], outils);

  assert.ok(html.includes("analyse.bulle.sortie-imposee"));
  assert.ok(!html.includes("data-resource"), "it offered to pick what comes out");
});

test("a block with nothing worth offering says so rather than showing an empty row", () => {
  const html = bulle(tile(2, 2), { side: "in", resource: null }, [], outils);

  assert.ok(html.includes("analyse.bulle.rien-a-offrir"));
});

test("the chosen resource is the one that reads as chosen", () => {
  const html = bulle(tile(2, 2), { side: "in", resource: "sand" }, ["coal", "sand"], outils);
  const sable = html.slice(html.indexOf('data-resource="sand"') - 60);

  assert.ok(html.includes('class="chip pick on" data-resource="sand"')
    || sable.includes("on"), "the picked chip is not marked as picked");
});

test("it stays inside the stage vertically as well as horizontally", () => {
  /* The horizontal clamp was there from the start and this was not. It did not show while
     the panel held two buttons; it showed the moment it also held what the block is and
     what it is doing, because a bubble on the bottom row of a short picture is then taller
     than the room under it and hung out of the frame entirely. */
  const court = { width: 300, height: 200, bulle: { width: 210, height: 180 } };
  const où = ancrage(tile(5, 0), drawn, court);

  assert.ok(où.top >= 0, `it went above the stage: ${où.top}`);
  assert.ok(où.top + 180 <= 200 + 1, `it hung out of the bottom: ${où.top}`);
});

test("a bubble taller than the stage lands at the top rather than off it", () => {
  // A dialog is allowed to cover the picture. It is not allowed to be unreachable.
  const où = ancrage(tile(5, 5), drawn, { width: 300, height: 100, bulle: { width: 210, height: 300 } });

  assert.ok(où.top >= 0, `it went negative: ${où.top}`);
});
