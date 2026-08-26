/**
 * How much can get through, computed rather than approached.
 *
 * The solver this replaces pushed supply forward until the numbers stopped moving, which
 * is fine on a line and wrong on anything with a loop: every round re-applied each
 * carrier's rate cap, so a network that loops multiplied by a fraction below one on every
 * pass. A schematic worth 2,402 power a second came out at 648.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { throughput } from "../../site/public/forge/maxflow.js";

const close = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-6, `${why}: ${a} vs ${b}`);

/** A chain of nodes, each feeding the next. */
function line(count) {
  return {
    nodes: Array.from({ length: count }, (_, i) => ({ i })),
    edges: Array.from({ length: count - 1 }, (_, i) => [i, i + 1]),
  };
}

test("what goes in comes out when nothing narrows", () => {
  const graph = line(4);
  const out = throughput(graph, {
    supply: { 0: 5 },
    capacity: () => Infinity,
    wants: (i) => (i === 3 ? 100 : 0),
  });
  close(out.total, 5, "cinq entrent, cinq sortent");
  close(out.received[3], 5, "et la machine les recoit");
});

test("the narrowest carrier sets the rate", () => {
  /* A belt is the commonest bottleneck in the game and the one players most often miss. */
  const graph = line(4);
  const out = throughput(graph, {
    supply: { 0: 40 },
    capacity: (i) => (i === 2 ? 6.5 : Infinity),
    wants: (i) => (i === 3 ? 100 : 0),
  });
  close(out.total, 6.5, "une bande porte 6,5 par seconde quoi qu il arrive");
});

test("two branches carry more than one", () => {
  /* The point of doubling a line up, and the thing an even split gets wrong: it sends half
     of everything down each branch whether or not either can take it. */
  const graph = {
    nodes: [{}, {}, {}, {}],
    edges: [[0, 1], [0, 2], [1, 3], [2, 3]],
  };
  const out = throughput(graph, {
    supply: { 0: 40 },
    capacity: (i) => (i === 1 || i === 2 ? 6.5 : Infinity),
    wants: (i) => (i === 3 ? 100 : 0),
  });
  close(out.total, 13, "deux bandes portent treize");
});

test("a dead branch takes nothing instead of half", () => {
  /* The failure that made a schematic report a quarter of what it makes: a branch that
     wants nothing kept taking half of everything, and the half that reached the machines
     was half of what it should have been. */
  const graph = {
    nodes: [{}, {}, {}],
    edges: [[0, 1], [0, 2]],
  };
  const out = throughput(graph, {
    supply: { 0: 10 },
    capacity: () => Infinity,
    // Node 2 is a pipe that ends in the air, so it wants nothing.
    wants: (i) => (i === 1 ? 10 : 0),
  });
  close(out.total, 10, "tout va vers la machine, rien dans le cul-de-sac");
  close(out.received[1], 10, "la machine est servie a plein");
});

test("a loop does not decay the answer", () => {
  /* The whole reason this exists. An iterative push around a ring shrank the flow by the
     carriers' cap on every pass; a hundred passes left 1e-103. */
  const graph = {
    nodes: [{}, {}, {}, {}],
    edges: [[0, 1], [1, 2], [2, 3], [3, 1]],
  };
  const out = throughput(graph, {
    supply: { 0: 7 },
    capacity: () => 20,
    wants: (i) => (i === 2 ? 50 : 0),
  });
  close(out.total, 7, "une boucle ne mange pas le debit");
});

test("nothing is invented when demand exceeds supply", () => {
  const graph = line(3);
  const out = throughput(graph, {
    supply: { 0: 2 },
    capacity: () => Infinity,
    wants: (i) => (i === 2 ? 1000 : 0),
  });
  close(out.total, 2, "on ne rend pas plus que ce qui entre");
});

test("a block's capacity belongs to the block, not to its ways in", () => {
  /* Three belts feeding one belt do not make it carry three belts' worth, which is what
     putting the cap on the edges instead of on the block would allow. */
  const graph = {
    nodes: [{}, {}, {}, {}, {}],
    edges: [[0, 3], [1, 3], [2, 3], [3, 4]],
  };
  const out = throughput(graph, {
    supply: { 0: 10, 1: 10, 2: 10 },
    capacity: (i) => (i === 3 ? 6.5 : Infinity),
    wants: (i) => (i === 4 ? 100 : 0),
  });
  close(out.total, 6.5, "la bande porte toujours 6,5");
});
