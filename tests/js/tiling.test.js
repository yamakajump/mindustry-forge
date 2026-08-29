import test from "node:test";
import assert from "node:assert/strict";

import { tileSpan, variantOf } from "../../site/public/forge/tiling.js";

test("a floor with one sprite always takes it", () => {
  for (const [x, y] of [[0, 0], [7, 3], [-4, 19]]) {
    assert.equal(variantOf(x, y, 1), 0);
    assert.equal(variantOf(x, y, 0), 0);
  }
});

test("the variant is in range and never moves", () => {
  for (let x = -20; x < 20; x++) {
    for (let y = -20; y < 20; y++) {
      const first = variantOf(x, y, 3);
      assert.ok(first >= 0 && first < 3, `${x},${y} gave ${first}`);
      assert.equal(variantOf(x, y, 3), first, "not stable across calls");
    }
  }
});

test("the variant depends on both coordinates, which is the whole point", () => {
  /* A hash of x alone stripes the board vertically, a hash of y alone stripes it
     horizontally, and either one is the defect this replaces wearing a different hat. So
     the check is not "it varies" but "it varies along both axes". */
  const alongX = new Set();
  const alongY = new Set();
  for (let i = 0; i < 40; i++) {
    alongX.add(variantOf(i, 0, 3));
    alongY.add(variantOf(0, i, 3));
  }
  assert.ok(alongX.size > 1, "a whole row took the same variant");
  assert.ok(alongY.size > 1, "a whole column took the same variant");
});

test("the three variants come up about as often as each other", () => {
  /* 4096 tiles is the largest board this editor allows, so this is the real population
     rather than a sample of it. A hash that is technically in range but favours one
     variant four to one looks, on a painted patch, exactly like no variants at all. */
  const seen = [0, 0, 0];
  for (let x = 0; x < 64; x++) {
    for (let y = 0; y < 64; y++) seen[variantOf(x, y, 3)]++;
  }
  const expected = 4096 / 3;
  for (const [n, count] of seen.entries()) {
    assert.ok(Math.abs(count - expected) < expected * 0.15,
      `variant ${n} came up ${count} times, expected about ${Math.round(expected)}`);
  }
});

test("neighbours usually differ, which is what kills the stripes", () => {
  let same = 0;
  for (let x = 0; x < 63; x++) {
    for (let y = 0; y < 64; y++) {
      if (variantOf(x, y, 3) === variantOf(x + 1, y, 3)) same++;
    }
  }
  // A third of neighbours matching is what three variants picked independently gives.
  assert.ok(same < 63 * 64 * 0.45, `${same} of ${63 * 64} horizontal neighbours matched`);
});

test("the variant is not constant along a diagonal either", () => {
  /* (x + y) % count and (x - y) % count both pass every test above this one: they vary
     along x, they vary along y, they're stable across calls, roughly balanced, and mostly
     differ from an east or north neighbour. What they don't do is vary along their own
     diagonal, since that is exactly the axis a sum or difference hash holds constant. A
     hash that only clears the row and column checks can still stripe the board on the
     diagonal, which is the same defect the rest of this file exists to catch. */
  const alongSum = new Set();
  const alongDiff = new Set();
  for (let x = 0; x < 40; x++) {
    alongSum.add(variantOf(x, 20 - x, 3));
    alongDiff.add(variantOf(x, x - 20, 3));
  }
  assert.ok(alongSum.size > 1, "a whole x + y diagonal took the same variant");
  assert.ok(alongDiff.size > 1, "a whole x - y diagonal took the same variant");
});

import { blendersAt, D8 } from "../../site/public/forge/tiling.js";

/* Two floors, one that blends over the other. Written here rather than read out of
   sols.json so the test says what it depends on.

   The ids and blend ids are invented, small and readable; the shapes they stand for are
   real, and each is named where it is used. `id` and `blend` are separate fields in the
   game and are not in step, which is why `char` below shares stone's blend id and keeps
   an id of its own. */
