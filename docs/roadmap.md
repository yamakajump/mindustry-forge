# Roadmap

What exists, what is being built, and in which order. Written for someone deciding where
to help. The reasoning behind the order is here too, because a list of features without
its reasoning is a list somebody will reorder by taste.

## What already exists

- **The analysis engine**, `site/public/forge/analyse.js`, and the bench that holds it
  against a real headless Mindustry server. Worst recorded gap: three percent.
- **The simulator**, `live.js`: the schematic runs in the browser, drawn from the same
  engine as the report. An animation driven by `Date.now()` would look identical and mean
  nothing, which is the whole point of sharing the engine.
- **The editor**, `site/public/forge/editor/`, eleven modules: the game's placement
  mechanics read from the v159.7 source. Line traces, Bresenham, A\*, fill, bridges spaced
  and chained by the game's own dynamic programming, junction on crossing, movable
  selection, `.msch` clipboard both ways, floor tab.
- **Processor decoding**, `logic.js`: the program in plain text, its links, and which of
  those links do not actually reach their block.
- **The block wiki**: 254 pages generated from the game's own numbers, not copied from a
  wiki written by hand.
- **The marketplace**, data side: origin, author, an index of what each schematic
  produces, AGPL licensing, migrations verified against MySQL in CI.
- **The multilingual base**: eight domains, French only for now, with two tests that
  refuse a missing key or a forgotten hole.

## How the work is sorted

Three tiers, and they are not worth the same.

**What only this repository can do.** Everything that falls out of the engine and the
bench. That is where the value is, and where the best of the time goes.

**Parity.** Tools the competition already has, rebuilt because a player who has to visit
two sites keeps one, and it will not be the newer one. Most of them are data manipulation
without mystery: once the format is known, the work is straight.

**What waits.** Maps, servers, posts. Volume and moderation, little differentiation.

## Tier one: what only this repository can do

| | | |
|---|---|---|
| A2 | Factory planner | "I want a hundred silicon a minute, tell me what to build." The analysis run backwards: the engine knows what a factory produces, so it knows what it takes to produce a quantity. Output is a block list, a build cost, the power to supply, and ideally a schematic to paste back into the game. Their ratio calculator does the division; this one returns a plan. |
| A3 | Comparator | Two schematics side by side: throughput, cost, footprint, power, bottleneck. The only site able to say which one is better with measured numbers instead of a screenshot. |
| A4 | Search by what you have | "I have coal and water, show me what I can run." The inverse of the current filter: search on `needs` instead of `produces`. Needs a schema decision before the migration, because other work reads that table. |
| A6 | Ranking by cost | Rank by copper invested, not only by blocks occupied. Two factories with the same throughput do not cost the same to build, and that is what decides an early game. |
| A7 | Blast survivability | `blast.js` already models an explosion and what it destroys. From there: "does your reactor kill your base when it melts", with the damage map. Nobody else can answer that. |

A4 and A6 both touch the marketplace schema. One after the other, never at the same time.

## Tier two: parity

| | | |
|---|---|---|
| B2 | Image to logic display | An image in, the processor program that draws it on a display out. Colour quantisation, `draw color` and `draw rect`, compression to fit the instruction limit. |
| B3 | Image to canvas | Same for the canvas block, which stores a 12 by 12 image in 8 colours in its configuration. Format documented in `Canvas.java`. |
| B4 | Sorter generator | A sorter layout that splits a flow in the requested proportions. Theirs is geometry. Here the engine can **verify** the result by running it, which theirs cannot. |
| B5 | Map generator | The largest of the five and the least connected to the rest. `.msav` format, terrain generation, ores, spawn points. |

The logic editor (B1) is done: the grammar was disassembled from the game and is held by
two oracles.

## Tier three: what waits

Maps, servers, posts and guides. Maps have one redeeming argument: the `.msav` format
shares its structure with `.msch`, so an analysed map would have something to say. To be
picked up when tiers one and two hold.

## Unowned work

- **The English conversion pass**, roughly 910 comments. It has to happen cold, when no
  branch is writing in the files concerned. `analyse.js` is hashed by `EngineVersion`, so
  rewording a comment there marks every stored analysis stale and triggers a full
  re-measurement of the catalogue.
- **Two dead bench files**, `bench/test_bench.py` and `bench/test_schematic_in_the_game.py`.
  Before writing a line, answer the real question: does a Python re-measurement path give
  anything `npm run oracle` does not? It is not obvious that it does.
Known engine gaps have their own page: [`known-gaps.md`](known-gaps.md).
