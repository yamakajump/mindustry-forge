# How the ground is drawn

This is for a reader who wants to understand or change how the site draws the boundary
between two patches of ground, not for someone executing a plan. The implementation is
`site/public/forge/tiling.js` (the arithmetic, tested without a canvas) and
`site/public/forge/render.js` (the `drawImage` calls). If this document and that code ever
disagree, the code is the truth: read it first, this is the explanation, not the
specification.

Everything below traces back to one of two sources, named at each step because a claim
about the game's own behaviour is only as good as where it came from:

- **Decompiled**: read out of `mindustry/world/blocks/environment/Floor.class` and related
  classes in the pinned `server-release.jar` (Mindustry v159.7), with `javap -p -c`. This is
  what the game actually does, not what a wiki says it does.
- **Measured**: read out of the packed atlas by decoding the PNG's own pixels, not assumed
  or transcribed from a comment. `tests/js/tiling.test.js` performs this measurement on
  every run, so a repacked atlas that transposed or flipped a sheet fails a test instead of
  silently drawing a boundary on the wrong side of a tile.

## Why there is a boundary at all

Two patches of ground that meet on a straight line is not what the game draws: the higher
one bleeds a soft, irregular edge onto the lower one. Drawing that edge needs, for every
tile: which of its eight neighbours contribute a boundary, which side each contributes on,
and which 32x32 pixel cell of a 96x96 pixel sheet to stamp there.

## `Floor.drawBase` has four statements

Decompiled. In the game, drawing one floor tile is:

1. `drawMain(tile)`, the floor's own sprite.
2. `drawEdges(tile)`, **only when this floor's `drawEdgeIn` is true**.
3. `drawOverlay(tile)`, the tile's overlay (ore, a spawn marker, and so on) drawn over the
   floor and its boundary.
4. A second `drawMain(tile)` at `1 - overlayAlpha`, **only when this floor is a liquid
   carrying an overlay**, which is what makes ore under water read as lying beneath the
   surface rather than floating on it. In bytecode the guard is
   `tile.overlay() != Blocks.air && tile.floor() == this && isLiquid`, then
   `Draw.alpha(1f - overlayAlpha)`, `drawMain(tile)`, `Draw.color()`.

`render.js` implements all four, in that order, in the ground loop. Ore drawn before the
boundary put a neighbour's material on top of an ore patch instead of underneath it, which
is the one place a player is looking, so the boundary is drawn between the floor and the
overlay rather than after both.

The fourth is `veilAt` in `tiling.js`, deciding the alpha, and three lines in `render.js`
setting `globalAlpha` around a second `paintLayer` of the same floor. The middle condition
of the guard costs nothing here: the renderer reaches that point only while drawing a
tile's own floor.

**`overlayAlpha` is per floor and its default is not the whole answer.** `Floor`'s
constructor sets 0.65, and exactly one class in `server-release.jar` writes the field
afterwards: `mindustry.content.Blocks$10`, the anonymous `Floor` the content class builds as
`new Blocks$10("pooled-cryofluid")`, which sets 0.35. So ten of the eleven liquid floors
come back over their overlay at 0.35 alpha and pooled cryofluid at 0.65. A single 0.35
written into the renderer, which is the obvious way to write this, draws one floor in eleven
wrong, and wrong in the way nobody reports: plausibly.

`sols.json` carries the subtraction already done, per floor, as `veil`, `null` for the
ninety-six floors that are not liquids. `bench/data/blocks.json` gates it: `isLiquid` is
already dumped there as `floor_liquid`. It does not carry `overlayAlpha`, so that value is
written into `build_sols.py` with its citation until a re-dump brings it; the lookup there
prefers the dump the day it does.

A second departure from `drawBase`, worth stating because it looks like a second edge pass
and is not one: `drawOverlay` calls `drawBase` again, on the tile's overlay block. Every
block that can be an overlay (`OreBlock`, `RemoveOre`, `SpawnBlock`, `RuneOverlay`,
`CharacterOverlay`) either overrides `drawBase` with a single rect and a return, or draws
one sprite without calling up at all. None of the five ever reaches `Floor.drawBase`, so
none of them ever reaches `drawEdges`. An overlay tile never gets its own boundary pass.

## `doEdge`: which neighbours contribute, and on which side

Decompiled, from `Floor.drawEdges` and `Floor.doEdge`. For one tile:

1. Walk the eight neighbours in `arc.math.geom.Geometry.d8` order. `D8` in `tiling.js`
   preserves that order, though it is bookkeeping between `blendersAt` and `render.js`
   rather than something `edgeCell` reads a position out of; reordering it would change
   nothing drawn.