const floors = {
  stone: { id: 33, blend: 10, in: true, out: true, layer: "normal", variants: 3, sheet: "stone" },
  grass: { id: 71, blend: 20, in: true, out: true, layer: "normal", variants: 3, sheet: "grass" },
  // A floor sharing stone's blend id and keeping its own, which is what a blend group does:
  // `stone`, `char` and `stone-vent` all carry blend id 33 in the real catalogue.
  char: { id: 35, blend: 10, in: true, out: true, layer: "normal", variants: 1, sheet: "stone" },
  // A floor the game tells not to bleed outwards, which is the one case where a higher
  // blend id still draws nothing.
  shale: { id: 30, blend: 30, in: false, out: false, variants: 1, layer: "normal", sheet: "shale" },
  // A floor nothing bleeds onto: `drawBase` reaches `drawEdges` only when `drawEdgeIn` is
  // set, and 14 floors clear it, `colored-floor` and every `metal-tiles-*`.
  "metal-tiles-4": { id: 146, blend: 146, in: false, out: false, layer: "normal",
                     variants: 1, sheet: null },
  // A liquid, drawn in a pass of its own. Its blend id is deliberately the LOWEST here, so
  // that the ordinary comparison lets every land floor bleed onto it and only the cache
  // layer gate stops them: that is the real shape, deep water at 21 beside stone at 33.
  "deep-water": { id: 21, blend: 5, in: true, out: true, layer: "water",
                  variants: 1, sheet: "deep-water" },
  // A floor with no sheet anywhere, neither its own nor its group's: it cannot bleed, and
  // anything bleeds onto it. Its blend id (40) is deliberately higher than every sheeted
  // floor below, so a test using it exercises the sheetless clause of doEdge rather than
  // the ordinary id comparison, which a lower id would have satisfied on its own and hidden
  // the clause's absence.
  sand: { id: 40, blend: 40, in: true, out: true, layer: "normal", variants: 3, sheet: null },
  // A vent, which ships no sheet and borrows its group's. Fourteen real floors are shaped
  // like this, and reading `<name>-edge` alone drops every one of them.
  "stone-vent": { id: 67, blend: 12, in: true, out: true, layer: "normal", variants: 3,
                  sheet: "stone" },
  // An ore overlay. Its blend id (45) beats every floor here and it is given a sheet it does
  // not really have, so that a test which mistakenly let an overlay contribute would show it
  // by name rather than by an empty result that half a dozen other faults also produce.
  "ore-copper": { id: 90, blend: 45, in: true, out: true, layer: "normal", variants: 1,
                  sheet: "ore-copper" },
};

const ground = (cells) => Object.fromEntries(
  Object.entries(cells).map(([at, floor]) => [at, { floor }]));

