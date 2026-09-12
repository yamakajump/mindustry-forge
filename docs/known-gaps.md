# Known gaps

What the engine does not model, and what the bench does not prove. A tool that only
publishes its successes is a tool whose numbers you cannot size, so this page exists to be
read before trusting a figure.

The counts on this page are read from the generator, not typed by hand, so they stay
accurate as the engine grows instead of drifting into a figure nobody regenerates.

## The bench does not disagree, which is not the same as being right

`npm run oracle` replays 165 recorded scenarios against the engine. Worst gap: 0.00 %, and
every one of them has an answer from a real server.

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

**A payload carried by a unit.** The payload family is transcribed and measured, and so is
what a `BuildPayload` is holding: cargo slides, conveyors beat on the map clock, a loader
fills the container it carries, an unloader empties it, and a battery ferried from one grid
to another arrives with the charge that was put into it. What is missing is the other
branch of `BuildPayload.update`, the one that runs when a **unit** is doing the carrying:
`updateInUnits` and `state.rules.unitPayloadUpdate` let a carried building go on running in
flight, and the engine has no model for a unit that flies.

**Processors do not run.** `LogicBlock` reads a program that can drive any block in the
schematic. None of that is simulated, and it probably never will be. What is proven is
narrower and worth stating: a processor consumes nothing at all, neither power nor items,
and the bench measures it.

**A processor's links are declared, not checked** by the game at paste time. A schematic
can carry a dead link, and the page says so, but the engine does not model what the driven
block would have done.

**The steady-state analysis shares a shortage evenly; the game does not.** Measured, not
supposed: `bench/data/oracle/liquid-router-in-line` is a mechanical pump giving seven water
a second to two cultivators that want about eleven each, through two liquid routers in line.
The real v159.7 server runs the near one at **0.2917** and the far one at **0.0972**, three
to one, and the same figures come back over 180 seconds as over 30, so it is a settled state
and not a transient. `solveFlow` in `bilan.js` gives both **0.1944**.

The totals agree exactly, 0.3889 either way, which is the signature: a maximum flow
conserves the whole and is free to choose the split, and the split is what a reader is
looking at. On a real six-mixer cryofluid plant the report therefore says all six run at two
thirds, where the game would run the near pair far harder and the far pair far less.

Not fixed. Reproducing the game's rule means modelling `Building.moveLiquid`, which pushes
towards the emptier neighbour by the difference in fill, and that is a scheduling problem
rather than a flow one: it is not a constant to nudge, and guessing at it would replace a
wrong number with a wrong number nobody could check.

**The oracle does not guard the analysis.** `ported()` in `tools/compare.mjs` builds a
`World` and steps it, so all 166 recorded scenarios prove `engine/`, the tick-by-tick
simulation behind "Faire tourner". Every figure the site actually prints comes from
`solveFlow`, and no scenario compares that against anything. The gap above was found by
running both halves over one scenario by hand; nothing in the suite would have reported it.

## Code that has not been re-reviewed since it landed

The engine has had one systematic review against the game source, class by class. It ran
**before** the payloads, the multi-tile liquid module, the cliff crusher, the Erekir drills
and the solid pumps landed, so none of that code has had the same scrutiny. Re-running the
review over it is open work.

## Two units in one field

The `range` field of `blocks.json` is in tiles for some blocks and in world units, eight
per tile, for others, and nothing in the file says which. The detail and the fix are in
[`pitfalls.md`](pitfalls.md).
