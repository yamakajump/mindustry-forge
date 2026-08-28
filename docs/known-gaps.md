# Known gaps

What the engine does not model, and what the bench does not prove. A tool that only
publishes its successes is a tool whose numbers you cannot size, so this page exists to be
read before trusting a figure.

The counts on this page are read from the generator, not typed by hand, so they stay
accurate as the engine grows instead of drifting into a figure nobody regenerates.

## The bench does not disagree, which is not the same as being right

`npm run oracle` replays 162 recorded scenarios against the engine. Worst gap: 0.00 %. Two
scenarios have never been measured at all and are waiting for a run with `--measure`.

Zero disagreement means every behaviour a scenario exercises is correct. It says nothing
about a behaviour no scenario exercises, and that is where the gaps below live. When a
defect is found, the fix is not complete until a scenario would have caught it.

## Blocks: 103 classes of 105

A block in Mindustry belongs to a Java class, and the class decides its behaviour: two
blocks of the same class share an `updateTile` and differ only in their numbers. Porting a
class therefore ticks every block that uses it at once. The list is in
[`blocks.md`](blocks.md), generated from the class list the game gives itself, and a ticked
box means transcribed **and** measured in a real server.

Two classes are unticked, on purpose: `UnitCargoLoader` and `UnitCargoUnloadPoint`. Both
need a unit that flies, which the engine has no model for.

## What a ticked box still does not cover

**A payload that is itself a building.** The payload family is transcribed and measured:
cargo slides, conveyors beat on the map clock, the reconstructor consumes, the assembler
builds. What is missing is a payload carrying a building with its own contents.

**Processors do not run.** `LogicBlock` reads a program that can drive any block in the
schematic. None of that is simulated, and it probably never will be. What is proven is
narrower and worth stating: a processor consumes nothing at all, neither power nor items,
and the bench measures it.

**A processor's links are declared, not checked** by the game at paste time. A schematic
can carry a dead link, and the page says so, but the engine does not model what the driven
block would have done.

## Code that has not been re-reviewed since it landed

The engine has had one systematic review against the game source, class by class. It ran
**before** the payloads, the multi-tile liquid module, the cliff crusher, the Erekir drills
and the solid pumps landed, so none of that code has had the same scrutiny. Re-running the
review over it is open work.

## Two units in one field

The `range` field of `blocks.json` is in tiles for some blocks and in world units, eight
per tile, for others, and nothing in the file says which. The detail and the fix are in
[`pitfalls.md`](pitfalls.md).