test("the eight directions are the game's, in the game's order", () => {
  // Decompiled from the pinned jar's arc.math.geom.Geometry.d8. Asserted as an exact
  // sequence, not just as a set, so that changing it is a deliberate act rather than an
  // accident: the order is not load-bearing for how a boundary is drawn (see the comment
  // on D8), but it is still the claim this file makes about following the game.
  assert.deepEqual(D8, [
    [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
  ]);
  const seen = new Set(D8.map(([dx, dy]) => `${dx},${dy}`));
  assert.equal(seen.size, 8, "a neighbour appeared twice");
  assert.ok(!seen.has("0,0"), "the centre must never appear");
});

test("a higher blend id bleeds onto a lower one", () => {
  const board = ground({ "0,0": "stone", "1,0": "grass" });
  const found = blendersAt(board, 0, 0, floors);
  assert.deepEqual(found.map((b) => b.name), ["grass"]);
});

test("a lower blend id does not bleed onto a higher one", () => {
  const board = ground({ "0,0": "grass", "1,0": "stone" });
  assert.deepEqual(blendersAt(board, 0, 0, floors), []);
});

test("the same floor on both sides is not a boundary", () => {
  const board = ground({ "0,0": "grass", "1,0": "grass", "0,1": "grass" });
  assert.deepEqual(blendersAt(board, 0, 0, floors), []);
});

test("drawEdgeOut false means it never bleeds, whatever its id", () => {
  const board = ground({ "0,0": "stone", "1,0": "shale" });
  assert.deepEqual(blendersAt(board, 0, 0, floors), []);
});

test("a floor with no sheet at all is bled onto by a lower id", () => {
  /* doEdge is `other.blendId > this.blendId || this.edges === null`. Sand's blend (40) is
     higher than stone's (10), so the ordinary id comparison alone would keep stone from
     bleeding onto it here; only the second half of doEdge, dropped when this tile's own
     floor has no sheet, lets a lower id still bleed. Removing the `here?.sheet` guard from
     blendersAt makes this assertion fail; see the fix report for the observed failure.
     Without the clause, a patch of sand next to anything reads as a cut-out. */
  const board = ground({ "0,0": "sand", "1,0": "stone" });
  assert.deepEqual(blendersAt(board, 0, 0, floors).map((b) => b.name), ["stone"]);
});

test("a vent bleeds, and does it with its group's sheet", () => {
  const board = ground({ "0,0": "sand", "1,0": "stone-vent" });
  const found = blendersAt(board, 0, 0, floors);
  assert.deepEqual(found.map((b) => b.name), ["stone-vent"]);
  assert.equal(found[0].sheet, "stone", "a vent must draw its group's sheet, not its own");
});

test("a neighbour's overlay changes nothing about which floor bleeds", () => {
  /* `(this != tile.floor() && other.overlay() != air) ? other.overlay() : other.floor()`
     reads as "prefer the layer on top" only if `this` is taken for the neighbour. It is the
     floor being drawn, and the clause is true only on the overlay pass, which is not modelled
     here: on the floor pass the neighbour always contributes its floor.

     This is not a matter of which sheet gets drawn. Every overlay in the catalogue has no
     sheet, so preferring one deletes the neighbour at the sheet guard. Painting ore on the
     stone tile below would stop stone bleeding onto sand at that tile and nowhere else, which
     is a hole in a boundary rather than a different boundary. Both boards must agree. */
  const bare = { "0,0": { floor: "sand" }, "1,0": { floor: "stone" } };
  const ored = {
    "0,0": { floor: "sand" },
    "1,0": { floor: "stone", overlay: "ore-copper" },
  };
  assert.deepEqual(blendersAt(bare, 0, 0, floors).map((b) => b.name), ["stone"]);
  assert.deepEqual(blendersAt(ored, 0, 0, floors), blendersAt(bare, 0, 0, floors),
    "an ore patch on the neighbour changed which floor bleeds");
});

test("a floor with drawEdgeIn false receives nothing, whatever borders it", () => {
  /* `Floor.drawBase` is `drawMain; if(drawEdgeIn) drawEdges; drawOverlay`, so a floor that
     clears the flag never enters `drawEdges` at all. Fourteen floors clear it. The tile here
     has no sheet either, which is the case that would otherwise let anything bleed onto it. */
  const board = ground({ "0,0": "metal-tiles-4", "1,0": "grass", "0,1": "stone" });
  assert.deepEqual(blendersAt(board, 0, 0, floors), []);
});

test("nothing bleeds onto a liquid from the land beside it", () => {
  /* `drawEdges` skips a neighbour whose floor sits on another `cacheLayer`. Deep water's
     blend id is lower than stone's, so the ordinary comparison happily draws a sliver of
     stone onto the water; the game draws none, because the liquid layers are a separate
     pass. */
  const board = ground({ "0,0": "deep-water", "1,0": "stone" });
  assert.deepEqual(blendersAt(board, 0, 0, floors), []);
});

test("and nothing bleeds onto land from the liquid beside it", () => {
  /* The same gate read from the other side. Sand has no sheet, so the sheetless half of
     `doEdge` would otherwise let deep water bleed onto it despite the lower blend id. */
  const board = ground({ "0,0": "sand", "1,0": "deep-water" });
  assert.deepEqual(blendersAt(board, 0, 0, floors), []);
});

test("two floors sharing a blend id are ordered by block id, as the game orders them", () => {
  /* `drawBlended` sorts on `floor.id`, not on `blendId`. A blend group hands one blend id to
     several floors that keep their own ids, so sorting on the blend id leaves this pair tied
     and settles it by whichever of the eight directions was walked first. `char` sits east
     and is met first; `stone` has the lower id and must come out first anyway. */
  const board = ground({ "0,0": "sand", "1,0": "char", "0,1": "stone" });
  assert.deepEqual(blendersAt(board, 0, 0, floors).map((b) => b.name), ["stone", "char"]);
});

test("one neighbour contributes once, with every direction it came from", () => {
  const board = ground({ "0,0": "stone", "1,0": "grass", "0,1": "grass", "1,1": "grass" });
  const found = blendersAt(board, 0, 0, floors);
  assert.equal(found.length, 1, "grass was listed more than once");
  assert.equal(found[0].dirs.length, 3, "not every direction was recorded");
});

test("blenders come out sorted, so two of them stack the same way every frame", () => {
  const board = ground({ "0,0": "sand", "1,0": "grass", "0,1": "stone" });
  const found = blendersAt(board, 0, 0, floors);
  assert.deepEqual(found.map((b) => b.name), ["stone", "grass"]);
});

test("an unpainted neighbour is not a floor and contributes nothing", () => {
  /* The board is mostly empty and stays that way: a tile nobody painted has no floor, and
     reading it as one would draw a boundary around every patch against nothing. */
  const board = ground({ "0,0": "stone" });
  assert.deepEqual(blendersAt(board, 0, 0, floors), []);
});

import { edgeCell } from "../../site/public/forge/tiling.js";
import { readFileSync } from "node:fs";

import { decodePng } from "./helpers.js";

/*
 * Which of the nine cells carries the material a neighbour spills, measured out of the atlas.
 *
 * What this replaces asserted eight literal cells and kept the pixel measurement that
 * justified them in a comment above the table. That is a measurement written down rather than
 * run: a packer that transposed or flipped the sheet would have left the comment describing a
 * sheet that no longer existed, and every assertion passing.
 *
 * So the sheet is decoded here, and the claim under test is the one that matters rather than
 * eight coordinates. A neighbour's floor spills along the edge the two tiles share, so the
 * opaque material in the cell `edgeCell` picks has to lie on the side the neighbour is on: a
 * neighbour to the east paints the right hand strip, one to the north the top one.
 *
 * `grass` because it is an ordinary floor with an ordinary sheet. Any of the 55 would do.
 */
const atlas = JSON.parse(readFileSync(
  new URL("../../site/public/forge/atlas.json", import.meta.url), "utf8"));
const SHEET = atlas.sprites["floor/grass#edge"];
const CELL = SHEET.w / 3;
const image = decodePng(
  new URL("../../site/public/forge/atlas.png", import.meta.url), SHEET.y + SHEET.h);

/** How much of one cell is opaque, and where in it that material sits. */
function materialIn(col, row) {
  let count = 0;
  let sumX = 0;
  let sumY = 0;
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const at = ((SHEET.y + row * CELL + y) * image.width + SHEET.x + col * CELL + x) * 4;
      if (image.pixels[at + 3] > 128) {
        count++;
        sumX += x;
        sumY += y;
      }
    }
  }
  return { cover: count / (CELL * CELL), x: sumX / count, y: sumY / count };
}