2. A neighbour contributes **its floor**, never its overlay. (`Floor.edges()`'s expression
   reads as if the neighbour's overlay might be preferred, but the condition that would
   select it is a property of the tile being drawn, and it is never true for the reason
   above: `drawEdges` never runs from inside an overlay's own `drawBase`.)
3. Skip a neighbour whose floor has `drawEdgeOut` false: that floor never bleeds onto
   anything, whatever its blend id.
4. Skip a neighbour whose floor sits on a different `cacheLayer` than this tile's floor.
   This is why water never bleeds into land: the game draws each liquid cache layer in a
   pass of its own. Without this gate, `deep-water` would collect a sliver of the `stone`
   beside it, since stone's blend id is the higher of the two.
5. `doEdge` itself: a neighbour bleeds onto this tile when **its blend id is higher than
   this tile's own, OR when this tile's own floor has no edge sheet at all.** The second
   half is easy to drop and easy to miss: without it, any patch of a sheetless floor reads
   as a flat cut-out with a hard border, which is the pre-existing defect this replaces, not
   an improvement on it.
6. Skip a neighbour whose contributing floor has no edge sheet of its own to draw.
7. Collect the distinct contributing floors (a neighbour that already contributed is not
   added twice; its direction is added to the existing entry), sorted by **block id**
   ascending. That is the game's own sort key on `drawBlended`: the alternative, blend id,
   is a different field that a blend group hands to several floors while they keep their
   own ids, so sorting on it leaves ties. Block id does not.

`tiling.js` gates step 1 first: a tile whose own floor has `drawEdgeIn` false receives no
boundary at all, whatever surrounds it. Fourteen floors in the catalogue say no:
`colored-floor` and every `metal-tiles-*` variant.

## The blend-group lookup

Decompiled: `Floor.edges()` returns `blendGroup.asFloor().edges`, not the floor's own
`edges` field. Fourteen floors in the catalogue (every crater and every vent) carry a
`blend_group` and ship no edge sheet of their own; their group does. Reading `<name>-edge`
directly, without resolving the group first, silently drops all fourteen: they would stop
blending against anything at all rather than borrow their group's sheet.

`tools/build_sols.py` resolves this once, ahead of time, into `sols.json`'s `sheet` field
per floor, so `tiling.js` and `render.js` never need to know a floor belongs to a group.

## The measured cell table

An edge sheet is 96x96 pixels: nine 32x32 cells in a 3x3 grid. `Floor.edge(x, y, i, j)`
reads a cell as `edges[i][2 - j]`, a game-coordinate lookup (y grows upward) already
converted once into a row that grows downward, which is how a texture atlas and a canvas
both count rows. Converting a second time on the way into `drawImage` undoes the first
conversion instead of applying it, so the row must be inverted exactly once between the
game's `(dx, dy)` and the cell passed to `drawImage`.

`edgeCell(dx, dy)` in `tiling.js` is `{ col: 1 - dx, row: 1 + dy }`. For the eight
neighbour directions and the untouched centre:

| Neighbour direction | `(dx, dy)` | Cell `(col, row)` |
|---|---|---|
| South-east | `(1, -1)` | `(0, 0)` |
| East | `(1, 0)` | `(0, 1)` |
| North-east | `(1, 1)` | `(0, 2)` |
| South | `(0, -1)` | `(1, 0)` |
| *(centre, never selected)* | `(0, 0)` | `(1, 1)` |
| North | `(0, 1)` | `(1, 2)` |
| South-west | `(-1, -1)` | `(2, 0)` |
| West | `(-1, 0)` | `(2, 1)` |
| North-west | `(-1, 1)` | `(2, 2)` |

This is not asserted from the formula alone. `tests/js/tiling.test.js` decodes
`atlas.png` at the byte level on every run, measures which cell each `(dx, dy)` selects,
and checks two things about the pixels actually found there: the cell is mostly
transparent (a sliver of material along one edge, not the whole 32x32 tile, since the
centre cell alone is fully opaque), and the opaque material sits on the side the neighbour
is on (a north neighbour's material near the top of its cell, and so on, with the same
single row-inversion applied once, in the same direction, as `edgeCell` itself). A packer
that transposed or flipped the sheet fails this measurement rather than passing nine
assertions against numbers that no longer describe the sheet.

## Reading this against the code

- `site/public/forge/tiling.js`: `D8`, `contributorAt`, `blendersAt`, `edgeCell`, `veilAt`,
  each with the game-source citation for the rule it implements.
- `site/public/forge/render.js`: the ground loop, around the comment that names the four
  statements of `drawBase` and the order they are drawn in.
- `tests/js/tiling.test.js`: the neighbour-selection tests against `blendersAt`, the
  pixel-measured cell tests against `edgeCell`, and the alpha tests against `veilAt`.
- `tests/js/sols.test.js`: which eleven floors are veiled, and at what alpha each.
- `bench/src/mindustryforge/DumpBlocks.java`, `describeFloor`: where `blend_id`,
  `draw_edge_in`, `draw_edge_out`, `blend_group` and `cache_layer` are read off the live
  game and dumped. These stop at `bench/data/blocks.json`; they decide how the ground looks
  and no figure the analyser reports, so `tools/build_catalogue.py`'s `KEEP` filter keeps
  them out of `site/public/forge/blocks.json`, which `EngineVersion` hashes. Adding one of
  them there would mark every stored analysis stale for the sake of presentation.
- `tools/build_sols.py`: turns the bench dump into `site/public/forge/sols.json`, resolving
  the blend-group lookup ahead of time.