/** The middle of a cell, in its own pixel coordinates. */
const MIDDLE = (CELL - 1) / 2;

const NAMES = {
  "1,0": "east", "1,1": "north-east", "0,1": "north", "-1,1": "north-west",
  "-1,0": "west", "-1,-1": "south-west", "0,-1": "south", "1,-1": "south-east",
};

for (const [dx, dy] of D8) {
  test(`the cell picked for a ${NAMES[`${dx},${dy}`]} neighbour carries its material there`,
    () => {
      const { col, row } = edgeCell(dx, dy);
      const found = materialIn(col, row);
      assert.ok(found.cover > 0, `cell (${col}, ${row}) has no material in it at all`);
      /* A sliver along one edge, not a tile. The centre cell is the whole texture and covers
         everything, so a direction landing on it would paint the neighbour's floor over this
         one entire rather than creeping onto it. */
      assert.ok(found.cover < 0.5,
        `cell (${col}, ${row}) is ${Math.round(found.cover * 100)}% opaque, not a sliver`);

      /* An image row grows downwards and a game y grows upwards, so a northern neighbour's
         material sits at the TOP of the cell, which is the low row. That single inversion is
         the whole of the coordinate change, and it is why the y expectation is negated. */
      const axes = [
        ["x", dx, found.x, "left", "right"],
        ["y", -dy, found.y, "top", "bottom"],
      ];
      for (const [axis, want, mean, low, high] of axes) {
        const where = `${axis} ${mean.toFixed(1)} of ${CELL}, middle ${MIDDLE}`;
        if (want > 0) {
          assert.ok(mean > MIDDLE + 4, `material should hug the ${high}, sits at ${where}`);
        } else if (want < 0) {
          assert.ok(mean < MIDDLE - 4, `material should hug the ${low}, sits at ${where}`);
        } else {
          assert.ok(Math.abs(mean - MIDDLE) < 2,
            `material should be centred on ${axis}, sits at ${where}`);
        }
      }
    });
}

test("the centre cell is the whole texture, and no direction ever picks it", () => {
  /* Measured rather than assumed: cell (1, 1) is the floor with nothing cut out of it. Every
     direction must land on one of the other eight, and on a different one, or two neighbours
     would spill through the same hole. */
  assert.equal(materialIn(1, 1).cover, 1, "the centre cell is not fully opaque");
  const seen = new Set();
  for (const [dx, dy] of D8) {
    const { col, row } = edgeCell(dx, dy);
    assert.ok(!(col === 1 && row === 1), `(${dx}, ${dy}) selected the centre cell`);
    seen.add(`${col},${row}`);
  }
  assert.equal(seen.size, 8, "two directions were sent to the same cell");
});

import { veilAt } from "../../site/public/forge/tiling.js";

/* Floors as `sols.json` records them for the fourth statement of `drawBase`. `veil` is the
   subtraction already done, `1 - overlayAlpha`, and `null` for the ninety-six floors that
   are not liquids and are never drawn a second time.

   The two values below are the only two v159.7 has, and they are not interchangeable: they
   belong to different floors, and swapping them makes one of the eleven wrong. */
const veiling = {
  "deep-water": { id: 21, blend: 5, in: true, out: true, layer: "water", variants: 1,
                  sheet: "deep-water", veil: 0.35 },
  /* The one floor in the game that overrides `overlayAlpha`, to 0.35, so it is the one that
     comes back over its overlay at 0.65 instead. `Floor`'s constructor sets the field to
     0.65, and `mindustry.content.Blocks$10`, the anonymous floor built as
     `new Blocks$10("pooled-cryofluid")`, is the only class in the jar that writes it after. */
  "pooled-cryofluid": { id: 29, blend: 29, in: true, out: true, layer: "cryofluid",
                        variants: 0, sheet: "pooled-cryofluid", veil: 0.65 },
  "sand-floor": { id: 39, blend: 39, in: true, out: true, layer: "normal", variants: 3,
                  sheet: "sand-floor", veil: null },
  "ore-copper": { id: 90, blend: 45, in: true, out: true, layer: "normal", variants: 1,
                  sheet: null, veil: null },
};

test("a liquid carrying an overlay is drawn back over it", () => {
  /* The whole of the statement: `drawMain` a second time at `1 - overlayAlpha`, which is what
     makes ore under water read as lying beneath the surface instead of floating on it. */
  const board = { "0,0": { floor: "deep-water", overlay: "ore-copper" } };
  assert.equal(veilAt(board, 0, 0, veiling), 0.35);
});

test("a liquid with nothing on it is drawn once", () => {
  /* `tile.overlay() != Blocks.air` is the game's first condition and it is not decoration:
     without it every water tile is painted twice, the second time at 0.35 over itself, and a
     plain sheet of water comes out visibly darker than the game's with nothing on screen to
     say why. */
  const board = { "0,0": { floor: "deep-water" } };
  assert.equal(veilAt(board, 0, 0, veiling), 0);
});

test("a floor that is not a liquid keeps its ore crisp", () => {
  /* `isLiquid` is the third condition. Ore on sand is ore on sand, and dimming it would be
     this change damaging the ninety-six floors it was never meant to touch. */
  const board = { "0,0": { floor: "sand-floor", overlay: "ore-copper" } };
  assert.equal(veilAt(board, 0, 0, veiling), 0);
});

test("the alpha is the floor's own, not one constant shared by the liquids", () => {
  /* Cryofluid is the reason `veil` is a field per floor rather than 0.35 written into the
     renderer. Reading the constructor's default off one liquid and applying it to all eleven
     draws cryofluid at half the cover the game gives it, which is a wrong picture that looks
     entirely plausible, and those are the ones nobody reports. */
  const water = { "0,0": { floor: "deep-water", overlay: "ore-copper" } };
  const cryo = { "0,0": { floor: "pooled-cryofluid", overlay: "ore-copper" } };
  assert.equal(veilAt(cryo, 0, 0, veiling), 0.65);
  assert.notEqual(veilAt(cryo, 0, 0, veiling), veilAt(water, 0, 0, veiling));
});

test("an unpainted tile and an unknown floor veil nothing", () => {
  /* The ground loop asks about every tile in the view, most of which carry no ground at all,
     and `sols.json` is allowed to be missing entirely: a failed fetch of it costs the soft
     edges between floors, not the ground itself. None of these may throw. */
  assert.equal(veilAt({}, 0, 0, veiling), 0);
  assert.equal(veilAt({ "0,0": { overlay: "ore-copper" } }, 0, 0, veiling), 0);
  assert.equal(
    veilAt({ "0,0": { floor: "unheard-of", overlay: "ore-copper" } }, 0, 0, veiling), 0);
  assert.equal(veilAt({ "0,0": { floor: "deep-water", overlay: "ore-copper" } }, 0, 0, {}), 0);
});

/**
 * Tiles share their edges, whatever the fraction underneath.
 *
 * The camera's box is fractional on purpose, so a tile drawn at `(x - box.left) * scale`
 * lands on a fractional coordinate. With smoothing off, two neighbours can each round away
 * from the edge they share and leave a row of background between them: on an area painted
 * with one floor that reads as a grid of seams.
 */
test("a tile ends exactly where the next one starts", () => {
  for (const dpr of [1, 1.25, 1.5, 2]) {
    for (const scale of [8, 13, 24, 41]) {
      for (const origin of [0, 0.37, 12.5, -3.14]) {
        for (let i = 0; i < 40; i++) {
          const [at, span] = tileSpan(i - origin, scale, dpr);
          const [next] = tileSpan(i + 1 - origin, scale, dpr);
          /* To the floating-point epsilon rather than exactly: the edge is snapped in
             device pixels and handed back in CSS ones, so `from + (to - from)` differs
             from `to` in the last bits at a ratio of 1.25. A hundred-millionth of a pixel
             is not a seam. */
          assert.ok(Math.abs(at + span - next) < 1e-9,
            `dpr ${dpr}, scale ${scale}, origin ${origin}, tile ${i}`);
          // And every edge is a whole device pixel, which is what stops the rounding.
          assert.equal(Math.round(at * dpr), at * dpr);
        }
      }
    }
  }
});

test("a span stays the size of a tile, give or take a pixel", () => {
  /* Snapping moves an edge by less than a device pixel, so a tile is never wider or
     narrower than a tile by more than that. A test that only checked the shared edge would
     pass on a function that returned zero. */
  for (let i = 0; i < 40; i++) {
    const [, span] = tileSpan(i - 0.37, 24, 1.5);
    assert.ok(Math.abs(span - 24) <= 1 / 1.5, `span ${span}`);
  }
});
